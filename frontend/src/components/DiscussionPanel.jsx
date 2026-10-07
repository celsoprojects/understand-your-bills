import { useState } from 'react';
import { api } from '../api.js';
import { formatDateTime } from '../lib/format.js';

const KIND_LABEL = { question: 'Question', dispute: 'Dispute', claim: 'Payment claim' };

export default function DiscussionPanel({ billId, disputes, members, isOwner, myMemberId, onChanged }) {
  const [form, setForm] = useState({ kind: 'question', message: '' });
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

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      await api.post(`/bills/${billId}/disputes`, {
        kind: form.kind,
        message: form.message,
        member_id: isOwner ? undefined : myMemberId,
      });
      setForm({ kind: 'question', message: '' });
    });
  };

  const memberName = (mid) => members.find((m) => m.id === mid)?.name;

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="grow">Questions &amp; disputes</h2>
        <span className="pill">{disputes.length}</span>
      </div>
      <p className="small muted">
        Anyone can ask a question or dispute a charge here. Nothing is overwritten — the organizer resolves it
        and the thread stays as a record.
      </p>
      {error && <div className="banner bad">{error}</div>}

      {disputes.length === 0 ? (
        <div className="empty">No questions yet.</div>
      ) : (
        <div className="stack">
          {disputes.map((d) => (
            <div key={d.id} className="stat">
              <div className="spread">
                <span className="small">
                  <span className="pill">{KIND_LABEL[d.kind] || d.kind}</span>{' '}
                  {d.member_name && <span className="muted">about {d.member_name}</span>}
                </span>
                <span className={`pill ${d.status === 'resolved' ? 'good' : 'warn'}`}>{d.status}</span>
              </div>
              <p style={{ margin: '0.5rem 0 0.25rem' }}>{d.message}</p>
              <div className="spread">
                <span className="tiny muted">{formatDateTime(d.created_at)}</span>
                {isOwner && d.status !== 'resolved' && (
                  <button
                    className="btn-sm"
                    onClick={() => run(() => api.patch(`/disputes/${d.id}`, { status: 'resolved' }))}
                  >
                    Mark resolved
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="divider" />
      <form onSubmit={submit}>
        <div className="field-row">
          <div className="field">
            <label>Type</label>
            <select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}>
              <option value="question">Question</option>
              <option value="dispute">Dispute a charge</option>
              <option value="claim">Payment claim note</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label>Message</label>
          <textarea
            rows={2}
            value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            placeholder="I think the late fee should be shared, not just mine…"
            required
          />
        </div>
        <button className="btn-primary" data-testid="post-dispute">Post</button>
      </form>
    </div>
  );
}
