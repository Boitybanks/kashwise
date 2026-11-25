import { z } from 'zod'
import { requestGroq, GROQ_MODEL } from '../lib/groq'
import type { Config } from '@netlify/functions'
import { signDocument, type CredentialRecord } from '../../src/lib/pq/credential'
import { SIGN_KID } from '../../src/lib/pq-public-keys'
import {
  aiPrompt,
  aiProfileSchema,
  bindToEvidence,
  REFRESH_MINUTES,
  summaryProfile,
  type ProfileContent,
  type SkillsProfile,
} from '../../src/lib/skills-profile'
import { json, optionalEnv, safe, seed, supabaseAs } from '../lib/shared'

const MAX_RECORDS = 60

async function writeWithGroq(apiKey: string, name: string, records: CredentialRecord[]): Promise<ProfileContent | null> {
  const result = await requestGroq({
    apiKey,
    name: 'skills_profile',
    schema: z.toJSONSchema(aiProfileSchema, { target: 'draft-7' }),
    ...aiPrompt(name, records),
    maxTokens: 4000,
    timeoutMs: 45_000,
  })
  if (result.status !== 'ok') return null
  const parsed = aiProfileSchema.safeParse(result.output)
  return parsed.success ? bindToEvidence(parsed.data, records) : null
}

export default safe(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!jwt) return json({ error: 'Please sign in again.' }, 401)

  let useAi = false
  try {
    useAi = ((await req.json()) as { useAi?: unknown }).useAi === true
  } catch {
    return json({ error: 'Invalid request.' }, 400)
  }

  const db = supabaseAs(jwt)
  const { data: userData, error: userError } = await db.auth.getUser(jwt)
  if (userError || !userData.user) return json({ error: 'Your session has expired. Please sign in again.' }, 401)
  const uid = userData.user.id

  const [{ data: profile }, { data: existing }] = await Promise.all([
    db.from('profiles').select('id, display_name, role, area_slug, is_demo').eq('id', uid).maybeSingle(),
    db.from('skills_profiles').select('created_at').eq('worker_id', uid).maybeSingle(),
  ])
  if (!profile || profile.role !== 'worker') return json({ error: 'Skills profiles are for service providers.' }, 403)
  if (existing && Date.now() - Date.parse(existing.created_at) < REFRESH_MINUTES * 60_000) {
    return json({ error: `You can refresh your skills profile once every ${REFRESH_MINUTES} minutes.` }, 429)
  }

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

  const apiKey = optionalEnv('GROQ_API_KEY')
  const ai = useAi && apiKey ? await writeWithGroq(apiKey, profile.display_name, records) : null
  const content = ai ?? summaryProfile(profile.display_name, records, averageRating)
  if (!content) return json({ error: 'Could not write a skills profile yet.' }, 400)

  const doc: SkillsProfile = {
    type: 'SideGigsSkillsProfile',
    version: 1,
    issuer: 'SideGigs',
    issued_at: new Date().toISOString(),
    written_by: ai ? 'ai' : 'summary',
    model: ai ? GROQ_MODEL : null,
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
  return json({ signed, aiAvailable: Boolean(apiKey), aiUsed: Boolean(ai) })
})

export const config: Config = { path: '/api/skills-profile' }
