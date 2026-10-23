// Assemble the grounded facts iBanks reasons over, from rows the worker is allowed to read (RLS-scoped).
import { earningsIntelligence, type JobInfo } from './analytics'
import type { LedgerEntry } from './contracts'
import type { AgentFacts, ProofFacts } from './agent'
import type { Insight } from './orchestrator'

export interface LedgerRow extends Omit<LedgerEntry, 'amount_cents'> {
  amount_cents: number | string // bigint arrives as a string from PostgREST
  provider?: string
}

export function toEntries(rows: readonly LedgerRow[]): LedgerEntry[] {
  return rows.map((r) => ({
    worker_id: r.worker_id,
    job_id: r.job_id,
    payment_id: r.payment_id,
    payout_id: r.payout_id,
    event_id: r.event_id,
    account: r.account,
    amount_cents: Number(r.amount_cents),
    occurred_at: r.occurred_at,
    reversal_of: r.reversal_of,
  }))
}

export function buildAgentFacts(input: {
  entries: readonly LedgerEntry[]
  jobs: ReadonlyMap<string, JobInfo>
  insights: readonly Insight[]
  proof: ProofFacts
  now: number
}): AgentFacts {
  return {
    intel: earningsIntelligence(input.entries, input.jobs, input.now),
    insights: input.insights,
    proof: input.proof,
    source_event_ids: [...new Set(input.entries.map((e) => e.event_id))],
    simulation: true, // every KashWise payment is simulated until a licensed provider is live
  }
}
