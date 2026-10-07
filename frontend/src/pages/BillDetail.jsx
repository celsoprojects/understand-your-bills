import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { formatCents, formatDate, monthLabel } from '../lib/format.js';
import ChargesPanel from '../components/ChargesPanel.jsx';
import AllocationPanel from '../components/AllocationPanel.jsx';
import StatementsPanel from '../components/StatementsPanel.jsx';
import PaymentsPanel from '../components/PaymentsPanel.jsx';
import DiscussionPanel from '../components/DiscussionPanel.jsx';
import SharingPanel from '../components/SharingPanel.jsx';

export default function BillDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const load = async () => {
    try {
      const res = await api.get(`/bills/${id}`);
      setData(res);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const afterChange = async () => {
    await load();
    setRefreshKey((k) => k + 1);
  };

  if (error) return <div className="banner bad">{error}</div>;
  if (!data) return <div className="loading">Loading bill…</div>;

  const { bill, isOwner, myMemberId, members, lines, charges, allocation, reconciliation, payments, disputes, shares } = data;

  const togglePublish = async () => {
    await api.patch(`/bills/${id}`, { status: bill.status === 'published' ? 'draft' : 'published' });
    await afterChange();
  };

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="breadcrumb">
            <Link to="/">Households</Link> / <Link to={`/groups/${bill.group_id}`}>Household</Link> /{' '}
            {monthLabel(bill.period_label)}
          </div>
          <h1>{monthLabel(bill.period_label)} bill</h1>
          <p className="muted small">
            Statement {formatDate(bill.statement_date)} · Due {formatDate(bill.due_date)} ·{' '}
            {charges.length} line items
          </p>
        </div>
        <div className="btn-row">
          <span className={`pill ${bill.status === 'published' ? 'good' : 'warn'}`}>{bill.status}</span>
          {isOwner && (
            <button className="btn" onClick={togglePublish} data-testid="toggle-publish">
              {bill.status === 'published' ? 'Unpublish' : 'Publish to members'}
            </button>
          )}
        </div>
      </div>

      {bill.notes && <div className="banner info">{bill.notes}</div>}

      <div className="grid four">
        <div className="stat">
          <div className="label">Provider total</div>
          <div className="value">{formatCents(bill.provider_total_cents)}</div>
          <div className="hint">Straight off the invoice</div>
        </div>
        <div className="stat">
          <div className="label">Line items entered</div>
          <div className="value">{formatCents(data.chargeTotalCents)}</div>
        </div>
        <div className="stat">
          <div className="label">Assigned to members</div>
          <div className="value">
            {allocation ? formatCents(allocation.items.reduce((s, i) => s + i.totalCents, 0)) : '—'}
          </div>
        </div>
        <div className="stat">
          <div className="label">Reconciled</div>
          <div className={`value small ${reconciliation.balanced ? 'good' : 'bad'}`}>
            {reconciliation.balanced ? 'Balanced ✓' : formatCents(reconciliation.differenceCents)}
          </div>
          <div className="hint">{allocation ? 'vs. invoice total' : 'Run the split first'}</div>
        </div>
      </div>

      {charges.length > 0 && (
        <ChargesPanel
          billId={id}
          charges={charges}
          members={members}
          lines={lines}
          isOwner={isOwner}
          onChanged={afterChange}
        />
      )}

      {isOwner ? (
        <>
          <AllocationPanel
            billId={id}
            allocation={allocation}
            members={members}
            reconciliation={reconciliation}
            onAllocated={afterChange}
          />
          <StatementsPanel
            billId={id}
            members={members}
            isOwner={isOwner}
            myMemberId={myMemberId}
            refreshKey={refreshKey}
          />
        </>
      ) : (
        <StatementsPanel billId={id} members={members} isOwner={false} myMemberId={myMemberId} refreshKey={refreshKey} />
      )}

      <PaymentsPanel
        billId={id}
        payments={payments}
        members={members}
        isOwner={isOwner}
        myMemberId={myMemberId}
        onChanged={afterChange}
      />

      <DiscussionPanel
        billId={id}
        disputes={disputes}
        members={members}
        isOwner={isOwner}
        myMemberId={myMemberId}
        onChanged={afterChange}
      />

      {isOwner && <SharingPanel billId={id} shares={shares} onChanged={afterChange} />}
    </>
  );
}
