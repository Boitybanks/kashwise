// Scheduled iBanks outbox worker (every 5 minutes). Dispatches posted events that no request handled: payout requests
// that KashWise posts inside the database, and any dispatch that failed after its event was posted.
// No user input reaches this function; it authenticates to the database with the Vault-held HMAC secret.
import type { Config } from '@netlify/functions'
import { drainOutbox } from '../lib/ibanks-pipeline'
import { rpcAsServer } from '../lib/ibanks-server'
import { env } from '../lib/shared'

export default async () => {
  const result = await drainOutbox(rpcAsServer(), env('IBANKS_PROVIDER_WEBHOOK_SECRET'))
  // Counts and outbox keys only: no amounts or personal data in logs.
  console.log(JSON.stringify({ ibanks_outbox: { claimed: result.claimed, dispatched: result.dispatched, failed: result.failed.length } }))
}

export const config: Config = { schedule: '*/5 * * * *' }
