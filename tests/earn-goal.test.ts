import { describe, expect, it } from 'vitest'
import { buildGoalPlan, goalInputSchema, southAfricaToday, windowsConflict } from '../src/lib/earn-goal'
import type { GoalCandidate, GoalContext, GoalMemory } from '../src/lib/earn-goal-types'

const now = new Date('2026-10-23T12:00:00Z')
const off: GoalMemory = { status: 'off', preferences: null, facts: [], message: '' }
const goal = { id: 'goal', target_cents: 90000, deadline: '2026-10-30', area_slug: 'soweto',
  weekdays: [6], time_windows: ['morning' as const, 'afternoon' as const], radius_km: 10,
  skills: ['gardening'], memory_opt_in: false, started_at: '2026-10-23T00:00:00Z', updated_at: now.toISOString() }
const job = (id: string, over: Partial<GoalCandidate> = {}): GoalCandidate => ({
  id, title: 'Tidy a garden', category: 'gardening', area_slug: 'soweto', scheduled_date: '2026-10-24',
  time_window: 'morning', payout_cents: 50000, fee_cents: 5000, worker_net_cents: 45000,
  distance_km: 2, is_demo: false, poster_eligible: true, application_status: null, ...over,
})
const context = (over: Partial<GoalContext> = {}): GoalContext => ({ goal, candidates: [], bookings: [], ledger: [], simulation: true, market_demo: false, truncated: false, ...over })

describe('Earn My Goal matching and money', () => {
  it('matches real eligible jobs even while payments are simulated and caps one compatible shortlist', () => {
    const plan = buildGoalPlan(context({ candidates: [job('a'), job('b'), job('c', { time_window: 'afternoon' })] }), off, now)
    expect(plan.suggestions.map((g) => g.id)).toEqual(['a', 'c'])
    expect(plan.progress).toMatchObject({ settled_cents: 0, booked_cents: 0, planned_cents: 90000, remaining_cents: 90000, remaining_after_plan_cents: 0 })
  })
  it('excludes wrong skills, radius, weekday, time, deadline, ineligible posters and mixed demos', () => {
    const rejected = [job('skill', { category: 'painting' }), job('far', { distance_km: 11 }),
      job('day', { scheduled_date: '2026-10-25' }), job('night', { time_window: 'evening' }),
      job('past', { scheduled_date: '2026-10-17' }), job('late', { scheduled_date: '2026-10-31' }),
      job('poster', { poster_eligible: false }), job('demo', { is_demo: true }), job('rejected', { application_status: 'rejected' })]
    expect(buildGoalPlan(context({ candidates: rejected }), off, now).suggestions).toEqual([])
    expect(buildGoalPlan(context({ market_demo: true, candidates: [job('real'), job('demo', { is_demo: true, poster_eligible: false })] }), off, now).suggestions[0].id).toBe('demo')
  })
  it('blocks booked windows and treats flexible timing as an entire reserved day', () => {
    const a = job('a')
    expect(windowsConflict(a, { ...a, time_window: 'flexible' })).toBe(true)
    const plan = buildGoalPlan(context({ candidates: [a, job('flex', { time_window: 'flexible' }), job('pm', { time_window: 'afternoon' })], bookings: [{ id: 'booked', scheduled_date: a.scheduled_date, time_window: 'morning', worker_net_cents: 10000, status: 'matched' }] }), off, now)
    expect(plan.suggestions.map((s) => s.id)).toEqual(['pm'])
    expect(plan.progress.booked_cents).toBe(10000)
  })
  it('counts only signed net ledger changes in the period and keeps payout and booking amounts separate', () => {
    const ledger = [
      { account: 'net_earned', amount_cents: 40000, occurred_at: '2026-10-23T01:00:00Z' },
      { account: 'net_earned', amount_cents: -5000, occurred_at: '2026-10-23T02:00:00Z' },
      { account: 'paid_out', amount_cents: 20000, occurred_at: '2026-10-23T03:00:00Z' },
      { account: 'net_earned', amount_cents: 999999, occurred_at: '2026-10-22T03:00:00Z' },
      { account: 'net_earned', amount_cents: 999999, occurred_at: '2026-10-24T03:00:00Z' },
    ]
    const plan = buildGoalPlan(context({ ledger, bookings: [{ id: 'done', scheduled_date: '2026-10-24', time_window: 'morning', worker_net_cents: 50000, status: 'completed' }] }), off, now)
    expect(plan.progress).toMatchObject({ settled_cents: 35000, paid_out_cents: 20000, booked_cents: 0, remaining_cents: 55000 })
    expect(plan.notes.some((n) => n.includes('awaiting settlement'))).toBe(true)
  })
  it('never invents opportunities or treats memory facts as money', () => {
    const plan = buildGoalPlan(context(), { ...off, status: 'ready', facts: [{ fact: 'Worker earned R900', valid_at: null, invalid_at: null }] }, now)
    expect(plan.suggestions).toEqual([])
    expect(plan.progress.settled_cents).toBe(0)
  })
  it('uses the SA calendar and validates cents, canonical skills and date bounds', () => {
    expect(southAfricaToday(new Date('2026-10-23T23:00:00Z'))).toBe('2026-10-24')
    const input = Object.fromEntries(Object.entries(goal).filter(([key]) => !['id', 'started_at', 'updated_at'].includes(key)))
    expect(goalInputSchema(now).safeParse(input).success).toBe(true)
    for (const bad of [{ target_cents: 1.1 }, { target_cents: 0 }, { deadline: '2026-02-31' }, { skills: ['hacking'] }, { worker_id: 'someone-else' }, { memory_opt_in: 'true' }]) {
      expect(goalInputSchema(now).safeParse({ ...input, ...bad }).success).toBe(false)
    }
  })
})
