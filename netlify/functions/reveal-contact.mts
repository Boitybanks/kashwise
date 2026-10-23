// POST /api/reveal-contact { gigId }  (Authorization: Bearer <Supabase access token>)
// Decrypts the post-quantum envelopes for a gig. Authorization is enforced by Postgres RLS:
// the envelopes are read with the CALLER's JWT, so only the customer and the matched worker get rows back.
import type { Config } from '@netlify/functions'
import { decryptEnvelope, type Envelope } from '../../src/lib/pq/envelope'
import { gigAad, phoneAad } from '../../src/lib/pq/aad'
import { json, safe, seed, supabaseAs, UUID_RE } from '../lib/shared'

export default safe(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!jwt) return json({ error: 'Please sign in again.' }, 401)

  let gigId = ''
  try {
    gigId = String(((await req.json()) as { gigId?: unknown }).gigId ?? '')
  } catch {
    return json({ error: 'Invalid request.' }, 400)
  }
  if (!UUID_RE.test(gigId)) return json({ error: 'Invalid gig.' }, 400)

  const db = supabaseAs(jwt)
  const { data: userData, error: userError } = await db.auth.getUser(jwt)
  if (userError || !userData.user) return json({ error: 'Your session has expired. Please sign in again.' }, 401)
  const uid = userData.user.id

  const { data: gig } = await db.from('gigs').select('id, customer_id, assigned_worker_id, status').eq('id', gigId).maybeSingle()
  const participant = gig && (gig.customer_id === uid || gig.assigned_worker_id === uid)
  if (!gig || !participant || !gig.assigned_worker_id || !['matched', 'in_progress', 'completed'].includes(gig.status)) {
    return json({ error: 'Contact details are only shared between a customer and the worker they chose.' }, 403)
  }

  const counterpartId: string = gig.customer_id === uid ? gig.assigned_worker_id : gig.customer_id
  const [{ data: gp }, { data: pp }, { data: counterpart }] = await Promise.all([
    db.from('gig_private').select('envelope').eq('gig_id', gigId).maybeSingle(),
    db.from('profile_private').select('phone_envelope').eq('id', counterpartId).maybeSingle(),
    db.from('profiles').select('display_name').eq('id', counterpartId).maybeSingle(),
  ])

  const secretKey = seed('PQ_KEM_SECRET_SEED')
  // Decrypt each envelope independently so one bad envelope never hides the other.
  async function open<T>(envelope: unknown, aad: string): Promise<T | null> {
    if (!envelope) return null
    try {
      return await decryptEnvelope<T>(envelope as Envelope, aad, secretKey)
    } catch (e) {
      console.error('reveal-contact: envelope could not be decrypted', aad.split(':')[0], (e as Error).message)
      return null
    }
  }
  try {
    const place = await open<{ address: string | null; access_notes: string | null }>(gp?.envelope, gigAad(gigId))
    const phone = await open<{ phone: string }>(pp?.phone_envelope, phoneAad(counterpartId))
    await db.rpc('log_contact_reveal', { p_gig: gigId })
    return json({
      address: place?.address ?? null,
      access_notes: place?.access_notes ?? null,
      counterpart_name: counterpart?.display_name ?? null,
      counterpart_phone: phone?.phone ?? null,
    })
  } finally {
    secretKey.fill(0)
  }
})

export const config: Config = { path: '/api/reveal-contact' }
