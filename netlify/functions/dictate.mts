import { requestGroq } from '../lib/groq'
import type { Config } from '@netlify/functions'
import { z } from 'zod'
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

async function writeWithGroq(apiKey: string, kind: DictationKind, transcript: string, guides: PriceGuide[], today: string) {
  const result = await requestGroq({
    apiKey,
    name: `${kind}_draft`,
    schema: z.toJSONSchema(DICTATION_SCHEMA[kind], { target: 'draft-7' }),
    ...dictationPrompt(kind, transcript, guides, today),
    maxTokens: 4000,
    timeoutMs: 25_000,
  })
  if (result.status !== 'ok') return { draft: null, status: result.status }
  const parsed = DICTATION_SCHEMA[kind].safeParse(result.output)
  const draft = parsed.success ? finalizeAi(kind, parsed.data, transcript, guides, today) : null
  return { draft, status: draft ? 'ok' as const : 'rejected' as const }
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

  const groqKey = optionalEnv('GROQ_API_KEY')
  const ai = useAi && groqKey ? await writeWithGroq(groqKey, kind, transcript, guides, today) : null
  const draft = ai?.draft ?? null
  const result: DictationResult = {
    kind,
    draft: draft ?? draftByRules(kind, transcript, guides, today),
    written_by: draft ? 'ai' : 'rules',
    ai_available: Boolean(groqKey),
    ai_status: ai?.status ?? 'off',
  }
  return json(result)
})

export const config: Config = { path: '/api/dictate' }
