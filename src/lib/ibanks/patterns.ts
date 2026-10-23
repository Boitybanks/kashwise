// Earning patterns and a likelihood-aware next step, from the worker's own settled jobs (FNB brief §G.3, §G.5).
// These describe what HAS happened, with sample sizes. They are correlations, never promises of future bookings.
import type { JobInfo } from './analytics'
import type { LedgerEntry } from './contracts'

/** Fewer paid jobs than this and iBanks says "too early to see a pattern" instead of suggesting anything. */
export const MIN_PATTERN_JOBS = 3
const SAST_MS = 2 * 3600_000
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

export interface CategoryPattern {
  category: string
  jobs: number
  net_cents: number
  avg_net_per_job_cents: number
}

export interface Patterns {
  paid_jobs: number
  categories: CategoryPattern[]
  /** Paid jobs by the SA weekday they were completed (only jobs with a known completion time). */
  weekdays: { weekday: (typeof WEEKDAYS)[number]; jobs: number }[]
  weekday_sample: number
  repeat_clients: number
  suggestion:
    | { kind: 'too_early'; paid_jobs: number; needed_jobs: number }
    | { kind: 'focus_category'; category: string; jobs: number; of_jobs: number; avg_net_per_job_cents: number; busiest_weekday: string | null; weekday_jobs: number }
}

export function earningPatterns(entries: readonly LedgerEntry[], jobs: ReadonlyMap<string, JobInfo>): Patterns {
  // Net per settled job, after any reversal; a fully refunded job is not "paid work".
  const netByJob = new Map<string, number>()
  for (const e of entries) {
    if (e.account !== 'net_earned' || !e.job_id) continue
    netByJob.set(e.job_id, (netByJob.get(e.job_id) ?? 0) + e.amount_cents)
  }
  const paid = [...netByJob.entries()].filter(([, net]) => net > 0)

  const cats = new Map<string, { jobs: number; net: number }>()
  const days = new Array<number>(7).fill(0)
  let weekdaySample = 0
  const clients = new Map<string, number>()
  for (const [jobId, net] of paid) {
    const info = jobs.get(jobId)
    const c = cats.get(info?.category ?? 'other') ?? { jobs: 0, net: 0 }
    c.jobs++
    c.net += net
    cats.set(info?.category ?? 'other', c)
    if (info?.completed_at) {
      const dow = (new Date(Date.parse(info.completed_at) + SAST_MS).getUTCDay() + 6) % 7
      days[dow]++
      weekdaySample++
    }
    if (info?.client_key) clients.set(info.client_key, (clients.get(info.client_key) ?? 0) + 1)
  }

  const categories = [...cats.entries()]
    .map(([category, c]) => ({ category, jobs: c.jobs, net_cents: c.net, avg_net_per_job_cents: Math.round(c.net / c.jobs) }))
    .sort((a, b) => b.jobs - a.jobs || b.net_cents - a.net_cents || a.category.localeCompare(b.category))
  const weekdays = WEEKDAYS.map((weekday, i) => ({ weekday, jobs: days[i] }))
  const busiest = weekdaySample >= MIN_PATTERN_JOBS ? weekdays.reduce((b, d) => (d.jobs > b.jobs ? d : b)) : null

  const top = categories[0]
  return {
    paid_jobs: paid.length,
    categories,
    weekdays,
    weekday_sample: weekdaySample,
    repeat_clients: [...clients.values()].filter((n) => n > 1).length,
    suggestion:
      paid.length < MIN_PATTERN_JOBS || !top
        ? { kind: 'too_early', paid_jobs: paid.length, needed_jobs: MIN_PATTERN_JOBS }
        : {
            kind: 'focus_category',
            category: top.category,
            jobs: top.jobs,
            of_jobs: paid.length,
            avg_net_per_job_cents: top.avg_net_per_job_cents,
            busiest_weekday: busiest && busiest.jobs > 0 ? busiest.weekday : null,
            weekday_jobs: busiest?.jobs ?? 0,
          },
  }
}
