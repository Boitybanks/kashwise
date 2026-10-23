// Data access for the native app. It reads only the signed-in user's own rows (RLS decides) and computes every figure
// with the SAME iBanks engine as the web app and the server (../../src/lib/ibanks), so the numbers cannot drift.
import { toEntries, type LedgerRow } from '../../src/lib/ibanks/facts'
import type { JobInfo } from '../../src/lib/ibanks/analytics'
import type { LedgerEntry } from '../../src/lib/ibanks/contracts'
import type { Insight } from '../../src/lib/ibanks/orchestrator'
import type { AgentOutput } from '../../src/lib/ibanks/agent'
import { API_BASE, supabase } from './supabase'

export interface MoneyRows {
  enabled: boolean
  entries: LedgerEntry[]
  insights: (Insight & { id: string })[]
  jobs: Map<string, JobInfo>
  fetchedAt: number
}

export async function fetchMoney(userId: string): Promise<MoneyRows> {
  const [ledger, insights, gigs] = await Promise.all([
    supabase.from('financial_ledger_entries').select('*').eq('worker_id', userId).order('id').limit(5000),
    supabase.from('ibanks_insights').select('*').eq('worker_id', userId).eq('status', 'active').order('created_at', { ascending: false }).limit(20),
    supabase.from('gigs').select('id, title, category, completed_at, customer_id').eq('assigned_worker_id', userId).eq('status', 'completed').limit(1000),
  ])
  return {
    enabled: !ledger.error,
    entries: toEntries((ledger.data ?? []) as LedgerRow[]),
    insights: (insights.data ?? []) as MoneyRows['insights'],
    jobs: new Map(
      (gigs.data ?? []).map((g) => [g.id as string, { title: g.title as string, category: g.category as string, completed_at: g.completed_at as string | null, client_key: g.customer_id as string }]),
    ),
    fetchedAt: Date.now(),
  }
}

export interface OpenGig {
  id: string
  title: string
  category: string
  area_slug: string
  scheduled_date: string
  worker_net_cents: number
  is_demo: boolean
}

export async function fetchOpenGigs(): Promise<OpenGig[]> {
  const { data, error } = await supabase
    .from('gigs')
    .select('id, title, category, area_slug, scheduled_date, worker_net_cents, is_demo')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) throw new Error(error.message)
  return (data ?? []) as OpenGig[]
}

export interface ProofRecord {
  id: string
  gig_id: string
  title: string
  category: string
  completed_at: string
  record_code: string
  rating: number | null
  payment_confirmed: boolean
}

export async function fetchProof(workerId: string): Promise<ProofRecord[]> {
  const [items, paid] = await Promise.all([
    supabase.from('portfolio_items').select('id, gig_id, title, category, completed_at, record_code, rating').eq('worker_id', workerId).order('completed_at', { ascending: false }),
    supabase.rpc('portfolio_payment_confirmed', { p_worker: workerId }),
  ])
  if (items.error) throw new Error(items.error.message)
  const settled = new Set(paid.error ? [] : ((paid.data ?? []) as string[]))
  return (items.data ?? []).map((i) => ({ ...(i as Omit<ProofRecord, 'payment_confirmed'>), payment_confirmed: settled.has(i.gig_id as string) }))
}

export async function fetchMyGigs(customerId: string) {
  const { data, error } = await supabase
    .from('gigs')
    .select('id, title, category, status, payout_cents, scheduled_date, is_demo')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) throw new Error(error.message)
  return (data ?? []) as { id: string; title: string; category: string; status: string; payout_cents: number; scheduled_date: string; is_demo: boolean }[]
}

/** Ask iBanks through the same server function as the web app; the subject is derived from the session server-side. */
export async function askIbanks(question: string): Promise<AgentOutput> {
  if (!API_BASE) throw new Error('Ask iBanks needs EXPO_PUBLIC_API_BASE (the KashWise web address).')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Please sign in again.')
  const res = await fetch(`${API_BASE}/api/ibanks/ask`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ question }),
  })
  const body = (await res.json().catch(() => ({}))) as AgentOutput & { error?: string }
  if (!res.ok) throw new Error(body.error ?? `iBanks is unavailable (${res.status}).`)
  return body
}
