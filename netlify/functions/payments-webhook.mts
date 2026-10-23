// POST /api/payments/webhook — the ONLY way provider events enter KashWise.
// Header X-KashWise-Signature: hex HMAC-SHA256 of the raw body. Checked here (fast reject) and again in the database.
// Today only the KashWise payment simulator signs events; FNB adapters stay disabled until approved access exists.
import type { Config } from '@netlify/functions'
import { providerEventSchema } from '../../src/lib/ibanks/contracts'
import { verifyPayload } from '../lib/ibanks-signing'
import { httpStatusFor, processProviderEvent } from '../lib/ibanks-pipeline'
import { rpcAsServer } from '../lib/ibanks-server'
import { env, json, safe } from '../lib/shared'

export default safe(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const raw = await req.text()
  if (raw.length > 16_384) return json({ error: 'Payload too large' }, 413)
  const secret = env('IBANKS_PROVIDER_WEBHOOK_SECRET')
  const signature = req.headers.get('x-kashwise-signature')
  if (!verifyPayload(secret, raw, signature)) return json({ error: 'Invalid signature' }, 401)

  let parsed
  try {
    parsed = providerEventSchema.safeParse(JSON.parse(raw))
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  if (!parsed.success) return json({ error: 'Event does not match the contract', issues: parsed.error.issues.map((i) => i.message) }, 400)
  if (parsed.data.source !== 'sandbox_payment_provider') return json({ error: 'Unknown provider' }, 400)

  const { ingest } = await processProviderEvent(rpcAsServer(), secret, parsed.data, raw, signature!)
  return json({ status: ingest.status, event_id: ingest.event_id, reason: ingest.reason ?? null }, httpStatusFor(ingest.status))
})

export const config: Config = { path: '/api/payments/webhook' }
