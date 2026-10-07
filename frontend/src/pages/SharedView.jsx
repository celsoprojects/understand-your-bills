import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { formatCents, formatDate, monthLabel } from '../lib/format.js';

export default function SharedView() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get(`/share/${token}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [token]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="brand">
          <span className="brand-mark">B</span>
          BillShare
        </span>
        <span className="topbar-spacer" />
        <span className="pill">Shared summary</span>
      </header>
      <main className="content narrow">
        {error && <div className="banner bad">{error}</div>}
        {!data && !error && <div className="loading">Loading shared summary…</div>}

        {data && (
          <>
            <div className="page-head">
              <div className="grow">
                <h1>{monthLabel(data.bill.period_label)} split</h1>
                <p className="muted small">
                  {data.group.name} · {data.provider} · due {formatDate(data.bill.due_date)}
                </p>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <h2 className="grow">Amounts owed</h2>
                <span className="pill mono">{formatCents(data.bill.provider_total_cents)}</span>
              </div>
              {data.totals.length === 0 ? (
                <div className="empty">This link only confirms the shared bill summary.</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Person</th>
                        <th className="num">Shared</th>
                        <th className="num">Own items</th>
                        <th className="num">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.totals.map((t, i) => (
                        <tr key={i}>
                          <td>{t.name}</td>
                          <td className="num mono">{formatCents(t.sharedCents)}</td>
                          <td className="num mono">{formatCents(t.personalCents)}</td>
                          <td className="num mono">
                            <strong>{formatCents(t.totalCents)}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="tiny muted" style={{ marginTop: '0.8rem' }}>
                {data.note}
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
