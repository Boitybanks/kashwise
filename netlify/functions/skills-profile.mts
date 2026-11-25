// POST /api/skills-profile { useAi }  (Authorization: Bearer <Supabase access token>)
// Writes the caller's skills profile (the summary and skills on their CV) from their customer-confirmed records,
// signs it with ML-DSA-65 and saves it through the save_skills_profile RPC (as the caller). With the worker's consent,
// Groq's free tier phrases it (once a day per person); every skill and quote is then checked against the records
// (bindToEvidence) before signing. A saved profile is reused until the confirmed records change. Without consent, or
// if the AI is off, used up or fails, KashWise assembles a factual summary instead, and the profile says so.
import type { Config } from '@netlify/functions'
import { z } from 'zod'
import { withoutContactDetails } from '../../src/lib/dictation'
import { signDocument, type CredentialRecord } from '../../src/lib/pq/credential'
import { SIGN_KID } from '../../src/lib/pq-public-keys'
import {
  aiPrompt,
  aiProfileSchema,
  bindToEvidence,
  REFRESH_MINUTES,
  summaryProfile,
  withName,
  type SkillsProfile,
} from '../../src/lib/skills-profile'
import { aiKillSwitchOn, GROQ_TEXT_MODEL, groqKey, runAi, type AiStatus } from '../lib/ai'
import { json, safe, seed, supabaseAs } from '../lib/shared'

const MAX_RECORDS = 60
const MAX_OUTPUT = 1_500

const sameCodes = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join()

export default safe(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!jwt) return json({ error: 'Please sign in again.' }, 401)

  let useAi = false
  try {
    const raw = await req.text()
    if (raw.length > 256) return json({ error: 'Invalid request.' }, 413)
    useAi = (JSON.parse(raw) as { useAi?: unknown }).useAi === true
  } catch {
    return json({ error: 'Invalid request.' }, 400)
  }

  const db = supabaseAs(jwt)
  const { data: userData, error: userError } = await db.auth.getUser(jwt)
  if (userError || !userData.user) return json({ error: 'Your session has expired. Please sign in again.' }, 401)
  const uid = userData.user.id

  const [{ data: profile }, { data: existing }] = await Promise.all([
    db.from('profiles').select('id, display_name, role, area_slug, is_demo').eq('id', uid).maybeSingle(),
    db.from('skills_profiles').select('created_at, written_by, signed').eq('worker_id', uid).maybeSingle(),
  ])
  if (!profile || profile.role !== 'worker') return json({ error: 'Skills profiles are for service providers.' }, 403)

  const [{ data: items }, { data: stats }] = await Promise.all([
    db.from('portfolio_items').select('*').eq('worker_id', uid).order('completed_at', { ascending: false }).limit(MAX_RECORDS),
    db.rpc('worker_stats', { p_worker: uid }),
  ])
  if (!items?.length) return json({ error: 'Your skills profile is written from confirmed jobs. Complete your first job to get one.' }, 400)

  const slugs = [...new Set([profile.area_slug, ...items.map((i) => i.area_slug)])]
  const { data: areas } = await db.from('areas').select('slug, name, city').in('slug', slugs)
  const areaName = (slug: string) => {
    const a = areas?.find((x) => x.slug === slug)
    return a ? `${a.name}, ${a.city}` : slug
  }
  const records: CredentialRecord[] = items.map((i) => ({
    code: i.record_code as string,
    title: i.title as string,
    category: i.category as string,
    area: areaName(i.area_slug),
    completed_at: i.completed_at as string,
    rating: (i.rating as number | null) ?? null,
    review: (i.review as string | null) ?? null,
    customer: i.customer_label as string,
  }))
  const averageRating: number | null = stats?.avg_rating ?? null
  const aiAvailable = !aiKillSwitchOn() && Boolean(groqKey())

  // Cache: the saved profile stands while it covers exactly the current confirmed records. No AI call, no quota used.
  const savedCodes = (existing?.signed as { credential?: SkillsProfile } | null)?.credential?.based_on?.codes ?? null
  if (existing && savedCodes && sameCodes(savedCodes, records.map((r) => r.code)) && (existing.written_by === 'ai' || !useAi)) {
    return json({ signed: existing.signed, aiAvailable, aiUsed: existing.written_by === 'ai', cached: true })
  }
  if (existing && Date.now() - Date.parse(existing.created_at) < REFRESH_MINUTES * 60_000) {
    return json({ error: `You can refresh your skills profile once every ${REFRESH_MINUTES} minutes.` }, 429)
  }

  let aiContent = null
  let aiStatus: AiStatus = 'off'
  if (useAi) {
    const { system, user } = aiPrompt(records, profile.display_name, withoutContactDetails)
    const schema = z.toJSONSchema(aiProfileSchema, { target: 'draft-7' }) as Record<string, unknown>
    delete schema.$schema
    const ai = await runAi(db, 'cv', { system, user, schemaName: 'skills_profile', schema, maxOutput: MAX_OUTPUT })
    aiStatus = ai.status
    if (ai.status === 'ok') {
      const parsed = aiProfileSchema.safeParse(ai.output)
      aiContent = parsed.success ? bindToEvidence(withName(parsed.data, profile.display_name), records) : null
      if (!aiContent) aiStatus = 'rejected'
    }
  }
  const content = aiContent ?? summaryProfile(profile.display_name, records, averageRating)
  if (!content) return json({ error: 'Could not write a skills profile yet.' }, 400)

  const doc: SkillsProfile = {
    type: 'SideGigsSkillsProfile',
    version: 1,
    issuer: 'SideGigs',
    issued_at: new Date().toISOString(),
    written_by: aiContent ? 'ai' : 'summary',
    model: aiContent ? GROQ_TEXT_MODEL : null,
    demo_data: Boolean(profile.is_demo) || items.some((i) => i.is_demo),
    worker: { id: profile.id, name: profile.display_name, area: areaName(profile.area_slug) },
    based_on: { records: records.length, codes: records.map((r) => r.code), average_rating: averageRating },
    ...content,
    profile_url: `${new URL(req.url).origin}/w/${profile.id}`,
  }

  const signSeed = seed('PQ_SIGN_SEED')
  let signed
  try {
    signed = signDocument(doc, signSeed, SIGN_KID)
  } finally {
    signSeed.fill(0)
  }
  const { error } = await db.rpc('save_skills_profile', { p_signed: signed })
  if (error) return json({ error: error.message }, error.code === '42501' ? 403 : 400)
  return json({ signed, aiAvailable, aiUsed: Boolean(aiContent), aiStatus })
})

export const config: Config = { path: '/api/skills-profile' }
