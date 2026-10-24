import { z } from 'zod'
import { goalInputSchema } from '../../src/lib/earn-goal'
import type { GoalInput, GoalMemory } from '../../src/lib/earn-goal-types'
import { optionalEnv } from './shared'

export const memoryOff = (): GoalMemory => ({
  status: 'off', preferences: null, facts: [],
  message: 'AI memory sharing is off. Your saved goal still works without AI.',
})
const unavailable = (message = 'Local AI memory is unavailable. Your goal and job matching still work.'): GoalMemory => ({
  status: 'unavailable', preferences: null, facts: [], message,
})

async function call(path: string, method: 'POST' | 'DELETE', payload: unknown, timeout = 3000): Promise<unknown> {
  const base = optionalEnv('GRAPHITI_SERVICE_URL')
  const token = optionalEnv('GRAPHITI_SERVICE_TOKEN')
  if (!base || !token) throw new Error('Memory service is not configured')
  const url = new URL(base)
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) throw new Error('Memory service requires HTTPS')
  const response = await fetch(`${url.toString().replace(/\/$/, '')}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(timeout), redirect: 'error',
  })
  if (!response.ok) throw new Error('Memory service request failed')
  return response.json()
}

export async function rememberGoal(workerId: string, input: GoalInput): Promise<GoalMemory> {
  if (!input.memory_opt_in) return memoryOff()
  // Deliberate allowlist: no identity documents, phone, address, bank data, job text or ledger.
  const preferences = {
    target_cents: input.target_cents, deadline: input.deadline, area_slug: input.area_slug,
    weekdays: input.weekdays, time_windows: input.time_windows, radius_km: input.radius_km, skills: input.skills,
  }
  try {
    const result = await call('/v1/preferences', 'POST', { worker_id: workerId, preferences })
    if (!z.object({ status: z.literal('queued') }).safeParse(result).success) return unavailable()
    return { status: 'pending', preferences: null, facts: [], message: 'Preferences queued for local AI memory. Processing may take a few minutes.' }
  } catch {
    return unavailable()
  }
}

export async function recallGoal(workerId: string): Promise<GoalMemory> {
  try {
    const raw = await call('/v1/preferences/search', 'POST', { worker_id: workerId }, 10_000)
    // Remembered dates may be old; the user must confirm and revalidate before saving them.
    const preferences = goalInputSchema().omit({ memory_opt_in: true }).extend({
      deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    const result = z.object({
      status: z.enum(['ready', 'empty', 'pending', 'unavailable']),
      preferences: preferences.nullable(),
      facts: z.array(z.object({
        fact: z.string().max(1000), valid_at: z.string().nullable(), invalid_at: z.string().nullable(),
      })).max(30),
    }).parse(raw)
    return {
      ...result, facts: result.facts.filter((f) => !f.invalid_at).slice(0, 5),
      message: {
        ready: 'Your previous preferences are available. Review them before using them.',
        empty: 'No remembered preferences yet.',
        pending: 'Local AI is still processing your preferences. Your plan is ready to use.',
        unavailable: 'Local AI memory is unavailable. Your goal and job matching still work.',
      }[result.status],
    }
  } catch {
    return unavailable()
  }
}

export async function forgetGoal(workerId: string): Promise<GoalMemory> {
  try {
    const raw = await call('/v1/preferences', 'DELETE', { worker_id: workerId }, 10_000)
    if (!z.object({ status: z.literal('forgotten') }).safeParse(raw).success) throw new Error('Deletion not confirmed')
    return { ...memoryOff(), message: 'Your AI preference memory was deleted. Your saved goal is kept.' }
  } catch {
    return unavailable('Memory sharing is off, but deletion could not be confirmed. Use Forget memory again when the service is available.')
  }
}
