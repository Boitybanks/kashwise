import { ShieldCheck } from 'lucide-react'
import { formatRand } from '../../lib/money'
import type { Transaction } from '../../lib/types'
import { Badge } from '../ui'

const statusCopy = {
  held: { tone: 'blue' as const, label: 'Authorised, not yet settled' },
  released: { tone: 'brand' as const, label: 'Settled — earned by worker' },
  refunded: { tone: 'gray' as const, label: 'Refunded' },
}

export function PaymentPanel({ txn, perspective }: { txn: Transaction; perspective: 'customer' | 'worker' }) {
  const s = statusCopy[txn.status]
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-bold">
          <ShieldCheck className="size-5 text-brand-600" aria-hidden /> KashWise protection
        </p>
        <Badge tone={s.tone}>{s.label}</Badge>
      </div>
      {perspective === 'customer' ? (
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between"><dt className="font-bold">You pay</dt><dd className="font-extrabold">{formatRand(txn.total_cents)}</dd></div>
        </dl>
      ) : (
        <p className="mt-3 text-sm">
          You receive <strong className="text-brand-700">{formatRand(txn.payout_cents)}</strong> after the {formatRand(txn.fee_cents)} KashWise fee
          {txn.status === 'held' && ' — earned once the customer confirms the job and the payment provider settles the payment.'}
          {txn.status === 'released' && ' — settled and earned. It is paid out to you when you cash out and the provider confirms the payout.'}
          {txn.status === 'refunded' && ' — the gig was cancelled.'}
        </p>
      )}
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-sun-700">Simulation — no real money moves in this version</p>
    </div>
  )
}
