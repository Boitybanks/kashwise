# iBanks inside KashWise — architecture (as built)

iBanks is the event-driven financial intelligence and protection layer of KashWise. It is **not** a chatbot and it
cannot move money. This document describes what exists in this repository on 8 Oct 2026, with real file paths.

## Flow

```
Client confirms job (confirm_completion RPC)        → portfolio record created; payment stays "held" (authorised)
Payment provider settles (today: the simulator)     → signed event
  netlify/functions/payments-webhook.mts            ← real provider entry point (HMAC header, zod contract)
  netlify/functions/payments-sandbox.mts            ← simulator (PAYMENTS_MODE=sandbox only), same pipeline
        │  netlify/lib/ibanks-pipeline.ts processProviderEvent()
        ▼
public.ibanks_ingest_provider_event(payload, signature)      supabase/migrations/20261008000100_ibanks_ledger.sql
  HMAC re-verified IN THE DATABASE (secret in Supabase Vault: ibanks_provider_webhook_secret)
  contract checks → per-worker advisory lock → unique (provider, event_id) → state machine
  → append-only financial_ledger_entries → transactions.status → ibanks_event_outbox → audit
        ▼
iBanks dispatcher (src/lib/ibanks/orchestrator.ts) — only for 'posted' events
  analytics.ts (weekly/monthly, median, volatility)   risk-rules.ts (R001–R006, versioned)
  forecast.ts (F001: 7/30-day outlook + backtest)      patterns.ts (P001: category / weekday / repeat clients)
  policy.ts (allow / deny / require_confirmation / escalate)   → insights + decision audit
        ▼
public.ibanks_record_dispatch(signed)  → ibanks_insights (worker-scoped RLS; a new outlook/pattern card supersedes
                                         the previous one), decision audit, outbox row marked done
public.ibanks_my_diagnostics()         → the worker's own decisions + event states ("How iBanks decided")
public.portfolio_payment_confirmed()   → ProofScript evidence level "payment confirmed" (no amounts)
        ▼
KashWise Money UI  src/pages/Money.tsx   (Overview · Earnings · Insights · Goals · History)
Ask iBanks         netlify/functions/ibanks-ask.mts → src/lib/ibanks/agent.ts (+ optional netlify/lib/ibanks-llm.ts)
```

## Principles enforced in code

| Principle | Where |
|---|---|
| Earned ≠ paid out ≠ payout pending ≠ disputed | ledger accounts in `contracts.ts`; `balances()` in `ledger.ts`; SQL mirror |
| Integer cents only | zod `int()` contract; `bigint` columns; `savings.ts` integer bps maths |
| Exactly-once effect | unique `(provider, provider_event_id)` + advisory lock; duplicates audited (`R001`) |
| No client can create income | no table write grants; ingest needs the Vault HMAC secret; `confirm_completion` no longer releases money |
| Append-only history | triggers block UPDATE/DELETE on ledger and provider events; refunds are compensating entries |
| Only KashWise requests payouts; only the provider confirms them | contract refinement + SQL source check |
| AI cannot move money | `policy.ts` denies `initiate_transfer`, `move_savings`, `approve_payout`, `edit_ledger`, `freeze_bank_card` |
| No LLM arithmetic | answers built by `answerDeterministic`; AI re-phrasing rejected unless every rand amount is in the facts (`acceptAiOutput`) |
| Worker isolation | RLS on ledger/insights/preferences; provider events, outbox, audit have no client grants |
| No service-role key | server→DB calls are HMAC-signed RPCs using the publishable key |

## Runtime AI (separate from the coding agent)

`IBANKS_LLM_PROVIDER=none` (default) → fully rules-based. `anthropic` + `ANTHROPIC_API_KEY` + the worker's opt-in →
`claude-opus-5-5` (override with `IBANKS_LLM_MODEL`) at low effort re-phrases the rules answer; refusals, timeouts or
any ungrounded amount fall back to the rules answer. The model never sees raw records, secrets or tools.

## Tests (local, never against the live project)

- `tests/ibanks-core.test.ts` — contract, ledger, analytics, savings, policy, orchestrator, grounding (31 tests)
- `tests/ibanks-sql.test.ts` — the migration in PGlite after all 13 existing migrations; RLS; TS↔SQL parity (12)
- `tests/ibanks-pipeline.test.ts` — simulator → pipeline → insights → Ask iBanks; FNB adapters fail closed (8)
- `tests/Money.test.tsx` — UI renders ledger-derived figures and labels
- `tests/helpers/local-db.ts` — PGlite with stub `auth`, `storage`, `vault` schemas and Supabase roles

## Known limits

- PGlite is single-connection: "10 concurrent replays" are serialised there. True concurrency safety rests on the
  unique constraint + advisory lock, which needs a real Postgres test before production.
- The outbox retry path (`ibanks_claim_outbox`) exists but no scheduled function calls it yet.
- Insights are rules-generated; the AI only re-phrases answers in Ask iBanks.
- The outlook is a transparent statistical baseline tested on synthetic series only; its backtest error is shown to
  the worker, and nothing about real-world accuracy is claimed until real (consented) history exists.
