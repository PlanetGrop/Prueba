import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { EncryptedSessionStore, SESSION_DURATION } from '../lib/session-store.js';

const secret = 'test-only-cryptographic-session-secret-32-characters';
const call = (store, method, ...args) => new Promise((resolve, reject) => store[method](...args, (error, value) => error ? reject(error) : resolve(value)));

test('sessions survive reopening but never store OAuth tokens as plaintext', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'clave-session-'));
  const filename = join(directory, 'sessions.sqlite');
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  let store = new EncryptedSessionStore({ filename, secret });
  const value = { cookie: { expires: new Date(Date.now() + SESSION_DURATION) }, google: { email: 'owner@example.com', accessToken: 'test-private-access-token', refreshToken: 'test-private-refresh-token', authenticatedAt: Date.now() } };
  await call(store, 'set', 'one', value);
  const db = new DatabaseSync(filename);
  const row = db.prepare('SELECT payload FROM sessions WHERE sid=?').get('one');
  assert.ok(!Buffer.from(row.payload).includes(Buffer.from(value.google.accessToken)));
  assert.ok(!Buffer.from(row.payload).includes(Buffer.from(value.google.refreshToken)));
  db.close(); store.close();
  store = new EncryptedSessionStore({ filename, secret });
  assert.equal((await call(store, 'get', 'one')).google.accessToken, value.google.accessToken);
  await call(store, 'destroy', 'one');
  assert.equal(await call(store, 'get', 'one'), null);
  store.close();
});

test('polling cannot extend fixed session expiry', async () => {
  let clock = 100000;
  const store = new EncryptedSessionStore({ filename: ':memory:', secret, now: () => clock });
  const value = { startedAt: clock, cookie: { expires: new Date(clock + SESSION_DURATION) } };
  await call(store, 'set', 'one', value);
  clock += SESSION_DURATION - 1000;
  await call(store, 'touch', 'one', { ...value, cookie: { expires: new Date(clock + SESSION_DURATION) } });
  assert.ok(await call(store, 'get', 'one'));
  clock += 1000;
  assert.equal(await call(store, 'get', 'one'), null);
  store.close();
});

test('altered ciphertext or a changed encryption key invalidates a session', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'clave-session-'));
  const filename = join(directory, 'sessions.sqlite');
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const store = new EncryptedSessionStore({ filename, secret });
  await call(store, 'set', 'tampered', { startedAt: Date.now(), google: { accessToken: 'test-token' } });
  const db = new DatabaseSync(filename);
  const bytes = Buffer.from(db.prepare('SELECT payload FROM sessions WHERE sid=?').get('tampered').payload);
  bytes[bytes.length - 1] ^= 1;
  db.prepare('UPDATE sessions SET payload=? WHERE sid=?').run(bytes, 'tampered'); db.close();
  assert.equal(await call(store, 'get', 'tampered'), null);
  await call(store, 'set', 'new-key', { startedAt: Date.now() }); store.close();
  const changed = new EncryptedSessionStore({ filename, secret: `${secret}-changed` });
  assert.equal(await call(changed, 'get', 'new-key'), null); changed.close();
});
