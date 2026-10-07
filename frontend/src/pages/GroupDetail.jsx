import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { formatCents, formatDate, monthLabel } from '../lib/format.js';

const PROVIDERS = ['T-Mobile', 'Verizon', 'AT&T', 'Spectrum', 'Xfinity', 'Other'];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function GroupDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [memberForm, setMemberForm] = useState({ name: '', email: '', phone_number: '' });
  const [lineForm, setLineForm] = useState({ label: '', phone_number: '', device: '', member_id: '' });
  const [billForm, setBillForm] = useState({
    period_label: new Date().toISOString().slice(0, 7),
    statement_date: todayISO(),
    due_date: '',
    provider_total: '',
    notes: '',
  });

  const load = async () => {
    try {
      const res = await api.get(`/groups/${id}`);
      setData(res);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  if (error) return <div className="banner bad">{error}</div>;
  if (!data) return <div className="loading">Loading household…</div>;

  const { group, isOwner, members, lines, bills, audit } = data;
  const memberName = (mid) => members.find((m) => m.id === mid)?.name || '—';

  const run = async (fn) => {
    setError('');
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const addMember = (e) => {
    e.preventDefault();
    run(async () => {
      await api.post(`/groups/${id}/members`, memberForm);
      setMemberForm({ name: '', email: '', phone_number: '' });
    });
  };

  const addLine = (e) => {
    e.preventDefault();
    run(async () => {
      await api.post(`/groups/${id}/lines`, { ...lineForm, member_id: lineForm.member_id || null });
      setLineForm({ label: '', phone_number: '', device: '', member_id: '' });
    });
  };

  const addBill = (e) => {
    e.preventDefault();
    run(async () => {
      const res = await api.post(`/groups/${id}/bills`, {
        period_label: billForm.period_label,
        statement_date: billForm.statement_date || null,
        due_date: billForm.due_date || null,
        provider_total_cents: Math.round(Number(billForm.provider_total || 0) * 100),
        notes: billForm.notes || null,
        charges: [],
      });
      window.location.href = `/bills/${res.bill.id}`;
    });
  };

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="breadcrumb">
            <Link to="/">Households</Link> / {group.name}
          </div>
          <h1>{group.name}</h1>
          <p className="muted small">
            {group.provider} · {members.length} members · {lines.length} lines
          </p>
        </div>
        <span className="pill accent">{isOwner ? 'You are the organizer' : 'You are a member'}</span>
      </div>

      {error && <div className="banner bad">{error}</div>}

      <div className="grid two">
        {/* Members */}
        <div className="card">
          <div className="card-head">
            <h2 className="grow">Members</h2>
            <span className="pill">{members.length}</span>
          </div>
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
                {members.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.name} {m.is_owner && <span className="chip">organizer</span>}
                    </td>
                    <td className="small muted">{m.email || m.phone_number || '—'}</td>
                    <td>
                      <span className={`pill ${m.status === 'active' ? 'good' : 'warn'}`}>{m.status}</span>
                    </td>
                    {isOwner && (
                      <td>
                        {!m.is_owner && (
                          <button
                            className="btn-ghost btn-sm"
                            onClick={() => run(() => api.del(`/groups/${id}/members/${m.id}`))}
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
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
                    value={memberForm.name}
                    onChange={(e) => setMemberForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Person 3"
                    required
                  />
                </div>
                <div className="field" style={{ flex: 1, minWidth: 150 }}>
                  <label>Email (to link their login)</label>
                  <input
                    value={memberForm.email}
                    onChange={(e) => setMemberForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="optional"
                  />
                </div>
                <div className="field" style={{ minWidth: 140 }}>
                  <label>Phone</label>
                  <input
                    value={memberForm.phone_number}
                    onChange={(e) => setMemberForm((f) => ({ ...f, phone_number: e.target.value }))}
                    placeholder="optional"
                  />
                </div>
                <button className="btn-primary" data-testid="add-member">Add member</button>
              </form>
              <p className="tiny muted" style={{ marginTop: '0.4rem' }}>
                Add a member with their email and they can sign in to see only what you share with them.
              </p>
            </>
          )}
        </div>

        {/* Lines */}
        <div className="card">
          <div className="card-head">
            <h2 className="grow">Lines &amp; devices</h2>
            <span className="pill">{lines.length}</span>
          </div>
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
                  {lines.map((l) => (
                    <tr key={l.id}>
                      <td>
                        {l.label}
                        {l.device && <div className="tiny muted">{l.device}</div>}
                      </td>
                      <td className="small muted mono">{l.phone_number || '—'}</td>
                      <td className="small">{l.member_id ? memberName(l.member_id) : <span className="muted">Unassigned</span>}</td>
                      {isOwner && (
                        <td>
                          <button className="btn-ghost btn-sm" onClick={() => run(() => api.del(`/groups/${id}/lines/${l.id}`))}>
                            Remove
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
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
                    value={lineForm.label}
                    onChange={(e) => setLineForm((f) => ({ ...f, label: e.target.value }))}
                    placeholder="Line 3"
                    required
                  />
                </div>
                <div className="field" style={{ minWidth: 130 }}>
                  <label>Phone number</label>
                  <input
                    value={lineForm.phone_number}
                    onChange={(e) => setLineForm((f) => ({ ...f, phone_number: e.target.value }))}
                    placeholder="(818) 000-0000"
                  />
                </div>
                <div className="field" style={{ minWidth: 120 }}>
                  <label>Device</label>
                  <input
                    value={lineForm.device}
                    onChange={(e) => setLineForm((f) => ({ ...f, device: e.target.value }))}
                    placeholder="iPhone 15"
                  />
                </div>
                <div className="field" style={{ minWidth: 130 }}>
                  <label>Member</label>
                  <select
                    value={lineForm.member_id}
                    onChange={(e) => setLineForm((f) => ({ ...f, member_id: e.target.value }))}
                  >
                    <option value="">Unassigned</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button className="btn-primary" data-testid="add-line">Add line</button>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Bills */}
      <div className="card">
        <div className="card-head">
          <h2 className="grow">Monthly bills</h2>
          <span className="pill">{bills.length}</span>
        </div>
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
                {bills.map((b) => (
                  <tr key={b.id}>
                    <td>{monthLabel(b.period_label)}</td>
                    <td className="small muted">{formatDate(b.due_date)}</td>
                    <td className="num mono">{formatCents(b.provider_total_cents)}</td>
                    <td>
                      <span className={`pill ${b.status === 'published' ? 'good' : ''}`}>{b.status}</span>
                    </td>
                    <td>
                      <Link className="btn btn-sm" to={`/bills/${b.id}`}>
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
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
                  value={billForm.period_label}
                  onChange={(e) => setBillForm((f) => ({ ...f, period_label: e.target.value }))}
                  required
                />
              </div>
              <div className="field" style={{ minWidth: 150 }}>
                <label>Statement date</label>
                <input
                  type="date"
                  value={billForm.statement_date}
                  onChange={(e) => setBillForm((f) => ({ ...f, statement_date: e.target.value }))}
                />
              </div>
              <div className="field" style={{ minWidth: 150 }}>
                <label>Due date</label>
                <input
                  type="date"
                  value={billForm.due_date}
                  onChange={(e) => setBillForm((f) => ({ ...f, due_date: e.target.value }))}
                />
              </div>
              <div className="field" style={{ minWidth: 140 }}>
                <label>Provider total ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={billForm.provider_total}
                  onChange={(e) => setBillForm((f) => ({ ...f, provider_total: e.target.value }))}
                  placeholder="337.06"
                />
              </div>
              <button className="btn-primary" data-testid="create-bill">Create bill</button>
            </form>
            <p className="tiny muted" style={{ marginTop: '0.4rem' }}>
              Create the bill, then add each line item on the bill page — you can paste them straight off the invoice.
            </p>
          </>
        )}
      </div>

      {/* Activity */}
      <div className="card">
        <div className="card-head">
          <h2 className="grow">Activity</h2>
        </div>
        {audit.length === 0 ? (
          <div className="empty">No activity yet.</div>
        ) : (
          <div className="timeline">
            {audit.map((a) => (
              <div className="event" key={a.id}>
                <span className="when">{formatDate(a.created_at)}</span>
                <span>
                  <strong>{a.action}</strong>{' '}
                  <span className="muted small">
                    {a.detail?.label || a.detail?.name || a.detail?.status || ''}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
