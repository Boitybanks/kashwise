# iBanks event contract — schema_version 1

Source of truth: `src/lib/ibanks/contracts.ts` (zod) and `private.ibanks_post_event` (SQL). Both must change together.

## Envelope

| Field | Type | Notes |
|---|---|---|
| `event_id` | string `[A-Za-z0-9_.:-]{1,100}` | Provider's id. Idempotency key with `source`. |
| `schema_version` | `1` | |
| `event_type` | see below | |
| `occurred_at` | ISO-8601 with offset | Periods use Africa/Johannesburg, weeks start Monday. |
| `source` | `sandbox_payment_provider` \| `kashwise_platform` | FNB sources are added only when an adapter goes live. |
| `worker_id` | uuid | Must be an existing profile. |
| `job_id` | uuid \| null | Required for payment events; the job must be a completed job of that worker. |
| `payment_id` / `payout_id` | string \| null | Payout id = `wallet_cashouts.reference` (`CO-XXXXXXXX`). |
| `provider_ref` | string | |
| `currency` | `ZAR` | |
| `gross_cents`, `marketplace_fee_cents`, `processor_fee_cents`, `worker_net_cents`, `amount_cents` | integer cents ≥ 0 | |
| `destination_label` | string ≤ 60 \| null | Masked, e.g. `PayShap ShapID ending 4321`. Never a full number. |
| `failure_reason` | string ≤ 120 \| null | |
| `simulation` | `true` | Required until a licensed provider is live. |

Invariant for payment events: `gross = marketplace_fee + worker_net`. `processor_fee` is platform-funded and recorded
separately (`private.ibanks_payments.processor_fee_cents`); it is never subtracted from the worker.

## Event types and ledger effect

| Event | Source | Ledger entries | Preconditions |
|---|---|---|---|
| `payment_settled` | provider | +gross, +platform_fee, +net_earned | payment not settled; job completed by worker |
| `payment_disputed` | provider | +disputed_hold (net) | payment `settled` |
| `dispute_resolved` | provider | −disputed_hold | payment `disputed` |
| `refund_settled` / `chargeback_confirmed` | provider | −gross, −platform_fee, −net_earned (+ release hold); `reversal_of` = settlement | full amounts only |
| `payout_requested` | kashwise_platform | +payout_pending | amount ≤ available |
| `payout_settled` | provider | −payout_pending, +paid_out | payout `processing`, same worker and amount |
| `payout_failed` | provider | −payout_pending | payout `processing` |

`available = net_earned − paid_out − payout_pending − disputed_hold`

## Ingest results

`posted` (effect applied once) · `duplicate` (seen; audited; HTTP 200) · `out_of_order` (depends on an unseen event;
not recorded; HTTP 409 so the provider retries) · `rejected` (invalid transition; audited; 422) · `invalid` (fails
contract; 400). A bad signature raises and is audited as `signature_invalid`.

## Signing

`X-KashWise-Signature: hex(HMAC-SHA256(secret, raw_body))`. The same secret is stored in Supabase Vault as
`ibanks_provider_webhook_secret` and in Netlify as `IBANKS_PROVIDER_WEBHOOK_SECRET` (≥ 32 chars). Server-to-database
calls (`ibanks_worker_context`, `ibanks_record_dispatch`, `ibanks_claim_outbox`) are signed the same way; context
requests expire after 5 minutes.
