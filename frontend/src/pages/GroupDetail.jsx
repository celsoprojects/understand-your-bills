import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { formatDate } from '../lib/format.js';
import MembersPanel from '../components/MembersPanel.jsx';
import LinesPanel from '../components/LinesPanel.jsx';
import BillsPanel from '../components/BillsPanel.jsx';

const PROVIDERS = ['T-Mobile', 'Verizon', 'AT&T', 'Spectrum', 'Xfinity', 'Other'];

export default function GroupDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [editingGroup, setEditingGroup] = useState(false);
  const [groupDraft, setGroupDraft] = useState({ name: '', provider: 'Other' });
  const [groupError, setGroupError] = useState('');
  const [savingGroup, setSavingGroup] = useState(false);

  const load = async () => {
    try {
      const res = await api.get(`/groups/${id}`);
      setData(res);
    } catch (err) {
      setLoadError(err.message);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  if (loadError) return <div className="banner bad">{loadError}</div>;
  if (!data) return <div className="loading">Loading household…</div>;

  const { group, isOwner, members, lines, bills, audit } = data;

  const startGroupEdit = () => {
    setGroupError('');
    setGroupDraft({ name: group.name || '', provider: group.provider || 'Other' });
    setEditingGroup(true);
  };

  const saveGroup = async (e) => {
    e.preventDefault();
    if (!groupDraft.name.trim()) {
      setGroupError('The household needs a name');
      return;
    }
    setGroupError('');
    setSavingGroup(true);
    try {
      await api.patch(`/groups/${id}`, groupDraft);
      setEditingGroup(false);
      await load();
    } catch (err) {
      setGroupError(err.message);
    } finally {
      setSavingGroup(false);
    }
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
        <div className="btn-row">
          {isOwner && !editingGroup && (
            <button className="btn" onClick={startGroupEdit} data-testid="edit-group">
              Edit household
            </button>
          )}
          <span className="pill accent">{isOwner ? 'You are the organizer' : 'You are a member'}</span>
        </div>
      </div>

      {editingGroup && (
        <div className="card">
          <div className="card-head">
            <h2 className="grow">Edit household</h2>
          </div>
          {groupError && <div className="banner bad">{groupError}</div>}
          <form className="inline-form" onSubmit={saveGroup}>
            <div className="field" style={{ flex: 1, minWidth: 220 }}>
              <label>Household name</label>
              <input
                value={groupDraft.name}
                onChange={(e) => setGroupDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Family plan"
                required
              />
            </div>
            <div className="field" style={{ minWidth: 170 }}>
              <label>Provider</label>
              <select
                value={groupDraft.provider}
                onChange={(e) => setGroupDraft((d) => ({ ...d, provider: e.target.value }))}
              >
                {PROVIDERS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="btn-row">
              <button className="btn-primary" disabled={savingGroup} data-testid="save-group">
                {savingGroup ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setEditingGroup(false);
                  setGroupError('');
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid two">
        <MembersPanel groupId={id} members={members} isOwner={isOwner} onChanged={load} />
        <LinesPanel groupId={id} lines={lines} members={members} isOwner={isOwner} onChanged={load} />
      </div>

      <BillsPanel groupId={id} bills={bills} isOwner={isOwner} onChanged={load} />

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
