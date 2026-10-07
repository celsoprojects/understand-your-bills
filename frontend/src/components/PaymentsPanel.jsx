import { useState } from 'react';
import { api } from '../api.js';
import { formatCents, formatDate } from '../lib/format.js';

const STATUS_PILL = { confirmed: 'good', claimed: 'warn', rejected: 'bad' };

export default function PaymentsPanel({ billId, payments, members, isOwner, myMemberId, onChanged }) {
  const [form, setForm] = useState({
    member_id: isOwner ? members[0]?.id || '' : myMemberId || '',
    amount: '',
    method: 'Zelle',
    paid_at: new Date().toISOString().slice(0, 10),
    proof_note: '',
  });
  const [error, setError] = useState('');

  const run = async (fn) => {
    setError('');
    try {
      await fn();
      await onChanged();
    } catch (err) {
      setError(err.message);
    }
  };

  const add = (e) => {
    e.preventDefault();
    run(async () => {
      await api.post(`/bills/${billId}/payments`, {
        member_id: Number(form.member_id) || undefined,
        amount_cents: Math.round(Number(form.amount || 0) * 100),
        method: form.method,
        paid_at: form.paid_at || null,
        proof_note: form.proof_note || null,
      });
      setForm((f) => ({ ...f, amount: '', proof_note: '' }));
    });
  };

  const memberName = (mid) => members.find((m) => m.id === mid)?.name || '—';
  const visible = isOwner ? payments : payments.filter((p) => p.member_id === myMemberId);

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="grow">Payment ledger</h2>
        <span className="pill">{visible.length} entries</span>
      </div>
      <p className="small muted">
        Track who paid, what&apos;s still owed, and any proof they attached. Unpaid balances carry forward as
        arrears.
      </p>
      {error && <div className="banner bad">{error}</div>}

      {visible.length === 0 ? (
        <div className="empty">No payments recorded yet.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th className="num">Amount</th>
                <th>Method</th>
                <th>Date</th>
                <th>Status</th>
                <th>Proof / note</th>
                {isOwner && <th />}
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.id}>
                  <td>{memberName(p.member_id)}</td>
                  <td className="num mono">{formatCents(p.amount_cents)}</td>
                  <td className="small muted">{p.method || '—'}</td>
                  <td className="small muted">{formatDate(p.paid_at)}</td>
                  <td>
                    <span className={`pill ${STATUS_PILL[p.status] || ''}`}>{p.status}</span>
                  </td>
                  <td className="small muted">{p.proof_note || '—'}</td>
                  {isOwner && (
                    <td>
                      <div className="btn-row">
                        {p.status !== 'confirmed' && (
                          <button
                            className="btn-sm"
                            onClick={() => run(() => api.patch(`/payments/${p.id}`, { status: 'confirmed' }))}
                          >
                            Confirm
                          </button>
                        )}
                        {p.status !== 'rejected' && (
                          <button
                            className="btn-sm btn-danger"
                            onClick={() => run(() => api.patch(`/payments/${p.id}`, { status: 'rejected' }))}
                          >
                            Reject
                          </button>
                        )}
                        <button className="btn-ghost btn-sm" onClick={() => run(() => api.del(`/payments/${p.id}`))}>
                          ✕
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="divider" />
      <form onSubmit={add}>
        <div className="field-row">
          {isOwner && (
            <div className="field">
              <label>Person</label>
              <select value={form.member_id} onChange={(e) => setForm((f) => ({ ...f, member_id: e.target.value }))}>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label>Amount ($)</label>
            <input
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="59.54"
              required
            />
          </div>
          <div className="field">
            <label>Method</label>
            <select value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}>
              <option>Zelle</option>
              <option>Cash</option>
              <option>Venmo</option>
              <option>Cash App</option>
              <option>Bank transfer</option>
              <option>Other</option>
            </select>
          </div>
          <div className="field">
            <label>Date</label>
            <input
              type="date"
              value={form.paid_at}
              onChange={(e) => setForm((f) => ({ ...f, paid_at: e.target.value }))}
            />
          </div>
        </div>
        <div className="field">
          <label>Proof or note (optional)</label>
          <input
            value={form.proof_note}
            onChange={(e) => setForm((f) => ({ ...f, proof_note: e.target.value }))}
            placeholder="Zelle confirmation #, screenshot note…"
          />
        </div>
        <button className="btn-primary" data-testid="add-payment">
          {isOwner ? 'Record payment' : 'Submit payment claim'}
        </button>
      </form>
    </div>
  );
}
