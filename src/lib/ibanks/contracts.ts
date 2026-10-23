// iBanks normalized financial-event contract (docs/IBANKS_EVENT_CONTRACTS.md, schema_version 1).
// Provider payloads are authenticated and normalized on the SERVER; browsers and apps never submit these.
// Money is always integer cents (ZAR). A payment settling is NOT a payout: those are separate events and states.
import { z } from 'zod'

export const SCHEMA_VERSION = 1

/** Facts a trusted payment provider can tell us. Platform facts (job_completed, …) come from gig_events instead. */
export const PROVIDER_EVENT_TYPES = [
  'payment_settled', // customer payment settled → worker net is EARNED (payable), not yet paid out
  'payment_disputed', // conditional: the net amount is held, not guaranteed
  'dispute_resolved', // hold released (a lost dispute arrives separately as refund_settled)
  'refund_settled', // compensating reversal of a settled payment
  'chargeback_confirmed', // same accounting effect as a refund, different provenance
  'payout_requested', // payout sent to the provider; NOT received
  'payout_settled', // provider confirms the payout settled
  'payout_failed', // payout did not happen; funds return to available
] as const
export type ProviderEventType = (typeof PROVIDER_EVENT_TYPES)[number]

const cents = z.number().int().min(0).max(5_000_000_00) // ≤ R5m: far below 2^53, never a float
const id = z.string().min(1).max(100).regex(/^[A-Za-z0-9_.:-]+$/)

export const providerEventSchema = z
  .object({
    event_id: id, // provider's own event id: the idempotency key together with `source`
    schema_version: z.literal(SCHEMA_VERSION),
    event_type: z.enum(PROVIDER_EVENT_TYPES),
    occurred_at: z.iso.datetime({ offset: true }),
    // Only the sandbox provider is wired; real partners (e.g. FNB) get their own adapter and source once approved.
    // `kashwise_platform` is KashWise itself, and may only say that a worker requested a payout.
    source: z.enum(['sandbox_payment_provider', 'kashwise_platform']),
    worker_id: z.uuid(),
    job_id: z.uuid().nullable(),
    payment_id: id.nullable(),
    payout_id: id.nullable(),
    provider_ref: id,
    currency: z.literal('ZAR'),
    gross_cents: cents,
    marketplace_fee_cents: cents,
    /** Funded by KashWise, never subtracted from the worker: recorded for reconciliation only. */
    processor_fee_cents: cents,
    worker_net_cents: cents,
    /** payout_requested / payout_settled / payout_failed: the payout amount. */
    amount_cents: cents,
    /** Masked payout destination, e.g. "Capitec ending 4321" — never a full account number. */
    destination_label: z.string().max(60).nullable(),
    failure_reason: z.string().max(120).nullable(),
    simulation: z.literal(true), // no real money moves until a licensed partner is contracted
  })
  .superRefine((e, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message })
    const paymentEvent = ['payment_settled', 'payment_disputed', 'dispute_resolved', 'refund_settled', 'chargeback_confirmed'].includes(e.event_type)
    if (paymentEvent) {
      if (!e.payment_id || !e.job_id) fail('payment events need payment_id and job_id')
      // Contract: the marketplace fee is worker-borne; processor fees are platform-funded and NOT subtracted again.
      if (e.gross_cents !== e.marketplace_fee_cents + e.worker_net_cents) fail('gross must equal marketplace fee + worker net')
      if (e.gross_cents === 0) fail('payment events need a gross amount')
    } else {
      if (!e.payout_id) fail('payout events need payout_id')
      if (e.amount_cents === 0) fail('payout events need an amount')
    }
    if ((e.event_type === 'payout_requested') !== (e.source === 'kashwise_platform')) {
      fail('only KashWise requests payouts, and only the payment provider reports everything else')
    }
  })
export type ProviderEvent = z.infer<typeof providerEventSchema>

/** Ledger accounts, per worker. Signed integer cents; entries are append-only and reversals are new entries. */
export const ACCOUNTS = ['gross', 'platform_fee', 'net_earned', 'disputed_hold', 'payout_pending', 'paid_out'] as const
export type Account = (typeof ACCOUNTS)[number]

export interface LedgerEntry {
  worker_id: string
  job_id: string | null
  payment_id: string | null
  payout_id: string | null
  event_id: string
  account: Account
  amount_cents: number
  occurred_at: string
  /** event_id of the settlement this entry compensates (refunds / chargebacks). */
  reversal_of: string | null
}

export type IngestStatus =
  | 'posted' // accounting effect applied exactly once
  | 'duplicate' // same provider event seen before: no effect, audited
  | 'out_of_order' // depends on an event we have not seen yet: parked for replay, no effect
  | 'rejected' // invalid transition (e.g. second settlement of one payment, refund > settled)

export interface IngestResult {
  status: IngestStatus
  event_id: string
  reason?: string
  entries: LedgerEntry[]
}

/** Who said so. Rendered as a badge everywhere a figure is shown (spec §8). */
export type Provenance = 'system_verified' | 'user_provided' | 'estimated' | 'simulated'

export const SCOPE_LABEL = 'Based on your KashWise activity only'
