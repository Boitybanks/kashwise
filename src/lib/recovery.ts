export type RecoveryLink =
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'token_hash'; tokenHash: string }
  | { kind: 'code'; code: string }
  | { kind: 'error'; message: string }
  | { kind: 'none' }

/**
 * Reads a Supabase password-reset link:
 * - PKCE authorization code in ?code= (standard Supabase JS v2 email flow)
 * - Tokens in #hash (default implicit template)
 * - Token hash in ?token_hash= (custom template)
 * - Errors from expired or consumed tokens
 */
export function parseRecoveryLink(hash: string, search: string): RecoveryLink {
  const h = new URLSearchParams(hash.replace(/^#/, ''))
  const q = new URLSearchParams(search)
  const error = h.get('error_code') ?? q.get('error_code') ?? h.get('error') ?? q.get('error')
  const errorDesc = h.get('error_description') ?? q.get('error_description')
  if (error || errorDesc) {
    const expired = error === 'otp_expired' || (Boolean(errorDesc) && /expired/i.test(errorDesc!))
    return {
      kind: 'error',
      message: expired ? 'This reset link has expired or was already used.' : (errorDesc || 'This reset link isn’t valid.'),
    }
  }

  const type = h.get('type') ?? q.get('type')
  if (type && type !== 'recovery') return { kind: 'none' }

  const accessToken = h.get('access_token') ?? q.get('access_token')
  const refreshToken = h.get('refresh_token') ?? q.get('refresh_token')
  if (accessToken && refreshToken) return { kind: 'tokens', accessToken, refreshToken }

  const tokenHash = q.get('token_hash') ?? h.get('token_hash') ?? q.get('token') ?? h.get('token')
  if (tokenHash) return { kind: 'token_hash', tokenHash }

  const code = q.get('code') ?? h.get('code')
  if (code) return { kind: 'code', code }

  return { kind: 'none' }
}

/** True when the URL carries a password-reset link or auth callback parameters, whichever page Supabase redirected to. */
export function isRecoveryUrl(search: string, hash: string): boolean {
  const q = new URLSearchParams(search)
  const h = new URLSearchParams(hash.replace(/^#/, ''))
  const type = q.get('type') ?? h.get('type')
  if (type && type !== 'recovery') return false
  if (type === 'recovery') return true
  if (q.has('code') || h.has('code')) return true
  if (q.has('token_hash') || h.has('token_hash')) return true
  if (h.has('access_token') && h.has('refresh_token')) return true
  if (q.has('error') || q.has('error_code') || h.has('error') || h.has('error_code')) return true
  return false
}
