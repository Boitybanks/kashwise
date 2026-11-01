import { breakdown, formatRand } from '../../lib/money'

/** Each side sees its own number: clients what they pay, providers what they receive. */
export function FeeBreakdown({ payoutCents, perspective, counterpart = false }: {
  payoutCents: number
  perspective: 'customer' | 'worker'
  counterpart?: boolean
}) {
  const b = breakdown(payoutCents)
  if (perspective === 'worker') {
    return (
      <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
        <p className="text-sm font-medium text-ink-soft">You receive</p>
        <p className="text-3xl font-semibold tabular-nums text-ink">{formatRand(b.workerNet)}</p>
        {counterpart && (
          <p className="mt-3 flex items-baseline justify-between gap-3 border-t border-brand-200 pt-3 text-sm text-ink">
            <span className="text-ink-soft">Clients see</span>
            <strong className="shrink-0">{formatRand(b.price)}</strong>
          </p>
        )}
      </div>
    )
  }
  return (
    <dl className="rounded-xl border border-line bg-surface p-4 text-sm" aria-label="Price">
      <div className="flex justify-between gap-3 text-base">
        <dt className="font-semibold text-ink">You pay</dt>
        <dd className="shrink-0 font-semibold tabular-nums text-ink">{formatRand(b.price)}</dd>
      </div>
    </dl>
  )
}
