import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { demoCredentials, parseSheet, sheetRange } from './lib/sheets.js';
import { buildProjectArchive, buildWindowsInstaller } from './lib/download.js';

export function createApp(config = process.env, request = fetch, { preview = false } = {}) {
  const app = express();
  const required = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_ALLOWED_EMAIL', 'GOOGLE_SPREADSHEET_ID'];
  const configured = required.every(key => Boolean(config[key]?.trim()));
  const partial = required.some(key => Boolean(config[key]?.trim()));
  if (config.SESSION_SECRET && config.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET debe tener al menos 32 caracteres.');
  const appUrl = new URL(config.APP_URL || 'http://localhost:3000');
  const production = config.NODE_ENV === 'production';
  // Only the fake-data development preview may be framed by ChatGPT.
  const embeddedPreview = preview && !production && !configured;
  if (production && appUrl.protocol !== 'https:') throw new Error('APP_URL debe usar HTTPS en producción.');
  if (config.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.disable('x-powered-by');
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
    if (req.method === 'POST' && req.get('origin') !== appUrl.origin) return res.status(403).json({ error: 'Origen no autorizado.' });
    next();
  });
  app.use(session({
    name: 'clave.sid',
    secret: config.SESSION_SECRET || randomBytes(48).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, secure: production, sameSite: 'lax', maxAge: 15 * 60 * 1000 },
    rolling: false
  }));

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
    authenticated: Boolean(req.session.google), email: req.session.google?.email || null
  }));
  app.get('/auth/google', (req, res, next) => {
    if (!configured) return res.redirect('/?auth=setup');
    const state = randomBytes(32).toString('hex');
    const verifier = randomBytes(48).toString('base64url');
    req.session.oauth = { state, verifier, created: Date.now() };
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID, redirect_uri: `${appUrl.origin}/auth/google/callback`,
      response_type: 'code', scope: 'openid email https://www.googleapis.com/auth/spreadsheets.readonly',
      state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
      access_type: 'offline', prompt: 'consent', login_hint: config.GOOGLE_ALLOWED_EMAIL
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
      if (!user.ok || user.body.email_verified !== true || user.body.email?.toLowerCase() !== config.GOOGLE_ALLOWED_EMAIL.trim().toLowerCase()) return res.redirect('/?auth=denied');
      await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
      req.session.google = { email: user.body.email, accessToken: token.access_token, refreshToken: token.refresh_token, expires: Date.now() + (token.expires_in || 3600) * 1000 };
      await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
      res.redirect('/');
    } catch { res.redirect('/?auth=error'); }
  });
  app.post('/auth/logout', (req, res) => req.session.destroy(() => {
    res.clearCookie('clave.sid', { httpOnly: true, secure: production, sameSite: 'lax' });
    res.json({ ok: true });
  }));
  app.get('/api/credentials', async (req, res) => {
    if (!configured) return res.json({ source: 'demo', credentials: demoCredentials, syncedAt: new Date().toISOString() });
    const google = req.session.google;
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
    res.attachment('clave-local.zip').type('application/zip').send(await buildProjectArchive());
  });
  app.get('/api/project-export/windows', async (req, res) => {
    res.json(await buildWindowsInstaller());
  });
  app.use(express.static(fileURLToPath(new URL('./public', import.meta.url)), { etag: false, lastModified: false }));
  app.use((error, req, res, next) => { res.status(500).json({ error: 'Ocurrió un error al procesar la solicitud.' }); });
  return app;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const preview = process.argv.includes('--preview');
  const host = preview ? '0.0.0.0' : '127.0.0.1';
  createApp(process.env, fetch, { preview }).listen(port, host, () => console.log(`CLAVE en ${host}:${port}. Las credenciales y los tokens no se registran.`));
}
