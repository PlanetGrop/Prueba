import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { demoCredentials, parseSheet, sheetRange } from './lib/sheets.js';
import { buildProjectArchive, buildWindowsInstaller } from './lib/download.js';
import { EncryptedSessionStore, SESSION_DURATION } from './lib/session-store.js';

export function createApp(config = process.env, request = fetch, { preview = false, sessionStore } = {}) {
  const app = express();
  const required = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_SPREADSHEET_ID'];
  const allowedEmails = [...new Set(String(config.GOOGLE_ALLOWED_EMAILS || config.GOOGLE_ALLOWED_EMAIL || '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean))];
  const configured = required.every(key => Boolean(config[key]?.trim())) && allowedEmails.length > 0;
  const partial = required.some(key => Boolean(config[key]?.trim())) || allowedEmails.length > 0;
  if (allowedEmails.some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error('La lista de correos autorizados contiene un correo no válido.');
  if (config.SESSION_SECRET && config.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET debe tener al menos 32 caracteres.');
  const appUrl = new URL(config.APP_URL || config.RENDER_EXTERNAL_URL || 'http://localhost:3000');
  const production = config.NODE_ENV === 'production';
  if (production && !configured) throw new Error('En producción se requieren las credenciales de Google, el ID de hoja y los correos autorizados.');
  if (production && !config.SESSION_SECRET) throw new Error('En producción se requiere SESSION_SECRET estable de al menos 32 caracteres.');
  // Only the fake-data development preview may be framed by ChatGPT.
  const embeddedPreview = preview && !production && !configured;
  if (production && appUrl.protocol !== 'https:') throw new Error('APP_URL debe usar HTTPS en producción.');
  if (appUrl.username || appUrl.password || appUrl.search || appUrl.hash || appUrl.pathname !== '/') throw new Error('APP_URL debe ser un origen sin rutas, parámetros ni credenciales.');
  if (config.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.get('/healthz', (req, res) => res.set('Cache-Control', 'no-store').json({ status: 'ok' }));
  app.use(helmet({
    referrerPolicy: { policy: 'no-referrer' },
    frameguard: embeddedPreview ? false : { action: 'sameorigin' },
    // Local development uses HTTP. Keep HTTPS upgrades for production only.
    contentSecurityPolicy: { directives: {
      'upgrade-insecure-requests': production ? [] : null,
      'frame-ancestors': embeddedPreview ? ["'self'", 'https://chatgpt.com', 'https://chat.openai.com'] : ["'self'"]
    } }
  }));
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (production && !req.secure) return res.status(400).json({ error: 'Se requiere HTTPS.' });
    if (req.method === 'POST' && req.get('origin') !== appUrl.origin) return res.status(403).json({ error: 'Origen no autorizado.' });
    next();
  });
  const store = sessionStore || (production ? new EncryptedSessionStore({ filename: config.SESSION_DB_PATH || resolve('.data/sessions.sqlite'), secret: config.SESSION_SECRET }) : undefined);
  app.locals.close = () => { if (store instanceof EncryptedSessionStore) store.close(); };
  const cookieName = production ? '__Host-clave.sid' : 'clave.sid';
  app.use(session({
    name: cookieName,
    store,
    secret: config.SESSION_SECRET || randomBytes(48).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, secure: production, sameSite: 'lax', path: '/', maxAge: SESSION_DURATION },
    rolling: false
  }));
  app.use((req, res, next) => {
    const authenticatedAt = req.session.google?.authenticatedAt;
    if (req.session.google && (!authenticatedAt || Date.now() - authenticatedAt >= SESSION_DURATION || !allowedEmails.includes(req.session.google.email.toLowerCase()))) {
      return req.session.regenerate(error => error ? next(error) : next());
    }
    next();
  });
  const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Demasiadas solicitudes. Espera un minuto.' } });
  const loginLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Demasiados intentos de acceso. Intenta de nuevo en diez minutos.' } });
  app.use('/api', apiLimiter);
  app.use('/auth/google', loginLimiter);

  const googleFetch = async (url, options) => {
    const response = await request(url, { ...options, signal: AbortSignal.timeout(15000) });
    let body;
    try { body = await response.json(); } catch { throw new Error('Google devolvió una respuesta no válida.'); }
    return { ok: response.ok, status: response.status, body };
  };
  const tokenRequest = async fields => {
    const result = await googleFetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.GOOGLE_CLIENT_ID, client_secret: config.GOOGLE_CLIENT_SECRET, ...fields })
    });
    if (!result.ok || !result.body.access_token) throw new Error('No se pudo autorizar el acceso con Google.');
    return result.body;
  };
  app.get('/api/status', (req, res) => res.json({
    mode: configured ? 'google' : 'demo', configurationIncomplete: partial && !configured,
    authenticated: Boolean(req.session?.google), email: req.session?.google?.email || null, localTools: !production
  }));
  app.get('/auth/google', (req, res, next) => {
    if (!configured) return res.redirect('/?auth=setup');
    const state = randomBytes(32).toString('hex');
    const verifier = randomBytes(48).toString('base64url');
    req.session.oauth = { state, verifier, created: Date.now() };
    req.session.startedAt = Date.now();
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID, redirect_uri: `${appUrl.origin}/auth/google/callback`,
      response_type: 'code', scope: 'openid email https://www.googleapis.com/auth/spreadsheets.readonly',
      state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
      access_type: 'offline', prompt: 'select_account consent'
    });
    req.session.save(error => error ? next(error) : res.redirect(url.href));
  });
  app.get('/auth/google/callback', async (req, res) => {
    const oauth = req.session.oauth;
    delete req.session.oauth;
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!configured || !oauth || Date.now() - oauth.created > 10 * 60 * 1000 || Buffer.byteLength(state) !== Buffer.byteLength(oauth.state) || !timingSafeEqual(Buffer.from(state), Buffer.from(oauth.state)) || typeof req.query.code !== 'string') {
      return res.redirect('/?auth=error');
    }
    try {
      const token = await tokenRequest({ code: req.query.code, code_verifier: oauth.verifier, grant_type: 'authorization_code', redirect_uri: `${appUrl.origin}/auth/google/callback` });
      const user = await googleFetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${token.access_token}` } });
      if (!user.ok || user.body.email_verified !== true || !allowedEmails.includes(user.body.email?.toLowerCase())) return res.redirect('/?auth=denied');
      await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
      req.session.google = { email: user.body.email, accessToken: token.access_token, refreshToken: token.refresh_token, expires: Date.now() + (token.expires_in || 3600) * 1000, authenticatedAt: Date.now() };
      await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
      res.redirect('/');
    } catch { res.redirect('/?auth=error'); }
  });
  app.post('/auth/logout', (req, res, next) => req.session.destroy(error => {
    if (error) return next(error);
    res.clearCookie(cookieName, { httpOnly: true, secure: production, sameSite: 'lax', path: '/' });
    res.json({ ok: true });
  }));
  app.get('/api/credentials', async (req, res) => {
    if (!configured) return res.json({ source: 'demo', credentials: demoCredentials, syncedAt: new Date().toISOString() });
    const google = req.session?.google;
    if (!google) return res.status(401).json({ error: 'Inicia sesión con tu cuenta de Google.' });
    try {
      if (google.expires < Date.now() + 30000) {
        if (!google.refreshToken) return res.status(401).json({ error: 'La autorización caducó. Vuelve a iniciar sesión.' });
        const token = await tokenRequest({ grant_type: 'refresh_token', refresh_token: google.refreshToken });
        google.accessToken = token.access_token;
        google.expires = Date.now() + (token.expires_in || 3600) * 1000;
      }
      const range = encodeURIComponent(sheetRange(config.GOOGLE_SHEET_TAB));
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.GOOGLE_SPREADSHEET_ID)}/values/${range}?valueRenderOption=FORMATTED_VALUE`;
      const result = await googleFetch(url, { headers: { Authorization: `Bearer ${google.accessToken}` } });
      if (result.status === 401) return res.status(401).json({ error: 'La autorización caducó. Vuelve a iniciar sesión.' });
      if (!result.ok) return res.status(502).json({ error: 'No se pudo leer la hoja. Revisa el ID, la pestaña, los permisos y que Google Sheets API esté habilitada.' });
      let credentials;
      try { credentials = parseSheet(result.body.values); } catch (error) { return res.status(422).json({ error: error.message }); }
      res.json({ source: 'google', credentials, syncedAt: new Date().toISOString() });
    } catch { res.status(502).json({ error: 'No se pudo conectar con Google. Intenta sincronizar de nuevo.' }); }
  });
  app.get('/download/clave-local.zip', async (req, res) => {
    if (production) return res.sendStatus(404);
    res.attachment('clave-local.zip').type('application/zip').send(await buildProjectArchive());
  });
  app.get('/api/project-export/windows', async (req, res) => {
    if (production) return res.sendStatus(404);
    res.json(await buildWindowsInstaller());
  });
  app.use(express.static(fileURLToPath(new URL('./public', import.meta.url)), { etag: false, lastModified: false }));
  app.use((error, req, res, next) => { res.status(500).json({ error: 'Ocurrió un error al procesar la solicitud.' }); });
  return app;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const preview = process.argv.includes('--preview');
  const host = preview || process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';
  const app = createApp(process.env, fetch, { preview });
  const server = app.listen(port, host, () => console.log(`CLAVE en ${host}:${port}. Las credenciales y los tokens no se registran.`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => server.close(() => { app.locals.close(); process.exit(0); }));
}
