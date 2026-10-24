import { z } from 'zod'
import { CATEGORIES, categoryLabel } from './categories'
import type { GoalContext, GoalMemory, GoalPlan, GoalSuggestion } from './earn-goal-types'
import type { TimeWindow } from './types'

export function southAfricaToday(now = new Date()): string {
  return new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}, 'Choose a valid date.')

export function goalInputSchema(now = new Date()) {
  const today = southAfricaToday(now)
  const lastDate = new Date(new Date(`${today}T00:00:00Z`).getTime() + 90 * 86400000).toISOString().slice(0, 10)
  return z.object({
    target_cents: z.number().int().min(100).max(10_000_000),
    deadline: dateOnly.refine((v) => v >= today && v <= lastDate, 'Choose a deadline from today to 90 days ahead.'),
    area_slug: z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).transform((a) => [...new Set(a)].sort()),
    time_windows: z.array(z.enum(['morning', 'afternoon', 'evening'])).min(1).max(3).transform((a) => [...new Set(a)]),
    radius_km: z.number().min(1).max(100),
    skills: z.array(z.string().refine((v) => CATEGORIES.some((c) => c.slug === v), 'Choose a listed skill.')).min(1).max(12).transform((a) => [...new Set(a)]),
    memory_opt_in: z.boolean(),
  }).strict()
}

export function windowsConflict(
  a: { scheduled_date: string; time_window: TimeWindow },
  b: { scheduled_date: string; time_window: TimeWindow },
): boolean {
  return a.scheduled_date === b.scheduled_date &&
    (a.time_window === 'flexible' || b.time_window === 'flexible' || a.time_window === b.time_window)
}

const integerSum = (values: number[]) => {
  const sum = values.reduce((a, b) => {
    if (!Number.isSafeInteger(b)) throw new Error('Invalid financial amount')
    return a + b
  }, 0)
  if (!Number.isSafeInteger(sum)) throw new Error('Financial amount exceeds supported range')
  return sum
}

/** SQL is authoritative for eligibility and money. AI never fabricates or ranks jobs. */
export function buildGoalPlan(context: GoalContext, memory: GoalMemory, now = new Date()): GoalPlan {
  const { goal } = context
  if (!goal) throw new Error('Save a goal first')
  const today = southAfricaToday(now)
  const end = new Date(`${goal.deadline}T23:59:59.999+02:00`).getTime()
  const start = new Date(goal.started_at).getTime()
  const ledger = context.ledger.filter((entry) => {
    const time = new Date(entry.occurred_at).getTime()
    return time >= start && time <= end && time <= now.getTime()
  })
  const accountSum = (account: string) => integerSum(ledger.filter((e) => e.account === account).map((e) => e.amount_cents))
  const settled = accountSum('net_earned')
  const booked = integerSum(context.bookings.filter((b) => b.status !== 'completed').map((b) => b.worker_net_cents))
  const remaining = Math.max(0, goal.target_cents - settled)
  const possible = context.candidates.filter((c) => {
    const weekday = new Date(`${c.scheduled_date}T00:00:00Z`).getUTCDay()
    return c.is_demo === context.market_demo && (context.market_demo || c.poster_eligible) &&
      c.scheduled_date >= today && c.scheduled_date <= goal.deadline &&
      goal.weekdays.includes(weekday) && (c.time_window === 'flexible' || goal.time_windows.includes(c.time_window)) &&
      goal.skills.includes(c.category) && c.distance_km >= 0 && c.distance_km <= goal.radius_km &&
      Number.isSafeInteger(c.worker_net_cents) && c.worker_net_cents > 0 &&
      c.application_status !== 'rejected' && c.application_status !== 'withdrawn' &&
      !context.bookings.some((b) => windowsConflict(c, b))
  })
  const suggestions: GoalSuggestion[] = []
  let needed = Math.max(0, remaining - booked)
  // A bounded, explainable shortlist; not an assertion of the globally optimal schedule.
  while (suggestions.length < 3 && needed > 0) {
    const available = possible.filter((c) => !suggestions.some((s) => s.id === c.id || windowsConflict(c, s)))
    available.sort((a, b) => Math.abs(needed - a.worker_net_cents) - Math.abs(needed - b.worker_net_cents) ||
      a.scheduled_date.localeCompare(b.scheduled_date) || a.distance_km - b.distance_km || a.id.localeCompare(b.id))
    const next = available[0]
    if (!next) break
    suggestions.push({
      ...next,
      reasons: [`Matches your ${categoryLabel(next.category).toLowerCase()} skill`,
        `About ${next.distance_km.toFixed(1)} km between area centres`,
        'Falls on an available day before your deadline'],
      schedule_note: next.time_window === 'flexible'
        ? 'Flexible timing: confirm a time within your availability. This plan reserves the whole day.'
        : 'Confirm the start time, duration and travel time with the customer before accepting.',
    })
    needed = Math.max(0, needed - next.worker_net_cents)
  }
  const planned = integerSum(suggestions.map((s) => s.worker_net_cents))
  return {
    goal,
    candidates_count: possible.length,
    suggestions,
    progress: {
      settled_cents: settled, booked_cents: booked, planned_cents: planned,
      remaining_cents: remaining,
      remaining_after_plan_cents: Math.max(0, remaining - booked - planned),
      paid_out_cents: accountSum('paid_out'),
      payout_pending_cents: accountSum('payout_pending'),
      disputed_hold_cents: accountSum('disputed_hold'),
    },
    as_of: now.toISOString(), simulation: context.simulation, memory,
    notes: [
      'Net amounts include the platform fee, but not your travel, materials or other costs.',
      'Suggested work and booked work are potential income. Only settlement ledger entries count as earned progress.',
      'Earned progress is the net change since this goal started, including refunds. It is not your available wallet balance.',
      'Times are broad windows and distances use area centres. Confirm timing and travel before accepting.',
      ...(context.truncated ? ['This shortlist uses the first 500 open jobs. Narrow your preferences if needed.'] : []),
      ...(context.bookings.some((b) => b.status === 'completed') ? ['Completed jobs awaiting settlement do not count as earned progress yet.'] : []),
      ...(context.simulation ? ['Payment simulation: no real money moves and no bank is connected.'] : []),
      ...(context.market_demo ? ['Demo account: opportunities in this plan are sample jobs.'] : []),
      ...(goal.deadline < today ? ['This goal has ended. Choose a new target and deadline to start another period.'] : []),
    ],
  }
}
