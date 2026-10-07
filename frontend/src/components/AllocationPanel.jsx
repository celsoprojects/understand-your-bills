import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { CATEGORIES, MODES, DEFAULT_RULES } from '../lib/categories.js';
import { formatCents } from '../lib/format.js';

export default function AllocationPanel({ billId, allocation, members, reconciliation, onAllocated }) {
  const [rules, setRules] = useState(allocation?.rules || DEFAULT_RULES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (allocation?.rules) setRules(allocation.rules);
  }, [allocation?.id]);

  const runSplit = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post(`/bills/${billId}/allocate`, { rules });
      await onAllocated();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const items = allocation?.items || [];
  const memberName = (id) => members.find((m) => m.id === id)?.name || `Member ${id}`;
  const grand = items.reduce((s, i) => s + i.totalCents, 0);

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="grow">Split rules</h2>
        {allocation && <span className="pill good">Saved {new Date(allocation.created_at).toLocaleDateString()}</span>}
      </div>

      <div className="banner info">
        Shared costs (plan, taxes, fees, credits) are pooled and split evenly. Personal items — phones and
        accessories — stay with their owner. Every split reconciles to the cent, and the extra penny rotates
        between members so no one is always overpaying.
      </div>

      {error && <div className="banner bad">{error}</div>}

      <div className="grid three">
        {CATEGORIES.map((c) => (
          <div className="field" key={c.id}>
            <label>{c.label}</label>
            <select value={rules[c.id] || 'equal'} onChange={(e) => setRules((r) => ({ ...r, [c.id]: e.target.value }))}>
              {MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="btn-row">
        <button className="btn-primary" onClick={runSplit} disabled={busy} data-testid="run-split">
          {busy ? 'Calculating…' : allocation ? 'Recalculate split' : 'Run the split'}
        </button>
        <span className="small muted">{members.length} members</span>
      </div>

      {allocation?.summary?.warnings?.length > 0 && (
        <div className="banner warn" style={{ marginTop: '0.9rem' }}>
          {allocation.summary.warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="divider" />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th className="num">Shared</th>
                  <th className="num">Personal</th>
                  <th className="num">Total</th>
                  <th className="num">Share</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.memberId}>
                    <td>{memberName(i.memberId)}</td>
                    <td className="num mono">{formatCents(i.sharedCents)}</td>
                    <td className="num mono">{formatCents(i.personalCents)}</td>
                    <td className="num mono">
                      <strong>{formatCents(i.totalCents)}</strong>
                    </td>
                    <td className="num muted small">
                      {grand ? `${((i.totalCents / grand) * 100).toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <strong>Total assigned</strong>
                  </td>
                  <td className="num" />
                  <td className="num" />
                  <td className="num mono">
                    <strong>{formatCents(grand)}</strong>
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {reconciliation && (
        <div className={`banner ${reconciliation.balanced ? 'good' : 'warn'}`} style={{ marginTop: '0.9rem' }}>
          {reconciliation.balanced ? (
            <>
              ✓ Reconciles to the invoice: <strong>{formatCents(reconciliation.invoiceTotalCents)}</strong> assigned
              with no difference.
            </>
          ) : (
            <>
              Invoice says {formatCents(reconciliation.invoiceTotalCents)} but{' '}
              {formatCents(reconciliation.assignedCents)} is assigned — difference{' '}
              <strong>{formatCents(reconciliation.differenceCents)}</strong>. Check your line items.
            </>
          )}
        </div>
      )}
    </div>
  );
}
