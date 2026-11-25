// Zero-budget AI for the KashWise beta. Groq's free tier is the only provider; there is no paid failover.
// Every call is claimed against persistent, atomic quotas in Postgres (claim_ai_call) as the signed-in caller, and
// settled afterwards (finish_ai_call). Anything unexpected (kill switch on, no key, quota tables missing, quota used up,
// provider error or timeout) means "no AI": the caller then uses its non-AI fallback. Content is never logged.
import type { SupabaseClient } from '@supabase/supabase-js'
import { optionalEnv } from './shared'

export const GROQ_TEXT_MODEL = 'openai/gpt-oss-20b'
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const TIMEOUT_MS = 20_000

export type AiFeature = 'dictation' | 'cv' | 'ask'
export type AiStatus =
  | 'ok' | 'off' | 'disabled' | 'no_key' | 'quota' | 'busy' | 'unavailable'
  | 'rate_limited' | 'auth' | 'api_error' | 'timeout' | 'failed' | 'rejected'

/** AI_DISABLED=true (or 1/on/yes) turns every AI call off instantly, without a deploy of new code. */
export function aiKillSwitchOn(): boolean {
  return /^(1|true|on|yes)$/i.test(optionalEnv('AI_DISABLED') ?? '')
}

export function groqKey(): string | undefined {
  return aiKillSwitchOn() ? undefined : optionalEnv('GROQ_API_KEY')
}

/** Rough upper bound on tokens for one call: prompt characters / 3.5, plus the full output allowance. */
export function estimateTokens(promptChars: number, maxOutput: number): number {
  return Math.ceil(promptChars / 3.5) + maxOutput
}

type Claim = { ok: true; callId: string } | { ok: false; status: AiStatus }

const REASON: Record<string, AiStatus> = { user_quota: 'quota', global_day: 'quota', global_minute: 'rate_limited', busy: 'busy' }

export async function claimAi(db: SupabaseClient, feature: AiFeature, estTokens: number): Promise<Claim> {
  const { data, error } = await db.rpc('claim_ai_call', { p_feature: feature, p_est_tokens: estTokens })
  if (error) {
    // Missing migration, too-large request or a database problem: fail closed.
    console.error(`ai: quota claim failed (${error.code ?? 'unknown'})`)
    return { ok: false, status: 'unavailable' }
  }
  const res = data as { ok: boolean; call_id?: string; reason?: string }
  if (!res.ok || !res.call_id) return { ok: false, status: REASON[res.reason ?? ''] ?? 'quota' }
  return { ok: true, callId: res.call_id }
}

export async function finishAi(db: SupabaseClient, callId: string, ok: boolean, usedTokens: number | null) {
  const { error } = await db.rpc('finish_ai_call', { p_call: callId, p_ok: ok, p_used_tokens: usedTokens })
  if (error) console.error(`ai: quota settle failed (${error.code ?? 'unknown'})`)
}

export interface GroqJsonResult {
  status: AiStatus
  output: unknown
  usedTokens: number | null
}

/** One structured-output call to Groq. No retries: a 429 or a failure goes straight to the caller's fallback. */
export async function groqJson(apiKey: string, input: {
  system: string
  user: string
  schemaName: string
  schema: Record<string, unknown>
  maxOutput: number
}): Promise<GroqJsonResult> {
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: GROQ_TEXT_MODEL,
        max_completion_tokens: input.maxOutput,
        reasoning_effort: 'low',
        temperature: 0.2,
        response_format: { type: 'json_schema', json_schema: { name: input.schemaName, strict: true, schema: input.schema } },
        messages: [{ role: 'system', content: input.system }, { role: 'user', content: input.user }],
      }),
    })
    if (res.status === 401 || res.status === 403) {
      console.error(`ai: GROQ_API_KEY was rejected (${res.status})`)
      return { status: 'auth', output: null, usedTokens: 0 }
    }
    if (res.status === 429) {
      console.error('ai: Groq rate limited')
      return { status: 'rate_limited', output: null, usedTokens: 0 }
    }
    if (!res.ok) {
      console.error(`ai: Groq error ${res.status}`)
      return { status: 'api_error', output: null, usedTokens: null }
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { total_tokens?: number } }
    const usedTokens = body.usage?.total_tokens ?? null
    try {
      return { status: 'ok', output: JSON.parse(body.choices?.[0]?.message?.content ?? 'null'), usedTokens }
    } catch {
      return { status: 'rejected', output: null, usedTokens }
    }
  } catch (e) {
    const timeout = (e as Error).name === 'TimeoutError' || (e as Error).name === 'AbortError'
    console.error(timeout ? 'ai: Groq timed out' : 'ai: Groq call failed')
    return { status: timeout ? 'timeout' : 'failed', output: null, usedTokens: null }
  }
}

/**
 * Claim → call → settle. Returns the parsed output, or null with a status the caller can show. A provider failure
 * gives the person their daily use back; a successful call or a rejected (unusable) answer does not.
 */
export async function runAi(db: SupabaseClient, feature: AiFeature, input: Parameters<typeof groqJson>[1]): Promise<GroqJsonResult> {
  if (aiKillSwitchOn()) return { status: 'disabled', output: null, usedTokens: null }
  const apiKey = groqKey()
  if (!apiKey) return { status: 'no_key', output: null, usedTokens: null }
  const claim = await claimAi(db, feature, estimateTokens(input.system.length + input.user.length, input.maxOutput))
  if (!claim.ok) return { status: claim.status, output: null, usedTokens: null }
  const result = await groqJson(apiKey, input)
  await finishAi(db, claim.callId, result.status === 'ok' || result.status === 'rejected', result.usedTokens)
  return result
}
