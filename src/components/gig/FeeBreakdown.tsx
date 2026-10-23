import { breakdown, formatRand, FEE_RATE_PERCENT } from '../../lib/money'

/**
 * Each side sees its own number. Client: what you pay, with nothing added. Provider: what you receive after the
 * KashWise fee, the only deduction. `counterpart` (used while posting) previews what the other side sees.
 */
export function FeeBreakdown({ payoutCents, perspective, counterpart = false }: {
  payoutCents: number
  perspective: 'customer' | 'worker'
  counterpart?: boolean
}) {
  const b = breakdown(payoutCents)
  if (perspective === 'worker') {
    return (
      <div className="rounded-xl bg-brand-50 p-4 ring-1 ring-inset ring-brand-100">
        <p className="text-sm font-semibold text-brand-800">You receive</p>
        <p className="text-3xl font-extrabold text-brand-800">{formatRand(b.workerNet)}</p>
        <p className="mt-1 text-xs text-brand-800/80">
          After KashWise’s {FEE_RATE_PERCENT}% fee ({formatRand(b.fee)}), the only deduction. No VAT is taken from your pay.
        </p>
        {counterpart && (
          <p className="mt-3 flex items-baseline justify-between gap-3 border-t border-brand-100 pt-3 text-sm text-brand-800">
            <span>Clients see</span>
            <strong className="shrink-0">{formatRand(b.price)}</strong>
          </p>
        )}
      </div>
    )
  }
  return (
    <dl className="space-y-1.5 rounded-xl bg-canvas p-4 text-sm ring-1 ring-inset ring-line" aria-label="Price breakdown">
      <div className="flex justify-between gap-3 text-base">
        <dt className="font-bold">You pay <span className="block text-xs font-normal text-muted">Nothing is added on top.</span></dt>
        <dd className="shrink-0 font-extrabold">{formatRand(b.price)}</dd>
      </div>
      {counterpart && (
        <div className="flex justify-between gap-3 border-t border-line pt-2">
          <dt>Service providers see <span className="text-xs text-muted">(after KashWise’s {FEE_RATE_PERCENT}% fee)</span></dt>
          <dd className="shrink-0 font-semibold">{formatRand(b.workerNet)}</dd>
        </div>
      )}
    </dl>
  )
}
