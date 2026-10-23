// Payment-provider adapters (server-only). One interface; a simulator that runs today; FNB adapters that refuse to
// operate until approved access exists. No adapter ever fabricates a provider success: the simulator's events are
// labelled `simulation: true` and every FNB call fails closed with ProviderNotEnabledError.
import { randomUUID } from 'node:crypto'
import { feeCents } from '../../../src/lib/money'
import type { ProviderEvent } from '../../../src/lib/ibanks/contracts'
import { PROVIDERS, type PayoutMethod, type ProviderId } from '../../../src/lib/payments/providers'

export class ProviderNotEnabledError extends Error {
  constructor(readonly provider: ProviderId, reason: string) {
    super(`${PROVIDERS[provider].name} is not enabled: ${reason}`)
  }
}

export interface SettlementRequest {
  workerId: string
  jobId: string
  /** The job price from the database (generated column), never from a client request. */
  grossCents: number
  paymentId: string
}

export interface PayoutRequest {
  workerId: string
  reference: string // wallet_cashouts.reference, e.g. CO-ABCDEFGH
  amountCents: number
  method: PayoutMethod
  destinationLabel: string
}

/**
 * Lifecycle: authorise (client pays) → settlement (provider confirms funds) → [client approves completion in KashWise]
 * → payout request (KashWise) → payout confirmation (provider). Each step is a separate, provider-signed event.
 */
export interface PaymentProviderAdapter {
  readonly id: ProviderId
  /** Provider-side settlement of a client's payment, reported back to KashWise as a signed event. */
  settlementEvent(req: SettlementRequest): Promise<ProviderEvent>
  /** Provider-side outcome of a payout KashWise requested. */
  payoutEvent(req: PayoutRequest, outcome: 'settled' | 'failed', failureReason?: string): Promise<ProviderEvent>
}

/** Illustrative processor cost the simulator reports so fees can be recorded separately. NOT FNB pricing. */
export const SIMULATED_PROCESSOR_FEE_BPS = 150

const baseEvent = (workerId: string): Omit<ProviderEvent, 'event_type'> => ({
  event_id: `sim_${randomUUID()}`,
  schema_version: 1,
  occurred_at: new Date().toISOString(),
  source: 'sandbox_payment_provider',
  worker_id: workerId,
  job_id: null,
  payment_id: null,
  payout_id: null,
  provider_ref: `simref_${randomUUID().slice(0, 12)}`,
  currency: 'ZAR',
  gross_cents: 0,
  marketplace_fee_cents: 0,
  processor_fee_cents: 0,
  worker_net_cents: 0,
  amount_cents: 0,
  destination_label: null,
  failure_reason: null,
  simulation: true,
})

/** The KashWise payment simulator. Fee is calculated here, server-side, from the database price. */
export class SandboxProvider implements PaymentProviderAdapter {
  readonly id = 'sandbox' as const

  async settlementEvent(req: SettlementRequest): Promise<ProviderEvent> {
    const fee = feeCents(req.grossCents)
    return {
      ...baseEvent(req.workerId),
      event_type: 'payment_settled',
      job_id: req.jobId,
      payment_id: req.paymentId,
      gross_cents: req.grossCents,
      marketplace_fee_cents: fee,
      processor_fee_cents: Math.floor((req.grossCents * SIMULATED_PROCESSOR_FEE_BPS + 5_000) / 10_000), // platform-funded
      worker_net_cents: req.grossCents - fee,
    }
  }

  async payoutEvent(req: PayoutRequest, outcome: 'settled' | 'failed', failureReason?: string): Promise<ProviderEvent> {
    return {
      ...baseEvent(req.workerId),
      event_type: outcome === 'settled' ? 'payout_settled' : 'payout_failed',
      payout_id: req.reference,
      amount_cents: req.amountCents,
      destination_label: req.destinationLabel,
      failure_reason: outcome === 'failed' ? (failureReason ?? 'Simulated provider failure').slice(0, 120) : null,
    }
  }
}

/**
 * FNB adapters. FNB's API specifications, webhook formats and pricing are provided only through onboarding
 * (Integration Channel / merchant agreements), so no request or response shapes are invented here. Each adapter
 * checks its enablement gate and then refuses: wiring the real calls is a deliberate, reviewed change.
 */
export class FnbAdapter implements PaymentProviderAdapter {
  constructor(
    readonly id: Exclude<ProviderId, 'sandbox'>,
    private readonly env: (name: string) => string | undefined,
  ) {}

  /** Live only with approved access + credentials + agreement + verified tests, all asserted explicitly. */
  enablement(): { enabled: false; missing: string[] } {
    const key = this.id.toUpperCase()
    const missing = [
      [`${key}_API_ACCESS_APPROVED`, 'approved API access'],
      [`${key}_AGREEMENT_REF`, 'signed agreement reference'],
      [`${key}_VERIFIED_TEST_RUN`, 'verified test results'],
      [`${key}_CLIENT_ID`, 'credentials'],
    ]
      .filter(([name]) => !this.env(name))
      .map(([, what]) => what)
    // Even with every gate set, the integration contract is not implemented yet: never pretend otherwise.
    return { enabled: false, missing: missing.length ? missing : ['integration contract not implemented'] }
  }

  async settlementEvent(): Promise<ProviderEvent> {
    throw new ProviderNotEnabledError(this.id, this.enablement().missing.join(', '))
  }

  async payoutEvent(): Promise<ProviderEvent> {
    throw new ProviderNotEnabledError(this.id, this.enablement().missing.join(', '))
  }
}

/** Which adapter handles a payout method. Today always the simulator; FNB routes are declared for when they are live. */
export function payoutAdapterFor(method: PayoutMethod, mode: 'sandbox' | 'fnb', env: (n: string) => string | undefined): PaymentProviderAdapter {
  if (mode === 'sandbox') return new SandboxProvider()
  const id: Exclude<ProviderId, 'sandbox'> = method === 'ewallet' ? 'fnb_ewallet' : 'fnb_payshap'
  return new FnbAdapter(id, env)
}
