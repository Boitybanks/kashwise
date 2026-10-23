// POST /api/ibanks/ask { question }  (Authorization: Bearer <Supabase access token>)
// Ask iBanks: reads ONLY the caller's own rows (their JWT, so RLS decides), computes facts deterministically and
// answers from them. With the worker's opt-in and IBANKS_LLM_PROVIDER=anthropic + ANTHROPIC_API_KEY, Claude may
// re-phrase the answer; any re-phrasing that states an amount not in the facts is thrown away.
import type { Config } from '@netlify/functions'
import { acceptAiOutput, allowedAmounts, answerDeterministic } from '../../src/lib/ibanks/agent'
import { buildAgentFacts, toEntries, type LedgerRow } from '../../src/lib/ibanks/facts'
import type { Insight } from '../../src/lib/ibanks/orchestrator'
import { rephraseWithClaude } from '../lib/ibanks-llm'
import { json, optionalEnv, safe, supabaseAs } from '../lib/shared'

export default safe(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!jwt) return json({ error: 'Please sign in again.' }, 401)
  let question = ''
  try {
    const q = ((await req.json()) as { question?: unknown }).question
    if (typeof q !== 'string' || !q.trim() || q.length > 500) return json({ error: 'Ask a question of up to 500 characters.' }, 400)
    question = q.trim()
  } catch {
    return json({ error: 'Invalid request.' }, 400)
  }

  const db = supabaseAs(jwt)
  const { data: userData, error: userError } = await db.auth.getUser(jwt)
  if (userError || !userData.user) return json({ error: 'Your session has expired. Please sign in again.' }, 401)
  const uid = userData.user.id // the subject is derived from the session, never from the request

  const [ledger, insights, gigs, items, reviews, prefs] = await Promise.all([
    db.from('financial_ledger_entries').select('*').eq('worker_id', uid).order('id').limit(5000),
    db.from('ibanks_insights').select('*').eq('worker_id', uid).eq('status', 'active').order('created_at', { ascending: false }).limit(20),
    db.from('gigs').select('id, title, category, completed_at, customer_id').eq('assigned_worker_id', uid).eq('status', 'completed').limit(1000),
    db.from('portfolio_items').select('record_code').eq('worker_id', uid).limit(1000),
    db.from('reviews').select('rating').eq('worker_id', uid).limit(1000),
    db.from('ibanks_worker_preferences').select('ai_explanations_opt_in').eq('worker_id', uid).maybeSingle(),
  ])
  if (ledger.error) return json({ error: 'iBanks is not enabled on this database yet.' }, 503)

  const ratings = (reviews.data ?? []).map((r) => r.rating as number)
  const facts = buildAgentFacts({
    entries: toEntries((ledger.data ?? []) as LedgerRow[]),
    jobs: new Map((gigs.data ?? []).map((g) => [g.id as string, { title: g.title as string, category: g.category as string, completed_at: g.completed_at as string | null, client_key: g.customer_id as string }])),
    insights: (insights.data ?? []) as Insight[],
    proof: {
      confirmed_jobs: items.data?.length ?? 0,
      reviews: ratings.length,
      average_rating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
      record_codes: (items.data ?? []).map((i) => i.record_code as string),
    },
    now: Date.now(),
  })
  const { output, scenario } = answerDeterministic(question, facts)

  const apiKey = optionalEnv('ANTHROPIC_API_KEY')
  const aiEnabled = optionalEnv('IBANKS_LLM_PROVIDER') === 'anthropic' && Boolean(apiKey) && prefs.data?.ai_explanations_opt_in === true
  let final = output
  let model: string | null = null
  if (aiEnabled) {
    const ai = await rephraseWithClaude(apiKey!, question, output, optionalEnv('IBANKS_LLM_MODEL') ?? 'claude-opus-5-5')
    if (ai) {
      final = acceptAiOutput({ ...ai, answered_by: 'ai' }, output, allowedAmounts(facts, scenario))
      if (final.answered_by === 'ai') model = ai.model
    }
  }
  return json({ ...final, scenario: scenario ?? null, model, ai_available: aiEnabled })
})

export const config: Config = { path: '/api/ibanks/ask' }
