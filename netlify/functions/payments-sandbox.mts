// POST /api/payments/sandbox  (Authorization: Bearer <Supabase access token>)
// The KashWise PAYMENT SIMULATOR, standing in for a licensed provider (e.g. FNB) until approved access exists.
// Enabled only when PAYMENTS_MODE=sandbox. It reads amounts from the database as the caller (RLS decides access),
// never from the request, and delivers signed provider events through the same pipeline as a real webhook.
//   { action: 'settle', gigId }                         client: provider settles the client's payment
//   { action: 'dispute' | 'resolve_dispute' | 'refund', gigId }   client: provider-side dispute lifecycle
//   { action: 'payout_result', reference, outcome: 'settled' | 'failed' }   worker: provider's payout outcome
import type { Config } from '@netlify/functions'
import { feeCents } from '../../src/lib/money'
import type { ProviderEvent } from '../../src/lib/ibanks/contracts'
import { SandboxProvider } from '../lib/payments/adapters'
import { httpStatusFor } from '../lib/ibanks-pipeline'
import { deliverSimulatedEvent } from '../lib/ibanks-server'
import { json, optionalEnv, safe, supabaseAs, UUID_RE } from '../lib/shared'

const provider = new SandboxProvider()

export default safe(async (req: Request) => {
  if (optionalEnv('PAYMENTS_MODE') !== 'sandbox') return json({ error: 'The payment simulator is not enabled.' }, 404)
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!jwt) return json({ error: 'Please sign in again.' }, 401)
  let body: { action?: unknown; gigId?: unknown; reference?: unknown; outcome?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid request.' }, 400)
  }

  const db = supabaseAs(jwt)
  const { data: userData, error: userError } = await db.auth.getUser(jwt)
  if (userError || !userData.user) return json({ error: 'Your session has expired. Please sign in again.' }, 401)
  const uid = userData.user.id

  let event: ProviderEvent
  if (body.action === 'payout_result') {
    if (typeof body.reference !== 'string' || !/^CO-[A-HJ-NP-Z2-9]{8}$/.test(body.reference)) return json({ error: 'Invalid payout reference.' }, 400)
    if (body.outcome !== 'settled' && body.outcome !== 'failed') return json({ error: 'Invalid outcome.' }, 400)
    const { data: c } = await db.from('wallet_cashouts').select('worker_id, reference, amount_cents, method, destination, status').eq('reference', body.reference).maybeSingle()
    if (!c || c.worker_id !== uid) return json({ error: 'Payout not found.' }, 404)
    if (c.status !== 'processing') return json({ error: `This payout is already ${c.status}.` }, 409)
    event = await provider.payoutEvent(
      { workerId: uid, reference: c.reference, amountCents: c.amount_cents, method: c.method === 'cash' ? 'ewallet' : c.method, destinationLabel: c.destination },
      body.outcome,
      body.outcome === 'failed' ? 'Simulated: recipient account could not be credited' : undefined,
    )
  } else if (['settle', 'dispute', 'resolve_dispute', 'refund'].includes(body.action as string)) {
    if (typeof body.gigId !== 'string' || !UUID_RE.test(body.gigId)) return json({ error: 'Invalid gig.' }, 400)
    const { data: g } = await db.from('gigs').select('id, customer_id, assigned_worker_id, status, payout_cents').eq('id', body.gigId).maybeSingle()
    if (!g || g.customer_id !== uid) return json({ error: 'Only the client who paid can do this.' }, 403)
    if (g.status !== 'completed' || !g.assigned_worker_id) return json({ error: 'Confirm the job is complete first.' }, 409)
    const base = await provider.settlementEvent({ workerId: g.assigned_worker_id, jobId: g.id, grossCents: g.payout_cents, paymentId: `pay_${g.id}` })
    const type = ({ settle: 'payment_settled', dispute: 'payment_disputed', resolve_dispute: 'dispute_resolved', refund: 'refund_settled' } as const)[
      body.action as 'settle' | 'dispute' | 'resolve_dispute' | 'refund'
    ]
    // A real provider retries a webhook with the SAME event id. Settlement ids are therefore stable per job, so pressing
    // "settle" again is a genuine replay: the database answers 'duplicate', credits nothing and iBanks audits it (R001).
    const eventId = body.action === 'settle' ? `sim_settle_${g.id}` : base.event_id
    event = { ...base, event_id: eventId, event_type: type, marketplace_fee_cents: feeCents(g.payout_cents) }
  } else {
    return json({ error: 'Unknown action.' }, 400)
  }

  const { ingest, insights } = await deliverSimulatedEvent(event)
  return json(
    { status: ingest.status, reason: ingest.reason ?? null, event_id: ingest.event_id, insights: insights.length, simulation: true },
    httpStatusFor(ingest.status),
  )
})

export const config: Config = { path: '/api/payments/sandbox' }
