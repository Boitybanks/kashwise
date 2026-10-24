// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GoalContext } from '../src/lib/earn-goal-types'
import { southAfricaToday } from '../src/lib/earn-goal'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), fetch: vi.fn() }))
vi.mock('../netlify/lib/shared', async (original) => ({
  ...await original<typeof import('../netlify/lib/shared')>(),
  supabaseAs: () => ({ rpc: mocks.rpc, auth: { getUser: mocks.getUser } }),
}))
const { default: handler } = await import('../netlify/functions/earn-goal.mts')
const uid = '10000000-0000-4000-8000-000000000001'
const input = { target_cents: 90000, deadline: southAfricaToday(), area_slug: 'soweto', weekdays: [1, 6], time_windows: ['morning'], radius_km: 10, skills: ['gardening'], memory_opt_in: false }
const context: GoalContext = { goal: null, candidates: [], bookings: [], ledger: [], simulation: true, market_demo: false, truncated: false }
let current: GoalContext
const req = (method: string, body?: unknown, auth = true) => new Request('https://kashwise.test/api/earn-goal', {
  method, headers: auth ? { Authorization: 'Bearer session-token' } : {},
  ...(body ? { body: JSON.stringify(body) } : {}),
})
beforeEach(() => {
  vi.resetAllMocks()
  current = structuredClone(context)
  vi.stubEnv('GRAPHITI_SERVICE_URL', 'http://127.0.0.1:8787')
  vi.stubEnv('GRAPHITI_SERVICE_TOKEN', 'test-only-secret')
  vi.stubGlobal('fetch', mocks.fetch)
  mocks.getUser.mockResolvedValue({ data: { user: { id: uid } }, error: null })
  mocks.rpc.mockImplementation(async (name, args) => {
    if (name === 'save_earn_goal') current.goal = { ...args.p_goal, id: 'goal', started_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    if (name === 'forget_earn_goal_memory' && current.goal) current.goal.memory_opt_in = false
    return { data: name === 'earn_goal_context' ? structuredClone(current) : current.goal, error: null }
  })
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('Earn My Goal authenticated API', () => {
  it('rejects missing/expired auth and non-worker callers before any AI access', async () => {
    expect((await handler(req('GET', undefined, false))).status).toBe(401)
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: {} })
    expect((await handler(req('GET'))).status).toBe(401)
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501' } })
    expect((await handler(req('GET'))).status).toBe(403)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it('rejects supplied identities and malformed inputs', async () => {
    expect((await handler(req('POST', { ...input, worker_id: 'victim' }))).status).toBe(400)
    expect((await handler(req('POST', { ...input, target_cents: 0 }))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('saves and matches without sending anything to AI when consent is off', async () => {
    const response = await handler(req('POST', input))
    expect(response.status).toBe(200)
    expect((await response.json()).memory.status).toBe('off')
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it('derives worker identity from auth and sends only the allowlisted opt-in preferences', async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ status: 'queued' }), { status: 202 }))
    const response = await handler(req('POST', { ...input, memory_opt_in: true }))
    expect((await response.json()).memory.status).toBe('pending')
    const payload = JSON.parse(mocks.fetch.mock.calls[0][1].body)
    expect(payload.worker_id).toBe(uid)
    expect(Object.keys(payload.preferences).sort()).toEqual(['target_cents', 'deadline', 'area_slug', 'weekdays', 'time_windows', 'radius_km', 'skills'].sort())
    expect(mocks.fetch.mock.calls[0][0]).toBe('http://127.0.0.1:8787/v1/preferences')
  })
  it('keeps the real plan usable when Ollama/Graphiti is unavailable', async () => {
    mocks.fetch.mockRejectedValue(new Error('offline'))
    const response = await handler(req('POST', { ...input, memory_opt_in: true }))
    const result = await response.json()
    expect(response.status).toBe(200)
    expect(result.memory.status).toBe('unavailable')
    expect(result.goal.target_cents).toBe(90000)
    expect(result.progress.settled_cents).toBe(0)
  })
  it('revokes sharing first and reports failed deletion honestly; retries can confirm deletion', async () => {
    await handler(req('POST', input))
    mocks.fetch.mockRejectedValueOnce(new Error('offline'))
    const failed = await handler(req('DELETE'))
    expect((await failed.json()).memory.message).toMatch(/deletion could not be confirmed/)
    expect(current.goal?.memory_opt_in).toBe(false)
    mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ status: 'forgotten' })))
    expect((await (await handler(req('DELETE'))).json()).memory.status).toBe('off')
  })
  it('reports unavailable database and never invents a plan', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } })
    const response = await handler(req('GET'))
    expect(response.status).toBe(503)
    expect(await response.json()).not.toHaveProperty('plan')
  })
})
