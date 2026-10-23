// The iBanks journal posting rules: provider event → append-only ledger entries, exactly once.
// This is the reference implementation; supabase/migrations/*_ibanks_ledger.sql mirrors it inside one DB transaction
// and tests/ibanks-sql.test.ts checks both give identical balances for the same event stream.
import type { Account, IngestResult, LedgerEntry, ProviderEvent } from './contracts'

export type PaymentState = 'settled' | 'disputed' | 'refunded'
export type PayoutState = 'requested' | 'settled' | 'failed'

export interface LedgerState {
  seen: Set<string> // `${source}:${event_id}`
  payments: Map<string, { state: PaymentState; event: ProviderEvent }>
  payouts: Map<string, { state: PayoutState; amount: number; worker_id: string }>
  entries: LedgerEntry[]
}

export const emptyLedger = (): LedgerState => ({ seen: new Set(), payments: new Map(), payouts: new Map(), entries: [] })

function entry(e: ProviderEvent, account: Account, amount: number, reversalOf: string | null = null): LedgerEntry {
  return {
    worker_id: e.worker_id,
    job_id: e.job_id,
    payment_id: e.payment_id,
    payout_id: e.payout_id,
    event_id: e.event_id,
    account,
    amount_cents: amount,
    occurred_at: e.occurred_at,
    reversal_of: reversalOf,
  }
}

/** Balances a worker could spend: earned net, minus what is paid out, on its way out, or held by a dispute. */
export function balances(entries: readonly LedgerEntry[]) {
  const sum = (a: Account) => entries.reduce((t, x) => (x.account === a ? t + x.amount_cents : t), 0)
  const net = sum('net_earned')
  const paidOut = sum('paid_out')
  const pending = sum('payout_pending')
  const held = sum('disputed_hold')
  return {
    gross_cents: sum('gross'),
    platform_fee_cents: sum('platform_fee'),
    net_earned_cents: net,
    disputed_hold_cents: held,
    payout_pending_cents: pending,
    paid_out_cents: paidOut,
    available_cents: net - paidOut - pending - held,
  }
}
export type Balances = ReturnType<typeof balances>

/**
 * Apply one authenticated, schema-valid provider event. Mutates `state` only when the result is `posted`.
 * Duplicates, out-of-order and invalid transitions are reported, never silently applied.
 */
export function applyEvent(state: LedgerState, e: ProviderEvent): IngestResult {
  const key = `${e.source}:${e.event_id}`
  const result = (status: IngestResult['status'], reason?: string, entries: LedgerEntry[] = []): IngestResult => ({
    status,
    event_id: e.event_id,
    reason,
    entries,
  })
  if (state.seen.has(key)) return result('duplicate', 'provider event already processed')

  const pay = e.payment_id ? state.payments.get(e.payment_id) : undefined
  const workerAvailable = () => balances(state.entries.filter((x) => x.worker_id === e.worker_id)).available_cents
  let out: LedgerEntry[]
  const commit = (next: () => void) => {
    state.seen.add(key)
    next()
    state.entries.push(...out)
    return result('posted', undefined, out)
  }

  switch (e.event_type) {
    case 'payment_settled': {
      if (pay) return result('rejected', 'payment already settled by another event')
      out = [entry(e, 'gross', e.gross_cents), entry(e, 'platform_fee', e.marketplace_fee_cents), entry(e, 'net_earned', e.worker_net_cents)]
      return commit(() => state.payments.set(e.payment_id!, { state: 'settled', event: e }))
    }
    case 'payment_disputed': {
      if (!pay) return result('out_of_order', 'payment not settled yet')
      if (pay.state !== 'settled') return result('rejected', `cannot dispute a ${pay.state} payment`)
      out = [entry(e, 'disputed_hold', pay.event.worker_net_cents)]
      return commit(() => (pay.state = 'disputed'))
    }
    case 'dispute_resolved': {
      if (!pay) return result('out_of_order', 'payment not settled yet')
      if (pay.state !== 'disputed') return result('rejected', 'no open dispute on this payment')
      out = [entry(e, 'disputed_hold', -pay.event.worker_net_cents)]
      return commit(() => (pay.state = 'settled'))
    }
    case 'refund_settled':
    case 'chargeback_confirmed': {
      if (!pay) return result('out_of_order', 'payment not settled yet')
      if (pay.state === 'refunded') return result('rejected', 'payment already reversed')
      const s = pay.event
      if (e.gross_cents !== s.gross_cents || e.worker_net_cents !== s.worker_net_cents) {
        return result('rejected', 'only full reversals are supported; amounts must match the settlement')
      }
      out = [
        entry(e, 'gross', -s.gross_cents, s.event_id),
        entry(e, 'platform_fee', -s.marketplace_fee_cents, s.event_id),
        entry(e, 'net_earned', -s.worker_net_cents, s.event_id),
      ]
      // A refund ends any dispute: release the hold so it is not counted twice.
      if (pay.state === 'disputed') out.push(entry(e, 'disputed_hold', -s.worker_net_cents, s.event_id))
      return commit(() => (pay.state = 'refunded'))
    }
    case 'payout_requested': {
      if (state.payouts.has(e.payout_id!)) return result('rejected', 'payout already requested')
      if (e.amount_cents > workerAvailable()) return result('rejected', 'payout exceeds available earnings')
      out = [entry(e, 'payout_pending', e.amount_cents)]
      return commit(() => state.payouts.set(e.payout_id!, { state: 'requested', amount: e.amount_cents, worker_id: e.worker_id }))
    }
    case 'payout_settled':
    case 'payout_failed': {
      const p = state.payouts.get(e.payout_id!)
      if (!p) return result('out_of_order', 'payout not requested yet')
      if (p.worker_id !== e.worker_id || p.amount !== e.amount_cents) return result('rejected', 'payout does not match the request')
      if (p.state !== 'requested') return result('rejected', `payout already ${p.state}`)
      out =
        e.event_type === 'payout_settled'
          ? [entry(e, 'payout_pending', -p.amount), entry(e, 'paid_out', p.amount)]
          : [entry(e, 'payout_pending', -p.amount)]
      return commit(() => (p.state = e.event_type === 'payout_settled' ? 'settled' : 'failed'))
    }
  }
}
