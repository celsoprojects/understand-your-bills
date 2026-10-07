// Deterministic, integer-only allocation engine.
//
// Rules are per charge category and control how a charge is shared:
//   equal      -> split evenly across every member
//   per_line   -> split in proportion to how many lines each member holds
//   personal   -> assigned entirely to the charge's member (or the owner)
//   excluded   -> kept by the owner, outside the split
//
// Every split reconciles to the exact cent using largest-remainder rounding,
// and the leftover penny is rotated by `seed` so it is not always the same person.

export const CATEGORIES = [
  'plan',
  'line',
  'tablet',
  'device',
  'accessory',
  'tax_fee',
  'late_fee',
  'proration',
  'one_time',
  'credit',
  'past_due',
  'other',
];

export const CATEGORY_LABELS = {
  plan: 'Plan / account base',
  line: 'Additional lines',
  tablet: 'Tablets & connected devices',
  device: 'Phone installments',
  accessory: 'Accessories (AirPods, etc.)',
  tax_fee: 'Taxes & fees',
  late_fee: 'Late fees',
  proration: 'Prorations & adjustments',
  one_time: 'One-time charges',
  credit: 'Credits & promotions',
  past_due: 'Bring-forward / past due',
  other: 'Other',
};

export const MODES = ['equal', 'per_line', 'personal', 'excluded'];

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

function normalizeMode(mode) {
  return MODES.includes(mode) ? mode : 'equal';
}

// Split `amount` across `ids` as evenly as possible, rotating the remainder.
function splitEqual(amount, ids, seed = 0) {
  const out = new Map();
  if (ids.length === 0) return out;
  const sign = amount < 0 ? -1 : 1;
  const abs = Math.abs(amount);
  const base = Math.floor(abs / ids.length);
  let remainder = abs - base * ids.length;
  const start = ((seed % ids.length) + ids.length) % ids.length;
  ids.forEach((id, i) => {
    let cents = base;
    if (i >= start && remainder > 0) {
      cents += 1;
      remainder -= 1;
    }
    out.set(id, sign * cents);
  });
  // Any remainder left because the rotation wrapped around.
  let i = 0;
  while (remainder > 0 && i < ids.length) {
    out.set(ids[i], out.get(ids[i]) + sign);
    remainder -= 1;
    i += 1;
  }
  return out;
}

// Split `amount` proportionally to weights, using largest-remainder rounding.
function splitProportional(amount, entries) {
  const out = new Map();
  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
  if (entries.length === 0 || totalWeight <= 0) {
    entries.forEach((e) => out.set(e.id, 0));
    return out;
  }
  const sign = amount < 0 ? -1 : 1;
  const abs = Math.abs(amount);
  const raw = entries.map((e) => (abs * e.weight) / totalWeight);
  const floors = raw.map((v) => Math.floor(v));
  let remainder = abs - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const cents = floors.slice();
  let k = 0;
  while (remainder > 0 && order.length > 0) {
    cents[order[k % order.length].i] += 1;
    remainder -= 1;
    k += 1;
  }
  entries.forEach((e, i) => out.set(e.id, sign * cents[i]));
  return out;
}

export function allocate({ charges, members, lines, rules = {}, ownerMemberId, seed = 0 }) {
  const mergedRules = { ...DEFAULT_RULES, ...rules };
  const memberIds = members.map((m) => m.id);
  const lineCounts = new Map(memberIds.map((id) => [id, 0]));
  for (const line of lines || []) {
    if (line.member_id && lineCounts.has(line.member_id)) {
      lineCounts.set(line.member_id, lineCounts.get(line.member_id) + 1);
    }
  }

  const items = new Map(
    members.map((m) => [m.id, { memberId: m.id, name: m.name, sharedCents: 0, personalCents: 0, excludedCents: 0, breakdown: [] }]),
  );

  const warnings = [];
  let allocatedCents = 0;
  let retainedCents = 0;

  for (const charge of charges) {
    const amount = Number(charge.amount_cents) || 0;
    const mode = charge.is_personal ? 'personal' : normalizeMode(mergedRules[charge.category]);
    const bucket = mode === 'personal' ? 'personalCents' : mode === 'excluded' ? 'excludedCents' : 'sharedCents';

    const record = (memberId, cents) => {
      const item = items.get(memberId);
      if (!item || cents === 0) return;
      item[bucket] += cents;
      item.breakdown.push({
        chargeId: charge.id,
        category: charge.category,
        label: charge.label,
        mode,
        amountCents: cents,
      });
    };

    if (mode === 'personal') {
      const target = charge.member_id || ownerMemberId;
      if (!target || !items.has(target)) {
        retainedCents += amount;
        warnings.push(`"${charge.label}" is personal but has no member assigned; kept by the owner.`);
        continue;
      }
      record(target, amount);
      allocatedCents += amount;
      continue;
    }

    if (mode === 'excluded') {
      retainedCents += amount;
      if (ownerMemberId && items.has(ownerMemberId)) {
        const item = items.get(ownerMemberId);
        item.excludedCents += amount;
        item.breakdown.push({
          chargeId: charge.id,
          category: charge.category,
          label: charge.label,
          mode,
          amountCents: amount,
        });
      }
      continue;
    }

    if (memberIds.length === 0) {
      retainedCents += amount;
      continue;
    }

    let split;
    if (mode === 'per_line') {
      const entries = memberIds
        .map((id) => ({ id, weight: lineCounts.get(id) || 0 }))
        .filter((e) => e.weight > 0);
      split = entries.length > 0 ? splitProportional(amount, entries) : splitEqual(amount, memberIds, seed);
    } else {
      split = splitEqual(amount, memberIds, seed);
    }

    let sum = 0;
    for (const [memberId, cents] of split) {
      record(memberId, cents);
      sum += cents;
    }
    allocatedCents += sum;
  }

  const result = [...items.values()].map((item) => ({
    ...item,
    totalCents: item.sharedCents + item.personalCents + item.excludedCents,
  }));

  return {
    rules: mergedRules,
    items: result,
    allocatedCents,
    retainedCents,
    warnings,
  };
}

export function reconcile(allocation, invoiceTotalCents) {
  const assigned = allocation.items.reduce((sum, i) => sum + i.totalCents, 0);
  const difference = invoiceTotalCents - assigned;
  return {
    invoiceTotalCents,
    assignedCents: assigned,
    differenceCents: difference,
    balanced: difference === 0,
  };
}
