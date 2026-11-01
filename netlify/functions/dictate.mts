// POST /api/dictate { kind, transcript, useAi }  (Authorization: Bearer <Supabase access token>)
// Turns what someone said into a draft bio, job post or earnings goal. It only returns a draft: saving and publishing
// stay with the existing forms and RPCs. With the person's consent and an ANTHROPIC_API_KEY, Claude phrases it and the
// checks in src/lib/dictation.ts decide whether it may be used. Otherwise the rules write it, and the draft says so.
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { Config } from '@netlify/functions'
import {
  DICTATION_KINDS,
  DICTATION_SCHEMA,
  dictationPrompt,
  draftByRules,
  finalizeAi,
  MAX_TRANSCRIPT,
  priceGuides,
  type DictationKind,
  type DictationResult,
  type PriceGuide,
} from '../../src/lib/dictation'
import { todayInSA } from '../../src/lib/validation'
import { json, optionalEnv, safe, supabaseAs } from '../lib/shared'

const MODEL = 'claude-opus-5-5'
const WINDOW_MS = 10 * 60_000
const MAX_PER_WINDOW = 20

// Best effort per function instance: it stops a stuck client or a script, and the transcript size cap bounds the rest.
const recent = new Map<string, number[]>()
function overLimit(uid: string, now = Date.now()): boolean {
  const times = (recent.get(uid) ?? []).filter((t) => now - t < WINDOW_MS)
  if (times.length >= MAX_PER_WINDOW) return true
  recent.set(uid, [...times, now])
  return false
}

async function writeWithClaude(apiKey: string, kind: DictationKind, transcript: string, guides: PriceGuide[], today: string) {
  const client = new Anthropic({ apiKey, timeout: 25_000, maxRetries: 1 })
  const { system, user } = dictationPrompt(kind, transcript, guides, today)
  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      // If the request is declined, the API re-runs it on a fallback model chosen for the refusal category.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(DICTATION_SCHEMA[kind]) },
      system,
      messages: [{ role: 'user', content: user }],
    })
    if (response.stop_reason === 'refusal' || !response.parsed_output) return null
    return finalizeAi(kind, response.parsed_output, transcript, guides, today)
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) console.error('dictation: Claude rate limited')
    else if (e instanceof Anthropic.APIError) console.error(`dictation: Claude API error ${e.status}`)
    else console.error('dictation: Claude call failed:', (e as Error).message)
    return null
  }
}

export default safe(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!jwt) return json({ error: 'Please sign in again.' }, 401)

  let kind: DictationKind
  let transcript: string
  let useAi: boolean
  try {
    const body = (await req.json()) as { kind?: unknown; transcript?: unknown; useAi?: unknown }
    if (!DICTATION_KINDS.includes(body.kind as DictationKind) || typeof body.transcript !== 'string') return json({ error: 'Invalid request.' }, 400)
    kind = body.kind as DictationKind
    transcript = body.transcript.trim()
    useAi = body.useAi === true
  } catch {
    return json({ error: 'Invalid request.' }, 400)
  }
  if (transcript.length < 3) return json({ error: 'Say or type a little more first.' }, 400)
  if (transcript.length > MAX_TRANSCRIPT) return json({ error: 'That is a bit long. Please keep it under a few minutes of speech.' }, 400)

  const db = supabaseAs(jwt)
  const { data: userData, error: userError } = await db.auth.getUser(jwt)
  if (userError || !userData.user) return json({ error: 'Your session has expired. Please sign in again.' }, 401)
  const uid = userData.user.id
  if (overLimit(uid)) return json({ error: 'Please wait a few minutes before trying again.' }, 429)

  const today = todayInSA()
  let guides: PriceGuide[] = []
  if (kind === 'job') {
    const { data: me } = await db.from('profiles').select('is_demo').eq('id', uid).maybeSingle()
    const { data: rows } = await db.from('gigs').select('category, payout_cents').eq('is_demo', Boolean(me?.is_demo)).order('created_at', { ascending: false }).limit(200)
    guides = priceGuides(rows ?? [])
  }

  const apiKey = optionalEnv('ANTHROPIC_API_KEY')
  const ai = useAi && apiKey ? await writeWithClaude(apiKey, kind, transcript, guides, today) : null
  const result: DictationResult = {
    kind,
    draft: ai ?? draftByRules(kind, transcript, guides, today),
    written_by: ai ? 'ai' : 'rules',
    ai_available: Boolean(apiKey),
  }
  return json(result)
})

export const config: Config = { path: '/api/dictate' }
