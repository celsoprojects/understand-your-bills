import { useState } from 'react';
import { api } from '../api.js';
import { formatDate } from '../lib/format.js';

export default function SharingPanel({ billId, shares, onChanged }) {
  const [form, setForm] = useState({ expiresInDays: 14, includeCharges: true });
  const [copied, setCopied] = useState('');
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

  const create = (e) => {
    e.preventDefault();
    run(() =>
      api.post(`/bills/${billId}/shares`, {
        expiresInDays: Number(form.expiresInDays) || null,
        includeCharges: form.includeCharges,
      }),
    );
  };

  const url = (token) => `${window.location.origin}/s/${token}`;

  const copy = async (token) => {
    try {
      await navigator.clipboard.writeText(url(token));
      setCopied(token);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      setError('Could not copy — select the link text manually.');
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="grow">Share links</h2>
      </div>
      <p className="small muted">
        Create a read-only link for someone outside your household. Links are revocable and can expire. Only
        the summary is shown — never the source bill.
      </p>
      {error && <div className="banner bad">{error}</div>}

      {shares.length === 0 ? (
        <div className="empty">No share links yet.</div>
      ) : (
        <div className="stack">
          {shares.map((s) => {
            const expired = s.expires_at && new Date(s.expires_at) < new Date();
            const dead = s.revoked || expired;
            return (
              <div key={s.id} className="stat">
                <div className="spread">
                  <span className="small">
                    <span className={`pill ${dead ? 'bad' : 'good'}`}>
                      {s.revoked ? 'revoked' : expired ? 'expired' : 'active'}
                    </span>{' '}
                    <span className="muted">
                      {s.expires_at ? `expires ${formatDate(s.expires_at)}` : 'no expiry'}
                    </span>
                  </span>
                  <div className="btn-row">
                    <button className="btn-sm" onClick={() => copy(s.id)} disabled={dead}>
                      {copied === s.id ? 'Copied!' : 'Copy link'}
                    </button>
                    {!s.revoked && (
                      <button className="btn-sm btn-danger" onClick={() => run(() => api.post(`/shares/${s.id}/revoke`))}>
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
                <div className="link-box" style={{ marginTop: '0.5rem' }}>
                  {url(s.id)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="divider" />
      <form className="inline-form" onSubmit={create}>
        <div className="field" style={{ minWidth: 150 }}>
          <label>Expires in (days)</label>
          <input
            type="number"
            value={form.expiresInDays}
            onChange={(e) => setForm((f) => ({ ...f, expiresInDays: e.target.value }))}
            placeholder="14"
          />
        </div>
        <div className="field">
          <label className="check">
            <input
              type="checkbox"
              checked={form.includeCharges}
              onChange={(e) => setForm((f) => ({ ...f, includeCharges: e.target.checked }))}
            />
            Include per-person totals
          </label>
        </div>
        <button className="btn-primary" data-testid="create-share">Create link</button>
      </form>
    </div>
  );
}
