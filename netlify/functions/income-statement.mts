// POST /api/income-statement { months }  (Authorization: Bearer <Supabase access token>)
// Issues the caller's proof-of-income statement, signed with ML-DSA-65 (FIPS 204). The earnings are read with the
// CALLER's JWT through the income_statement RPC, so a worker can only ever get their own statement.
import type { Config } from '@netlify/functions'
import { randomBytes } from 'node:crypto'
import { buildIncomeStatement, statementReference, STATEMENT_MONTHS, type RawStatement } from '../../src/lib/income-statement'
import { signDocument } from '../../src/lib/pq/credential'
import { SIGN_KID } from '../../src/lib/pq-public-keys'
import { json, safe, seed, supabaseAs } from '../lib/shared'

export default safe(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!jwt) return json({ error: 'Please sign in again.' }, 401)

  let months = 3
  try {
    months = Number(((await req.json()) as { months?: unknown }).months ?? 3)
  } catch {
    return json({ error: 'Invalid request.' }, 400)
  }
  if (!(STATEMENT_MONTHS as readonly number[]).includes(months)) return json({ error: 'Choose 3, 6 or 12 months.' }, 400)

  const db = supabaseAs(jwt)
  const { data, error } = await db.rpc('income_statement', { p_months: months })
  if (error) return json({ error: error.message }, error.code === '42501' ? 403 : 400)
  const raw = data as RawStatement

  const slugs = [...new Set([raw.worker.area_slug, ...(raw.lines ?? []).map((l) => l.area_slug)])]
  const { data: areas } = await db.from('areas').select('slug, name, city').in('slug', slugs)
  const areaName = (slug: string) => {
    const a = areas?.find((x) => x.slug === slug)
    return a ? `${a.name}, ${a.city}` : slug
  }

  const statement = buildIncomeStatement(raw, {
    areaName,
    origin: new URL(req.url).origin,
    issuedAt: new Date(),
    reference: statementReference((n) => randomBytes(n)),
  })
  const signSeed = seed('PQ_SIGN_SEED')
  try {
    return json(signDocument(statement, signSeed, SIGN_KID))
  } finally {
    signSeed.fill(0)
  }
})

export const config: Config = { path: '/api/income-statement' }
