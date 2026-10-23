// Payment-provider registry (browser-safe: no secrets, no endpoints). docs/PAYMENTS_FNB_INTEGRATION.md.
// KashWise never holds customer funds: a licensed provider collects, settles and pays out; KashWise records the
// lifecycle from the provider's signed events. Nothing here is a live FNB integration.

export type PayoutMethod = 'bank' | 'payshap' | 'ewallet'

export type ProviderId =
  | 'sandbox' // KashWise payment simulator: the only provider that runs today
  | 'fnb_ecommerce_gateway' // card / online payment acceptance from clients
  | 'fnb_payshap' // instant payouts to an account or ShapID
  | 'fnb_ewallet' // payouts to a cellphone number; recipient can withdraw cash
  | 'fnb_ewallet_bulk' // batched eWallet disbursements
  | 'fnb_integration_channel' // API / Host-to-Host connectivity, payment status and reconciliation

export type Capability = 'collect' | 'payout' | 'status' | 'reconciliation'

/**
 * `simulated`: runs against the KashWise simulator. `not_configured`: designed for, but no approved access yet.
 * `live` requires ALL of: approved API access, credentials, signed agreements and verified test results
 * (recorded in docs/PAYMENTS_FNB_INTEGRATION.md) — no provider is live.
 */
export type ProviderStatus = 'simulated' | 'not_configured' | 'live'

export interface ProviderInfo {
  id: ProviderId
  name: string
  capabilities: Capability[]
  payoutMethods: PayoutMethod[]
  status: ProviderStatus
  note: string
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  sandbox: {
    id: 'sandbox',
    name: 'KashWise payment simulator',
    capabilities: ['collect', 'payout', 'status', 'reconciliation'],
    payoutMethods: ['bank', 'payshap', 'ewallet'],
    status: 'simulated',
    note: 'Simulated payments. No real money moves.',
  },
  fnb_ecommerce_gateway: {
    id: 'fnb_ecommerce_gateway',
    name: 'FNB eCommerce Gateway',
    capabilities: ['collect', 'status'],
    payoutMethods: [],
    status: 'not_configured',
    note: 'Client card payments. Needs an FNB merchant agreement and gateway credentials.',
  },
  fnb_payshap: {
    id: 'fnb_payshap',
    name: 'FNB PayShap',
    capabilities: ['payout', 'status'],
    payoutMethods: ['payshap', 'bank'],
    status: 'not_configured',
    note: 'Instant payouts to a bank account or ShapID. Needs approved FNB API access.',
  },
  fnb_ewallet: {
    id: 'fnb_ewallet',
    name: 'FNB eWallet',
    capabilities: ['payout', 'status'],
    payoutMethods: ['ewallet'],
    status: 'not_configured',
    note: 'Payouts to a cellphone number, withdrawable as cash. Needs approved FNB access.',
  },
  fnb_ewallet_bulk: {
    id: 'fnb_ewallet_bulk',
    name: 'FNB eWallet Bulk Payments',
    capabilities: ['payout'],
    payoutMethods: ['ewallet'],
    status: 'not_configured',
    note: 'Batched worker payouts. Needs an FNB business banking agreement.',
  },
  fnb_integration_channel: {
    id: 'fnb_integration_channel',
    name: 'FNB Integration Channel',
    capabilities: ['status', 'reconciliation'],
    payoutMethods: [],
    status: 'not_configured',
    note: 'API or Host-to-Host connectivity for payment status and reconciliation. Needs FNB onboarding.',
  },
}

export const PAYOUT_METHOD_LABEL: Record<PayoutMethod, string> = {
  bank: 'Bank account',
  payshap: 'PayShap (instant)',
  ewallet: 'eWallet to cellphone',
}

/**
 * Per-payout limits used by KashWise. The eWallet figure follows FNB's PUBLIC consumer eWallet page (R3 000 per send
 * from the app, R5 000 maximum balance) as researched on 8 Oct 2026; business limits must come from the FNB agreement.
 */
export const PAYOUT_MAX_CENTS: Record<PayoutMethod, number> = { bank: 2_500_000, payshap: 2_500_000, ewallet: 300_000 }

/** Mask anything that identifies an account: only the last four digits are ever shown or stored by KashWise. */
export function maskDestination(method: PayoutMethod, last4: string, bankName?: string): string {
  if (!/^\d{4}$/.test(last4)) throw new RangeError('last4 must be 4 digits')
  if (method === 'ewallet') return `eWallet to cellphone ending ${last4}`
  if (method === 'payshap') return `PayShap ShapID ending ${last4}`
  return `${(bankName ?? 'Bank').trim()} ending ${last4}`
}
