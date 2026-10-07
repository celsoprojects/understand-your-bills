import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { formatCents } from '../lib/format.js';

export default function Dashboard() {
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', provider: 'T-Mobile' });
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try {
      const data = await api.get('/groups');
      setGroups(data.groups);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const create = async (e) => {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      const data = await api.post('/groups', form);
      setForm({ name: '', provider: 'T-Mobile' });
      await load();
      window.location.href = `/groups/${data.group.id}`;
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>Your households</h1>
          <p className="muted small">
            Each household holds one account, its members, and every monthly bill you split.
          </p>
        </div>
      </div>

      {error && <div className="banner bad">{error}</div>}

      <div className="card">
        <div className="card-head">
          <h2 className="grow">Create a household</h2>
        </div>
        <form className="inline-form" onSubmit={create}>
          <div className="field" style={{ minWidth: 220, flex: 1 }}>
            <label htmlFor="g-name">Household name</label>
            <input
              id="g-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Family plan"
              required
            />
          </div>
          <div className="field" style={{ minWidth: 170 }}>
            <label htmlFor="g-provider">Provider</label>
            <select
              id="g-provider"
              value={form.provider}
              onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
            >
              <option>T-Mobile</option>
              <option>Verizon</option>
              <option>AT&amp;T</option>
              <option>Spectrum</option>
              <option>Xfinity</option>
              <option>Other</option>
            </select>
          </div>
          <button className="btn-primary" disabled={creating} data-testid="create-group">
            {creating ? 'Creating…' : 'Create household'}
          </button>
        </form>
      </div>

      {groups === null && <div className="empty">Loading households…</div>}
      {groups?.length === 0 && (
        <div className="card empty">No households yet. Create one above to get started.</div>
      )}

      {groups?.map((g) => (
        <Link key={g.id} to={`/groups/${g.id}`} className="list-row">
          <div className="grow">
            <div className="title">{g.name}</div>
            <div className="small muted">
              {g.provider} · {g.member_count} {g.member_count === 1 ? 'member' : 'members'} ·{' '}
              {g.bill_count} {g.bill_count === 1 ? 'bill' : 'bills'}
            </div>
          </div>
          <span className={`pill ${g.is_owner ? 'accent' : ''}`}>{g.is_owner ? 'Organizer' : 'Member'}</span>
        </Link>
      ))}
    </>
  );
}
