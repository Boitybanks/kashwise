export type RecoveryLink =
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'token_hash'; tokenHash: string }
  | { kind: 'error'; message: string }
  | { kind: 'none' }

/**
 * Reads a Supabase password-reset link: tokens in the #hash (default email template) or ?token_hash= (custom template).
 * The client is created with detectSessionInUrl: false, so the reset page handles this itself.
 */
export function parseRecoveryLink(hash: string, search: string): RecoveryLink {
  const h = new URLSearchParams(hash.replace(/^#/, ''))
  const q = new URLSearchParams(search)
  const error = h.get('error_code') ?? q.get('error_code') ?? h.get('error') ?? q.get('error')
  if (error) {
    return {
      kind: 'error',
      message: error === 'otp_expired' ? 'This reset link has expired or was already used.' : 'This reset link isn’t valid.',
    }
  }
  const accessToken = h.get('access_token')
  const refreshToken = h.get('refresh_token')
  if (accessToken && refreshToken && h.get('type') === 'recovery') return { kind: 'tokens', accessToken, refreshToken }
  const tokenHash = q.get('token_hash')
  if (tokenHash && q.get('type') === 'recovery') return { kind: 'token_hash', tokenHash }
  return { kind: 'none' }
}

/** True when the URL carries a password-reset link, whichever page Supabase redirected to. */
export function isRecoveryUrl(search: string, hash: string): boolean {
  const re = /(^|[?#&])type=recovery(&|$)/
  return re.test(search) || re.test(hash)
}
