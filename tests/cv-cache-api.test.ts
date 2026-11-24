// @vitest-environment node
// The AI CV (skills profile) is cached: while it covers exactly the worker's confirmed records, pressing "Update"
// returns it without an AI call or a quota claim. A new confirmed job invalidates it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), fetch: vi.fn(), tables: {} as Record<string, unknown> }))
function query(table: string) {
  const result = () => mocks.tables[table]
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order', 'limit', 'in']) chain[m] = () => chain
  chain.maybeSingle = async () => ({ data: result(), error: null })
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: result(), error: null })
  return chain
}
vi.mock('../netlify/lib/shared', async (original) => ({
  ...await original<typeof import('../netlify/lib/shared')>(),
  supabaseAs: () => ({ rpc: mocks.rpc, auth: { getUser: mocks.getUser }, from: query }),
}))
const { default: handler } = await import('../netlify/functions/skills-profile.mts')

const uid = '10000000-0000-4000-8000-000000000002'
const item = (code: string) => ({ record_code: code, title: 'Paint a lounge', category: 'painting', area_slug: 'orlando', completed_at: '2026-10-01T10:00:00Z', rating: 5, review: 'Neat work.', customer_label: 'Thandi M.', is_demo: false })
const saved = (codes: string[], writtenBy: 'ai' | 'summary') => ({
  created_at: new Date().toISOString(),
  written_by: writtenBy,
  signed: { credential: { based_on: { codes, records: codes.length, average_rating: 5 } }, signature: 'sig' },
})
const req = (useAi: boolean) => new Request('https://kashwise.test/api/skills-profile', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify({ useAi }) })

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('GROQ_API_KEY', 'gsk_test_only')
  vi.stubGlobal('fetch', mocks.fetch)
  mocks.getUser.mockResolvedValue({ data: { user: { id: uid } }, error: null })
  mocks.rpc.mockResolvedValue({ data: { avg_rating: 5 }, error: null })
  mocks.tables = {
    profiles: { id: uid, display_name: 'Nomsa Zulu', role: 'worker', area_slug: 'orlando', is_demo: false },
    portfolio_items: [item('SG-1'), item('SG-2')],
    areas: [{ slug: 'orlando', name: 'Orlando', city: 'Soweto' }],
  }
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('AI CV cache', () => {
  it('returns the saved AI profile without any AI call or quota claim while the records are unchanged', async () => {
    mocks.tables.skills_profiles = saved(['SG-2', 'SG-1'], 'ai')
    const res = await handler(req(true))
    expect(res.status).toBe(200)
    expect((await res.json()).cached).toBe(true)
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(mocks.rpc.mock.calls.map(([n]) => n)).not.toContain('claim_ai_call')
  })

  it('a new confirmed job invalidates the cache', async () => {
    mocks.tables.skills_profiles = { ...saved(['SG-1'], 'ai'), created_at: '2026-01-01T00:00:00Z' }
    mocks.rpc.mockImplementation(async (name: string) =>
      name === 'claim_ai_call' ? { data: { ok: false, reason: 'user_quota' }, error: null } : { data: { avg_rating: 5 }, error: null })
    vi.stubEnv('PQ_SIGN_SEED', Buffer.alloc(32, 7).toString('base64'))
    const res = await handler(req(true))
    const body = await res.json()
    expect(body.cached).toBeUndefined()
    expect(body.aiStatus).toBe('quota') // it tried to write a new one; today's AI use was gone, so a factual one was signed
    expect(body.aiUsed).toBe(false)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
})
