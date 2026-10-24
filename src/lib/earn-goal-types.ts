import type { TimeWindow } from './types'

export type GoalWindow = Exclude<TimeWindow, 'flexible'>
export interface GoalInput {
  target_cents: number
  deadline: string
  area_slug: string
  weekdays: number[]
  time_windows: GoalWindow[]
  radius_km: number
  skills: string[]
  memory_opt_in: boolean
}
export interface GoalRecord extends GoalInput {
  id: string
  started_at: string
  updated_at: string
}
export interface GoalCandidate {
  id: string
  title: string
  category: string
  area_slug: string
  scheduled_date: string
  time_window: TimeWindow
  payout_cents: number
  fee_cents: number
  worker_net_cents: number
  distance_km: number
  is_demo: boolean
  poster_eligible: boolean
  application_status: string | null
}
export interface GoalBooking {
  id: string
  scheduled_date: string
  time_window: TimeWindow
  worker_net_cents: number
  status: 'matched' | 'in_progress' | 'completed'
}
export interface GoalContext {
  goal: GoalRecord | null
  candidates: GoalCandidate[]
  bookings: GoalBooking[]
  ledger: { account: string; amount_cents: number; occurred_at: string }[]
  simulation: boolean
  market_demo: boolean
  truncated: boolean
}
export interface GoalMemory {
  status: 'off' | 'ready' | 'empty' | 'pending' | 'unavailable'
  preferences: Omit<GoalInput, 'memory_opt_in'> | null
  facts: { fact: string; valid_at: string | null; invalid_at: string | null }[]
  message: string
}
export interface GoalSuggestion extends GoalCandidate {
  reasons: string[]
  schedule_note: string
}
export interface GoalPlan {
  goal: GoalRecord
  candidates_count: number
  suggestions: GoalSuggestion[]
  progress: {
    settled_cents: number
    booked_cents: number
    planned_cents: number
    remaining_cents: number
    remaining_after_plan_cents: number
    paid_out_cents: number
    payout_pending_cents: number
    disputed_hold_cents: number
  }
  as_of: string
  simulation: boolean
  notes: string[]
  memory: GoalMemory
}
export interface GoalResponse {
  goal: GoalRecord | null
  plan: GoalPlan | null
  memory: GoalMemory
}
