import { useState } from 'react';
import { api } from '../api.js';

const EMPTY = { label: '', phone_number: '', device: '', member_id: '' };

export default function LinesPanel({ groupId, lines, members, isOwner, onChanged }) {
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const memberName = (mid) => members.find((m) => m.id === mid)?.name;

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

  const addLine = (e) => {
    e.preventDefault();
    run(async () => {
      await api.post(`/groups/${groupId}/lines`, { ...form, member_id: form.member_id || null });
      setForm(EMPTY);
    });
  };

  const startEdit = (l) => {
    setError('');
    setEditingId(l.id);
    setDraft({
      label: l.label || '',
      phone_number: l.phone_number || '',
      device: l.device || '',
      member_id: l.member_id || '',
    });
  };

  const saveEdit = () => {
    if (!draft.label.trim()) {
      setError('A line needs a label');
      return;
    }
    run(async () => {
      await api.patch(`/groups/${groupId}/lines/${editingId}`, {
        label: draft.label,
        phone_number: draft.phone_number,
        device: draft.device,
        member_id: draft.member_id || null,
      });
      setEditingId(null);
    });
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="grow">Lines &amp; devices</h2>
        <span className="pill">{lines.length}</span>
      </div>
      {error && <div className="banner bad">{error}</div>}
      {lines.length === 0 ? (
        <div className="empty">No lines yet. Add each phone line and who uses it.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Line</th>
                <th>Number</th>
                <th>Member</th>
                {isOwner && <th />}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const editing = editingId === l.id;
                return (
                  <tr key={l.id}>
                    <td>
                      {editing ? (
                        <div className="stack" style={{ gap: '0.25rem' }}>
                          <input
                            value={draft.label}
                            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                            placeholder="Line 3"
                            style={{ minWidth: 120 }}
                          />
                          <input
                            value={draft.device}
                            onChange={(e) => setDraft((d) => ({ ...d, device: e.target.value }))}
                            placeholder="Device"
                            style={{ minWidth: 120 }}
                          />
                        </div>
                      ) : (
                        <>
                          {l.label}
                          {l.device && <div className="tiny muted">{l.device}</div>}
                        </>
                      )}
                    </td>
                    <td className="small muted mono">
                      {editing ? (
                        <input
                          value={draft.phone_number}
                          onChange={(e) => setDraft((d) => ({ ...d, phone_number: e.target.value }))}
                          placeholder="(818) 000-0000"
                          style={{ minWidth: 140 }}
                        />
                      ) : (
                        l.phone_number || '—'
                      )}
                    </td>
                    <td className="small">
                      {editing ? (
                        <select
                          value={draft.member_id}
                          onChange={(e) => setDraft((d) => ({ ...d, member_id: e.target.value }))}
                          style={{ minWidth: 130 }}
                        >
                          <option value="">Unassigned</option>
                          {members.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      ) : l.member_id ? (
                        memberName(l.member_id)
                      ) : (
                        <span className="muted">Unassigned</span>
                      )}
                    </td>
                    {isOwner && (
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
                            <button className="btn btn-sm" onClick={() => startEdit(l)}>
                              Edit
                            </button>
                            <button
                              className="btn-ghost btn-sm"
                              onClick={() => run(() => api.del(`/groups/${groupId}/lines/${l.id}`))}
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </td>
                    )}
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
          <form className="inline-form" onSubmit={addLine}>
            <div className="field" style={{ flex: 1, minWidth: 120 }}>
              <label>Label</label>
              <input
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="Line 3"
                required
              />
            </div>
            <div className="field" style={{ minWidth: 130 }}>
              <label>Phone number</label>
              <input
                value={form.phone_number}
                onChange={(e) => setForm((f) => ({ ...f, phone_number: e.target.value }))}
                placeholder="(818) 000-0000"
              />
            </div>
            <div className="field" style={{ minWidth: 120 }}>
              <label>Device</label>
              <input
                value={form.device}
                onChange={(e) => setForm((f) => ({ ...f, device: e.target.value }))}
                placeholder="iPhone 15"
              />
            </div>
            <div className="field" style={{ minWidth: 130 }}>
              <label>Member</label>
              <select
                value={form.member_id}
                onChange={(e) => setForm((f) => ({ ...f, member_id: e.target.value }))}
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn-primary" data-testid="add-line" disabled={busy}>
              Add line
            </button>
          </form>
        </>
      )}
    </div>
  );
}
