# Earn My Goal

Worker route: `/money/earn-goal`, linked from Discover and Money.

The worker sets an amount, deadline, skills, coarse area, radius, weekdays and time
windows. A deterministic matcher shortlists up to three compatible open jobs.
It explains the skill, date and approximate area-distance match. Nothing applies
for work or accepts a booking automatically. Posted services are not paying
opportunities until a customer books them.

## Boundaries

- Only authenticated workers can save/read their own goal. The API derives the
  worker ID from the verified Supabase JWT; the browser cannot supply it.
- Real listings require the poster's identity-details record. This is **not** an
  external government identity check. Database triggers enforce the same rule on
  new/edited jobs and services, including legacy accounts that predate signup checks.
- Demo opportunities remain isolated from real accounts. Payments are still
  simulated for everyone; the interface says so. No FNB connection is claimed.
- New workers can match by skills and availability without needing a job history.
- Availability uses broad windows, not exact appointment times. A flexible job
  reserves its whole day. Existing bookings and completed jobs block overlapping
  windows. Workers must confirm duration, travel and exact timing with customers.
- Distances are between area centres, not routes or private home addresses.
- Matching is a bounded, explainable shortlist, not a claim of global optimisation.
  The database exposes at most 500 current eligible opportunities and flags truncation.

## Money and goal periods

Use the database's generated worker-net amount after the platform fee. Travel,
materials, taxes and other worker costs are not estimated or deducted.

Only signed `net_earned` ledger changes between goal creation and its deadline
count toward earned progress. Refunds during that period can reduce it, including
refunds for older work. Booked work and suggested work remain potential income;
completed jobs do not count until settlement is posted. Payouts and pending or
held funds are shown separately and never added to earnings. Those figures are
goal-period changes, not current wallet balances.

Changing the target or deadline starts a new earnings period. Changing only
availability, skills, location or memory consent preserves the period. The form
explains this before saving. The previous single active goal is replaced.

## Local memory

Optional Graphiti memory uses the user's pinned Graphiti fork and Ollama. See
[GRAPHITI_LOCAL.md](GRAPHITI_LOCAL.md). Only the confirmed structured goal and
preferences enter it. No identity documents, contact details, private addresses,
job descriptions or ledger entries are sent. Memory never decides eligibility,
job availability or money. Recalled preferences must be reviewed before saving.

Sharing starts only after a checked opt-in is saved. Opt-out disables further
sharing and attempts deletion; Forget can be retried even while sharing is off.
A failed deletion is reported as unconfirmed, not as successful. A saved SQL goal
is retained when AI memory is forgotten. The single-process local queue is not
durable and is not a production job queue.

## Enablement

1. Apply the existing migrations and `20261023000100_earn_goals.sql` to the intended
   Supabase environment using the normal reviewed migration process.
2. Configure the app's Supabase public URL/key and deploy the Netlify function
   `earn-goal.mts`. It uses caller-scoped access; no service-role bypass is needed.
3. Optionally run the private service described in GRAPHITI_LOCAL.md and set
   server-only `GRAPHITI_SERVICE_URL` and `GRAPHITI_SERVICE_TOKEN`.

Netlify cloud cannot call a laptop's localhost. Public memory requires a reachable
authenticated HTTPS backend, persistent queue and deployment monitoring. The
core planner works with memory disabled or unavailable.

## Local verification

23 October 2026: TypeScript checking, source ESLint and the Vite production build
passed. The four new application test files passed 31 tests; the existing iBanks
SQL and pipeline suites passed 25 tests. Python gateway tests passed 19 tests.
The new page and its gig navigation were also checked in a browser with labelled
demo fixtures. These checks do not claim production deployment or live AI extraction.

Focused tests cover matching, schedule conflicts, fee amounts, refunds, consent,
failed service calls, cross-worker isolation, posting eligibility and the UI.
SQL tests run all migrations inside local PGlite; they never touch production.
Python tests exercise authentication, partition isolation and queued/in-flight
forget behaviour. A successful unit test is not proof of live model extraction.

```powershell
npm run typecheck
npm run lint
npm run build
npx vitest run tests/earn-goal.test.ts tests/earn-goal-api.test.ts tests/earn-goal-sql.test.ts tests/EarnGoal.test.tsx --pool=threads --maxWorkers=1 --no-file-parallelism
services/graphiti/.venv/Scripts/python.exe -m pytest services/graphiti/tests -q
```
