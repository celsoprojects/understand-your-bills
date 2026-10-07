import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import {
  createSession,
  persistSession,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  destroySession,
} from '../auth.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.post('/register', wrap(async (req, res) => {
  const { email, name, password } = req.body || {};
  if (!email || !name || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const existing = await query('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }
  const hash = await bcrypt.hash(String(password), 10);
  const { rows } = await query(
    'INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, name',
    [String(email).toLowerCase().trim(), String(name).trim(), hash],
  );
  const user = rows[0];
  const session = createSession(user.id);
  await persistSession(session.id, user.id, session.expiresAt);
  setSessionCookie(res, session.id, session.expiresAt);
  return res.status(201).json({ user });
}));

router.post('/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  const { rows } = await query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
  if (rows.length === 0) return res.status(401).json({ error: 'Invalid email or password' });
  const user = rows[0];
  const ok = await bcrypt.compare(String(password), user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });
  const session = createSession(user.id);
  await persistSession(session.id, user.id, session.expiresAt);
  setSessionCookie(res, session.id, session.expiresAt);
  return res.json({ user: { id: user.id, email: user.email, name: user.name } });
}));

router.post('/logout', requireAuth, wrap(async (req, res) => {
  await destroySession(req.sessionId);
  clearSessionCookie(res);
  res.json({ ok: true });
}));

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
