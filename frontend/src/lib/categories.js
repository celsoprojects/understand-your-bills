export const CATEGORIES = [
  { id: 'plan', label: 'Plan / account base' },
  { id: 'line', label: 'Additional lines' },
  { id: 'tablet', label: 'Tablets & connected devices' },
  { id: 'device', label: 'Phone installments' },
  { id: 'accessory', label: 'Accessories (AirPods, etc.)' },
  { id: 'tax_fee', label: 'Taxes & fees' },
  { id: 'late_fee', label: 'Late fees' },
  { id: 'proration', label: 'Prorations & adjustments' },
  { id: 'one_time', label: 'One-time charges' },
  { id: 'credit', label: 'Credits & promotions' },
  { id: 'past_due', label: 'Bring-forward / past due' },
  { id: 'other', label: 'Other' },
];

export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

export const MODES = [
  { id: 'equal', label: 'Split evenly (all members)' },
  { id: 'per_line', label: 'Split by lines held' },
  { id: 'personal', label: "One person's own" },
  { id: 'excluded', label: 'Kept by organizer' },
];

export const DEFAULT_RULES = {
  plan: 'equal',
  line: 'equal',
  tablet: 'equal',
  device: 'personal',
  accessory: 'personal',
  tax_fee: 'equal',
  late_fee: 'equal',
  proration: 'equal',
  one_time: 'equal',
  credit: 'equal',
  past_due: 'equal',
  other: 'equal',
};
