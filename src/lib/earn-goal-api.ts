import { supabase } from './supabase'
import type { GoalInput, GoalMemory, GoalPlan, GoalResponse } from './earn-goal-types'

async function request<T>(method: 'GET' | 'POST' | 'DELETE', body?: GoalInput): Promise<T> {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) throw new Error('Please sign in again.')
  const response = await fetch('/api/earn-goal', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const result = await response.json().catch(() => null) as (T & { error?: string }) | null
  if (!response.ok || !result) throw new Error(result?.error ?? 'Earn My Goal is temporarily unavailable. Please try again.')
  return result
}

export const fetchEarnGoal = () => request<GoalResponse>('GET')
export const planEarnGoal = (input: GoalInput) => request<GoalPlan>('POST', input)
export const forgetEarnGoalMemory = () => request<{ memory: GoalMemory }>('DELETE')
