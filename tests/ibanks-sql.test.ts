// @vitest-environment node
// The iBanks migration, run for real in a local Postgres (PGlite) with every existing migration applied first.
// Spec §12 acceptance tests 2–7 and 11 at the database level, plus TS ↔ SQL ledger parity. Never touches live Supabase.
import { beforeAll, describe, expect, it } from 'vitest'
import { createLocalDb, seedUser, type LocalDb } from './helpers/local-db'
import { signPayload, signed } from '../netlify/lib/ibanks-signing'
import { providerEventSchema, type ProviderEvent } from '../src/lib/ibanks/contracts'
import { applyEvent, balances, emptyLedger } from '../src/lib/ibanks/ledger'

const SECRET = 'test-secret-'.padEnd(64, 'x')
const THANDI = 'aaaaaaaa-0000-4000-8000-000000000001'
const SIPHO = 'aaaaaaaa-0000-4000-8000-000000000002'
const BONGI = 'aaaaaaaa-0000-4000-8000-000000000003'
const JOB1 = 'bbbbbbbb-0000-4000-8000-000000000001'
const JOB2 = 'bbbbbbbb-0000-4000-8000-000000000002'

let l: LocalDb
const tsLedger = emptyLedger()

function event(over: Partial<ProviderEvent>): ProviderEvent {
  return providerEventSchema.parse({
    event_id: 'evt_demo_0001',
    schema_version: 1,
    event_type: 'payment_settled',
    occurred_at: new Date().toISOString(),
    source: 'sandbox_payment_provider',
    worker_id: SIPHO,
    job_id: JOB1,
    payment_id: 'pay_demo_001',
    payout_id: null,
    provider_ref: 'provider_settle_001',
    currency: 'ZAR',
    gross_cents: 100_000,
    marketplace_fee_cents: 10_000,
    processor_fee_cents: 0,
    worker_net_cents: 90_000,
    amount_cents: 0,
    destination_label: null,
    failure_reason: null,
    simulation: true,
    ...over,
  })
}

async function ingest(e: ProviderEvent, sig?: string) {
  const payload = JSON.stringify(e)
  const rows = await l.as<{ r: { status: string; reason?: string } }>(null, 'select public.ibanks_ingest_provider_event($1, $2) as r', [
    payload,
    sig ?? signPayload(SECRET, payload),
  ])
  if (rows[0].r.status === 'posted') applyEvent(tsLedger, e) // mirror into the TS reference ledger
  return rows[0].r
}

async function sqlBalances(worker: string) {
  const rows = await l.admin<{ account: string; total: string }>(
    'select account, sum(amount_cents)::text as total from public.financial_ledger_entries where worker_id = $1 group by account',
    [worker],
  )
  const get = (a: string) => Number(rows.find((r) => r.account === a)?.total ?? 0)
  return {
    gross_cents: get('gross'),
    platform_fee_cents: get('platform_fee'),
    net_earned_cents: get('net_earned'),
    disputed_hold_cents: get('disputed_hold'),
    payout_pending_cents: get('payout_pending'),
    paid_out_cents: get('paid_out'),
  }
}

async function completedJob(id: string, worker: string) {
  await l.admin(
    `insert into public.gigs (id, customer_id, title, category, description, area_slug, scheduled_date, payout_cents, status,
       assigned_worker_id, matched_at, started_at, worker_done_at)
     values ($1, $2, 'House painting job', 'painting', 'Paint the lounge walls, two coats, client supplies paint.',
       (select slug from public.areas limit 1), current_date, 100000, 'in_progress', $3, now(), now(), now())`,
    [id, THANDI, worker],
  )
  await l.admin(
    `insert into public.transactions (gig_id, customer_id, worker_id, payout_cents, fee_cents, total_cents)
     select id, customer_id, assigned_worker_id, worker_net_cents, fee_cents, total_cents from public.gigs where id = $1`,
    [id],
  )
  await l.as(THANDI, 'select public.confirm_completion($1)', [id])
}

/** The worker's payout request goes through the real RPC; the TS mirror gets the same platform event. */
async function requestPayout(worker: string, amount: number, method = 'bank') {
  const [row] = await l.as<{ r: { reference: string; status: string } }>(worker, "select public.request_cashout($1, $2, 'Capitec', '4321') as r", [method, amount])
  applyEvent(
    tsLedger,
    event({ event_id: `po_req_${row.r.reference}`, event_type: 'payout_requested', source: 'kashwise_platform', job_id: null, payment_id: null,
      payout_id: row.r.reference, gross_cents: 0, marketplace_fee_cents: 0, worker_net_cents: 0, amount_cents: amount, worker_id: worker }),
  )
  return row.r
}
const payoutEvent = (type: 'payout_settled' | 'payout_failed', ref: string, amount: number) =>
  event({ event_id: `evt_${type}_${ref}`, event_type: type, job_id: null, payment_id: null, payout_id: ref, gross_cents: 0,
    marketplace_fee_cents: 0, worker_net_cents: 0, amount_cents: amount, failure_reason: type === 'payout_failed' ? 'account closed' : null })

beforeAll(async () => {
  l = await createLocalDb()
  await l.admin(`select vault.create_secret($1, 'ibanks_provider_webhook_secret')`, [SECRET])
  await seedUser(l, { id: THANDI, name: 'Thandi Mokoena', role: 'customer' })
  await seedUser(l, { id: SIPHO, name: 'Sipho Dlamini', role: 'worker' })
  await seedUser(l, { id: BONGI, name: 'Bongi Khumalo', role: 'worker' })
}, 240_000)

describe('iBanks ledger in Postgres', () => {
  it('#2 client confirmation creates the verified record but pays nobody', async () => {
    await completedJob(JOB1, SIPHO)
    const [item] = await l.admin<{ n: number }>('select count(*)::int as n from public.portfolio_items where gig_id = $1', [JOB1])
    expect(item.n).toBe(1)
    const [txn] = await l.admin<{ status: string }>('select status from public.transactions where gig_id = $1', [JOB1])
    expect(txn.status).toBe('held')
    const [w] = await l.as<{ w: { available_cents: number; earned_cents: number } }>(SIPHO, 'select public.wallet_summary() as w')
    expect(w.w).toMatchObject({ available_cents: 0, earned_cents: 0 })
  })

  it('rejects forged, unsigned or wrongly-sourced events and direct writes', async () => {
    await expect(ingest(event({}), '0'.repeat(64))).rejects.toThrow(/Invalid provider signature/)
    await expect(l.as(SIPHO, `insert into public.financial_ledger_entries (worker_id, provider, event_id, account, amount_cents, occurred_at)
      values ($1, 'x', 'x', 'net_earned', 500000, now())`, [SIPHO])).rejects.toThrow(/permission denied/)
    await expect(l.as(SIPHO, 'select private.ibanks_post_event($1::jsonb, $2, $3, null)', [JSON.stringify(event({})), 'sandbox_payment_provider', 'verified'])).rejects.toThrow(/permission denied/)
    const wrongSource = { ...event({}), source: 'kashwise_platform' }
    const payload = JSON.stringify(wrongSource)
    await expect(l.as(null, 'select public.ibanks_ingest_provider_event($1, $2)', [payload, signPayload(SECRET, payload)])).rejects.toThrow(/Unknown provider/)
    expect((await sqlBalances(SIPHO)).net_earned_cents).toBe(0)
  })

  it('#3 a signed settlement posts R1 000 / R100 / R900 and releases the held payment', async () => {
    expect(await ingest(event({}))).toMatchObject({ status: 'posted' })
    expect(await sqlBalances(SIPHO)).toMatchObject({ gross_cents: 100_000, platform_fee_cents: 10_000, net_earned_cents: 90_000, paid_out_cents: 0 })
    const [txn] = await l.admin<{ status: string }>('select status from public.transactions where gig_id = $1', [JOB1])
    expect(txn.status).toBe('released')
    const [ob] = await l.admin<{ n: number }>("select count(*)::int as n from public.ibanks_event_outbox where event_id = 'evt_demo_0001' and state = 'pending'")
    expect(ob.n).toBe(1) // iBanks is woken through the durable outbox
  })

  it('#4 ten replays of the same event credit once and are audited', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => ingest(event({}))))
    expect(results.every((r) => r.status === 'duplicate')).toBe(true)
    expect((await sqlBalances(SIPHO)).net_earned_cents).toBe(90_000)
    const [a] = await l.admin<{ n: number }>("select count(*)::int as n from public.ibanks_decision_audit where rule_id = 'R001_provider_replay'")
    expect(a.n).toBe(10)
    expect(await ingest(event({ event_id: 'evt_second_settle' }))).toMatchObject({ status: 'rejected' })
  })

  it('#5 a payout is pending until the provider confirms it, then paid out', async () => {
    const po = await requestPayout(SIPHO, 90_000)
    expect(po.status).toBe('processing')
    expect(await sqlBalances(SIPHO)).toMatchObject({ payout_pending_cents: 90_000, paid_out_cents: 0 })
    expect(await ingest(payoutEvent('payout_settled', po.reference, 90_000))).toMatchObject({ status: 'posted' })
    expect(await sqlBalances(SIPHO)).toMatchObject({ payout_pending_cents: 0, paid_out_cents: 90_000 })
    const [c] = await l.admin<{ status: string }>('select status from public.wallet_cashouts where reference = $1', [po.reference])
    expect(c.status).toBe('paid')
  })

  it('#6 a failed payout is never paid and the money becomes available again', async () => {
    await completedJob(JOB2, SIPHO)
    await ingest(event({ event_id: 'evt_job2', payment_id: 'pay_job2', job_id: JOB2 }))
    const po = await requestPayout(SIPHO, 50_000, 'payshap')
    await expect(requestPayout(SIPHO, 50_000)).rejects.toThrow(/up to the R400.00 available/)
    expect(await ingest(payoutEvent('payout_failed', po.reference, 50_000))).toMatchObject({ status: 'posted' })
    const [c] = await l.admin<{ status: string; failure_reason: string }>('select status, failure_reason from public.wallet_cashouts where reference = $1', [po.reference])
    expect(c).toEqual({ status: 'failed', failure_reason: 'account closed' })
    const [w] = await l.as<{ w: { available_cents: number } }>(SIPHO, 'select public.wallet_summary() as w')
    expect(w.w.available_cents).toBe(90_000)
    expect(await ingest(payoutEvent('payout_settled', po.reference, 50_000))).toMatchObject({ status: 'rejected' })
    expect(await ingest(payoutEvent('payout_settled', 'CO-NOPE2345', 1_000))).toMatchObject({ status: 'out_of_order' })
  })

  it('#7 disputes hold and refunds reverse with compensating entries; history is immutable', async () => {
    expect(await ingest(event({ event_id: 'evt_job2_dispute', event_type: 'payment_disputed', payment_id: 'pay_job2', job_id: JOB2 }))).toMatchObject({ status: 'posted' })
    expect((await sqlBalances(SIPHO)).disputed_hold_cents).toBe(90_000)
    expect(await ingest(event({ event_id: 'evt_job2_refund', event_type: 'refund_settled', payment_id: 'pay_job2', job_id: JOB2 }))).toMatchObject({ status: 'posted' })
    expect(await sqlBalances(SIPHO)).toMatchObject({ net_earned_cents: 90_000, disputed_hold_cents: 0, gross_cents: 100_000 })
    const [orig] = await l.admin<{ n: number }>("select count(*)::int as n from public.financial_ledger_entries where event_id = 'evt_job2'")
    expect(orig.n).toBe(3)
    await expect(l.admin("update public.financial_ledger_entries set amount_cents = 1 where event_id = 'evt_job2'")).rejects.toThrow(/append-only/)
    await expect(l.admin("delete from public.financial_ledger_entries where event_id = 'evt_job2'")).rejects.toThrow(/append-only/)
  })

  it('TS reference ledger and SQL ledger agree exactly', async () => {
    const ts = balances(tsLedger.entries.filter((e) => e.worker_id === SIPHO))
    const tsAccounts: Partial<typeof ts> = { ...ts }
    delete tsAccounts.available_cents // derived, not an account
    expect(await sqlBalances(SIPHO)).toEqual(tsAccounts)
  })

  it('#11 workers, clients and anonymous callers cannot see another worker\'s money', async () => {
    expect(await l.as(SIPHO, 'select * from public.financial_ledger_entries')).not.toHaveLength(0)
    expect(await l.as(BONGI, 'select * from public.financial_ledger_entries')).toHaveLength(0)
    expect(await l.as(THANDI, 'select * from public.financial_ledger_entries')).toHaveLength(0)
    expect(await l.as(BONGI, 'select * from public.financial_ledger_entries where worker_id = $1', [SIPHO])).toHaveLength(0)
    await expect(l.as(null, 'select * from public.financial_ledger_entries')).rejects.toThrow(/permission denied/)
    for (const t of ['financial_provider_events', 'ibanks_event_outbox', 'ibanks_decision_audit']) {
      await expect(l.as(SIPHO, `select * from public.${t}`)).rejects.toThrow(/permission denied/)
    }
    const [bw] = await l.as<{ w: { earned_cents: number } }>(BONGI, 'select public.wallet_summary() as w')
    expect(bw.w.earned_cents).toBe(0)
  })

  it('signed worker context and dispatch: insights are visible only to their worker', async () => {
    const ctx = signed(SECRET, { worker_id: SIPHO, issued_at: new Date().toISOString() })
    const [c] = await l.as<{ r: { entries: unknown[]; jobs: unknown[] } }>(null, 'select public.ibanks_worker_context($1, $2) as r', [ctx.p_payload, ctx.p_signature])
    expect(c.r.entries.length).toBeGreaterThan(0)
    expect(c.r.jobs).toHaveLength(2)
    const stale = signed(SECRET, { worker_id: SIPHO, issued_at: '2020-01-01T00:00:00Z' })
    await expect(l.as(null, 'select public.ibanks_worker_context($1, $2)', [stale.p_payload, stale.p_signature])).rejects.toThrow(/expired/)
    await expect(l.as(null, 'select public.ibanks_worker_context($1, $2)', [ctx.p_payload, signPayload('another-secret'.padEnd(40, 'y'), ctx.p_payload)])).rejects.toThrow(/Invalid signature/)

    const insight = {
      worker_id: SIPHO, kind: 'earnings:new_payment', severity: 'info', title: 'iBanks noticed a new payment', body: 'R900 earned.',
      scope: 'Based on your KashWise activity only', source_event_ids: ['evt_demo_0001'], fact_snapshot: { net_cents: 90_000 },
      data_as_of: new Date().toISOString(), generated_by: 'rules', actions: ['show_explanation'],
    }
    const d = signed(SECRET, { outbox_key: 'sandbox_payment_provider:evt_demo_0001', insights: [insight, insight], audits: [] })
    await l.as(null, 'select public.ibanks_record_dispatch($1, $2)', [d.p_payload, d.p_signature])
    expect(await l.as(SIPHO, 'select title from public.ibanks_insights')).toEqual([{ title: 'iBanks noticed a new payment' }]) // deduplicated
    expect(await l.as(BONGI, 'select * from public.ibanks_insights')).toHaveLength(0)
    const [ob] = await l.admin<{ state: string }>("select state from public.ibanks_event_outbox where event_id = 'evt_demo_0001'")
    expect(ob.state).toBe('done')
    const [id] = await l.admin<{ id: string }>('select id from public.ibanks_insights limit 1')
    await expect(l.as(BONGI, "select public.ibanks_insight_feedback($1, 'dismissed', false)", [id.id])).rejects.toThrow(/your own/)
    await l.as(SIPHO, "select public.ibanks_insight_feedback($1, null, true)", [id.id])
  })

  it('settlement of a job that is not a completed job of that worker is rejected', async () => {
    const r = await ingest(event({ event_id: 'evt_bongi', worker_id: BONGI, payment_id: 'pay_bongi', job_id: JOB1 }))
    expect(r.status).toBe('rejected')
  })

  it('fails closed when the provider secret is not configured', async () => {
    await l.admin("delete from vault.secrets where name = 'ibanks_provider_webhook_secret'")
    await expect(ingest(event({ event_id: 'evt_after' }))).rejects.toThrow(/not configured/)
  })
})
