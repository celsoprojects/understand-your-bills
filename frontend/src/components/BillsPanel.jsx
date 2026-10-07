import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { formatCents, formatDate, monthLabel } from '../lib/format.js';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

const EMPTY = { period_label: currentPeriod(), statement_date: todayISO(), due_date: '', provider_total: '' };

export default function BillsPanel({ groupId, bills, isOwner, onChanged }) {
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setError('');
    setBusy(true);
    try {
      await fn();
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const addBill = (e) => {
    e.preventDefault();
    run(async () => {
      const res = await api.post(`/groups/${groupId}/bills`, {
        period_label: form.period_label,
        statement_date: form.statement_date || null,
        due_date: form.due_date || null,
        provider_total_cents: Math.round(Number(form.provider_total || 0) * 100),
        charges: [],
      });
      setForm({ ...EMPTY, period_label: currentPeriod(), statement_date: todayISO() });
      window.location.href = `/bills/${res.bill.id}`;
    });
  };

  const startEdit = (b) => {
    setError('');
    setEditingId(b.id);
    setDraft({
      period_label: b.period_label || '',
      statement_date: b.statement_date ? String(b.statement_date).slice(0, 10) : '',
      due_date: b.due_date ? String(b.due_date).slice(0, 10) : '',
      provider_total: (Number(b.provider_total_cents) / 100).toFixed(2),
    });
  };

  const saveEdit = () => {
    if (!draft.period_label) {
      setError('A billing period is required');
      return;
    }
    run(async () => {
      await api.patch(`/bills/${editingId}`, {
        period_label: draft.period_label,
        statement_date: draft.statement_date || null,
        due_date: draft.due_date || null,
        provider_total_cents: Math.round(Number(draft.provider_total || 0) * 100),
      });
      setEditingId(null);
    });
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="grow">Monthly bills</h2>
        <span className="pill">{bills.length}</span>
      </div>
      {error && <div className="banner bad">{error}</div>}
      {bills.length === 0 ? (
        <div className="empty">No bills yet.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th>Due</th>
                <th className="num">Provider total</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => {
                const editing = editingId === b.id;
                return (
                  <tr key={b.id}>
                    <td>
                      {editing ? (
                        <input
                          type="month"
                          value={draft.period_label}
                          onChange={(e) => setDraft((d) => ({ ...d, period_label: e.target.value }))}
                          style={{ minWidth: 140 }}
                        />
                      ) : (
                        monthLabel(b.period_label)
                      )}
                    </td>
                    <td className="small muted">
                      {editing ? (
                        <div className="stack" style={{ gap: '0.25rem' }}>
                          <input
                            type="date"
                            value={draft.due_date}
                            onChange={(e) => setDraft((d) => ({ ...d, due_date: e.target.value }))}
                            style={{ minWidth: 140 }}
                          />
                          <input
                            type="date"
                            value={draft.statement_date}
                            onChange={(e) => setDraft((d) => ({ ...d, statement_date: e.target.value }))}
                            style={{ minWidth: 140 }}
                            title="Statement date"
                          />
                        </div>
                      ) : (
                        formatDate(b.due_date)
                      )}
                    </td>
                    <td className="num mono">
                      {editing ? (
                        <input
                          type="number"
                          step="0.01"
                          value={draft.provider_total}
                          onChange={(e) => setDraft((d) => ({ ...d, provider_total: e.target.value }))}
                          style={{ width: 110, textAlign: 'right' }}
                        />
                      ) : (
                        formatCents(b.provider_total_cents)
                      )}
                    </td>
                    <td>
                      <span className={`pill ${b.status === 'published' ? 'good' : ''}`}>{b.status}</span>
                    </td>
                    <td>
                      {editing ? (
                        <div className="btn-row">
                          <button className="btn-primary btn-sm" onClick={saveEdit} disabled={busy}>
                            Save
                          </button>
                          <button className="btn-ghost btn-sm" onClick={() => setEditingId(null)} disabled={busy}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="btn-row">
                          {isOwner && (
                            <button className="btn btn-sm" onClick={() => startEdit(b)}>
                              Edit
                            </button>
                          )}
                          <Link className="btn btn-sm" to={`/bills/${b.id}`}>
                            Open
                          </Link>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {isOwner && (
        <>
          <div className="divider" />
          <form className="inline-form" onSubmit={addBill}>
            <div className="field" style={{ minWidth: 150 }}>
              <label>Billing period</label>
              <input
                type="month"
                value={form.period_label}
                onChange={(e) => setForm((f) => ({ ...f, period_label: e.target.value }))}
                required
              />
            </div>
            <div className="field" style={{ minWidth: 150 }}>
              <label>Statement date</label>
              <input
                type="date"
                value={form.statement_date}
                onChange={(e) => setForm((f) => ({ ...f, statement_date: e.target.value }))}
              />
            </div>
            <div className="field" style={{ minWidth: 150 }}>
              <label>Due date</label>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
              />
            </div>
            <div className="field" style={{ minWidth: 140 }}>
              <label>Provider total ($)</label>
              <input
                type="number"
                step="0.01"
                value={form.provider_total}
                onChange={(e) => setForm((f) => ({ ...f, provider_total: e.target.value }))}
                placeholder="337.06"
              />
            </div>
            <button className="btn-primary" data-testid="create-bill" disabled={busy}>
              Create bill
            </button>
          </form>
          <p className="tiny muted" style={{ marginTop: '0.4rem' }}>
            Create the bill, then add each line item on the bill page — you can paste them straight off the invoice.
            Any period works: every month is a separate bill.
          </p>
        </>
      )}
    </div>
  );
}
