import crypto from 'node:crypto';
import { query } from './db.js';

const SESSION_COOKIE = 'billshare_sid';
const SESSION_DAYS = 30;

export function createSession(userId) {
  const id = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  return { id, expiresAt };
}

export async function persistSession(id, userId, expiresAt) {
  await query('INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)', [id, userId, expiresAt]);
}

export function setSessionCookie(res, id, expiresAt) {
  res.cookie(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    expires: expiresAt,
    path: '/',
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export async function requireAuth(req, res, next) {
  try {
    const sid = req.cookies?.[SESSION_COOKIE];
    if (!sid) return res.status(401).json({ error: 'Not signed in' });
    const { rows } = await query(
      `SELECT u.id, u.email, u.name
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = $1 AND s.expires_at > now()`,
      [sid],
    );
    if (rows.length === 0) {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'Session expired' });
    }
    req.user = rows[0];
    req.sessionId = sid;
    return next();
  } catch (err) {
    return next(err);
  }
}

export function destroySession(id) {
  return query('DELETE FROM sessions WHERE id = $1', [id]);
}

// Returns { group, member } when the user can access the group, else null.
// `member` is the membership row linked to this user (may be null for the owner
// if their member row is not linked to the account).
export async function loadGroupAccess(userId, groupId) {
  const { rows } = await query(
    `SELECT g.*,
            m.id AS member_id,
            m.is_owner AS member_is_owner
       FROM groups g
       LEFT JOIN members m ON m.group_id = g.id AND m.user_id = $1
      WHERE g.id = $2
      LIMIT 1`,
    [userId, groupId],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  const isOwner = row.owner_id === userId;
  if (!isOwner && !row.member_id) return null;
  return {
    group: row,
    isOwner,
    memberId: row.member_id || null,
  };
}

export async function loadBillAccess(userId, billId) {
  const { rows } = await query('SELECT * FROM bills WHERE id = $1', [billId]);
  if (rows.length === 0) return null;
  const bill = rows[0];
  const access = await loadGroupAccess(userId, bill.group_id);
  if (!access) return null;
  return { bill, ...access };
}
