import { useState } from 'react';
import { api } from '../api.js';

const EMPTY = { name: '', email: '', phone_number: '' };

export default function MembersPanel({ groupId, members, isOwner, onChanged }) {
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(EMPTY);
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

  const addMember = (e) => {
    e.preventDefault();
    run(async () => {
      await api.post(`/groups/${groupId}/members`, form);
      setForm(EMPTY);
    });
  };

  const startEdit = (m) => {
    setError('');
    setEditingId(m.id);
    setDraft({ name: m.name || '', email: m.email || '', phone_number: m.phone_number || '' });
  };

  const saveEdit = () => {
    if (!draft.name.trim()) {
      setError('A member needs a name');
      return;
    }
    run(async () => {
      await api.patch(`/groups/${groupId}/members/${editingId}`, draft);
      setEditingId(null);
    });
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="grow">Members</h2>
        <span className="pill">{members.length}</span>
      </div>
      {error && <div className="banner bad">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              <th>Status</th>
              {isOwner && <th />}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const editing = editingId === m.id;
              return (
                <tr key={m.id}>
                  <td>
                    {editing ? (
                      <input
                        value={draft.name}
                        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                        placeholder="Name"
                        style={{ minWidth: 130 }}
                      />
                    ) : (
                      <>
                        {m.name} {m.is_owner && <span className="chip">organizer</span>}
                      </>
                    )}
                  </td>
                  <td className="small muted">
                    {editing ? (
                      <div className="stack" style={{ gap: '0.25rem' }}>
                        <input
                          value={draft.email}
                          onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                          placeholder="email"
                          style={{ minWidth: 150 }}
                        />
                        <input
                          value={draft.phone_number}
                          onChange={(e) => setDraft((d) => ({ ...d, phone_number: e.target.value }))}
                          placeholder="phone"
                          style={{ minWidth: 150 }}
                        />
                      </div>
                    ) : (
                      m.email || m.phone_number || '—'
                    )}
                  </td>
                  <td>
                    <span className={`pill ${m.status === 'active' ? 'good' : 'warn'}`}>{m.status}</span>
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
                          <button className="btn btn-sm" onClick={() => startEdit(m)}>
                            Edit
                          </button>
                          {!m.is_owner && (
                            <button
                              className="btn-ghost btn-sm"
                              onClick={() => run(() => api.del(`/groups/${groupId}/members/${m.id}`))}
                            >
                              Remove
                            </button>
                          )}
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
      {isOwner && (
        <>
          <div className="divider" />
          <form className="inline-form" onSubmit={addMember}>
            <div className="field" style={{ flex: 1, minWidth: 130 }}>
              <label>Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Person 3"
                required
              />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 150 }}>
              <label>Email (to link their login)</label>
              <input
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="optional"
              />
            </div>
            <div className="field" style={{ minWidth: 140 }}>
              <label>Phone</label>
              <input
                value={form.phone_number}
                onChange={(e) => setForm((f) => ({ ...f, phone_number: e.target.value }))}
                placeholder="optional"
              />
            </div>
            <button className="btn-primary" data-testid="add-member" disabled={busy}>
              Add member
            </button>
          </form>
          <p className="tiny muted" style={{ marginTop: '0.4rem' }}>
            Add a member with their email and they can sign in to see only what you share with them.
          </p>
        </>
      )}
    </div>
  );
}
