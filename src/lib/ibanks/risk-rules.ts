// Versioned, explainable protection rules (spec §5.4, docs/IBANKS_RISK_RULES.md). Each finding carries its evidence.
// Rules flag for protection and review; they are never a fraud verdict, credit decision or employment exclusion.
import { feeCents } from '../money'
import type { IngestResult, LedgerEntry, ProviderEvent } from './contracts'
import type { Action } from './policy'
import { median } from './analytics'

export type Severity = 'info' | 'low' | 'medium' | 'high'

export interface RiskFinding {
  rule_id: string
  version: number
  severity: Severity
  title: string
  explanation: string
  evidence: Record<string, string | number | boolean | null>
  proposed_actions: Action[]
  /** Internal findings go to the audit log only; the worker is not alarmed by plumbing issues. */
  audience: 'worker' | 'internal'
}

export interface PayoutRecord {
  payout_id: string
  requested_at: string
  amount_cents: number
  destination_label: string | null
  state: 'requested' | 'settled' | 'failed'
}

export interface RuleContext {
  event: ProviderEvent
  ingest: IngestResult
  /** All of this worker's ledger entries AFTER the event was applied. */
  entries: readonly LedgerEntry[]
  payouts: readonly PayoutRecord[]
  now: number
}

type Rule = { id: string; version: number; run: (c: RuleContext) => RiskFinding | null }

const HOUR = 3600_000

export const RULES: Rule[] = [
  {
    id: 'R001_provider_replay',
    version: 1,
    run: ({ ingest, event }) =>
      ingest.status === 'duplicate'
        ? {
            rule_id: 'R001_provider_replay',
            version: 1,
            severity: 'low',
            title: 'Repeated provider event ignored',
            explanation: 'The payment provider sent an event we had already processed. It was not counted again.',
            evidence: { event_id: event.event_id, event_type: event.event_type, source: event.source },
            proposed_actions: ['audit_only'],
            audience: 'internal',
          }
        : null,
  },
  {
    id: 'R002_payout_failures',
    version: 1,
    run: ({ event, ingest, payouts, now }) => {
      if (event.event_type !== 'payout_failed' || ingest.status !== 'posted') return null
      const recent = payouts.filter((p) => p.state === 'failed' && now - Date.parse(p.requested_at) < 30 * 24 * HOUR).length
      return {
        rule_id: 'R002_payout_failures',
        version: 1,
        severity: recent >= 2 ? 'medium' : 'low',
        title: recent >= 2 ? 'Several payouts have failed' : 'A payout failed',
        explanation:
          `Your payout of the requested amount did not go through${event.failure_reason ? ` (provider says: ${event.failure_reason})` : ''}. ` +
          'The money is back in your available earnings. Check your payout details before trying again.',
        evidence: { payout_id: event.payout_id, amount_cents: event.amount_cents, failed_last_30_days: recent },
        proposed_actions: recent >= 2 ? ['notify', 'open_support_case'] : ['notify'],
        audience: 'worker',
      }
    },
  },
  {
    id: 'R003_new_payout_destination',
    version: 1,
    run: ({ event, ingest, payouts }) => {
      if (event.event_type !== 'payout_requested' || ingest.status !== 'posted' || !event.destination_label) return null
      const earlier = payouts.filter((p) => p.payout_id !== event.payout_id && p.state !== 'failed' && p.destination_label)
      if (earlier.length === 0 || earlier.some((p) => p.destination_label === event.destination_label)) return null
      return {
        rule_id: 'R003_new_payout_destination',
        version: 1,
        severity: 'medium',
        title: 'Payout to a new destination',
        explanation:
          `This payout goes to ${event.destination_label}, which you have not been paid to before. ` +
          'If you did not make this change, contact support straight away.',
        evidence: { payout_id: event.payout_id, destination: event.destination_label, previous_destinations: earlier.length },
        proposed_actions: ['notify', 'require_step_up'],
        audience: 'worker',
      }
    },
  },
  {
    id: 'R004_fee_mismatch',
    version: 1,
    run: ({ event, ingest }) => {
      if (event.event_type !== 'payment_settled' || ingest.status !== 'posted') return null
      const expected = feeCents(event.gross_cents)
      if (event.marketplace_fee_cents === expected) return null
      return {
        rule_id: 'R004_fee_mismatch',
        version: 1,
        severity: 'medium',
        title: 'The fee on a payment looks wrong',
        explanation: 'The KashWise fee recorded on this payment differs from the 10% fee you agreed to. A review case was opened; nothing was changed automatically.',
        evidence: { payment_id: event.payment_id, charged_fee_cents: event.marketplace_fee_cents, expected_fee_cents: expected },
        proposed_actions: ['notify', 'open_support_case'],
        audience: 'worker',
      }
    },
  },
  {
    id: 'R005_dispute_with_pending_payout',
    version: 1,
    run: ({ event, ingest, payouts }) => {
      if (event.event_type !== 'payment_disputed' || ingest.status !== 'posted') return null
      const pending = payouts.filter((p) => p.state === 'requested')
      return {
        rule_id: 'R005_dispute_with_pending_payout',
        version: 1,
        severity: pending.length ? 'medium' : 'low',
        title: 'A payment is being disputed',
        explanation:
          'The client disputed a payment, so its earnings are on hold until the dispute is resolved and are not available to cash out.' +
          (pending.length ? ' You also have a payout in progress; it is not affected unless the provider says so.' : ''),
        evidence: { payment_id: event.payment_id, held_cents: event.worker_net_cents, pending_payouts: pending.length },
        proposed_actions: ['notify', 'show_explanation'],
        audience: 'worker',
      }
    },
  },
  {
    id: 'R006_unusual_earnings_velocity',
    version: 1,
    run: ({ event, ingest, entries, now }) => {
      if (event.event_type !== 'payment_settled' || ingest.status !== 'posted') return null
      const settled = entries.filter((e) => e.account === 'net_earned' && e.amount_cents > 0)
      const lastDay = settled.filter((e) => now - Date.parse(e.occurred_at) < 24 * HOUR)
      const typical = median(settled.map((e) => e.amount_cents))
      const big = settled.length >= 5 && event.worker_net_cents > typical * 5
      if (lastDay.length <= 5 && !big) return null
      return {
        rule_id: 'R006_unusual_earnings_velocity',
        version: 1,
        severity: 'low',
        title: 'Unusual payment activity',
        explanation: 'This activity is unusual for your account, so a person will take a quick look. This is routine and does not mean anything is wrong.',
        evidence: { settlements_24h: lastDay.length, amount_cents: event.worker_net_cents, typical_job_net_cents: typical },
        proposed_actions: ['request_human_review'],
        audience: 'internal',
      }
    },
  },
]

export function runRules(ctx: RuleContext): RiskFinding[] {
  return RULES.map((r) => r.run(ctx)).filter((f): f is RiskFinding => f !== null)
}
