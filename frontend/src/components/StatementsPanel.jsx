import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { formatCents, formatDate } from '../lib/format.js';
import { CATEGORY_LABEL } from '../lib/categories.js';

export default function StatementsPanel({ billId, members, isOwner, myMemberId, refreshKey }) {
  const [memberId, setMemberId] = useState(isOwner ? members[0]?.id : myMemberId);
  const [statement, setStatement] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOwner) setMemberId(myMemberId);
  }, [isOwner, myMemberId]);

  useEffect(() => {
    if (!memberId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    api
      .get(`/bills/${billId}/statement/${memberId}`)
      .then((res) => {
        if (!cancelled) setStatement(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [billId, memberId, refreshKey]);

  const toggleVisibility = async (field, value) => {
    try {
      await api.put(`/bills/${billId}/visibility`, {
        memberId,
        show_amount: field === 'show_amount' ? value : statement.visibility.show_amount,
        show_charges: field === 'show_charges' ? value : statement.visibility.show_charges,
        show_explanation: field === 'show_explanation' ? value : statement.visibility.show_explanation,
        show_source: field === 'show_source' ? value : statement.visibility.show_source,
      });
      const res = await api.get(`/bills/${billId}/statement/${memberId}`);
      setStatement(res);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="grow">{isOwner ? 'Member statements' : 'Your statement'}</h2>
        {isOwner && (
          <select value={memberId} onChange={(e) => setMemberId(Number(e.target.value))} style={{ width: 'auto' }}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <div className="banner bad">{error}</div>}
      {loading && <div className="empty">Loading statement…</div>}

      {statement && !loading && (
        <>
          {statement.hidden ? (
            <div className="banner warn">{statement.message}</div>
          ) : (
            <>
              <div className="grid four">
                <div className="stat">
                  <div className="label">Amount due</div>
                  <div className="value">{formatCents(statement.totalCents)}</div>
                  <div className="hint">
                    {formatCents(statement.allocation?.sharedCents || 0)} shared +{' '}
                    {formatCents(statement.allocation?.personalCents || 0)} personal
                  </div>
                </div>
                <div className="stat">
                  <div className="label">Confirmed paid</div>
                  <div className="value good">{formatCents(statement.paidCents)}</div>
                </div>
                <div className="stat">
                  <div className="label">Awaiting confirmation</div>
                  <div className="value small">{formatCents(statement.pendingCents)}</div>
                </div>
                <div className="stat">
                  <div className="label">Balance</div>
                  <div className={`value ${statement.balanceCents > 0 ? 'bad' : 'good'}`}>
                    {formatCents(statement.balanceCents)}
                  </div>
                  <div className="hint">Due {formatDate(statement.bill.due_date)}</div>
                </div>
              </div>

              {statement.visibility.show_charges && statement.allocation?.breakdown?.length > 0 && (
                <>
                  <div className="divider" />
                  <h3>Where this comes from</h3>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Type</th>
                          <th className="num">Your share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statement.allocation.breakdown.map((b, idx) => (
                          <tr key={idx}>
                            <td>{b.label}</td>
                            <td className="small muted">
                              {CATEGORY_LABEL[b.category] || b.category}
                              {b.mode === 'equal' && <span className="chip" style={{ marginLeft: 6 }}>shared</span>}
                              {b.mode === 'personal' && <span className="chip" style={{ marginLeft: 6 }}>yours</span>}
                              {b.mode === 'per_line' && <span className="chip" style={{ marginLeft: 6 }}>by lines</span>}
                            </td>
                            <td className="num mono">{formatCents(b.amountCents)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {statement.source_filename && (
                <p className="small muted">Source document: {statement.source_filename}</p>
              )}
            </>
          )}

          {isOwner && (
            <>
              <div className="divider" />
              <h3>What this member can see</h3>
              <p className="small muted">
                Documents stay private to you. Choose exactly what is shared with this person.
              </p>
              <div className="grid two">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={Boolean(statement.visibility.show_amount)}
                    onChange={(e) => toggleVisibility('show_amount', e.target.checked)}
                  />
                  Amounts and totals
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={Boolean(statement.visibility.show_charges)}
                    onChange={(e) => toggleVisibility('show_charges', e.target.checked)}
                  />
                  Itemized breakdown
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={Boolean(statement.visibility.show_explanation)}
                    onChange={(e) => toggleVisibility('show_explanation', e.target.checked)}
                  />
                  Explanation notes
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={Boolean(statement.visibility.show_source)}
                    onChange={(e) => toggleVisibility('show_source', e.target.checked)}
                  />
                  Original bill filename
                </label>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
