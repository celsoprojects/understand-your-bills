// All money is stored and computed as integer minor units (cents).
// This module is the single place that converts between display and storage.

export function toCents(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Math.round(value * 100);
  const clean = String(value).replace(/[^0-9.\-]/g, '');
  const num = Number.parseFloat(clean);
  if (Number.isNaN(num)) return 0;
  return Math.round(num * 100);
}

export function toDecimal(cents) {
  const n = Number(cents) || 0;
  return n / 100;
}

export function formatCents(cents) {
  const n = Number(cents) || 0;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}
