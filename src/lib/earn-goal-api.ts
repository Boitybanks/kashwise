import { buildGoalPlan } from './earn-goal'
import type { GoalContext, GoalInput, GoalMemory, GoalPlan, GoalResponse } from './earn-goal-types'
import { supabase } from './supabase'

const DEFAULT_MEMORY: GoalMemory = {
  status: 'off',
  preferences: null,
  facts: [],
  message: 'Your preferences are not being shared with personal memory.',
}

async function fallbackViaSupabase<T>(method: 'GET' | 'POST' | 'DELETE', body?: GoalInput): Promise<T> {
  if (method === 'DELETE') {
    const { error } = await supabase.rpc('forget_earn_goal_memory')
    if (error) throw new Error('Memory sharing could not be switched off. Please try again.')
    return { memory: { ...DEFAULT_MEMORY, message: 'Your remembered preferences have been deleted.' } } as unknown as T
  }
  if (method === 'POST' && body) {
    const saved = await supabase.rpc('save_earn_goal', { p_goal: body })
    if (saved.error) throw new Error(saved.error.message || 'Your goal could not be saved. Check your area, amount and availability.')
    const updated = await supabase.rpc('earn_goal_context')
    if (updated.error) throw new Error('Your goal was saved, but jobs could not be refreshed. Please try again.')
    return buildGoalPlan(updated.data as GoalContext, DEFAULT_MEMORY) as unknown as T
  }
  const ctxRes = await supabase.rpc('earn_goal_context')
  if (ctxRes.error) throw new Error(ctxRes.error.message || 'Earn My Goal is temporarily unavailable. Please try again.')
  const context = ctxRes.data as GoalContext
  return {
    goal: context.goal,
    plan: context.goal ? buildGoalPlan(context, DEFAULT_MEMORY) : null,
    memory: DEFAULT_MEMORY,
  } as unknown as T
}

async function request<T>(method: 'GET' | 'POST' | 'DELETE', body?: GoalInput): Promise<T> {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) throw new Error('Please sign in again.')
  try {
    const response = await fetch('/api/earn-goal', {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const result = (await response.json().catch(() => null)) as (T & { error?: string }) | null
    if (response.ok && result) return result
    // If Vite dev server returned 404 (Netlify function not running locally), fall back to direct Supabase RPC
    if (response.status === 404 && !result?.error) {
      return await fallbackViaSupabase<T>(method, body)
    }
    throw new Error(result?.error ?? 'Earn My Goal is temporarily unavailable. Please try again.')
  } catch (err) {
    if (err instanceof TypeError) {
      return await fallbackViaSupabase<T>(method, body)
    }
    throw err
  }
}

export const fetchEarnGoal = () => request<GoalResponse>('GET')
export const planEarnGoal = (input: GoalInput) => request<GoalPlan>('POST', input)
export const forgetEarnGoalMemory = () => request<{ memory: GoalMemory }>('DELETE')
