import { Router } from 'express';
import { query, tx } from '../db.js';
import { requireAuth, loadGroupAccess, loadBillAccess } from '../auth.js';
import { logAudit } from '../lib/audit.js';
import { allocate, reconcile, DEFAULT_RULES, CATEGORIES } from '../lib/allocation.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.use(requireAuth);

function seedFor(periodLabel) {
  const digits = String(periodLabel || '').replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}

async function loadContext(billId) {
  const [members, lines, charges] = await Promise.all([
    query('SELECT id, name, is_owner FROM members WHERE group_id = (SELECT group_id FROM bills WHERE id = $1) ORDER BY is_owner DESC, id ASC', [billId]),
    query('SELECT * FROM lines WHERE group_id = (SELECT group_id FROM bills WHERE id = $1)', [billId]),
    query('SELECT * FROM charges WHERE bill_id = $1 ORDER BY id ASC', [billId]),
  ]);
  return { members: members.rows, lines: lines.rows, charges: charges.rows };
}

async function latestAllocation(billId) {
  const { rows } = await query('SELECT * FROM allocations WHERE bill_id = $1 ORDER BY id DESC LIMIT 1', [billId]);
  if (rows.length === 0) return null;
  const allocation = rows[0];
  const items = await query('SELECT * FROM allocation_items WHERE allocation_id = $1', [allocation.id]);
  return { ...allocation, items: items.rows };
}

function billSummary(bill) {
  return {
    id: bill.id,
    group_id: bill.group_id,
    period_label: bill.period_label,
    statement_date: bill.statement_date,
    due_date: bill.due_date,
    provider_total_cents: Number(bill.provider_total_cents),
    notes: bill.notes,
    status: bill.status,
    source_filename: bill.source_filename,
  };
}

// --- Bills ---------------------------------------------------------------

router.get('/groups/:groupId/bills', wrap(async (req, res) => {
  const access = await loadGroupAccess(req.user.id, Number(req.params.groupId));
  if (!access) return res.status(404).json({ error: 'Group not found' });
  const { rows } = await query(
    'SELECT * FROM bills WHERE group_id = $1 ORDER BY period_label DESC, id DESC',
    [access.group.id],
  );
  res.json({ bills: rows });
}));

router.post('/groups/:groupId/bills', wrap(async (req, res) => {
  const access = await loadGroupAccess(req.user.id, Number(req.params.groupId));
  if (!access) return res.status(404).json({ error: 'Group not found' });
  if (!access.isOwner) return res.status(403).json({ error: 'Only the organizer can add bills' });
  const { period_label, statement_date, due_date, provider_total_cents, notes, source_filename, charges } = req.body || {};
  if (!period_label) return res.status(400).json({ error: 'A billing period (e.g. 2026-09) is required' });

  const bill = await tx(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO bills (group_id, period_label, statement_date, due_date, provider_total_cents, notes, source_filename, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        access.group.id,
        period_label,
        statement_date || null,
        due_date || null,
        Number(provider_total_cents) || 0,
        notes ?? null,
        source_filename ?? null,
        req.user.id,
      ],
    );
    const created = rows[0];
    for (const charge of charges || []) {
      await client.query(
        `INSERT INTO charges (bill_id, category, label, amount_cents, is_personal, member_id, line_id, source_ref, confidence)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          created.id,
          CATEGORIES.includes(charge.category) ? charge.category : 'other',
          charge.label || 'Charge',
          Number(charge.amount_cents) || 0,
          Boolean(charge.is_personal),
          charge.member_id || null,
          charge.line_id || null,
          charge.source_ref ?? null,
          charge.confidence ?? null,
        ],
      );
    }
    return created;
  });

  await logAudit({
    groupId: access.group.id,
    billId: bill.id,
    actorId: req.user.id,
    action: 'bill.created',
    detail: { period_label, chargeCount: (charges || []).length },
  });
  res.status(201).json({ bill });
}));

router.get('/bills/:id', wrap(async (req, res) => {
  const access = await loadBillAccess(req.user.id, Number(req.params.id));
  if (!access) return res.status(404).json({ error: 'Bill not found' });
  const billId = access.bill.id;
  const [{ members, lines, charges }, allocation, payments, disputes, visibility, shares, audit] = await Promise.all([
    loadContext(billId),
    latestAllocation(billId),
    query('SELECT * FROM payments WHERE bill_id = $1 ORDER BY id ASC', [billId]),
    query('SELECT * FROM disputes WHERE bill_id = $1 ORDER BY created_at DESC', [billId]),
    query('SELECT * FROM bill_visibility WHERE bill_id = $1', [billId]),
    query('SELECT id, scope, expires_at, revoked, created_at FROM share_links WHERE bill_id = $1 ORDER BY created_at DESC', [billId]),
    query('SELECT * FROM audit_events WHERE bill_id = $1 ORDER BY created_at DESC LIMIT 50', [billId]),
  ]);

  const chargeTotal = charges.reduce((sum, c) => sum + Number(c.amount_cents), 0);
  const reconciliation = reconcile(
    allocation ? { items: allocation.items.map((i) => ({ totalCents: Number(i.total_cents) })) } : { items: [] },
    Number(access.bill.provider_total_cents),
  );

  res.json({
    bill: billSummary(access.bill),
    isOwner: access.isOwner,
    myMemberId: access.memberId,
    members,
    lines,
    charges,
    allocation: allocation
      ? {
          id: allocation.id,
          rules: allocation.rules,
          summary: allocation.summary,
          created_at: allocation.created_at,
          items: allocation.items.map((i) => ({
            memberId: i.member_id,
            sharedCents: Number(i.shared_cents),
            personalCents: Number(i.personal_cents),
            totalCents: Number(i.total_cents),
            breakdown: i.breakdown,
          })),
        }
      : null,
    chargeTotalCents: chargeTotal,
    reconciliation,
    payments: payments.rows.map((p) => ({ ...p, amount_cents: Number(p.amount_cents) })),
    disputes: disputes.rows,
    visibility: visibility.rows,
    shares: shares.rows,
    audit: audit.rows,
  });
}));

router.patch('/bills/:id', wrap(async (req, res) => {
  const access = await loadBillAccess(req.user.id, Number(req.params.id));
  if (!access) return res.status(404).json({ error: 'Bill not found' });
  if (!access.isOwner) return res.status(403).json({ error: 'Only the organizer can edit the bill' });
  const body = req.body || {};
  const { provider_total_cents, notes, status, period_label } = body;
  // statement_date / due_date are only touched when the editor sends them, so an
  // explicit empty value clears the date instead of silently keeping the old one.
  const hasStatement = Object.hasOwn(body, 'statement_date');
  const hasDue = Object.hasOwn(body, 'due_date');
  const { rows } = await query(
    `UPDATE bills SET statement_date = CASE WHEN $1::boolean THEN $2::date ELSE statement_date END,
                      due_date = CASE WHEN $3::boolean THEN $4::date ELSE due_date END,
                      provider_total_cents = COALESCE($5, provider_total_cents),
                      notes = COALESCE($6, notes),
                      status = COALESCE($7, status),
                      period_label = COALESCE($8, period_label)
     WHERE id = $9 RETURNING *`,
    [
      hasStatement,
      hasStatement ? body.statement_date || null : null,
      hasDue,
      hasDue ? body.due_date || null : null,
      provider_total_cents === undefined || provider_total_cents === null ? null : Number(provider_total_cents),
      notes ?? null,
      status ?? null,
      period_label ?? null,
      access.bill.id,
    ],
  );
  await logAudit({
    groupId: access.bill.group_id,
    billId: access.bill.id,
    actorId: req.user.id,
    action: 'bill.updated',
    detail: { status: status ?? rows[0].status },
  });
  res.json({ bill: rows[0] });
}));

router.delete('/bills/:id', wrap(async (req, res) => {
  const access = await loadBillAccess(req.user.id, Number(req.params.id));
  if (!access) return res.status(404).json({ error: 'Bill not found' });
  if (!access.isOwner) return res.status(403).json({ error: 'Only the organizer can delete the bill' });
  await query('DELETE FROM bills WHERE id = $1', [access.bill.id]);
  await logAudit({ groupId: access.bill.group_id, actorId: req.user.id, action: 'bill.deleted', detail: { billId: access.bill.id } });
  res.json({ ok: true });
}));

// --- Charges -------------------------------------------------------------

router.post('/bills/:id/charges', wrap(async (req, res) => {
  const access = await loadBillAccess(req.user.id, Number(req.params.id));
  if (!access) return res.status(404).json({ error: 'Bill not found' });
  if (!access.isOwner) return res.status(403).json({ error: 'Only the organizer can edit charges' });
  const { category, label, amount_cents, is_personal, member_id, line_id, source_ref, confidence } = req.body || {};
  const { rows } = await query(
    `INSERT INTO charges (bill_id, category, label, amount_cents, is_personal, member_id, line_id, source_ref, confidence)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      access.bill.id,
      CATEGORIES.includes(category) ? category : 'other',
      label || 'Charge',
      Number(amount_cents) || 0,
      Boolean(is_personal),
      member_id || null,
      line_id || null,
      source_ref ?? null,
      confidence ?? null,
    ],
  );
  await logAudit({
    groupId: access.bill.group_id,
    billId: access.bill.id,
    actorId: req.user.id,
    action: 'charge.added',
    detail: { label: rows[0].label, amount_cents: Number(rows[0].amount_cents) },
  });
  res.status(201).json({ charge: rows[0] });
}));

router.patch('/bills/:id/charges/:chargeId', wrap(async (req, res) => {
  const access = await loadBillAccess(req.user.id, Number(req.params.id));
  if (!access) return res.status(404).json({ error: 'Bill not found' });
  if (!access.isOwner) return res.status(403).json({ error: 'Only the organizer can edit charges' });
  const { category, label, amount_cents, is_personal, member_id, line_id, source_ref, confidence } = req.body || {};
  const { rows } = await query(
    `UPDATE charges SET category = COALESCE($1, category),
                        label = COALESCE($2, label),
                        amount_cents = COALESCE($3, amount_cents),
                        is_personal = COALESCE($4, is_personal),
                        member_id = $5,
                        line_id = $6,
                        source_ref = COALESCE($7, source_ref),
                        confidence = COALESCE($8, confidence)
     WHERE id = $9 AND bill_id = $10 RETURNING *`,
    [
      category ?? null,
      label ?? null,
      amount_cents === undefined || amount_cents === null ? null : Number(amount_cents),
      is_personal === undefined || is_personal === null ? null : Boolean(is_personal),
      member_id ?? null,
      line_id ?? null,
      source_ref ?? null,
      confidence ?? null,
      Number(req.params.chargeId),
      access.bill.id,
    ],
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Charge not found' });
  await logAudit({
    groupId: access.bill.group_id,
    billId: access.bill.id,
    actorId: req.user.id,
    action: 'charge.updated',
    detail: { chargeId: rows[0].id },
  });
  res.json({ charge: rows[0] });
}));

router.delete('/bills/:id/charges/:chargeId', wrap(async (req, res) => {
  const access = await loadBillAccess(req.user.id, Number(req.params.id));
  if (!access) return res.status(404).json({ error: 'Bill not found' });
  if (!access.isOwner) return res.status(403).json({ error: 'Only the organizer can edit charges' });
  await query('DELETE FROM charges WHERE id = $1 AND bill_id = $2', [Number(req.params.chargeId), access.bill.id]);
  res.json({ ok: true });
}));

// --- Allocation ----------------------------------------------------------

router.post('/bills/:id/allocate', wrap(async (req, res) => {
  const access = await loadBillAccess(req.user.id, Number(req.params.id));
  if (!access) return res.status(404).json({ error: 'Bill not found' });
  if (!access.isOwner) return res.status(403).json({ error: 'Only the organizer can run the split' });
  const rules = { ...DEFAULT_RULES, ...(req.body?.rules || {}) };
  const { members, lines, charges } = await loadContext(access.bill.id);

  const ownerMemberId = members.find((m) => m.is_owner)?.id || members[0]?.id || null;
  const allocation = allocate({
    charges,
    members,
    lines,
    rules,
    ownerMemberId,
    seed: seedFor(access.bill.period_label),
  });

  const summary = {
    allocatedCents: allocation.allocatedCents,
    retainedCents: allocation.retainedCents,
    warnings: allocation.warnings,
    memberCount: members.length,
    chargeCount: charges.length,
  };

  const saved = await tx(async (client) => {
    const { rows } = await client.query(
      'INSERT INTO allocations (bill_id, rules, summary, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
      [access.bill.id, JSON.stringify(allocation.rules), JSON.stringify(summary), req.user.id],
    );
    const record = rows[0];
    for (const item of allocation.items) {
      await client.query(
        `INSERT INTO allocation_items (allocation_id, member_id, shared_cents, personal_cents, total_cents, breakdown)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [record.id, item.memberId, item.sharedCents, item.personalCents, item.totalCents, JSON.stringify(item.breakdown)],
      );
    }
    return record;
  });

  // Make sure every member has a visibility row so owner-approved sharing is explicit.
  for (const member of members) {
    await query(
      `INSERT INTO bill_visibility (bill_id, member_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [access.bill.id, member.id],
    );
  }

  await logAudit({
    groupId: access.bill.group_id,
    billId: access.bill.id,
    actorId: req.user.id,
    action: 'allocation.created',
    detail: { allocationId: saved.id, ...summary },
  });

  res.status(201).json({
    allocation: {
      id: saved.id,
      rules: allocation.rules,
      summary,
      items: allocation.items.map((i) => ({
        memberId: i.memberId,
        name: i.name,
        sharedCents: i.sharedCents,
        personalCents: i.personalCents,
        excludedCents: i.excludedCents,
        totalCents: i.totalCents,
        breakdown: i.breakdown,
      })),
    },
    reconciliation: reconcile(allocation, Number(access.bill.provider_total_cents)),
  });
}));

// --- Statement (per member) ---------------------------------------------

router.get('/bills/:id/statement/:memberId', wrap(async (req, res) => {
  const access = await loadBillAccess(req.user.id, Number(req.params.id));
  if (!access) return res.status(404).json({ error: 'Bill not found' });
  const memberId = Number(req.params.memberId);
  if (!access.isOwner && access.memberId !== memberId) {
    return res.status(403).json({ error: 'You can only view your own statement' });
  }

  const billId = access.bill.id;
  const [memberRes, allocation, visRes, payments, disputes, chargesRes] = await Promise.all([
    query('SELECT * FROM members WHERE id = $1 AND group_id = $2', [memberId, access.bill.group_id]),
    latestAllocation(billId),
    query('SELECT * FROM bill_visibility WHERE bill_id = $1 AND member_id = $2', [billId, memberId]),
    query('SELECT * FROM payments WHERE bill_id = $1 AND member_id = $2 ORDER BY id ASC', [billId, memberId]),
    query('SELECT * FROM disputes WHERE bill_id = $1 AND member_id = $2 ORDER BY created_at DESC', [billId, memberId]),
    query('SELECT * FROM charges WHERE bill_id = $1 ORDER BY id ASC', [billId]),
  ]);
  if (memberRes.rows.length === 0) return res.status(404).json({ error: 'Member not found' });

  const member = memberRes.rows[0];
  const visibility = visRes.rows[0] || {
    show_amount: true,
    show_charges: true,
    show_explanation: true,
    show_source: false,
  };

  if (!visibility.show_amount && !access.isOwner) {
    return res.json({
      bill: billSummary(access.bill),
      member: { id: member.id, name: member.name },
      hidden: true,
      visibility,
      message: 'The organizer has not shared the amounts for this bill with you yet.',
    });
  }

  const item = allocation?.items.find((i) => i.member_id === memberId) || null;
  const confirmed = payments.rows.filter((p) => p.status === 'confirmed');
  const claimed = payments.rows.filter((p) => p.status === 'claimed');
  const paidCents = confirmed.reduce((s, p) => s + Number(p.amount_cents), 0);
  const pendingCents = claimed.reduce((s, p) => s + Number(p.amount_cents), 0);
  const totalCents = item ? Number(item.total_cents) : 0;

  const breakdown = visibility.show_charges && item ? item.breakdown : [];
  const visibleCharges = visibility.show_charges
    ? chargesRes.rows.filter((c) => Number(c.amount_cents) !== 0)
    : [];

  res.json({
    bill: billSummary(access.bill),
    member: { id: member.id, name: member.name, is_owner: member.is_owner },
    hidden: false,
    visibility,
    allocation: item
      ? {
          sharedCents: Number(item.shared_cents),
          personalCents: Number(item.personal_cents),
          totalCents,
          breakdown,
        }
      : null,
    totalCents,
    paidCents,
    pendingCents,
    balanceCents: totalCents - paidCents,
    payments: payments.rows.map((p) => ({ ...p, amount_cents: Number(p.amount_cents) })),
    disputes: disputes.rows,
    charges: visibility.show_charges ? visibleCharges : null,
    source_filename: visibility.show_source ? access.bill.source_filename : null,
  });
}));

// --- Visibility (owner-approved sharing) ---------------------------------

router.get('/bills/:id/visibility', wrap(async (req, res) => {
  const access = await loadBillAccess(req.user.id, Number(req.params.id));
  if (!access) return res.status(404).json({ error: 'Bill not found' });
  const { rows } = await query(
    `SELECT v.*, m.name AS member_name
       FROM bill_visibility v JOIN members m ON m.id = v.member_id
      WHERE v.bill_id = $1 ORDER BY m.id ASC`,
    [access.bill.id],
  );
  res.json({ visibility: rows });
}));

router.put('/bills/:id/visibility', wrap(async (req, res) => {
  const access = await loadBillAccess(req.user.id, Number(req.params.id));
  if (!access) return res.status(404).json({ error: 'Bill not found' });
  if (!access.isOwner) return res.status(403).json({ error: 'Only the organizer can change sharing' });
  const { memberId, show_amount, show_charges, show_explanation, show_source } = req.body || {};
  if (!memberId) return res.status(400).json({ error: 'memberId is required' });
  const { rows } = await query(
    `INSERT INTO bill_visibility (bill_id, member_id, show_amount, show_charges, show_explanation, show_source)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (bill_id, member_id) DO UPDATE
       SET show_amount = EXCLUDED.show_amount,
           show_charges = EXCLUDED.show_charges,
           show_explanation = EXCLUDED.show_explanation,
           show_source = EXCLUDED.show_source
     RETURNING *`,
    [access.bill.id, Number(memberId), show_amount !== false, show_charges !== false, show_explanation !== false, Boolean(show_source)],
  );
  await logAudit({
    groupId: access.bill.group_id,
    billId: access.bill.id,
    actorId: req.user.id,
    action: 'visibility.updated',
    detail: { memberId: Number(memberId), ...rows[0] },
  });
  res.json({ visibility: rows[0] });
}));

export default router;
