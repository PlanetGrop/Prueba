import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { unzipSync, strFromU8 } from 'fflate';
import { createHash } from 'node:crypto';
import { createApp } from '../server.js';
import { parseSheet, sheetRange } from '../lib/sheets.js';

const teamSheet = [
  ['Departamento/Area', 'Colaborador(nombre completo)', 'Cuenta de Googlev', '', '', 'MOCHAHOST (995-465)', '', 'SIRETT', '', '', 'SERVIDOR', ''],
  ['', '', 'Correo', 'Contraseña', 'BITRIX', 'Correo', 'Contraseña', 'Usuario ', 'Contraseña', '', 'USUARIO', 'CONTRASEÑA'],
  ['Tecnología', 'Persona de prueba', 'demo@example.com', 'demo-google', 'demo-bitrix', 'host@example.com', 'demo-host', 'usuario-sirett', 'demo-sirett', '', 'usuario-servidor', 'demo-server'],
  ['', 'Otra persona', 'otra@example.com', 'demo-otra']
];

test('reads the supplied two-row layout, departments, all four paired services and Bitrix', () => {
  const rows = parseSheet(teamSheet);
  assert.equal(rows.length, 6);
  assert.deepEqual(rows.slice(0, 5).map(r => r.service), ['Google', 'Bitrix', 'MOCHAHOST (995-465)', 'SIRETT', 'SERVIDOR']);
  assert.equal(rows[1].password, 'demo-bitrix');
  assert.equal(rows[1].username, '');
  assert.equal(rows[4].password, 'demo-server');
  assert.equal(rows[5].category, 'Tecnología');
  assert.equal(rows[5].collaborator, 'Otra persona');
  assert.equal(new Set(rows.map(r => r.id)).size, rows.length);
});
test('reads a simple layout without trimming passwords or parsing them as numbers', () => {
  assert.equal(parseSheet([['Servicio', 'Email', 'Clave'], ['Apple ID', 'test@example.com', ' 00123 ']])[0].password, ' 00123 ');
  assert.deepEqual(parseSheet([]), []);
  assert.throws(() => parseSheet([['Incorrecto'], ['algo']]), /primera fila/);
  assert.throws(() => parseSheet([['Departamento/Area', 'Colaborador'], ['', 'Sin encabezados']]), /segunda fila/);
});
test('escapes tab names for Google Sheets ranges', () => assert.equal(sheetRange("Equipo's"), "'Equipo''s'!A1:ZZ10001"));

const config = {
  GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret', GOOGLE_ALLOWED_EMAIL: 'owner@example.com',
  GOOGLE_SPREADSHEET_ID: 'test-sheet', SESSION_SECRET: 'this-is-a-test-session-key-at-least-32-chars', APP_URL: 'http://localhost:3000'
};
async function serve(t, app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}`;
}
test('demo uses fake data, security headers, and no caching', async t => {
  const url = await serve(t, createApp({}));
  const response = await fetch(`${url}/api/credentials`);
  const body = await response.json();
  assert.equal(body.source, 'demo'); assert.equal(body.credentials.length, 6);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok(response.headers.get('content-security-policy').includes("default-src 'self'"));
  assert.ok(body.credentials.every(row => row.password.startsWith('Demo-')));
  assert.equal((await fetch(`${url}/`)).status, 200);
});
test('CSS and JavaScript load at both the root and a nested preview path', async t => {
  const app = express();
  app.use('/preview/public', createApp({}));
  app.use(createApp({}));
  const origin = await serve(t, app);
  for (const path of ['/', '/preview/public/index.html']) {
    const url = `${origin}${path}`;
    const htmlResponse = await fetch(url);
    assert.equal(htmlResponse.status, 200);
    assert.ok(!htmlResponse.headers.get('content-security-policy').includes('upgrade-insecure-requests'));
    const html = await htmlResponse.text();
    const cssPath = html.match(/rel="stylesheet" href="([^"]+)"/)[1];
    const scriptPath = html.match(/<script src="([^"]+)"/)[1];
    const css = await fetch(new URL(cssPath, url));
    const script = await fetch(new URL(scriptPath, url));
    assert.equal(css.status, 200);
    assert.match(css.headers.get('content-type'), /^text\/css/);
    assert.match(await css.text(), /\.sidebar\{/);
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type'), /javascript/);
    assert.match(await script.text(), /async function init/);
  }
});
test('configured app denies unauthenticated reads and cross-origin logout', async t => {
  const url = await serve(t, createApp(config));
  assert.equal((await fetch(`${url}/api/credentials`)).status, 401);
  assert.equal((await fetch(`${url}/auth/logout`, { method: 'POST', headers: { Origin: 'https://untrusted.example' } })).status, 403);
  assert.equal((await fetch(`${url}/auth/logout`, { method: 'POST', headers: { Origin: config.APP_URL } })).status, 200);
  const callback = await fetch(`${url}/auth/google/callback?state=wrong&code=fake`, { redirect: 'manual' });
  assert.equal(callback.headers.get('location'), '/?auth=error');
});
test('project download is a usable source ZIP without secrets or dependency files', async t => {
  const origin = await serve(t, createApp({}));
  const response = await fetch(`${origin}/download/clave-local.zip`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/zip');
  assert.match(response.headers.get('content-disposition'), /^attachment; filename="?clave-local\.zip"?$/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
  assert.ok(files['clave/server.js']);
  assert.ok(files['clave/lib/download.js']);
  assert.ok(files['clave/public/style.css']);
  assert.ok(files['clave/package-lock.json']);
  assert.ok(files['clave/README.md']);
  assert.ok(files['clave/.env.example']);
  assert.ok(!Object.keys(files).some(path => path.endsWith('/.env') || path.includes('/node_modules/') || path.includes('/.git/')));
  assert.equal(JSON.parse(strFromU8(files['clave/package.json'])).dependencies.fflate, '0.8.3');
});
test('Windows export transfers a complete project without using browser downloads', async t => {
  const origin = await serve(t, createApp({}));
  const response = await fetch(`${origin}/api/project-export/windows`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const { script, sha256 } = await response.json();
  const encoded = script.match(/\$claveBase64 = @'\n([A-Za-z0-9+/=\n]+)\n'@/)[1];
  const bytes = Buffer.from(encoded, 'base64');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), sha256);
  assert.ok(script.includes(`-ne '${sha256}'`));
  assert.ok(script.includes('Expand-Archive -LiteralPath'));
  assert.ok(script.includes('[Guid]::NewGuid()'));
  assert.ok(!script.includes('Set-ExecutionPolicy'));
  assert.ok(!script.includes('Invoke-WebRequest'));
  const files = unzipSync(bytes);
  assert.ok(files['clave/server.js']);
  assert.match(strFromU8(files['clave/public/index.html']), /id="export-windows"/);
  assert.match(strFromU8(files['clave/public/app.js']), /El navegador bloqueó la copia automática/);
  assert.ok(!Object.keys(files).some(path => path.endsWith('/.env') || path.includes('/node_modules/') || path.includes('/.git/')));
});
test('only demo preview allows embedding by ChatGPT; real credentials and production remain same-origin', async t => {
  const preview = await serve(t, createApp({}, fetch, { preview: true }));
  const response = await fetch(preview);
  assert.equal(response.headers.get('x-frame-options'), null);
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'self' https:\/\/chatgpt\.com https:\/\/chat\.openai\.com;/);
  assert.ok(!response.headers.get('content-security-policy').includes('frame-ancestors *'));
  for (const settings of [{}, config, { NODE_ENV: 'production', APP_URL: 'https://private.example' }]) {
    const url = await serve(t, createApp(settings, fetch, { preview: Boolean(Object.keys(settings).length) }));
    const headers = (await fetch(url)).headers;
    assert.equal(headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.match(headers.get('content-security-policy'), /frame-ancestors 'self';/);
  }
});

async function login(t, email = 'owner@example.com', sheetResult = { values: teamSheet }) {
  const calls = [];
  const mockGoogle = async (url, options) => {
    calls.push({ url, options });
    let body;
    if (url.includes('/token')) body = { access_token: 'private-server-token', refresh_token: 'private-refresh-token', expires_in: 3600 };
    else if (url.includes('userinfo')) body = { email, email_verified: true };
    else body = sheetResult;
    return { ok: true, status: 200, json: async () => body };
  };
  const url = await serve(t, createApp(config, mockGoogle));
  const auth = await fetch(`${url}/auth/google`, { redirect: 'manual' });
  let cookie = auth.headers.get('set-cookie').split(';')[0];
  const redirect = new URL(auth.headers.get('location'));
  assert.equal(redirect.searchParams.get('code_challenge_method'), 'S256');
  const callback = await fetch(`${url}/auth/google/callback?code=test&state=${redirect.searchParams.get('state')}`, { headers: { Cookie: cookie }, redirect: 'manual' });
  if (callback.headers.get('set-cookie')) cookie = callback.headers.get('set-cookie').split(';')[0];
  return { url, cookie, callback, calls };
}
test('Google OAuth authorizes only the configured owner; tokens remain server-side', async t => {
  const { url, cookie, calls } = await login(t);
  const status = await fetch(`${url}/api/status`, { headers: { Cookie: cookie } }).then(r => r.json());
  assert.equal(status.email, 'owner@example.com');
  assert.equal(status.authenticated, true);
  assert.ok(!JSON.stringify(status).includes('private-server-token'));
  const credentials = await fetch(`${url}/api/credentials`, { headers: { Cookie: cookie } }).then(r => r.json());
  assert.equal(credentials.source, 'google'); assert.equal(credentials.credentials.length, 6);
  assert.ok(!JSON.stringify(credentials).includes('private-server-token'));
  assert.ok(calls.some(c => c.url.includes('/spreadsheets/test-sheet/values/')));
  await fetch(`${url}/auth/logout`, { method: 'POST', headers: { Cookie: cookie, Origin: config.APP_URL } });
  assert.equal((await fetch(`${url}/api/credentials`, { headers: { Cookie: cookie } })).status, 401);
});
test('another Google account cannot read credentials', async t => {
  const { url, cookie, callback } = await login(t, 'someone-else@example.com');
  assert.equal(callback.headers.get('location'), '/?auth=denied');
  assert.equal((await fetch(`${url}/api/credentials`, { headers: { Cookie: cookie } })).status, 401);
});
test('invalid sheet headers return a useful error instead of a misleading empty success', async t => {
  const { url, cookie } = await login(t, 'owner@example.com', { values: [['Unknown']] });
  const response = await fetch(`${url}/api/credentials`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 422);
});
test('production refuses HTTP and short session secrets', () => {
  assert.throws(() => createApp({ ...config, NODE_ENV: 'production' }), /HTTPS/);
  assert.throws(() => createApp({ ...config, SESSION_SECRET: 'short' }), /32/);
});
