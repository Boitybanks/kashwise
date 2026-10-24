import type { Config } from '@netlify/functions'
import { buildGoalPlan, goalInputSchema } from '../../src/lib/earn-goal'
import type { GoalContext, GoalInput, GoalRecord } from '../../src/lib/earn-goal-types'
import { forgetGoal, memoryOff, recallGoal, rememberGoal } from '../lib/goal-memory'
import { json, safe, supabaseAs } from '../lib/shared'

export default safe(async (req: Request) => {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return json({ error: 'Method not allowed' }, 405)
  const authorization = req.headers.get('authorization')
  if (!authorization?.match(/^Bearer\s+\S+$/i)) return json({ error: 'Please sign in again.' }, 401)
  const jwt = authorization.replace(/^Bearer\s+/i, '')
  const db = supabaseAs(jwt)
  const { data, error } = await db.auth.getUser(jwt)
  if (error || !data.user) return json({ error: 'Your session has expired. Please sign in again.' }, 401)
  const workerId = data.user.id
  let input: GoalInput | null = null
  if (req.method === 'POST') {
    try {
      const body = await req.text()
      if (body.length > 8192) return json({ error: 'Goal details are too long.' }, 400)
      const parsed = goalInputSchema().safeParse(JSON.parse(body))
      if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Check your goal details.' }, 400)
      input = parsed.data
    } catch {
      return json({ error: 'Invalid goal details.' }, 400)
    }
  }
  const contextResult = await db.rpc('earn_goal_context')
  if (contextResult.error) {
    if (contextResult.error.code === '42501') return json({ error: 'Earn My Goal is available to worker accounts.' }, 403)
    return json({ error: 'Earn My Goal is not available on this database yet.' }, 503)
  }
  let context = contextResult.data as GoalContext
  if (req.method === 'DELETE') {
    const stopped = await db.rpc('forget_earn_goal_memory')
    if (stopped.error) return json({ error: 'Memory sharing could not be switched off. Please try again.' }, 503)
    return json({ memory: await forgetGoal(workerId) })
  }
  if (input) {
    const previousOptIn = context.goal?.memory_opt_in === true
    const saved = await db.rpc('save_earn_goal', { p_goal: input })
    if (saved.error) return json({ error: 'Your goal could not be saved. Check your area, amount and availability.' }, 400)
    const updated = await db.rpc('earn_goal_context')
    if (updated.error) return json({ error: 'Your goal was saved, but jobs could not be refreshed. Please try again.' }, 503)
    context = updated.data as GoalContext
    // The stored snapshot wins if another request edited or revoked consent meanwhile.
    const stored = context.goal as GoalRecord
    const memory = stored.memory_opt_in ? await rememberGoal(workerId, stored)
      : previousOptIn ? await forgetGoal(workerId) : memoryOff()
    return json(buildGoalPlan(context, memory))
  }
  const memory = context.goal?.memory_opt_in ? await recallGoal(workerId) : memoryOff()
  return json({ goal: context.goal, plan: context.goal ? buildGoalPlan(context, memory) : null, memory })
})

export const config: Config = { path: '/api/earn-goal' }
