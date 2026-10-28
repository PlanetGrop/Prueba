import session from 'express-session';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

export const SESSION_DURATION = 15 * 60 * 1000;
const finish = (callback, ...args) => queueMicrotask(() => callback(...args));

// One-process deployment. Session tokens are encrypted before writing to SQLite.
export class EncryptedSessionStore extends session.Store {
  constructor({ filename, secret, now = Date.now }) {
    super();
    if (!secret || secret.length < 32) throw new Error('La clave de sesiones debe tener al menos 32 caracteres.');
    this.now = now;
    this.key = Buffer.from(hkdfSync('sha256', secret, '', 'clave/session-store/v1', 32));
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename);
    if (filename !== ':memory:') chmodSync(filename, 0o600);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, payload BLOB NOT NULL, expires INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);');
  }

  get(sid, callback) {
    try {
      const row = this.db.prepare('SELECT payload, expires FROM sessions WHERE sid = ?').get(sid);
      if (!row) return finish(callback, null, null);
      if (row.expires <= this.now()) { this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid); return finish(callback, null, null); }
      try {
        const bytes = Buffer.from(row.payload);
        if (bytes[0] !== 1 || bytes.length < 29) throw new Error('Formato de sesión inválido.');
        const decipher = createDecipheriv('aes-256-gcm', this.key, bytes.subarray(1, 13));
        decipher.setAAD(Buffer.from(sid));
        decipher.setAuthTag(bytes.subarray(13, 29));
        const value = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(29)), decipher.final()]).toString());
        finish(callback, null, value);
      } catch {
        this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
        finish(callback, null, null);
      }
    } catch (error) { finish(callback, error); }
  }

  set(sid, value, callback = () => {}) {
    try {
      const now = this.now();
      const started = value.google?.authenticatedAt || value.startedAt || now;
      const cookieExpiry = value.cookie?.expires ? new Date(value.cookie.expires).getTime() : now + SESSION_DURATION;
      const expires = Math.min(Number.isFinite(cookieExpiry) ? cookieExpiry : now + SESSION_DURATION, started + SESSION_DURATION);
      this.db.prepare('DELETE FROM sessions WHERE expires <= ?').run(now);
      if (expires <= now) return this.destroy(sid, callback);
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', this.key, iv);
      cipher.setAAD(Buffer.from(sid));
      const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
      const payload = Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), encrypted]);
      this.db.prepare('INSERT INTO sessions(sid, payload, expires) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET payload=excluded.payload, expires=excluded.expires').run(sid, payload, expires);
      finish(callback, null);
    } catch (error) { finish(callback, error); }
  }

  touch(sid, value, callback = () => {}) {
    // Fixed lifetime: polling the sheet cannot keep a session alive indefinitely.
    try { this.db.prepare('DELETE FROM sessions WHERE sid = ? AND expires <= ?').run(sid, this.now()); finish(callback, null); }
    catch (error) { finish(callback, error); }
  }

  destroy(sid, callback = () => {}) {
    try { this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid); finish(callback, null); }
    catch (error) { finish(callback, error); }
  }

  close() { this.db.close(); this.key.fill(0); }
}
