# KashWise / iBanks — implementation status

Updated 9 Oct 2026. Statuses: **WORKING** (demonstrated by the tests or commands listed) · **PARTIAL** · **SIMULATED** ·
**NOT STARTED** · **BLOCKED**. "Local DB" = every migration running in PGlite (`tests/helpers/local-db.ts`), never the
live Supabase project. Repo: `kashwise-main` (own Git repo since 8 Oct, no commits yet), imported from `GK_SideGIGS`
with attribution (`NOTICE.md`).

## Verified results (Windows 11, Node 22, repo on OneDrive)

| Command | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass (0 problems; includes `mobile/`) |
| `npm run test:serial` (21 files, 177 tests) | All 177 pass, but across runs: the full run passed 20 files / 159 tests with 0 failures while one file's worker timed out on start (OneDrive); that file group then passed on its own (28/28). Last full-run failure (outbox SQL bug) fixed and its file re-run: 13/13 |
| `npm run build` | pass |
| `cd mobile && npx tsc --noEmit` | pass |
| `cd mobile && npx expo export --platform android` | pass — Android bundle, 741 modules incl. the shared iBanks engine |
| `npm run test:journey` (live DB) | not run on purpose: writes to the live project |
| Live Supabase migrations (read via Supabase connector) | 13 applied; the two iBanks migrations are **not** applied |

Parallel thread workers time out on OneDrive ("Failed to start threads worker"); use `npm run test:serial`.

## Deployment state

| Item | Status | Note |
|---|---|---|
| Migrations `20261008000100_ibanks_ledger.sql`, `20261009000100_ibanks_outlook_and_diagnostics.sql` on live Supabase | **BLOCKED — needs founder approval** | Change `confirm_completion`, `wallet_summary`, `request_cashout`. Recommend a separate demo project or branch first |
| Vault secret `ibanks_provider_webhook_secret` + Netlify `IBANKS_PROVIDER_WEBHOOK_SECRET` | NOT STARTED | Ingest fails closed without it |
| Netlify deploy of new code (incl. scheduled `ibanks-outbox`) | NOT STARTED | |
| Supabase security advisor | Checked 8 Oct | 31 "security definer callable" warnings are the intended RPC-only write design; **leaked-password protection is off** — enable in Supabase Auth settings |

## Flow: WORK → PAYMENT → LEDGER → iBANKS → OUTLOOK → PROOF → GOALS

| Feature | Status | Evidence |
|---|---|---|
| Client confirmation creates proof, not income | WORKING (local DB) | `ibanks-pipeline.test.ts` |
| Signed provider ingestion verified in the database; append-only ledger; exactly-once | WORKING (local DB, serialised) | `ibanks-sql.test.ts`, pipeline test |
| Payment settled ≠ payout settled; failures; disputes/refunds as compensating entries | WORKING (local DB) | `ibanks-sql.test.ts` |
| Simulator settlement ids stable per job → "Replay the settlement event" button yields `duplicate` | PARTIAL | Code + DB dedupe tested; button not clicked against a running stack |
| Dispatcher → rules R001–R006 → policy gate → insights + audit | WORKING (local DB) | core + pipeline tests |
| **Outbox worker** (scheduled `netlify/functions/ibanks-outbox.mts`, `drainOutbox`) | WORKING (local DB) | Pipeline test. Found and fixed a real bug: `ibanks_claim_outbox` was invalid SQL (data-modifying CTE in a subquery), so payout requests were never dispatched |
| Income outlook F001: 7/30-day ranges, recency weighting, backtest error, confidence, "not enough data" | WORKING | `ibanks-intelligence.test.ts` (synthetic series only — no accuracy claim) |
| Earning patterns P001 (category, weekday, repeat clients, sample sizes) | WORKING | `ibanks-intelligence.test.ts` |
| Outlook/pattern card supersedes the previous one | WORKING (local DB) | pipeline test |
| Worker audit trail "How iBanks decided" (`ibanks_my_diagnostics`) | WORKING (local DB + component) | pipeline test (own rows only; client sees none; anon denied); `Money.test.tsx` |
| Ask iBanks grounded answers, injection resistance, forecast grounding | WORKING | core, intelligence and pipeline tests |
| Ask iBanks AI re-phrasing | PARTIAL | Code + grounding check; never called against the API |
| Savings / retirement simulation | WORKING / SIMULATED | R45 / R18 / R837; no transfer created |
| ProofScript evidence level "payment confirmed" | WORKING (local DB) | pipeline test; badge in `PortfolioRecord.tsx` |
| Insight feedback (helpful / not / dismiss) | WORKING (code, pre-existing RPC) | not separately tested this round |
| User-declared obligations (cash-flow gaps) | NOT STARTED | |

## Product, business, presentation

| Item | Status | Evidence |
|---|---|---|
| KashWise rebrand of the web UI (historical identifiers kept, see `NOTICE.md`) | WORKING | typecheck/tests/build; not yet viewed in a browser |
| Unit economics calculator `/economics` | WORKING | `unit-economics.test.ts` |
| Demo script, judge Q&A, unit economics doc | WRITTEN | `DEMO_SCRIPT_90_SECONDS.md` (needs a migrated demo env), `JUDGE_QA.md`, `UNIT_ECONOMICS.md` |
| 3/5-minute pitch, evidence pack, usability sessions, impact metrics from iBanks | NOT STARTED | |
| Traction | Zero real users | — |

## Platforms

| Platform | Status |
|---|---|
| Web (React/Vite) | Builds; tests pass; not run in a browser this session |
| Android (Expo) | Typechecks and bundles; **not run on a device/emulator** |
| iOS (Expo) | Same code; **no iOS bundle or build made** (needs EAS or a Mac) |
