export function formatCents(cents) {
  const n = Number(cents) || 0;
  const sign = n < 0 ? '-' : '';
  return `${sign}$${(Math.abs(n) / 100).toFixed(2)}`;
}

export function toCents(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const num = Number.parseFloat(String(value).replace(/[^0-9.\-]/g, ''));
  if (Number.isNaN(num)) return 0;
  return Math.round(num * 100);
}

export function fromCents(cents) {
  const n = Number(cents) || 0;
  return (n / 100).toFixed(2);
}

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function monthLabel(period) {
  if (!period) return '—';
  const [year, month] = String(period).split('-');
  if (!year || !month) return period;
  const d = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(d.getTime())) return period;
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
