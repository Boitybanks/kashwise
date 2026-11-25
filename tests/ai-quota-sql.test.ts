// @vitest-environment node
// Local Postgres only: applies every migration (including the AI quota one) and checks the quota functions.
import { beforeAll, describe, expect, it } from 'vitest'
import { createLocalDb, seedUser, type LocalDb } from './helpers/local-db'

const A = 'c0000000-0000-4000-8000-000000000001'
const B = 'c0000000-0000-4000-8000-000000000002'
type Claim = { ok: boolean; call_id?: string; reason?: string; remaining?: number }

let l: LocalDb
const claim = async (uid: string | null, feature: string, tokens = 1000) =>
  (await l.as<{ r: Claim }>(uid, 'select public.claim_ai_call($1, $2) as r', [feature, tokens]))[0].r
const finish = (uid: string, id: string, ok: boolean, used: number | null) =>
  l.as(uid, 'select public.finish_ai_call($1::uuid, $2, $3)', [id, ok, used])

beforeAll(async () => {
  l = await createLocalDb() // fails here if any migration, including the AI quota one, does not apply cleanly
  await seedUser(l, { id: A, name: 'Worker A', role: 'worker' })
  await seedUser(l, { id: B, name: 'Worker B', role: 'worker' })
}, 120_000)

describe('AI quota migration', () => {
  it('refuses anonymous callers and hides the tables from the API roles', async () => {
    await expect(claim(null, 'dictation')).rejects.toThrow()
    await expect(l.as(A, 'select * from private.ai_calls')).rejects.toThrow()
    await expect(l.as(A, "insert into private.ai_user_daily (user_id, day, feature) values ($1, current_date, 'cv')", [A])).rejects.toThrow()
  })

  it('rejects unknown features and oversized requests', async () => {
    await expect(claim(A, 'essay')).rejects.toThrow(/Unknown AI feature/)
    await expect(claim(A, 'dictation', 99_999)).rejects.toThrow(/too large/)
  })

  it('allows 3 dictations a day, refuses duplicates in flight, and refunds a provider failure', async () => {
    const first = await claim(A, 'dictation')
    expect(first).toMatchObject({ ok: true, remaining: 2 })
    expect(await claim(A, 'dictation')).toEqual({ ok: false, reason: 'busy' }) // first is still pending
    await finish(A, first.call_id!, true, 800)

    const second = await claim(A, 'dictation')
    expect(second.remaining).toBe(1)
    await finish(A, second.call_id!, false, null) // provider failed: the use comes back

    const third = await claim(A, 'dictation')
    expect(third.remaining).toBe(1)
    await finish(A, third.call_id!, true, 700)
    const fourth = await claim(A, 'dictation')
    expect(fourth.remaining).toBe(0)
    await finish(A, fourth.call_id!, true, 700)
    expect(await claim(A, 'dictation')).toEqual({ ok: false, reason: 'user_quota' })

    const left = (await l.as<{ r: { dictation: number; cv: number } }>(A, 'select public.my_ai_quota() as r'))[0].r
    expect(left).toEqual({ dictation: 0, cv: 1 })
  })

  it('allows one AI CV a day, and a refused claim counts nowhere', async () => {
    const before = await l.admin<{ requests: number }>("select requests from private.ai_budget where bucket like 'day:%'")
    const cv = await claim(B, 'cv')
    await finish(B, cv.call_id!, true, 1200)
    expect(await claim(B, 'cv')).toEqual({ ok: false, reason: 'user_quota' })
    const after = await l.admin<{ requests: number }>("select requests from private.ai_budget where bucket like 'day:%'")
    expect(after[0].requests).toBe(before[0].requests + 1)
  })

  it('stops everyone at the global per-minute token budget, without charging the person', async () => {
    await l.admin("update private.ai_budget set tokens = 5900 where bucket like 'min:%'")
    expect(await claim(B, 'dictation', 500)).toEqual({ ok: false, reason: 'global_minute' })
    const used = await l.admin<{ used: number }>("select used from private.ai_user_daily where user_id = $1 and feature = 'dictation'", [B])
    expect(used).toEqual([])
    await l.admin("update private.ai_budget set tokens = 0, requests = 0 where bucket like 'min:%'")
  })

  it('stops everyone at the global daily request budget', async () => {
    await l.admin("update private.ai_budget set requests = 400 where bucket like 'day:%'")
    expect(await claim(B, 'dictation')).toEqual({ ok: false, reason: 'global_day' })
    await l.admin("update private.ai_budget set requests = 0 where bucket like 'day:%'")
  })

  it('only settles your own calls', async () => {
    const mine = await claim(B, 'dictation')
    await finish(A, mine.call_id!, false, null) // someone else tries to refund it
    const row = await l.admin<{ status: string }>('select status from private.ai_calls where id = $1', [mine.call_id])
    expect(row[0].status).toBe('pending')
  })

  it('removes the unused table write grants', async () => {
    const rows = await l.admin<{ ok: boolean }>(`select not (has_table_privilege('authenticated', 'public.gig_work_ids', 'INSERT')
      or has_table_privilege('anon', 'public.profile_identity', 'UPDATE')
      or has_table_privilege('anon', 'public.profile_documents', 'INSERT')) as ok`)
    expect(rows[0].ok).toBe(true)
  })
})
