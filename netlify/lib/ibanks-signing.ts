// HMAC-SHA256 signing for server → database calls (provider events, worker context, dispatch results).
// The same secret lives in Supabase Vault ('ibanks_provider_webhook_secret'), where the database verifies it.
// Server-only: never import this from src/ (it would put the secret's use next to the browser bundle).
import { createHmac, timingSafeEqual } from 'node:crypto'

export function signPayload(secret: string, payload: string): string {
  if (secret.length < 32) throw new Error('IBANKS_PROVIDER_WEBHOOK_SECRET must be at least 32 characters')
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex')
}

export function verifyPayload(secret: string, payload: string, signature: string | null): boolean {
  if (!signature || !/^[0-9a-f]{64}$/.test(signature)) return false
  const expected = Buffer.from(signPayload(secret, payload), 'hex')
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'))
}

/** A signed JSON body: the exact string that was signed is what is sent, so verification never depends on re-serialising. */
export function signed(secret: string, body: unknown): { p_payload: string; p_signature: string } {
  const p_payload = JSON.stringify(body)
  return { p_payload, p_signature: signPayload(secret, p_payload) }
}
