// @vitest-environment node
// Local Postgres only: eligibility, privacy, fee amounts and goal-period ledger boundaries.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createLocalDb, seedUser, type LocalDb } from './helpers/local-db'

const MIGRATION = '20261023000100_earn_goals.sql'
const WORKER = 'a0000000-0000-4000-8000-000000000001'
const OTHER_WORKER = 'a0000000-0000-4000-8000-000000000002'
const CUSTOMER = 'a0000000-0000-4000-8000-000000000003'
const LEGACY_CUSTOMER = 'a0000000-0000-4000-8000-000000000004'
const DEMO_WORKER = 'a0000000-0000-4000-8000-000000000005'
const DEMO_CUSTOMER = 'a0000000-0000-4000-8000-000000000006'
const jobId = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`

interface Goal {
  id: string
  worker_id: string
  target_cents: number
  deadline: string
  area_slug: string
  weekdays: number[]
  time_windows: string[]
  radius_km: number
  skills: string[]
  memory_opt_in: boolean
  started_at: string
  updated_at: string
}
interface Context {
  goal: Goal | null
  candidates: { id: string; payout_cents: number; fee_cents: number; worker_net_cents: number; is_demo: boolean;
    distance_km: number; poster_eligible: boolean; application_status: string | null }[]
  bookings: { id: string; status: string; worker_net_cents: number }[]
  ledger: { account: string; amount_cents: number; occurred_at: string }[]
  simulation: boolean
  truncated: boolean
}

let l: LocalDb
let today: string
let tomorrow: string
let deadline: string
let original: Goal
const draft = (over: Record<string, unknown> = {}) => ({
  target_cents: 90000, deadline, area_slug: 'soweto', weekdays: [0, 1, 2, 3, 4, 5, 6],
  time_windows: ['morning', 'afternoon'], radius_km: 30, skills: ['gardening', 'painting'], memory_opt_in: true,
  ...over,
})
async function save(uid = WORKER, over: Record<string, unknown> = {}) {
  return (await l.as<{ r: Goal }>(uid, 'select public.save_earn_goal($1::jsonb) as r', [JSON.stringify(draft(over))]))[0].r
}
async function context(uid: string | null = WORKER) {
  return (await l.as<{ r: Context }>(uid, 'select public.earn_goal_context() as r'))[0].r
}
async function identity(uid: string) {
  const envelope = JSON.stringify({ v: 1, kid: 'test-only', alg: 'test-only', kem: '', iv: '', ct: '' })
  await l.admin(`insert into public.profile_identity (id, gender, identity_envelope, address_envelope, id_number_hmac)
    values ($1::uuid, 'male', $2::jsonb, $2::jsonb, decode(replace($1::text, '-', ''), 'hex'))`, [uid, envelope])
}
async function job(n: number, opts: { customer?: string; demo?: boolean; status?: string; assigned?: string; date?: string; area?: string } = {}) {
  await l.admin(`insert into public.gigs (id, customer_id, title, category, description, area_slug, scheduled_date,
    time_window, payout_cents, status, assigned_worker_id, is_demo)
    values ($1,$2,'Garden maintenance','gardening','Mow and tidy a small garden. Equipment is provided.',$3,$4,
      'morning',50000,$5::public.gig_status,$6,$7)`,
  [jobId(n), opts.customer ?? CUSTOMER, opts.area ?? 'soweto', opts.date ?? tomorrow,
    opts.status ?? 'open', opts.assigned ?? null, opts.demo ?? false])
}

beforeAll(async () => {
  // Install older schema first to retain one pre-existing legacy listing, then apply the new migration.
  l = await createLocalDb({ only: (f) => f !== MIGRATION })
  const [dates] = await l.admin<{ today: string; tomorrow: string; deadline: string }>(`select
    ((now() at time zone 'Africa/Johannesburg')::date)::text as today,
    ((now() at time zone 'Africa/Johannesburg')::date + 1)::text as tomorrow,
    ((now() at time zone 'Africa/Johannesburg')::date + 14)::text as deadline`)
  ;({ today, tomorrow, deadline } = dates)
  for (const [id, role, demo] of [
    [WORKER, 'worker', false], [OTHER_WORKER, 'worker', false], [CUSTOMER, 'customer', false],
    [LEGACY_CUSTOMER, 'customer', false], [DEMO_WORKER, 'worker', true], [DEMO_CUSTOMER, 'customer', true],
  ] as const) await seedUser(l, { id, role, demo, name: 'Test person', eligible: false })
  await identity(CUSTOMER)
  await identity(WORKER)
  await job(1)
  await job(2, { customer: LEGACY_CUSTOMER })
  await job(3, { customer: DEMO_CUSTOMER, demo: true })
  await job(4, { status: 'matched', assigned: WORKER })
  await job(5, { status: 'in_progress', assigned: WORKER })
  await job(6, { status: 'completed', assigned: WORKER })
  await job(7, { status: 'cancelled', assigned: WORKER })
  await job(8, { status: 'matched', assigned: OTHER_WORKER })
  await job(9, { customer: WORKER })
  await job(10, { date: '2000-01-01' })
  await job(11, { date: '2099-01-01' })
  await l.admin(`insert into public.gig_applications (gig_id, worker_id, status) values ($1,$2,'pending')`, [jobId(1), WORKER])
  await l.db.exec(readFileSync(new URL(`../supabase/migrations/${MIGRATION}`, import.meta.url), 'utf8'))
}, 240_000)
afterAll(async () => { await l?.db.close() })

describe('Earn My Goal SQL', () => {
  it('returns an honest empty state, and requires an authenticated worker', async () => {
    expect(await context()).toEqual({ goal: null, candidates: [], bookings: [], ledger: [], simulation: true, market_demo: false, truncated: false })
    await expect(context(null)).rejects.toThrow(/permission denied|sign in/i)
    await expect(context(CUSTOMER)).rejects.toThrow(/worker accounts/)
    await expect(save(CUSTOMER)).rejects.toThrow(/worker accounts/)
  })

  it('saves only the caller’s goal and never trusts a supplied owner, start or id', async () => {
    original = await save(WORKER, { worker_id: OTHER_WORKER, started_at: '2000-01-01', id: OTHER_WORKER })
    expect(original.worker_id).toBe(WORKER)
    expect(original.id).not.toBe(OTHER_WORKER)
    expect(new Date(original.started_at).getUTCFullYear()).toBeGreaterThan(2020)
    expect(original.target_cents).toBe(90000)
    expect((await context(OTHER_WORKER)).goal).toBeNull()
    expect(await l.as(OTHER_WORKER, 'select * from public.earn_goals')).toEqual([])
    await expect(l.as(null, 'select * from public.earn_goals')).rejects.toThrow(/permission denied/)
    await expect(l.as(WORKER, `update public.earn_goals set started_at = '2000-01-01'`)).rejects.toThrow(/permission denied/)
    await expect(l.as(WORKER, 'delete from public.earn_goals')).rejects.toThrow(/permission denied/)
    await expect(l.as(WORKER, `insert into public.earn_goals (worker_id) values ($1)`, [OTHER_WORKER])).rejects.toThrow(/permission denied/)
  })

  it('preserves the period when availability changes, but restarts when target or deadline changes', async () => {
    const changedPreferences = await save(WORKER, { time_windows: ['afternoon'], weekdays: [6, 6] })
    expect(changedPreferences.started_at).toBe(original.started_at)
    expect(changedPreferences.weekdays).toEqual([6])
    const changedTarget = await save(WORKER, { target_cents: 120000 })
    expect(new Date(changedTarget.started_at).getTime()).toBeGreaterThan(new Date(original.started_at).getTime())
    const changedDeadline = await save(WORKER, { target_cents: 120000, deadline: tomorrow })
    expect(new Date(changedDeadline.started_at).getTime()).toBeGreaterThanOrEqual(new Date(changedTarget.started_at).getTime())
    original = await save()
  })

  it('rejects out-of-range inputs, unknown skills/areas and empty availability', async () => {
    for (const invalid of [
      { target_cents: 99 }, { target_cents: 10000001 }, { target_cents: null },
      { deadline: '2000-01-01' }, { deadline: '2099-01-01' }, { radius_km: 0 }, { radius_km: 101 },
      { weekdays: [] }, { weekdays: [7] }, { weekdays: [null] }, { time_windows: [] },
      { time_windows: ['flexible'] }, { skills: [] }, { skills: ['unknown'] }, { area_slug: 'not-a-real-area' },
    ]) await expect(save(WORKER, invalid)).rejects.toThrow()
    expect((await context()).goal?.target_cents).toBe(90000)
  })

  it('returns only eligible open opportunities, own bookings and actual generated fee amounts', async () => {
    const result = await context()
    expect(result.candidates.map((g) => g.id)).toEqual([jobId(1)])
    expect(result.candidates[0]).toMatchObject({ payout_cents: 50000, fee_cents: 5000, worker_net_cents: 45000,
      is_demo: false, poster_eligible: true, distance_km: 0, application_status: 'pending' })
    expect(result.bookings.map((g) => g.id)).toEqual([jobId(4), jobId(5), jobId(6)])
    expect(result.simulation).toBe(true)
    // The definer checks membership without granting access to anyone else's identity fields.
    expect(await l.as(WORKER, 'select id from public.profile_identity where id = $1', [CUSTOMER])).toEqual([])
    expect(JSON.stringify(result)).not.toMatch(/identity_envelope|id_number_hmac|address_envelope/)
  })

  it('isolates labelled demo opportunities from real accounts', async () => {
    await save(DEMO_WORKER)
    const demo = await context(DEMO_WORKER)
    expect(demo.candidates.some((g) => g.id === jobId(3))).toBe(true)
    expect(demo.candidates.every((g) => g.is_demo && !g.poster_eligible)).toBe(true)
    expect(demo.candidates.some((g) => g.id === jobId(1))).toBe(false)
  })

  it('enforces required identity submission for new jobs and services, with explicit demo isolation', async () => {
    await expect(job(20, { customer: LEGACY_CUSTOMER })).rejects.toThrow(/identity details/)
    await expect(l.as(LEGACY_CUSTOMER, `select public.create_gig(null,'Garden work','gardening',
      'A sufficiently detailed garden work request.','soweto',$1,'morning',50000,null)`, [tomorrow])).rejects.toThrow(/identity details/)
    await expect(l.as(OTHER_WORKER, `select public.save_service(null,'Garden service','gardening',
      'A sufficiently detailed garden service.','soweto',45000)`)).rejects.toThrow(/identity details/)
    await expect(job(21, { customer: CUSTOMER, demo: true })).rejects.toThrow(/Demo and real/)
    await expect(job(22, { customer: DEMO_CUSTOMER, demo: true, status: 'matched', assigned: WORKER })).rejects.toThrow(/Demo and real/)
    await expect(job(23, { customer: DEMO_CUSTOMER, demo: true })).resolves.toBeUndefined()
    await expect(l.as(WORKER, `select public.save_service(null,'Garden service','gardening',
      'A sufficiently detailed garden service.','soweto',45000)`)).resolves.toHaveLength(1)
  })

  it('returns own net ledger changes, including refunds, separately from payouts; excludes out-of-period and future records', async () => {
    const rows = [
      [WORKER, 'net_earned', 45000, 'now() - interval \'1 millisecond\''],
      [WORKER, 'net_earned', -10000, 'now() - interval \'1 millisecond\''],
      [WORKER, 'paid_out', 20000, 'now() - interval \'1 millisecond\''],
      [WORKER, 'payout_pending', 5000, 'now() - interval \'1 millisecond\''],
      [WORKER, 'disputed_hold', 1000, 'now() - interval \'1 millisecond\''],
      [WORKER, 'gross', 50000, 'now() - interval \'1 millisecond\''],
      [WORKER, 'net_earned', 99999, "now() - interval '2 days'"],
      [WORKER, 'net_earned', 88888, "now() + interval '1 day'"],
      [OTHER_WORKER, 'net_earned', 77777, 'now() - interval \'1 millisecond\''],
    ] as const
    for (const [i, [worker, account, amount, when]] of rows.entries()) await l.admin(`insert into public.financial_ledger_entries
      (worker_id, provider, event_id, account, amount_cents, occurred_at) values ($1,'test-provider',$2,$3,$4,${when})`,
    [worker, `goal-test-${i}`, account, amount])
    const result = await context()
    expect(result.ledger).toHaveLength(5)
    expect(result.ledger.filter((e) => e.account === 'net_earned').reduce((sum, e) => sum + e.amount_cents, 0)).toBe(35000)
    expect(result.ledger.find((e) => e.account === 'paid_out')?.amount_cents).toBe(20000)
    expect(result.ledger.map((e) => e.amount_cents)).not.toEqual(expect.arrayContaining([99999, 88888, 77777]))
  })

  it('turns memory consent off only for the caller without erasing financial progress', async () => {
    const before = await context()
    await l.as(WORKER, 'select public.forget_earn_goal_memory()')
    const after = await context()
    expect(after.goal?.memory_opt_in).toBe(false)
    expect(after.goal?.started_at).toBe(before.goal?.started_at)
    expect(after.ledger).toEqual(before.ledger)
    expect((await context(DEMO_WORKER)).goal?.memory_opt_in).toBe(true)
  })

  it('caps the deterministic marketplace snapshot and reports truncation', async () => {
    await l.admin(`insert into public.gigs (customer_id,title,category,description,area_slug,scheduled_date,payout_cents)
      select $1,'Extra garden work','gardening','Equipment is provided for garden maintenance.','soweto',$2,50000
      from generate_series(1,501)`, [CUSTOMER, today])
    const result = await context()
    expect(result.candidates).toHaveLength(500)
    expect(result.truncated).toBe(true)
    expect((await context()).candidates.map((g) => g.id)).toEqual(result.candidates.map((g) => g.id))
  })
})
