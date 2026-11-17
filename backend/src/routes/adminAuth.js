import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// Keep the credentials ONLY in the backend environment (never in the GitHub Pages bundle).
// Admin sessions are short-lived, memory-only bearer tokens; restarting the server revokes them.
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const SESSION_LIMIT = 24;
const configuredLogin = (process.env.ADMIN_USERNAME || '').trim();
const configuredPassword = process.env.ADMIN_PASSWORD || '';
const enabled = configuredLogin.length >= 6 && configuredPassword.length >= 20;
const sessions = new Map();

function digest(value) {
  return createHash('sha256').update(value, 'utf8').digest();
}

function matches(candidate, expected) {
  const actualHash = digest(candidate);
  const expectedHash = digest(expected);
  return timingSafeEqual(actualHash, expectedHash);
}

function pruneSessions() {
  const now = Date.now();
  for (const [key, expiresAt] of sessions) {
    if (expiresAt <= now) sessions.delete(key);
  }
  while (sessions.size >= SESSION_LIMIT) sessions.delete(sessions.keys().next().value);
}

function readBearer(req) {
  const header = req.get('authorization') || '';
  const match = /^Bearer ([a-zA-Z0-9_-]{32,128})$/u.exec(header);
  return match?.[1] || '';
}

export function requireAdmin(req, res, next) {
  if (!enabled) return res.status(503).json({ ok: false, error: 'ADMIN_NOT_CONFIGURED' });
  const token = readBearer(req);
  const key = token ? digest(token).toString('hex') : '';
  const expiresAt = sessions.get(key);
  if (!expiresAt || expiresAt <= Date.now()) {
    if (key) sessions.delete(key);
    return res.status(401).json({ ok: false, error: 'ADMIN_AUTH_REQUIRED' });
  }
  req.adminSessionKey = key;
  req.adminSessionExpiresAt = expiresAt;
  next();
}

export function registerAdminAuthRoutes(app, limitLogin) {
  app.post('/api/admin/login', limitLogin, (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!enabled) return res.status(503).json({ ok: false, error: 'ADMIN_NOT_CONFIGURED' });
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string'
      || username.length > 128 || password.length > 256) {
      return res.status(400).json({ ok: false, error: 'INVALID_CREDENTIALS' });
    }
    // Compare both fields without shortcutting to avoid leaking the valid username.
    const loginValid = matches(username, configuredLogin);
    const passwordValid = matches(password, configuredPassword);
    if (!(loginValid && passwordValid)) {
      return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });
    }
    pruneSessions();
    const token = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + SESSION_TTL_MS;
    sessions.set(digest(token).toString('hex'), expiresAt);
    return res.json({ ok: true, token, expiresAt });
  });

  app.get('/api/admin/session', requireAdmin, (req, res) => {
    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, expiresAt: req.adminSessionExpiresAt });
  });

  app.post('/api/admin/logout', requireAdmin, (req, res) => {
    sessions.delete(req.adminSessionKey);
    return res.json({ ok: true });
  });
}
