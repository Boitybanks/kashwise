import { z } from 'zod'
import { CATEGORIES, categoryLabel, isCategory } from './categories'
import type { CvSuggestedJob } from './cv-parser'
import type { GoalContext, GoalMemory, GoalPlan, GoalSuggestion } from './earn-goal-types'
import { workerNetCents } from './money'
import type { DiscoverGig, TimeWindow } from './types'

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

const rand = (cents: number) => `R${Math.round(cents / 100).toLocaleString('en-ZA')}`

/** The plan in one plain paragraph, built only from its figures. It never promises work: suggested jobs still need a hire. */
export function goalBrief(plan: GoalPlan, now = new Date()): string {
  const { goal, progress: p, suggestions, candidates_count } = plan
  const daysLeft = Math.round((Date.parse(`${goal.deadline}T00:00:00Z`) - Date.parse(`${southAfricaToday(now)}T00:00:00Z`)) / 86_400_000)
  if (p.remaining_cents === 0) return `You have reached your ${rand(goal.target_cents)} goal. Set a new one when you are ready.`
  if (daysLeft < 0) return `This goal has ended ${rand(p.remaining_cents)} short. Choose a new target and deadline to go again.`
  const time = daysLeft === 0 ? 'today' : daysLeft === 1 ? 'by tomorrow' : `in the next ${daysLeft} days`
  const need = `You need ${rand(p.remaining_cents)} more ${time}.`
  const booked = p.booked_cents > 0 ? ` Booked work could bring ${rand(p.booked_cents)}.` : ''
  if (suggestions.length === 0) {
    return `${need}${booked} ${p.remaining_cents > p.booked_cents ? 'No open job fits your choices right now, so try a wider area, more days or another skill.' : 'That would cover it once the work is done and paid.'}`
  }
  const jobs = `${suggestions.length} open ${suggestions.length === 1 ? 'job fits' : 'jobs fit'} your skills, area and free time, worth ${rand(p.planned_cents)} to you`
  const outcome = p.remaining_after_plan_cents > 0
    ? `That would leave you ${rand(p.remaining_after_plan_cents)} short${candidates_count > suggestions.length ? `, and ${candidates_count - suggestions.length} more ${candidates_count - suggestions.length === 1 ? 'job also fits' : 'jobs also fit'}` : ', so a wider area or more days would help'}.`
    : 'That would cover your goal if you are hired and the work is confirmed.'
  return `${need}${booked} ${jobs}. ${outcome} Start with “${suggestions[0].title}”.`
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
  // Keep matching non-conflicting jobs until the worker's remaining goal is covered (up to 10 jobs).
  while (suggestions.length < 10 && needed > 0) {
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
      'Suggested work and booked work are potential income. Only settlement ledger entries count as earned progress.',
      'Earned progress is the net change since this goal started, including refunds. It is not your available wallet balance.',
      'Times are broad windows and distances use area centres. Confirm timing and travel before accepting.',
      ...(context.truncated ? ['This shortlist uses the first 500 open jobs. Narrow your preferences if needed.'] : []),
      ...(context.bookings.some((b) => b.status === 'completed') ? ['Completed jobs awaiting settlement do not count as earned progress yet.'] : []),
      ...(goal.deadline < today ? ['This goal has ended. Choose a new target and deadline to start another period.'] : []),
    ],
  }
}

// ── iBanks CV & Goal Matching Roadmap ───────────────────────────────────────

export interface IbanksRoadmapStep {
  order: number
  id: string
  title: string
  category: string
  category_label: string
  scheduled_date: string
  time_window: TimeWindow
  worker_net_cents: number
  cumulative_cents: number
  percent_of_goal: number
  reaches_goal: boolean
  source: 'plan' | 'cv_expansion'
  note: string
}

export interface IbanksCvMixItem {
  category: string
  category_label: string
  job_title: string
  jobs_count: number
  net_per_job_cents: number
  total_net_cents: number
}

export interface IbanksGoalRoadmap {
  target_cents: number
  settled_cents: number
  booked_cents: number
  planned_cents: number
  extra_cv_cents: number
  projected_total_cents: number
  remaining_after_all_cents: number
  goal_met_by_plan: boolean
  goal_met_with_cv_expansion: boolean
  steps: IbanksRoadmapStep[]
  extra_cv_gigs: (DiscoverGig & { worker_net_cents: number; match_note: string })[]
  unselected_cv_skills: string[]
  cv_mix_to_close_gap: IbanksCvMixItem[]
  summary: string
}

/**
 * Deterministic iBanks matching roadmap:
 * 1. Traces how each matched job builds cumulative net income toward the target.
 * 2. If the strict filter leaves a shortfall, scans wider marketplace gigs matching the worker's CV skills
 *    to find additional non-conflicting jobs that close the gap.
 * 3. Computes a CV job-mix blueprint (how many jobs of each CV skill cover any remaining gap).
 */
export function buildIbanksGoalRoadmap(input: {
  targetCents: number
  deadline?: string | null
  settledCents?: number
  bookedCents?: number
  suggestions?: readonly GoalSuggestion[]
  cvSuggestedJobs: readonly CvSuggestedJob[]
  openMarketplaceGigs?: readonly DiscoverGig[]
  selectedSkills: readonly string[]
  allWorkerSkills: readonly string[]
}): IbanksGoalRoadmap {
  const targetCents = Math.max(100, Math.round(input.targetCents || 0))
  const settledCents = input.settledCents ?? 0
  const bookedCents = input.bookedCents ?? 0
  const suggestions = input.suggestions ?? []
  const allSkills = [...new Set([...input.allWorkerSkills, ...input.selectedSkills].filter(isCategory))]
  const unselectedCvSkills = allSkills.filter((s) => !input.selectedSkills.includes(s))

  const steps: IbanksRoadmapStep[] = []
  let runningCents = Math.max(0, settledCents) + Math.max(0, bookedCents)
  let crossedGoal = runningCents >= targetCents

  for (const s of suggestions) {
    runningCents += s.worker_net_cents
    const hitsNow = !crossedGoal && runningCents >= targetCents
    if (hitsNow) crossedGoal = true
    steps.push({
      order: steps.length + 1,
      id: s.id,
      title: s.title,
      category: s.category,
      category_label: categoryLabel(s.category),
      scheduled_date: s.scheduled_date,
      time_window: s.time_window,
      worker_net_cents: s.worker_net_cents,
      cumulative_cents: runningCents,
      percent_of_goal: Math.min(100, Math.round((runningCents / targetCents) * 100)),
      reaches_goal: hitsNow,
      source: 'plan',
      note: s.reasons[0] ?? `Matches your ${categoryLabel(s.category).toLowerCase()} skill`,
    })
  }

  const plannedCents = suggestions.reduce((sum, s) => sum + s.worker_net_cents, 0)
  const goalMetByPlan = runningCents >= targetCents

  // If still short, look for extra open gigs from the worker's CV skills or wider area/dates
  const extraCvGigs: (DiscoverGig & { worker_net_cents: number; match_note: string })[] = []
  let extraCvCents = 0

  if (!goalMetByPlan && input.openMarketplaceGigs && input.openMarketplaceGigs.length > 0) {
    const takenIds = new Set(suggestions.map((s) => s.id))
    const takenSlots: { scheduled_date: string; time_window: TimeWindow }[] = suggestions.map((s) => ({
      scheduled_date: s.scheduled_date,
      time_window: s.time_window,
    }))

    const pool = input.openMarketplaceGigs
      .filter((g) => !takenIds.has(g.id) && allSkills.includes(g.category))
      .map((g) => ({
        ...g,
        worker_net_cents: workerNetCents(g.payout_cents),
      }))
      .filter((g) => g.worker_net_cents > 0)

    while (runningCents < targetCents && extraCvGigs.length < 6) {
      const neededNow = targetCents - runningCents
      const available = pool.filter(
        (g) =>
          !extraCvGigs.some((x) => x.id === g.id) &&
          !takenSlots.some((slot) => windowsConflict(slot, g)),
      )
      available.sort(
        (a, b) =>
          Math.abs(neededNow - a.worker_net_cents) - Math.abs(neededNow - b.worker_net_cents) ||
          a.scheduled_date.localeCompare(b.scheduled_date) ||
          (a.distance_km ?? 99) - (b.distance_km ?? 99),
      )
      const pick = available[0]
      if (!pick) break

      const fromExtraSkill = !input.selectedSkills.includes(pick.category)
      const matchNote = fromExtraSkill
        ? `Matches ${categoryLabel(pick.category)} from your CV — add this skill to your goal filter`
        : input.deadline && pick.scheduled_date > input.deadline
          ? `Scheduled ${pick.scheduled_date} — extend your deadline to include this job`
          : `In ${pick.area_name} — widen your area or available days to include this job`

      runningCents += pick.worker_net_cents
      extraCvCents += pick.worker_net_cents
      const hitsNow = !crossedGoal && runningCents >= targetCents
      if (hitsNow) crossedGoal = true

      extraCvGigs.push({ ...pick, match_note: matchNote })
      takenSlots.push({ scheduled_date: pick.scheduled_date, time_window: pick.time_window })

      steps.push({
        order: steps.length + 1,
        id: pick.id,
        title: pick.title,
        category: pick.category,
        category_label: categoryLabel(pick.category),
        scheduled_date: pick.scheduled_date,
        time_window: pick.time_window,
        worker_net_cents: pick.worker_net_cents,
        cumulative_cents: runningCents,
        percent_of_goal: Math.min(100, Math.round((runningCents / targetCents) * 100)),
        reaches_goal: hitsNow,
        source: 'cv_expansion',
        note: matchNote,
      })
    }
  }

  const remainingAfterAllCents = Math.max(0, targetCents - runningCents)
  const goalMetWithCvExpansion = runningCents >= targetCents

  // Build CV job-mix blueprint for covering either the remaining shortfall or the full goal from CV skills
  const gapForMix = remainingAfterAllCents > 0 ? remainingAfterAllCents : Math.max(0, targetCents - Math.max(0, settledCents) - Math.max(0, bookedCents))
  const cvMix: IbanksCvMixItem[] = []
  const cvJobs = input.cvSuggestedJobs.length > 0 ? input.cvSuggestedJobs : []

  if (cvJobs.length > 0 && gapForMix > 0) {
    // Distribute across the worker's top CV job types so they see a balanced mix to hit their target
    let stillToCover = gapForMix
    const counts = new Map<string, number>()
    let safety = 0
    while (stillToCover > 0 && safety < 50) {
      for (const cj of cvJobs.slice(0, 3)) {
        if (stillToCover <= 0) break
        counts.set(cj.category, (counts.get(cj.category) ?? 0) + 1)
        stillToCover = Math.max(0, stillToCover - cj.typical_net_cents)
      }
      safety++
    }
    for (const cj of cvJobs.slice(0, 3)) {
      const count = counts.get(cj.category) ?? 0
      if (count > 0) {
        cvMix.push({
          category: cj.category,
          category_label: cj.category_label,
          job_title: cj.title,
          jobs_count: count,
          net_per_job_cents: cj.typical_net_cents,
          total_net_cents: count * cj.typical_net_cents,
        })
      }
    }
  }

  let summary = ''
  if (goalMetByPlan) {
    summary =
      steps.length === 0
        ? `Your settled and booked earnings already cover your ${rand(targetCents)} goal.`
        : `iBanks matched ${suggestions.length} open ${suggestions.length === 1 ? 'job' : 'jobs'} worth ${rand(plannedCents)} net — enough to reach 100% of your ${rand(targetCents)} goal.`
  } else if (goalMetWithCvExpansion) {
    summary = `Your strict filter covers ${rand(plannedCents)}, and iBanks found ${extraCvGigs.length} more CV-matched ${extraCvGigs.length === 1 ? 'job' : 'jobs'} (+${rand(extraCvCents)}) that bring you to ${rand(runningCents)} and meet your ${rand(targetCents)} goal.`
  } else if (cvMix.length > 0) {
    const mixParts = cvMix.map((m) => `${m.jobs_count} × ${m.job_title.toLowerCase()} (~${rand(m.total_net_cents)})`).join(' + ')
    summary =
      steps.length > 0
        ? `Open matches cover ${rand(plannedCents + extraCvCents)}. Based on your CV, you can close the remaining ${rand(remainingAfterAllCents)} gap with ${mixParts}.`
        : `Based on your extracted CV skills, iBanks worked out a practical mix to reach ${rand(targetCents)}: ${mixParts}.`
  } else {
    summary = `Add more skills from your CV or widen your area and available days so iBanks can match more jobs toward ${rand(targetCents)}.`
  }

  return {
    target_cents: targetCents,
    settled_cents: settledCents,
    booked_cents: bookedCents,
    planned_cents: plannedCents,
    extra_cv_cents: extraCvCents,
    projected_total_cents: runningCents,
    remaining_after_all_cents: remainingAfterAllCents,
    goal_met_by_plan: goalMetByPlan,
    goal_met_with_cv_expansion: goalMetWithCvExpansion,
    steps,
    extra_cv_gigs: extraCvGigs,
    unselected_cv_skills: unselectedCvSkills,
    cv_mix_to_close_gap: cvMix,
    summary,
  }
}
