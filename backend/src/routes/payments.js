import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, loadBillAccess } from '../auth.js';
import { logAudit } from '../lib/audit.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.use(requireAuth);

// --- Payments (ledger + arrears) -----------------------------------------

router.get('/bills/:id/payments', wrap(async (req, res) => {
  const access = await loadBillAccess(req.user.id, Number(req.params.id));
  if (!access) return res.status(404).json({ error: 'Bill not found' });
  const { rows } = await query(
    `SELECT p.*, m.name AS member_name
       FROM payments p JOIN members m ON m.id = p.member_id
      WHERE p.bill_id = $1 ORDER BY p.id ASC`,
    [access.bill.id],
  );
  res.json({ payments: rows.map((p) => ({ ...p, amount_cents: Number(p.amount_cents) })) });
}));

// A participant can claim a payment for themselves; the organizer can record
// payments for anyone in the group.
router.post('/bills/:id/payments', wrap(async (req, res) => {
  const access = await loadBillAccess(req.user.id, Number(req.params.id));
  if (!access) return res.status(404).json({ error: 'Bill not found' });
  const { member_id, amount_cents, method, paid_at, proof_note, status } = req.body || {};
  const targetMember = Number(member_id) || access.memberId;
  if (!targetMember) return res.status(400).json({ error: 'member_id is required' });
  if (!access.isOwner && targetMember !== access.memberId) {
    return res.status(403).json({ error: 'You can only record a payment for yourself' });
  }
  if (!amount_cents || Number(amount_cents) === 0) {
    return res.status(400).json({ error: 'Amount is required' });
  }
  const finalStatus = access.isOwner && status ? status : 'claimed';
  const { rows } = await query(
    `INSERT INTO payments (bill_id, member_id, amount_cents, method, paid_at, status, proof_note, recorded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      access.bill.id,
      targetMember,
      Number(amount_cents),
      method ?? null,
      paid_at || null,
      finalStatus,
      proof_note ?? null,
      req.user.id,
    ],
  );
  await logAudit({
    groupId: access.bill.group_id,
    billId: access.bill.id,
    actorId: req.user.id,
    action: 'payment.recorded',
    detail: { memberId: targetMember, amount_cents: Number(amount_cents), status: finalStatus },
  });
  res.status(201).json({ payment: { ...rows[0], amount_cents: Number(rows[0].amount_cents) } });
}));

router.patch('/payments/:paymentId', wrap(async (req, res) => {
  const { rows: paymentRows } = await query('SELECT * FROM payments WHERE id = $1', [Number(req.params.paymentId)]);
  if (paymentRows.length === 0) return res.status(404).json({ error: 'Payment not found' });
  const payment = paymentRows[0];
  const access = await loadBillAccess(req.user.id, payment.bill_id);
  if (!access) return res.status(404).json({ error: 'Bill not found' });
  if (!access.isOwner) return res.status(403).json({ error: 'Only the organizer can confirm or reject payments' });
  const { status, amount_cents, method, paid_at, proof_note } = req.body || {};
  const { rows } = await query(
    `UPDATE payments SET status = COALESCE($1, status),
                         amount_cents = COALESCE($2, amount_cents),
                         method = COALESCE($3, method),
                         paid_at = COALESCE($4, paid_at),
                         proof_note = COALESCE($5, proof_note)
     WHERE id = $6 RETURNING *`,
    [
      status ?? null,
      amount_cents === undefined || amount_cents === null ? null : Number(amount_cents),
      method ?? null,
      paid_at || null,
      proof_note ?? null,
      payment.id,
    ],
  );
  await logAudit({
    groupId: access.bill.group_id,
    billId: access.bill.id,
    actorId: req.user.id,
    action: 'payment.updated',
    detail: { paymentId: payment.id, status: rows[0].status },
  });
  res.json({ payment: { ...rows[0], amount_cents: Number(rows[0].amount_cents) } });
}));

router.delete('/payments/:paymentId', wrap(async (req, res) => {
  const { rows: paymentRows } = await query('SELECT * FROM payments WHERE id = $1', [Number(req.params.paymentId)]);
  if (paymentRows.length === 0) return res.status(404).json({ error: 'Payment not found' });
  const payment = paymentRows[0];
  const access = await loadBillAccess(req.user.id, payment.bill_id);
  if (!access || !access.isOwner) return res.status(403).json({ error: 'Only the organizer can remove a payment' });
  await query('DELETE FROM payments WHERE id = $1', [payment.id]);
  await logAudit({
    groupId: access.bill.group_id,
    billId: access.bill.id,
    actorId: req.user.id,
    action: 'payment.removed',
    detail: { paymentId: payment.id },
  });
  res.json({ ok: true });
}));

// --- Disputes, questions and claims --------------------------------------

router.get('/bills/:id/disputes', wrap(async (req, res) => {
  const access = await loadBillAccess(req.user.id, Number(req.params.id));
  if (!access) return res.status(404).json({ error: 'Bill not found' });
  const { rows } = await query(
    `SELECT d.*, m.name AS member_name, u.name AS author_name
       FROM disputes d
       LEFT JOIN members m ON m.id = d.member_id
       LEFT JOIN users u ON u.id = d.author_id
      WHERE d.bill_id = $1 ORDER BY d.created_at DESC`,
    [access.bill.id],
  );
  res.json({ disputes: rows });
}));

router.post('/bills/:id/disputes', wrap(async (req, res) => {
  const access = await loadBillAccess(req.user.id, Number(req.params.id));
  if (!access) return res.status(404).json({ error: 'Bill not found' });
  const { kind, message, member_id } = req.body || {};
  if (!message) return res.status(400).json({ error: 'Message is required' });
  const targetMember = Number(member_id) || access.memberId;
  if (!access.isOwner && targetMember && targetMember !== access.memberId) {
    return res.status(403).json({ error: 'You can only comment on your own statement' });
  }
  const { rows } = await query(
    `INSERT INTO disputes (bill_id, member_id, author_id, kind, message)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [access.bill.id, targetMember || null, req.user.id, kind || 'question', message],
  );
  await logAudit({
    groupId: access.bill.group_id,
    billId: access.bill.id,
    actorId: req.user.id,
    action: 'dispute.created',
    detail: { kind: kind || 'question', memberId: targetMember || null },
  });
  res.status(201).json({ dispute: rows[0] });
}));

router.patch('/disputes/:disputeId', wrap(async (req, res) => {
  const { rows: disputeRows } = await query('SELECT * FROM disputes WHERE id = $1', [Number(req.params.disputeId)]);
  if (disputeRows.length === 0) return res.status(404).json({ error: 'Not found' });
  const dispute = disputeRows[0];
  const access = await loadBillAccess(req.user.id, dispute.bill_id);
  if (!access) return res.status(404).json({ error: 'Bill not found' });
  if (!access.isOwner) return res.status(403).json({ error: 'Only the organizer can resolve a dispute' });
  const { status } = req.body || {};
  const { rows } = await query('UPDATE disputes SET status = COALESCE($1, status) WHERE id = $2 RETURNING *', [
    status ?? null,
    dispute.id,
  ]);
  await logAudit({
    groupId: access.bill.group_id,
    billId: access.bill.id,
    actorId: req.user.id,
    action: 'dispute.updated',
    detail: { disputeId: dispute.id, status: rows[0].status },
  });
  res.json({ dispute: rows[0] });
}));

export default router;
