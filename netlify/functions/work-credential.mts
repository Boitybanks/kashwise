// GET /api/work-credential?worker=<uuid>
// Issues a worker's verified KashWise history signed with ML-DSA-65 (FIPS 204). Public data only
// (portfolio records are public), read with the publishable key so RLS still applies.
import type { Config } from '@netlify/functions'
import { signCredential, type WorkCredential } from '../../src/lib/pq/credential'
import { SIGN_KID } from '../../src/lib/pq-public-keys'
import { json, safe, seed, supabaseAs, UUID_RE } from '../lib/shared'

export default safe(async (req: Request) => {
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
  const url = new URL(req.url)
  const workerId = url.searchParams.get('worker') ?? ''
  if (!UUID_RE.test(workerId)) return json({ error: 'Invalid worker.' }, 400)

  const db = supabaseAs(null)
  const [{ data: profile }, { data: items }, { data: stats }] = await Promise.all([
    db.from('profiles').select('id, display_name, area_slug, skills, created_at, is_demo').eq('id', workerId).maybeSingle(),
    db.from('portfolio_items').select('*').eq('worker_id', workerId).order('completed_at', { ascending: false }).limit(200),
    db.rpc('worker_stats', { p_worker: workerId }),
  ])
  if (!profile) return json({ error: 'Worker not found.' }, 404)

  const slugs = [...new Set([profile.area_slug, ...(items ?? []).map((i) => i.area_slug)])]
  const { data: areas } = await db.from('areas').select('slug, name, city').in('slug', slugs)
  const areaName = (slug: string) => {
    const a = areas?.find((x) => x.slug === slug)
    return a ? `${a.name}, ${a.city}` : slug
  }

  const records = (items ?? []).map((i) => ({
    code: i.record_code as string,
    title: i.title as string,
    category: i.category as string,
    area: areaName(i.area_slug),
    completed_at: i.completed_at as string,
    rating: (i.rating as number | null) ?? null,
    review: (i.review as string | null) ?? null,
    customer: i.customer_label as string,
  }))

  const credential: WorkCredential = {
    type: 'SideGigsWorkHistory',
    version: 1,
    issuer: 'SideGigs',
    issued_at: new Date().toISOString(),
    demo_data: Boolean(profile.is_demo) || (items ?? []).some((i) => i.is_demo),
    worker: {
      id: profile.id,
      name: profile.display_name,
      area: areaName(profile.area_slug),
      member_since: profile.created_at,
      skills: profile.skills ?? [],
    },
    summary: {
      completed_gigs: records.length,
      average_rating: stats?.avg_rating ?? null,
      reviews: stats?.review_count ?? 0,
      repeat_customers: stats?.repeat_customers ?? 0,
    },
    records,
    profile_url: `${url.origin}/w/${profile.id}`,
  }

  const signSeed = seed('PQ_SIGN_SEED')
  try {
    return json(signCredential(credential, signSeed, SIGN_KID))
  } finally {
    signSeed.fill(0)
  }
})

export const config: Config = { path: '/api/work-credential' }
