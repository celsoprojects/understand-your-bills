import { Router } from 'express';
import { query, tx } from '../db.js';
import { requireAuth, loadGroupAccess } from '../auth.js';
import { logAudit } from '../lib/audit.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.use(requireAuth);

async function requireOwner(req, res, next) {
  const access = await loadGroupAccess(req.user.id, Number(req.params.id || req.params.groupId));
  if (!access) return res.status(404).json({ error: 'Group not found' });
  if (!access.isOwner) return res.status(403).json({ error: 'Only the organizer can do that' });
  req.groupAccess = access;
  return next();
}

router.get('/', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT g.*,
            (g.owner_id = $1) AS is_owner,
            (SELECT count(*)::int FROM members m WHERE m.group_id = g.id) AS member_count,
            (SELECT count(*)::int FROM bills b WHERE b.group_id = g.id) AS bill_count
       FROM groups g
      WHERE g.owner_id = $1
         OR EXISTS (SELECT 1 FROM members m WHERE m.group_id = g.id AND m.user_id = $1)
      ORDER BY g.created_at DESC`,
    [req.user.id],
  );
  res.json({ groups: rows });
}));

router.post('/', wrap(async (req, res) => {
  const { name, provider, currency } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Group name is required' });
  const group = await tx(async (client) => {
    const { rows } = await client.query(
      'INSERT INTO groups (owner_id, name, provider, currency) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.user.id, name, provider || 'Other', currency || 'USD'],
    );
    const created = rows[0];
    await client.query(
      `INSERT INTO members (group_id, user_id, name, email, is_owner, status)
       VALUES ($1, $2, $3, $4, true, 'active')`,
      [created.id, req.user.id, req.user.name, req.user.email],
    );
    return created;
  });
  await logAudit({ groupId: group.id, actorId: req.user.id, action: 'group.created', detail: { name } });
  res.status(201).json({ group });
}));

router.get('/:id', wrap(async (req, res) => {
  const access = await loadGroupAccess(req.user.id, Number(req.params.id));
  if (!access) return res.status(404).json({ error: 'Group not found' });
  const groupId = access.group.id;
  const [members, lines, bills, audit] = await Promise.all([
    query('SELECT * FROM members WHERE group_id = $1 ORDER BY is_owner DESC, id ASC', [groupId]),
    query('SELECT * FROM lines WHERE group_id = $1 ORDER BY id ASC', [groupId]),
    query('SELECT * FROM bills WHERE group_id = $1 ORDER BY period_label DESC, id DESC', [groupId]),
    query('SELECT * FROM audit_events WHERE group_id = $1 ORDER BY created_at DESC LIMIT 30', [groupId]),
  ]);
  res.json({
    group: access.group,
    isOwner: access.isOwner,
    myMemberId: access.memberId,
    members: members.rows,
    lines: lines.rows,
    bills: bills.rows,
    audit: audit.rows,
  });
}));

router.patch('/:id', requireOwner, wrap(async (req, res) => {
  const { name, provider, currency } = req.body || {};
  const { rows } = await query(
    `UPDATE groups SET name = COALESCE($1, name),
                       provider = COALESCE($2, provider),
                       currency = COALESCE($3, currency)
     WHERE id = $4 RETURNING *`,
    [name ?? null, provider ?? null, currency ?? null, req.groupAccess.group.id],
  );
  res.json({ group: rows[0] });
}));

// --- Members -------------------------------------------------------------

router.post('/:id/members', requireOwner, wrap(async (req, res) => {
  const { name, email, phone_number } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Member name is required' });
  if (email) {
    const existingUser = await query('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
    const userId = existingUser.rows[0]?.id ?? null;
    const { rows } = await query(
      `INSERT INTO members (group_id, user_id, name, email, phone_number, status)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.groupAccess.group.id, userId, name, email, phone_number ?? null, userId ? 'active' : 'invited'],
    );
    await logAudit({
      groupId: req.groupAccess.group.id,
      actorId: req.user.id,
      action: 'member.added',
      detail: { name, email, linked: Boolean(userId) },
    });
    return res.status(201).json({ member: rows[0] });
  }
  const { rows } = await query(
    `INSERT INTO members (group_id, name, email, phone_number, status)
     VALUES ($1, $2, NULL, $3, 'active') RETURNING *`,
    [req.groupAccess.group.id, name, phone_number ?? null],
  );
  await logAudit({ groupId: req.groupAccess.group.id, actorId: req.user.id, action: 'member.added', detail: { name } });
  res.status(201).json({ member: rows[0] });
}));

router.patch('/:id/members/:memberId', requireOwner, wrap(async (req, res) => {
  const { name, email, phone_number } = req.body || {};
  const { rows } = await query(
    `UPDATE members SET name = COALESCE($1, name),
                        email = COALESCE($2, email),
                        phone_number = COALESCE($3, phone_number)
     WHERE id = $4 AND group_id = $5 RETURNING *`,
    [name ?? null, email ?? null, phone_number ?? null, Number(req.params.memberId), req.groupAccess.group.id],
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Member not found' });
  res.json({ member: rows[0] });
}));

router.delete('/:id/members/:memberId', requireOwner, wrap(async (req, res) => {
  const memberId = Number(req.params.memberId);
  const groupId = req.groupAccess.group.id;
  const { rows } = await query('SELECT is_owner FROM members WHERE id = $1 AND group_id = $2', [memberId, groupId]);
  if (rows.length === 0) return res.status(404).json({ error: 'Member not found' });
  if (rows[0].is_owner) return res.status(400).json({ error: 'The organizer cannot be removed' });
  await query('DELETE FROM members WHERE id = $1 AND group_id = $2', [memberId, groupId]);
  await logAudit({ groupId, actorId: req.user.id, action: 'member.removed', detail: { memberId } });
  res.json({ ok: true });
}));

// --- Lines ---------------------------------------------------------------

router.post('/:id/lines', requireOwner, wrap(async (req, res) => {
  const { label, phone_number, device, member_id, active_from, active_to } = req.body || {};
  if (!label) return res.status(400).json({ error: 'Line label is required' });
  const { rows } = await query(
    `INSERT INTO lines (group_id, member_id, label, phone_number, device, active_from, active_to)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      req.groupAccess.group.id,
      member_id || null,
      label,
      phone_number ?? null,
      device ?? null,
      active_from || null,
      active_to || null,
    ],
  );
  await logAudit({
    groupId: req.groupAccess.group.id,
    actorId: req.user.id,
    action: 'line.created',
    detail: { label, member_id: member_id || null },
  });
  res.status(201).json({ line: rows[0] });
}));

router.patch('/:id/lines/:lineId', requireOwner, wrap(async (req, res) => {
  const body = req.body || {};
  const { label, phone_number, device, active_from, active_to } = body;
  // member_id is sent explicitly by the editor, so an empty value must clear the assignment.
  const hasMember = Object.hasOwn(body, 'member_id');
  const { rows } = await query(
    `UPDATE lines SET label = COALESCE($1, label),
                      phone_number = COALESCE($2, phone_number),
                      device = COALESCE($3, device),
                      member_id = CASE WHEN $4::boolean THEN $5::integer ELSE member_id END,
                      active_from = COALESCE($6, active_from),
                      active_to = COALESCE($7, active_to)
     WHERE id = $8 AND group_id = $9 RETURNING *`,
    [
      label ?? null,
      phone_number ?? null,
      device ?? null,
      hasMember,
      hasMember ? body.member_id ?? null : null,
      active_from || null,
      active_to || null,
      Number(req.params.lineId),
      req.groupAccess.group.id,
    ],
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Line not found' });
  res.json({ line: rows[0] });
}));

router.delete('/:id/lines/:lineId', requireOwner, wrap(async (req, res) => {
  await query('DELETE FROM lines WHERE id = $1 AND group_id = $2', [Number(req.params.lineId), req.groupAccess.group.id]);
  res.json({ ok: true });
}));

router.get('/:id/audit', wrap(async (req, res) => {
  const access = await loadGroupAccess(req.user.id, Number(req.params.id));
  if (!access) return res.status(404).json({ error: 'Group not found' });
  const { rows } = await query(
    'SELECT * FROM audit_events WHERE group_id = $1 ORDER BY created_at DESC LIMIT 100',
    [access.group.id],
  );
  res.json({ audit: rows });
}));

export default router;
