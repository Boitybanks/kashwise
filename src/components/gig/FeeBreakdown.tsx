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
      <div className="rounded-xl bg-[#0D9488]/15 p-4 border border-[#0D9488]/30">
        <p className="text-sm font-medium text-[#94A3B8]">You receive</p>
        <p className="text-3xl font-extrabold tabular-nums text-[#F1F5F9]">{formatRand(b.workerNet)}</p>
        <p className="mt-1 text-xs text-[#94A3B8]">
          After KashWise’s {FEE_RATE_PERCENT}% fee ({formatRand(b.fee)}), the only deduction. No VAT is taken from your pay.
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[#14B8A6]">
          <span className="size-1.5 rounded-full bg-[#14B8A6]" />
          Starter guarantee: 5% fee on first 5 jobs. Zero upfront fee — only deducted upon confirmed payout.
        </p>
        {counterpart && (
          <p className="mt-3 flex items-baseline justify-between gap-3 border-t border-[#0D9488]/30 pt-3 text-sm text-[#F1F5F9]">
            <span className="text-[#94A3B8]">Clients see</span>
            <strong className="shrink-0">{formatRand(b.price)}</strong>
          </p>
        )}
      </div>
    )
  }
  return (
    <dl className="space-y-1.5 rounded-xl bg-[#141A21] p-4 text-sm border border-[#1E293B]" aria-label="Price breakdown">
      <div className="flex justify-between gap-3 text-base">
        <dt className="font-bold text-[#F1F5F9]">You pay <span className="block text-xs font-normal text-[#94A3B8]">Nothing is added on top.</span></dt>
        <dd className="shrink-0 font-extrabold tabular-nums text-[#F1F5F9]">{formatRand(b.price)}</dd>
      </div>
      {counterpart && (
        <div className="flex justify-between gap-3 border-t border-[#1E293B] pt-2">
          <dt className="text-[#94A3B8]">Service providers see <span className="text-xs text-[#64748B]">(after KashWise’s {FEE_RATE_PERCENT}% fee)</span></dt>
          <dd className="shrink-0 font-semibold tabular-nums text-[#14B8A6]">{formatRand(b.workerNet)}</dd>
        </div>
      )}
    </dl>
  )
}
