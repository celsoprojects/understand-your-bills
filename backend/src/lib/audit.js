import { query } from '../db.js';

export async function logAudit({ groupId = null, billId = null, actorId = null, action, detail = {} }) {
  try {
    await query(
      `INSERT INTO audit_events (group_id, bill_id, actor_id, action, detail)
       VALUES ($1, $2, $3, $4, $5)`,
      [groupId, billId, actorId, action, detail],
    );
  } catch (err) {
    console.error('[audit] failed to record event', action, err.message);
  }
}
