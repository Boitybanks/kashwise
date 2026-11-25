// @vitest-environment node
// The zero-budget AI guard on /api/dictate: authentication, kill switch, quotas, duplicates, provider failures.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), fetch: vi.fn(), error: vi.fn() }))
vi.mock('../netlify/lib/shared', async (original) => ({
  ...await original<typeof import('../netlify/lib/shared')>(),
  supabaseAs: () => ({ rpc: mocks.rpc, auth: { getUser: mocks.getUser } }),
}))
const { default: handler } = await import('../netlify/functions/dictate.mts')
const { estimateTokens } = await import('../netlify/lib/ai')

const uid = '10000000-0000-4000-8000-000000000001'
const said = 'I paint houses in Soweto and I am very neat. Call me on 082 555 1234.'
const req = (body: unknown, auth = true) => new Request('https://kashwise.test/api/dictate', {
  method: 'POST', headers: auth ? { Authorization: 'Bearer session-token' } : {}, body: typeof body === 'string' ? body : JSON.stringify(body),
})
const groqOk = (content: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { total_tokens: 900 } }), { status: 200 })
const aiBio = { headline: 'Painter in Soweto', bio: 'I paint houses in Soweto and I am very neat.', skills: ['painting'] }

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('GROQ_API_KEY', 'gsk_test_only')
  vi.stubEnv('AI_DISABLED', '')
  vi.stubGlobal('fetch', mocks.fetch)
  vi.spyOn(console, 'error').mockImplementation(mocks.error)
  mocks.getUser.mockResolvedValue({ data: { user: { id: uid } }, error: null })
  mocks.rpc.mockImplementation(async (name: string) =>
    name === 'claim_ai_call' ? { data: { ok: true, call_id: 'call-1', remaining: 2 }, error: null } : { data: null, error: null })
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const finishCall = () => mocks.rpc.mock.calls.find(([n]) => n === 'finish_ai_call')?.[1]

describe('AI guard on dictation', () => {
  it('needs a verified session before anything else', async () => {
    expect((await handler(req({ kind: 'bio', transcript: said, useAi: true }, false))).status).toBe(401)
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'bad jwt' } })
    expect((await handler(req({ kind: 'bio', transcript: said, useAi: true }))).status).toBe(401)
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('rejects oversized and malformed requests without calling AI', async () => {
    expect((await handler(req('x'.repeat(9000)))).status).toBe(413)
    expect((await handler(req('{not json'))).status).toBe(400)
    expect((await handler(req({ kind: 'essay', transcript: said, useAi: true }))).status).toBe(400)
    expect((await handler(req({ kind: 'bio', transcript: 'a'.repeat(2001), useAi: true }))).status).toBe(400)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('uses Groq gpt-oss-20b after a quota claim, settles the real tokens, and never sends contact details', async () => {
    mocks.fetch.mockResolvedValue(groqOk(aiBio))
    const res = await (await handler(req({ kind: 'bio', transcript: said, useAi: true }))).json()
    expect(res.written_by).toBe('ai')
    expect(res.ai_status).toBe('ok')
    const [url, init] = mocks.fetch.mock.calls[0]
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions')
    const sent = JSON.parse(init.body)
    expect(sent.model).toBe('openai/gpt-oss-20b')
    expect(JSON.stringify(sent.messages)).not.toContain('555 1234')
    expect(mocks.rpc.mock.calls[0][0]).toBe('claim_ai_call')
    expect(mocks.rpc.mock.calls[0][1].p_feature).toBe('dictation')
    expect(finishCall()).toEqual({ p_call: 'call-1', p_ok: true, p_used_tokens: 900 })
  })

  it('does not call AI without consent', async () => {
    const res = await (await handler(req({ kind: 'bio', transcript: said, useAi: false }))).json()
    expect(res.written_by).toBe('rules')
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('kill switch: no claim, no provider call, rules draft', async () => {
    vi.stubEnv('AI_DISABLED', 'true')
    const res = await (await handler(req({ kind: 'bio', transcript: said, useAi: true }))).json()
    expect(res).toMatchObject({ written_by: 'rules', ai_status: 'disabled', ai_available: false })
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('no key: rules draft, nothing claimed', async () => {
    vi.stubEnv('GROQ_API_KEY', '')
    const res = await (await handler(req({ kind: 'bio', transcript: said, useAi: true }))).json()
    expect(res).toMatchObject({ written_by: 'rules', ai_status: 'no_key' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it.each([
    [{ ok: false, reason: 'user_quota' }, 'quota'],
    [{ ok: false, reason: 'global_day' }, 'quota'],
    [{ ok: false, reason: 'global_minute' }, 'rate_limited'],
    [{ ok: false, reason: 'busy' }, 'busy'],
  ])('a refused claim (%o) falls back to rules without calling Groq', async (claim, status) => {
    mocks.rpc.mockResolvedValueOnce({ data: claim, error: null })
    const res = await (await handler(req({ kind: 'bio', transcript: said, useAi: true }))).json()
    expect(res).toMatchObject({ written_by: 'rules', ai_status: status })
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('fails closed when the quota tables are missing', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } })
    const res = await (await handler(req({ kind: 'bio', transcript: said, useAi: true }))).json()
    expect(res).toMatchObject({ written_by: 'rules', ai_status: 'unavailable' })
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('a Groq 429 gives the person their use back and returns a rules draft', async () => {
    mocks.fetch.mockResolvedValue(new Response('{"error":"rate"}', { status: 429 }))
    const res = await (await handler(req({ kind: 'bio', transcript: said, useAi: true }))).json()
    expect(res).toMatchObject({ written_by: 'rules', ai_status: 'rate_limited' })
    expect(finishCall()).toMatchObject({ p_call: 'call-1', p_ok: false })
  })

  it('a timeout or network failure falls back without retrying', async () => {
    mocks.fetch.mockRejectedValue(Object.assign(new Error('timed out'), { name: 'TimeoutError' }))
    const res = await (await handler(req({ kind: 'bio', transcript: said, useAi: true }))).json()
    expect(res).toMatchObject({ written_by: 'rules', ai_status: 'timeout' })
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(finishCall()).toMatchObject({ p_ok: false })
  })

  it('an answer that adds things the person did not say is thrown away', async () => {
    mocks.fetch.mockResolvedValue(groqOk({ ...aiBio, bio: 'I have a trade certificate and 20 years of experience painting houses.' }))
    const res = await (await handler(req({ kind: 'bio', transcript: said, useAi: true }))).json()
    expect(res).toMatchObject({ written_by: 'rules', ai_status: 'rejected' })
    expect(finishCall()).toMatchObject({ p_ok: true }) // the provider was used, so it counts
  })

  it('never logs the transcript or the key', async () => {
    mocks.fetch.mockResolvedValue(new Response('{"error":"bad"}', { status: 500 }))
    await handler(req({ kind: 'bio', transcript: said, useAi: true }))
    const logged = JSON.stringify(mocks.error.mock.calls)
    expect(logged).not.toContain('Soweto')
    expect(logged).not.toContain('gsk_test_only')
  })

  it('keeps every estimate under the per-minute token budget', () => {
    expect(estimateTokens(2000 + 4000, 1500)).toBeLessThan(6000)
  })
})
