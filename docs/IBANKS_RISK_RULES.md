# iBanks protection rules — policy-2026-10-08.1

Code: `src/lib/ibanks/risk-rules.ts`. Rules flag for protection and human review only — never a fraud verdict, credit
decision or exclusion from work. Each finding carries its evidence; every proposed action passes `policy.ts`.

| Rule | v | Trigger | Severity | Actions | Audience |
|---|---|---|---|---|---|
| R001_provider_replay | 1 | Same provider event received again | low | audit_only | internal |
| R002_payout_failures | 1 | `payout_failed` posted; ≥2 failures in 30 days escalates | low/medium | notify (+ open_support_case) | worker |
| R003_new_payout_destination | 1 | Payout requested to a destination never paid before (when history exists) | medium | notify, require_step_up | worker |
| R004_fee_mismatch | 1 | Settled fee ≠ 10% of gross (half-up) | medium | notify, open_support_case | worker |
| R005_dispute_with_pending_payout | 1 | `payment_disputed` posted (medium if a payout is processing) | low/medium | notify, show_explanation | worker |
| R006_unusual_earnings_velocity | 1 | >5 settlements in 24h, or a job > 5× the typical job (≥5 jobs history) | low | request_human_review | internal |

## Intelligence rules (added 9 Oct 2026, `orchestrator.ts`)

Not protection rules: they explain the worker's own history and are audited the same way.

| Rule | v | Trigger | Output | Method |
|---|---|---|---|---|
| F001_income_outlook | 1 | Posted `payment_settled`, `dispute_resolved`, `refund_settled`, `chargeback_confirmed` | `forecast:outlook` insight (replaces the previous one) | `forecast.ts` `ibanks-outlook-v1`: recency-weighted median of up to 12 complete weeks (half-life 4), weighted 20th–80th percentile range, 30-day = weekly × 30/7, rolling-origin backtest. < 4 complete weeks → "not enough data". Confidence `low`, or `moderate` from 8+ weeks with a backtest; never `high` |
| P001_earning_pattern | 1 | Same triggers, only with ≥ 3 paid jobs | `pattern:suggestion` insight | `patterns.ts`: top category by paid jobs with average net per job, busiest completion weekday (≥ 3 dated jobs), repeat clients counted by opaque key. Worded as history, never a promise |

## Policy outcomes

- `deny` always: `initiate_transfer`, `move_savings`, `approve_payout`, `edit_ledger`, `freeze_bank_card`.
- Agent/worker acting on anyone but themselves: `deny`.
- `open_support_case` from the agent: `require_confirmation`. `request_human_review`: `escalate`.
- `require_step_up`, `block_payout_detail_change`: only deterministic rules (`system_rule`) — `deny` for the agent.

## Not active in KashWise (need authorised bank data)

Unusual merchant, recurring debit changes, bank fee retries, beneficiary anomalies, card controls, bank holds. No
account-takeover rule fires unless real session/device signals exist; none are wired yet.
