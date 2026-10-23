import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Download, Printer, ShieldCheck, TriangleAlert } from 'lucide-react'
import { fetchIncomeStatement } from '../lib/api'
import { categoryLabel } from '../lib/categories'
import { formatDate } from '../lib/format'
import { monthName, STATEMENT_MONTHS } from '../lib/income-statement'
import { formatRand } from '../lib/money'
import { downloadSigned } from '../lib/pq/verify-client'
import { LogoMark } from '../components/layout/Logo'
import { Button, ButtonLink, DemoBadge, ErrorState, Skeleton } from '../components/ui'

/**
 * Proof of income for a worker without a payslip: signed by KashWise, printable, and checkable by anyone at /verify.
 * While payments are simulated, every copy says so in large type: it must not be mistaken for real proof of income.
 */
export default function IncomeStatement() {
  const [params, setParams] = useSearchParams()
  const asked = Number(params.get('months'))
  const months = (STATEMENT_MONTHS as readonly number[]).includes(asked) ? asked : 3
  const q = useQuery({ queryKey: ['income-statement', months], queryFn: () => fetchIncomeStatement(months), staleTime: 60_000 })

  const toolbar = (
    <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
      <Link to="/wallet" className="mr-auto inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-brand-700"><ArrowLeft className="size-4" aria-hidden /> My Wallet</Link>
      <label htmlFor="statement-months" className="sr-only">Period</label>
      <select id="statement-months" className="input w-auto py-2" value={months} onChange={(e) => setParams({ months: e.target.value })}>
        {STATEMENT_MONTHS.map((m) => <option key={m} value={m}>Last {m} months</option>)}
      </select>
      {q.data && (
        <>
          <Button variant="secondary" size="sm" onClick={() => downloadSigned(q.data, `kashwise-income-${q.data.credential.reference}.json`)}>
            <Download className="size-4" aria-hidden /> Signed copy
          </Button>
          <Button size="sm" onClick={() => window.print()}><Printer className="size-4" aria-hidden /> Print or save PDF</Button>
        </>
      )}
    </div>
  )

  if (q.isPending) {
    return <div className="mx-auto max-w-3xl">{toolbar}<Skeleton className="h-96" /></div>
  }
  if (q.isError) {
    return (
      <div className="mx-auto max-w-3xl">
        {toolbar}
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      </div>
    )
  }

  const s = q.data.credential
  const period = `${formatDate(s.period.from)} to ${formatDate(s.period.to)}`

  return (
    <div className="mx-auto max-w-3xl">
      {toolbar}
      <article aria-labelledby="statement-h" className="card relative overflow-hidden p-6 print:border-0 print:p-0 print:shadow-none sm:p-8">
        {s.payments_simulated && (
          <div role="note" className="mb-6 flex gap-3 rounded-xl border-2 border-clay-500 bg-clay-50 p-4 text-clay-700">
            <TriangleAlert className="size-6 shrink-0" aria-hidden />
            <div>
              <p className="font-extrabold uppercase tracking-wide">Simulated payments: not valid proof of income</p>
              <p className="text-sm">In this version of KashWise no real money moves. When payments go live through a licensed payment partner, this statement will show real earnings.</p>
            </div>
          </div>
        )}

        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div className="flex items-center gap-3">
            <LogoMark className="size-10" />
            <div>
              <p className="text-sm font-semibold text-muted">KashWise</p>
              <h1 id="statement-h" className="text-2xl font-extrabold">Income statement</h1>
            </div>
          </div>
          <dl className="text-right text-sm">
            <dt className="sr-only">Reference</dt><dd className="font-mono font-bold">{s.reference}</dd>
            <dt className="sr-only">Issued</dt><dd className="text-muted">Issued {formatDate(s.issued_at)}</dd>
          </dl>
        </header>

        <section className="mt-5 grid gap-4 sm:grid-cols-2" aria-label="Worker and period">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Service provider</p>
            <p className="flex flex-wrap items-center gap-2 text-lg font-bold">{s.worker.name} {s.demo_data && <DemoBadge />}</p>
            <p className="text-sm text-muted">{s.worker.area} · on KashWise since {formatDate(s.worker.member_since)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Period</p>
            <p className="text-lg font-bold">{period}</p>
            <p className="text-sm text-muted">{s.period.months} months</p>
          </div>
        </section>

        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-line sm:grid-cols-4" aria-label="Totals">
          {[
            ['Received', formatRand(s.totals.net_cents)],
            ['Average a month', formatRand(s.totals.average_monthly_net_cents)],
            ['Confirmed jobs', String(s.totals.jobs)],
            ['Different clients', String(s.totals.distinct_clients)],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-col-reverse bg-white p-4">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="text-xl font-extrabold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        <section className="mt-6" aria-labelledby="monthly-h">
          <h2 id="monthly-h" className="font-bold">Month by month</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm tabular-nums">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="py-2 font-semibold">Month</th>
                  <th className="py-2 text-right font-semibold">Jobs</th>
                  <th className="py-2 text-right font-semibold">Clients paid</th>
                  <th className="py-2 text-right font-semibold">KashWise fee (10%)</th>
                  <th className="py-2 text-right font-semibold">Received</th>
                </tr>
              </thead>
              <tbody>
                {s.monthly.map((m) => (
                  <tr key={m.month} className="border-b border-line">
                    <td className="py-2">{monthName(m.month)}</td>
                    <td className="py-2 text-right">{m.jobs}</td>
                    <td className="py-2 text-right">{formatRand(m.client_paid_cents)}</td>
                    <td className="py-2 text-right">{formatRand(m.fee_cents)}</td>
                    <td className="py-2 text-right font-bold">{formatRand(m.net_cents)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-extrabold">
                  <td className="py-2">Total</td>
                  <td className="py-2 text-right">{s.totals.jobs}</td>
                  <td className="py-2 text-right">{formatRand(s.totals.client_paid_cents)}</td>
                  <td className="py-2 text-right">{formatRand(s.totals.fee_cents)}</td>
                  <td className="py-2 text-right">{formatRand(s.totals.net_cents)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <section className="mt-6" aria-labelledby="jobs-h">
          <h2 id="jobs-h" className="font-bold">Confirmed jobs in this period</h2>
          {s.lines.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No confirmed jobs were paid out in this period.</p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr className="border-b border-line">
                    <th className="py-2 font-semibold">Paid out</th>
                    <th className="py-2 font-semibold">Job</th>
                    <th className="py-2 font-semibold">Client</th>
                    <th className="py-2 text-right font-semibold">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {s.lines.map((l, i) => (
                    <tr key={`${l.record ?? i}`} className="border-b border-line align-top">
                      <td className="py-2 whitespace-nowrap">{formatDate(l.date)}</td>
                      <td className="py-2">
                        <p className="font-semibold">{l.title}</p>
                        <p className="text-xs text-muted">{categoryLabel(l.category)} · {l.area}{l.record ? ` · record ${l.record}` : ''}</p>
                      </td>
                      <td className="py-2">{l.customer ?? '—'}</td>
                      <td className="py-2 text-right font-bold tabular-nums">{formatRand(l.net_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {s.cash_outs.count > 0 && (
            <p className="mt-3 text-sm text-muted">
              Cashed out in this period: {formatRand(s.cash_outs.amount_cents)} in {s.cash_outs.count} {s.cash_outs.count === 1 ? 'cash-out' : 'cash-outs'}
              {s.cash_outs.fee_cents ? ` (${formatRand(s.cash_outs.fee_cents)} in cash-out fees)` : ''}.
            </p>
          )}
        </section>

        <footer className="mt-8 space-y-2 border-t border-line pt-5 text-xs text-muted">
          <p className="flex items-start gap-2">
            <ShieldCheck className="size-4 shrink-0 text-brand-600" aria-hidden />
            <span>
              Signed by KashWise with ML-DSA-65 (key <code>{q.data.kid}</code>). To check it is genuine and unchanged, upload the signed copy at{' '}
              <span className="font-semibold text-ink">{s.verify_url}</span>.
            </span>
          </p>
          <p>
            Earnings are payments released to {s.worker.name.split(' ')[0]} after each client confirmed the job was done, less KashWise’s 10% fee.
            KashWise is a work marketplace, not a bank or a credit provider. The lender or landlord decides how to use this statement.
          </p>
        </footer>
      </article>
      <p className="mt-4 text-center text-sm print:hidden">
        <ButtonLink to="/wallet" variant="ghost" size="sm">Back to My Wallet</ButtonLink>
      </p>
    </div>
  )
}
