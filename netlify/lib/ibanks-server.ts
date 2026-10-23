// Netlify-side wiring for the iBanks pipeline (kept outside netlify/functions so it is not deployed as a function).
import type { ProviderEvent } from '../../src/lib/ibanks/contracts'
import { processProviderEvent, type Rpc } from './ibanks-pipeline'
import { signPayload } from './ibanks-signing'
import { env, supabaseAs } from './shared'

/** Signed RPCs use only the publishable key: the HMAC secret (also held in Supabase Vault) authenticates them. */
export function rpcAsServer(): Rpc {
  const db = supabaseAs(null)
  return async (fn, args) => {
    const { data, error } = await db.rpc(fn, args)
    if (error) throw new Error(`${fn}: ${error.message}`)
    return data
  }
}

/** The simulator delivers its event exactly as a provider webhook would: signed, then through the same pipeline. */
export async function deliverSimulatedEvent(event: ProviderEvent) {
  const secret = env('IBANKS_PROVIDER_WEBHOOK_SECRET')
  const raw = JSON.stringify(event)
  return processProviderEvent(rpcAsServer(), secret, event, raw, signPayload(secret, raw))
}
