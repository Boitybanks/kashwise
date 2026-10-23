// Deterministic earnings intelligence. No LLM arithmetic anywhere: every figure iBanks says comes from here.
// Periods are Africa/Johannesburg (UTC+2 all year — South Africa has no daylight saving), weeks start Monday.
import { balances, type Balances } from './ledger'
import type { LedgerEntry } from './contracts'
import { incomeOutlook, type Outlook } from './forecast'
import { earningPatterns, type Patterns } from './patterns'

export const TIMEZONE = 'Africa/Johannesburg'
const SAST_MS = 2 * 3600_000
const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS

export interface JobInfo {
  title: string
  category: string
  /** When the client confirmed completion (ISO). Optional: older callers only know title and category. */
  completed_at?: string | null
  /** Opaque per-client key for counting repeat clients; never a name, phone or address. */
  client_key?: string | null
}

/** Local-midnight Monday (as a UTC instant) of the SA week containing `t`. */
export function weekStart(t: number): number {
  const local = t + SAST_MS
  const day = Math.floor(local / DAY_MS)
  const dow = (new Date(day * DAY_MS).getUTCDay() + 6) % 7 // Monday = 0
  return (day - dow) * DAY_MS - SAST_MS
}

export function monthKey(t: number): string {
  return new Date(t + SAST_MS).toISOString().slice(0, 7)
}

export function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

function quantile(xs: readonly number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b)
  const pos = (s.length - 1) * q
  const lo = Math.floor(pos)
  return Math.round(s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (pos - lo))
}

export interface PeriodTotals extends Balances {
  from: string
  to: string
  settled_jobs: number
}

/** Totals of entries whose event happened in [from, to). Balances are period flows, not lifetime positions. */
export function periodTotals(entries: readonly LedgerEntry[], from: number, to: number): PeriodTotals {
  const inPeriod = entries.filter((e) => {
    const t = Date.parse(e.occurred_at)
    return t >= from && t < to
  })
  const jobs = new Set(inPeriod.filter((e) => e.account === 'net_earned' && e.amount_cents > 0).map((e) => e.payment_id))
  return { ...balances(inPeriod), from: new Date(from).toISOString(), to: new Date(to).toISOString(), settled_jobs: jobs.size }
}

export interface WeekPoint {
  week_start: string
  net_cents: number
  jobs: number
  complete: boolean
}

export interface EarningsIntelligence {
  as_of: string
  timezone: typeof TIMEZONE
  week_starts_on: 'monday'
  lifetime: Balances & { settled_jobs: number }
  this_week: PeriodTotals
  last_week: PeriodTotals
  this_month: PeriodTotals
  weeks: WeekPoint[]
  observation: { first_settlement: string | null; complete_weeks: number; zero_income_weeks: number }
  median_weekly_net_cents: number | null
  mean_weekly_net_cents: number | null
  /** Coefficient of variation in basis points; null when fewer than 4 complete weeks make it meaningless. */
  volatility_bps: number | null
  best_week: WeekPoint | null
  worst_week: WeekPoint | null
  by_category: { category: string; net_cents: number; jobs: number }[]
  forecast: Forecast
  /** Next 7 / 30 days as ranges with a backtest (forecast.ts). Visibly separate from confirmed earnings. */
  outlook: Outlook
  patterns: Patterns
}

export type Forecast =
  | { kind: 'insufficient_history'; complete_weeks: number; needed_weeks: number }
  | { kind: 'range'; basis_weeks: number; low_cents: number; median_cents: number; high_cents: number; label: 'estimate, not a guarantee' }

export const MIN_FORECAST_WEEKS = 4

/** Net earned per settled job category: what each kind of work actually brought in after fees and reversals. */
function byCategory(entries: readonly LedgerEntry[], jobs: ReadonlyMap<string, JobInfo>) {
  const m = new Map<string, { net_cents: number; jobs: Set<string> }>()
  for (const e of entries) {
    if (e.account !== 'net_earned' || !e.job_id) continue
    const cat = jobs.get(e.job_id)?.category ?? 'other'
    const row = m.get(cat) ?? { net_cents: 0, jobs: new Set<string>() }
    row.net_cents += e.amount_cents
    if (e.amount_cents > 0) row.jobs.add(e.job_id)
    m.set(cat, row)
  }
  return [...m.entries()]
    .map(([category, r]) => ({ category, net_cents: r.net_cents, jobs: r.jobs.size }))
    .filter((r) => r.net_cents > 0)
    .sort((a, b) => b.net_cents - a.net_cents || a.category.localeCompare(b.category))
}

export function earningsIntelligence(
  entries: readonly LedgerEntry[],
  jobs: ReadonlyMap<string, JobInfo>,
  now: number,
): EarningsIntelligence {
  const thisWeek = weekStart(now)
  const localNow = new Date(now + SAST_MS)
  const monthStart = Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), 1) - SAST_MS

  const settlements = entries.filter((e) => e.account === 'net_earned' && e.amount_cents > 0).map((e) => Date.parse(e.occurred_at))
  const first = settlements.length ? Math.min(...settlements) : null

  // Weekly series from the first settled week to this week; weeks with no income count as zero (coverage is known).
  const weeks: WeekPoint[] = []
  if (first !== null) {
    for (let w = weekStart(first); w <= thisWeek; w += WEEK_MS) {
      const t = periodTotals(entries, w, w + WEEK_MS)
      weeks.push({ week_start: new Date(w).toISOString(), net_cents: t.net_earned_cents, jobs: t.settled_jobs, complete: w < thisWeek })
    }
  }
  const complete = weeks.filter((w) => w.complete)
  const recent = complete.slice(-8).map((w) => w.net_cents)
  const mean = recent.length ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length) : null
  let volatility: number | null = null
  if (recent.length >= MIN_FORECAST_WEEKS && mean) {
    const variance = recent.reduce((a, x) => a + (x - mean) ** 2, 0) / recent.length
    volatility = Math.round((Math.sqrt(variance) / mean) * 10_000)
  }
  const forecast: Forecast =
    recent.length < MIN_FORECAST_WEEKS
      ? { kind: 'insufficient_history', complete_weeks: complete.length, needed_weeks: MIN_FORECAST_WEEKS }
      : {
          kind: 'range',
          basis_weeks: recent.length,
          low_cents: quantile(recent, 0.25),
          median_cents: median(recent),
          high_cents: quantile(recent, 0.75),
          label: 'estimate, not a guarantee',
        }
  const pick = (better: (a: WeekPoint, b: WeekPoint) => boolean) =>
    complete.length ? complete.reduce((best, w) => (better(w, best) ? w : best)) : null

  const allJobs = new Set(entries.filter((e) => e.account === 'net_earned' && e.amount_cents > 0).map((e) => e.payment_id))
  return {
    as_of: new Date(now).toISOString(),
    timezone: TIMEZONE,
    week_starts_on: 'monday',
    lifetime: { ...balances(entries), settled_jobs: allJobs.size },
    this_week: periodTotals(entries, thisWeek, thisWeek + WEEK_MS),
    last_week: periodTotals(entries, thisWeek - WEEK_MS, thisWeek),
    this_month: periodTotals(entries, monthStart, now + 1),
    weeks,
    observation: {
      first_settlement: first === null ? null : new Date(first).toISOString(),
      complete_weeks: complete.length,
      zero_income_weeks: complete.filter((w) => w.net_cents === 0).length,
    },
    median_weekly_net_cents: recent.length ? median(recent) : null,
    mean_weekly_net_cents: mean,
    volatility_bps: volatility,
    best_week: pick((a, b) => a.net_cents > b.net_cents),
    worst_week: pick((a, b) => a.net_cents < b.net_cents),
    by_category: byCategory(entries, jobs),
    forecast,
    outlook: incomeOutlook(complete.map((w) => w.net_cents)),
    patterns: earningPatterns(entries, jobs),
  }
}
