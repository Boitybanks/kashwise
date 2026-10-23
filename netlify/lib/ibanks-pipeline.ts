// Server pipeline: validated provider event → database ingest (signature re-checked there) → worker context →
// iBanks dispatcher (rules, insights, policy) → signed write-back. iBanks is triggered ONLY from here, and only
// after the database has accepted the event; the LLM is never involved.
import { providerEventSchema, type IngestResult, type LedgerEntry, type ProviderEvent } from '../../src/lib/ibanks/contracts'
import type { JobInfo } from '../../src/lib/ibanks/analytics'
import { dispatch, type Insight } from '../../src/lib/ibanks/orchestrator'
import type { PayoutRecord } from '../../src/lib/ibanks/risk-rules'
import { signed } from './ibanks-signing'

/** Calls a Postgres RPC and returns its result, throwing on error (supabase-js in production, PGlite in tests). */
export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<unknown>

export interface DbIngest {
  status: IngestResult['status'] | 'invalid'
  event_id: string
  reason?: string
  worker_id?: string
}

export interface WorkerContext {
  entries: LedgerEntry[]
  payouts: PayoutRecord[]
  jobs: { id: string; title: string; category: string; completed_at?: string | null; client_key?: string | null }[]
}

export async function workerContext(rpc: Rpc, secret: string, workerId: string, now = Date.now()): Promise<WorkerContext> {
  const ctx = (await rpc('ibanks_worker_context', signed(secret, { worker_id: workerId, issued_at: new Date(now).toISOString() }))) as WorkerContext
  return { ...ctx, entries: ctx.entries.map((e) => ({ ...e, amount_cents: Number(e.amount_cents) })) }
}

/**
 * `rawPayload` + `signature` are passed to the database untouched, so it verifies the provider's own signature.
 * Returns the database verdict and any insights iBanks produced.
 */
export async function processProviderEvent(
  rpc: Rpc,
  secret: string,
  event: ProviderEvent,
  rawPayload: string,
  signature: string,
  now = Date.now(),
): Promise<{ ingest: DbIngest; insights: Insight[] }> {
  const ingest = (await rpc('ibanks_ingest_provider_event', { p_payload: rawPayload, p_signature: signature })) as DbIngest
  // Duplicates, out-of-order, rejected and invalid events change no money; the database already audited them.
  if (ingest.status !== 'posted') return { ingest, insights: [] }

  return { ingest, insights: await dispatchPosted(rpc, secret, event, now) }
}

/** Wake iBanks for an event the database has already posted, persist its insights + audit, and close the outbox row. */
export async function dispatchPosted(rpc: Rpc, secret: string, event: ProviderEvent, now = Date.now()): Promise<Insight[]> {
  const ctx = await workerContext(rpc, secret, event.worker_id, now)
  const jobs = new Map<string, JobInfo>(ctx.jobs.map((j) => [j.id, { title: j.title, category: j.category, completed_at: j.completed_at ?? null, client_key: j.client_key ?? null }]))
  const result = dispatch({
    event,
    ingest: { status: 'posted', event_id: event.event_id, entries: [] },
    entries: ctx.entries,
    payouts: ctx.payouts,
    jobs,
    now,
  })
  await rpc(
    'ibanks_record_dispatch',
    signed(secret, { outbox_key: `${event.source}:${event.event_id}`, insights: result.insights, audits: result.audits }),
  )
  return result.insights
}

/**
 * Outbox worker (scheduled): dispatches posted events nobody has handled yet — events KashWise posts inside the
 * database (payout requests) and any dispatch that failed after its event was posted. Claimed rows back off
 * exponentially in the database and are marked failed after repeated errors; one bad row never blocks the rest.
 */
export async function drainOutbox(rpc: Rpc, secret: string, now = Date.now()) {
  const rows = (await rpc('ibanks_claim_outbox', signed(secret, { issued_at: new Date(now).toISOString() }))) as { dedupe_key: string; payload: unknown }[]
  let dispatched = 0
  const failed: string[] = []
  for (const row of rows) {
    const parsed = providerEventSchema.safeParse(typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload)
    if (!parsed.success) {
      failed.push(row.dedupe_key)
      continue
    }
    try {
      await dispatchPosted(rpc, secret, parsed.data, now)
      dispatched++
    } catch {
      failed.push(row.dedupe_key) // stays pending; retried after the database's backoff
    }
  }
  return { claimed: rows.length, dispatched, failed }
}

/** HTTP status for a provider: 409 asks it to retry later (out of order); duplicates are acknowledged with 200. */
export function httpStatusFor(status: DbIngest['status']): number {
  return { posted: 200, duplicate: 200, out_of_order: 409, rejected: 422, invalid: 400 }[status]
}
