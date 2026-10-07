# BillShare — Base44 dev environment notes

## What this repo is

The repository was imported with no application code (only a `chat-gpt.txt` transcript).
The app was therefore scaffolded from scratch to satisfy the approved PRD:

- `backend/` — Node 22 + Express + `pg` REST API. No build step; plain ESM.
- `frontend/` — React 18 + Vite dev server, served on port 3000 and proxying `/api` to the API service.
- `db` — PostgreSQL 16, one compose service. The schema is created on API boot (`backend/src/db.js`
  `initSchema`, idempotent `CREATE TABLE IF NOT EXISTS`), so there is no separate migration step.

## Running it

```bash
docker compose -f docker-compose.base44.yml up -d          # start
docker compose -f docker-compose.base44.yml logs -f web api # watch
docker compose -f docker-compose.base44.yml down            # stop (keeps the db_data volume)
```

Only host port **3000** is published. The browser talks to Vite, which proxies `/api` to the `api`
service — single origin, so the `billshare_sid` session cookie needs no CORS or `SameSite=None`.

## Non-obvious things worth knowing

- **Auth is opaque DB-backed sessions**, not signed JWTs. The `billshare_sid` cookie holds a random
  token validated against the `sessions` table, so there is no `SESSION_SECRET` and no external
  secret of any kind is required to boot.
- **All money is integer cents.** `backend/src/lib/money.js` converts; never store decimals.
- **The allocation engine is `backend/src/lib/allocation.js`.** It is pure and deterministic per
  category rule (`equal | per_line | personal | excluded`). Even splits use largest-remainder rounding
  and rotate the leftover penny by a seed derived from the billing period, so a member is not always
  the one paying the extra cent. Invariant: assigned totals always sum back to the input exactly.
- **`provider_total_cents` is the invoice total** and is kept separate from the sum of entered charges;
  the UI surfaces the difference as a reconciliation banner. Do not auto-sync the two.
- **Statements are permission-checked server-side** for every member, and `bill_visibility` holds the
  organizer's per-member sharing flags (source documents default to owner-only).
- Dependency installs run at container start (`npm ci`) against the lockfiles in `backend/` and
  `frontend/`, with `node_modules` in named volumes. Editing a `package.json` requires
  `docker compose -f docker-compose.base44.yml up -d --build` to refresh.

## How to verify it works

1. `curl -s localhost:3000/api/health` → `{"ok":true,...}`.
2. Sign in at the preview root; create a household, add members, create a bill, add line items,
   run the split, and confirm the reconciliation banner shows “Balanced ✓”.
3. The split math is the important invariant. With the September sample (5 members, $337.06 invoice)
   the organizer should land on **$93.50** and the second member on **$64.95**.
