// POST /api/dictate { kind, transcript, useAi }  (Authorization: Bearer <Supabase access token>)
// Turns what someone said into a draft bio, job post or earnings goal. It only returns a draft: saving and publishing
// stay with the existing forms and RPCs. With the person's consent, Groq's free tier phrases it (3 a day per person,
// within global budgets), and the checks in src/lib/dictation.ts decide whether it may be used. Otherwise, or if
// anything fails, the rules write it, and the draft says so.
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
  withoutContactDetails,
  type DictationKind,
  type DictationResult,
  type PriceGuide,
} from '../../src/lib/dictation'
import { todayInSA } from '../../src/lib/validation'
import { aiKillSwitchOn, groqKey, runAi } from '../lib/ai'
import { json, safe, supabaseAs } from '../lib/shared'

const MAX_BODY = 8_192
const MAX_OUTPUT = 1_500

export default safe(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!jwt) return json({ error: 'Please sign in again.' }, 401)

  let kind: DictationKind
  let transcript: string
  let useAi: boolean
  try {
    const raw = await req.text()
    if (raw.length > MAX_BODY) return json({ error: 'That is a bit long. Please keep it under a few minutes of speech.' }, 413)
    const body = JSON.parse(raw) as { kind?: unknown; transcript?: unknown; useAi?: unknown }
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

  const today = todayInSA()
  let guides: PriceGuide[] = []
  if (kind === 'job') {
    const { data: me } = await db.from('profiles').select('is_demo').eq('id', uid).maybeSingle()
    const { data: rows } = await db.from('gigs').select('category, payout_cents').eq('is_demo', Boolean(me?.is_demo)).order('created_at', { ascending: false }).limit(200)
    guides = priceGuides(rows ?? [])
  }

  let draft: DictationResult['draft'] | null = null
  let status: DictationResult['ai_status'] = 'off'
  if (useAi) {
    const { system, user } = dictationPrompt(kind, withoutContactDetails(transcript), guides, today)
    const schema = z.toJSONSchema(DICTATION_SCHEMA[kind], { target: 'draft-7' }) as Record<string, unknown>
    delete schema.$schema
    const ai = await runAi(db, 'dictation', { system, user, schemaName: `${kind}_draft`, schema, maxOutput: MAX_OUTPUT })
    if (ai.status === 'ok') {
      draft = finalizeAi(kind, ai.output, transcript, guides, today)
      status = draft ? 'ok' : 'rejected'
    } else {
      status = ai.status
    }
  }
  const result: DictationResult = {
    kind,
    draft: draft ?? draftByRules(kind, transcript, guides, today),
    written_by: draft ? 'ai' : 'rules',
    ai_available: !aiKillSwitchOn() && Boolean(groqKey()),
    ai_status: status,
  }
  return json(result)
})

export const config: Config = { path: '/api/dictate' }
