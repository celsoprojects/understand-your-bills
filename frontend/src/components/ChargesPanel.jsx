import { useState } from 'react';
import { api } from '../api.js';
import { CATEGORIES, MODES, DEFAULT_RULES } from '../lib/categories.js';
import { formatCents } from '../lib/format.js';

export default function ChargesPanel({ billId, charges, members, lines, isOwner, onChanged }) {
  const [form, setForm] = useState({
    category: 'plan',
    label: '',
    amount: '',
    is_personal: false,
    member_id: '',
    source_ref: '',
  });
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

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
      await api.post(`/bills/${billId}/charges`, {
        category: form.category,
        label: form.label,
        amount_cents: Math.round(Number(form.amount || 0) * 100),
        is_personal: form.is_personal,
        member_id: form.is_personal ? form.member_id || null : null,
        source_ref: form.source_ref || null,
      });
      setForm({ category: 'plan', label: '', amount: '', is_personal: false, member_id: '', source_ref: '' });
    });
  };

  const total = charges.reduce((sum, c) => sum + Number(c.amount_cents), 0);

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="grow">Line items</h2>
        <span className="pill">{charges.length} items</span>
        <span className="pill mono">{formatCents(total)}</span>
      </div>
      {error && <div className="banner bad">{error}</div>}

      {charges.length === 0 ? (
        <div className="empty">No line items yet. Add each charge from the invoice below.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Category</th>
                <th>Whose</th>
                <th className="num">Amount</th>
                <th>Source</th>
                {isOwner && <th />}
              </tr>
            </thead>
            <tbody>
              {charges.map((c) => (
                <ChargeRow
                  key={c.id}
                  charge={c}
                  billId={billId}
                  members={members}
                  lines={lines}
                  isOwner={isOwner}
                  onChanged={onChanged}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isOwner && (
        <>
          <div className="divider" />
          {!open ? (
            <button className="btn" onClick={() => setOpen(true)} data-testid="show-add-charge">
              + Add line item
            </button>
          ) : (
            <form onSubmit={add}>
              <div className="field-row">
                <div className="field">
                  <label>Description</label>
                  <input
                    value={form.label}
                    onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                    placeholder="Additional line 3"
                    required
                  />
                </div>
                <div className="field">
                  <label>Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    placeholder="30.00"
                    required
                  />
                </div>
                <div className="field">
                  <label>Bill reference</label>
                  <input
                    value={form.source_ref}
                    onChange={(e) => setForm((f) => ({ ...f, source_ref: e.target.value }))}
                    placeholder="p.2 line 12"
                  />
                </div>
              </div>
              <div className="field-row" style={{ alignItems: 'end' }}>
                <div className="field">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={form.is_personal}
                      onChange={(e) => setForm((f) => ({ ...f, is_personal: e.target.checked }))}
                    />
                    Belongs to one person (device, accessory)
                  </label>
                </div>
                {form.is_personal && (
                  <div className="field">
                    <label>Person</label>
                    <select
                      value={form.member_id}
                      onChange={(e) => setForm((f) => ({ ...f, member_id: e.target.value }))}
                    >
                      <option value="">Choose member</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="field">
                  <div className="btn-row">
                    <button className="btn-primary" data-testid="add-charge">Add item</button>
                    <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}

function ChargeRow({ charge, billId, members, isOwner, onChanged }) {
  const [saving, setSaving] = useState(false);

  const patch = async (body) => {
    setSaving(true);
    try {
      await api.patch(`/bills/${billId}/charges/${charge.id}`, body);
      await onChanged();
    } finally {
      setSaving(false);
    }
  };

  if (!isOwner) {
    return (
      <tr>
        <td>{charge.label}</td>
        <td className="small muted">{CATEGORIES.find((c) => c.id === charge.category)?.label}</td>
        <td className="small muted">
          {charge.is_personal ? members.find((m) => m.id === charge.member_id)?.name || '—' : 'Shared'}
        </td>
        <td className="num mono">{formatCents(charge.amount_cents)}</td>
        <td className="tiny muted">{charge.source_ref || '—'}</td>
      </tr>
    );
  }

  return (
    <tr>
      <td>
        <input
          defaultValue={charge.label}
          onBlur={(e) => e.target.value !== charge.label && patch({ label: e.target.value })}
          style={{ minWidth: 150 }}
        />
      </td>
      <td>
        <select
          value={charge.category}
          onChange={(e) => patch({ category: e.target.value })}
          style={{ minWidth: 150 }}
        >
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </td>
      <td>
        <div className="stack" style={{ gap: '0.25rem' }}>
          <label className="check tiny">
            <input
              type="checkbox"
              checked={charge.is_personal}
              onChange={(e) =>
                patch({
                  is_personal: e.target.checked,
                  member_id: e.target.checked ? charge.member_id || members[0]?.id : null,
                })
              }
            />
            Personal
          </label>
          {charge.is_personal && (
            <select
              value={charge.member_id || ''}
              onChange={(e) => patch({ member_id: Number(e.target.value) })}
              style={{ minWidth: 120 }}
            >
              <option value="">Choose</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </td>
      <td className="num">
        <input
          type="number"
          step="0.01"
          defaultValue={(Number(charge.amount_cents) / 100).toFixed(2)}
          onBlur={(e) => {
            const cents = Math.round(Number(e.target.value || 0) * 100);
            if (cents !== Number(charge.amount_cents)) patch({ amount_cents: cents });
          }}
          style={{ width: 110, textAlign: 'right' }}
          disabled={saving}
        />
      </td>
      <td>
        <input
          defaultValue={charge.source_ref || ''}
          onBlur={(e) => e.target.value !== (charge.source_ref || '') && patch({ source_ref: e.target.value })}
          placeholder="ref"
          style={{ width: 100 }}
          className="tiny"
        />
      </td>
      <td>
        <button
          className="btn-ghost btn-sm"
          onClick={() => api.del(`/bills/${billId}/charges/${charge.id}`).then(onChanged)}
        >
          ✕
        </button>
      </td>
    </tr>
  );
}
