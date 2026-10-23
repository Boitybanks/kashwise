// Turns Supabase/Postgres/network errors into sentences a user can act on.
// RPC exceptions are already written for humans (raise exception '...'), so pass those through.

interface MaybeError {
  message?: string
  code?: string
  status?: number
  name?: string
}

const FALLBACK = 'Something went wrong. Please try again.'

export function friendlyError(err: unknown): string {
  if (!err) return FALLBACK
  if (typeof err === 'string') return err
  const e = err as MaybeError
  const msg = e.message ?? ''
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'You seem to be offline. Check your connection and try again.'
  if (/rate limit/i.test(msg)) return 'Too many emails have been sent. Please wait a few minutes and try again.'
  if (/Invalid login credentials/i.test(msg)) return 'That email and password do not match. Please try again.'
  if (/JWT expired|invalid JWT|not authenticated/i.test(msg)) return 'Your session has expired. Please sign in again.'
  if (/permission denied|row-level security/i.test(msg)) return 'You do not have permission to do that.'
  if (e.code === '23514') return 'Some details are not valid. Please check the form and try again.'
  if (/violates|syntax|relation|column|function .* does not exist/i.test(msg)) return FALLBACK
  return msg || FALLBACK
}
