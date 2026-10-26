import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, FileCheck2, Landmark, Smartphone, Store, Zap } from 'lucide-react'
import { fetchWallet, requestCashout, sandboxPayment } from '../lib/api'
import { useAuth } from '../lib/auth'
import { friendlyError } from '../lib/errors'
import { timeAgo } from '../lib/format'
import { CASH_VOUCHER_MAX_CENTS, CASHOUT_MIN_CENTS, cashoutFee, EWALLET_MAX_CENTS, formatRand, randsToCents, type CashoutMethod } from '../lib/money'
import type { Cashout, WalletSummary } from '../lib/types'
import { STATEMENT_MONTHS } from '../lib/income-statement'
import { Badge, Button, ButtonLink, Card, ErrorState, Field, PageHeader, SimulationNote, Skeleton } from '../components/ui'
import { useToast } from '../components/ui/toast'

const BANKS = ['Capitec', 'FNB', 'Standard Bank', 'Absa', 'Nedbank', 'TymeBank', 'African Bank', 'Discovery Bank', 'Other bank']
const CASH_SHOPS = 'Boxer, Shoprite, Checkers, Usave, Pick n Pay, PEP, Spar and spaza shops with Flash, Kazang or OTT terminals'

function MethodOption({ method, current, onPick, title, body, fee, icon }: {
  method: CashoutMethod
  current: CashoutMethod
  onPick: (m: CashoutMethod) => void
  title: string
  body: string
  fee: string
  icon: ReactNode
}) {
  const on = method === current
  return (
    <label className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition ${on ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-line bg-surface hover:border-brand-500'}`}>
      <input type="radio" name="method" value={method} checked={on} onChange={() => onPick(method)} className="mt-1 size-4 accent-brand-600" />
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface text-brand-500 ring-1 ring-line">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold">{title}</span>
          <span className="text-xs font-semibold text-brand-700">{fee}</span>
        </span>
        <span className="mt-0.5 block text-sm text-ink-soft">{body}</span>
      </span>
    </label>
  )
}

const STATUS_BADGE = {
  processing: { tone: 'blue' as const, label: 'Processing' },
  paid: { tone: 'brand' as const, label: 'Paid out (simulation)' },
  failed: { tone: 'clay' as const, label: 'Failed — money returned' },
}

/** Payouts are 'processing' until the (simulated) payment provider confirms or fails them. */
function CashoutRow({ c, onSimulate }: { c: Cashout; onSimulate?: (outcome: 'settled' | 'failed') => void }) {
  const badge = STATUS_BADGE[c.status]
  return (
    <li className="card flex items-center gap-3 p-4">
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-canvas text-brand-700">
        {c.method === 'cash' ? <Store className="size-5" /> : c.method === 'ewallet' ? <Smartphone className="size-5" /> : c.method === 'payshap' ? <Zap className="size-5" /> : <Landmark className="size-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{formatRand(c.amount_cents - c.fee_cents)} <span className="font-normal text-muted">· {c.destination}</span></span>
        <span className="block text-xs text-muted">
          {c.reference} · {timeAgo(c.created_at)} · {c.fee_cents ? `${formatRand(c.fee_cents)} fee` : 'free cash-out'}
        </span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <Badge tone={badge.tone}>{badge.label}</Badge>
        {c.status === 'processing' && onSimulate && (
          <span className="flex gap-1" aria-label="Payment simulator">
            <button type="button" onClick={() => onSimulate('settled')} className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-brand-700 ring-1 ring-brand-100 hover:bg-brand-50">Simulate: provider pays</button>
            <button type="button" onClick={() => onSimulate('failed')} className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-clay-700 ring-1 ring-clay-100 hover:bg-clay-50">Simulate: fails</button>
          </span>
        )}
      </span>
    </li>
  )
}

/** A provider's earnings from confirmed jobs, cashed out to a bank or as a cash voucher collected at a shop. */
export default function Wallet() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const toast = useToast()
  const q = useQuery({ queryKey: ['wallet'], queryFn: fetchWallet })
  const [method, setMethod] = useState<CashoutMethod>('cash')
  const [amount, setAmount] = useState('')
  const [bank, setBank] = useState('')
  const [last4, setLast4] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Cashout | null>(null)

  if (q.isPending) return <div className="space-y-3"><Skeleton className="h-40" /><Skeleton className="h-72" /></div>
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const w: WalletSummary = q.data

  // The iBanks ledger migration adds payout_pending_cents; until then the Wallet keeps its original two methods.
  const ibanks = w.payout_pending_cents !== undefined
  const isCash = method === 'cash' || method === 'ewallet'
  const cents = amount === '' ? 0 : randsToCents(Number(amount))
  const fee = cashoutFee(method, w.free_cashout_available)
  const cashLeftToday = Math.max(CASH_VOUCHER_MAX_CENTS - w.cash_today_cents, 0)
  const maxCents = isCash ? Math.min(w.available_cents, cashLeftToday, method === 'ewallet' ? EWALLET_MAX_CENTS : Infinity) : w.available_cents
  const needsLast4 = ibanks || method === 'bank'
  const last4Label =
    method === 'bank' ? 'Last 4 digits of your account' : method === 'payshap' ? 'Last 4 digits of your ShapID or cellphone number' : 'Last 4 digits of your cellphone number'
  const canCashOut = w.available_cents >= CASHOUT_MIN_CENTS
  const feeLabel = (m: CashoutMethod) => (w.free_cashout_available ? 'Free this week' : `${formatRand(cashoutFee(m, false))} fee`)

  function problem(): string {
    if (!cents || Number.isNaN(cents)) return 'Enter how much you want to cash out.'
    if (cents < CASHOUT_MIN_CENTS) return 'The minimum cash-out is R50.'
    if (cents > w.available_cents) return `You can cash out up to ${formatRand(w.available_cents)}.`
    if (method === 'ewallet' && cents > EWALLET_MAX_CENTS) return `An eWallet payout can be at most ${formatRand(EWALLET_MAX_CENTS)}.`
    if (isCash && cents > cashLeftToday) return `Cash vouchers are limited to R5 000 a day. You can still take ${formatRand(cashLeftToday)} in cash today.`
    if (method === 'bank' && !bank) return 'Choose your bank.'
    if (needsLast4 && !/^\d{4}$/.test(last4)) return `Enter the ${last4Label.toLowerCase()}.`
    return ''
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const p = problem()
    setError(p)
    if (p) return
    setBusy(true)
    try {
      const result = await requestCashout({ method, amountCents: cents, bankName: bank, accountLast4: last4 })
      setDone(result)
      setAmount('')
      toast.show(
        result.status === 'processing'
          ? `Payout requested: ${formatRand(result.amount_cents - result.fee_cents)}. It shows as paid once the payment provider confirms it (simulation).`
          : `Cash-out sent: ${formatRand(result.amount_cents - result.fee_cents)} (simulation).`,
      )
      await queryClient.invalidateQueries({ queryKey: ['wallet'] })
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  async function simulatePayout(reference: string, outcome: 'settled' | 'failed') {
    try {
      const r = await sandboxPayment({ action: 'payout_result', reference, outcome })
      toast.show(
        r.status === 'posted'
          ? outcome === 'settled'
            ? 'The simulated provider confirmed the payout.'
            : 'The simulated provider reported a failed payout. The money is available again.'
          : `Provider event ${r.status}${r.reason ? `: ${r.reason}` : ''}`,
      )
      await queryClient.invalidateQueries({ queryKey: ['wallet'] })
      await queryClient.invalidateQueries({ queryKey: ['money'] })
    } catch (err) {
      toast.show(friendlyError(err), 'error')
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="My Wallet" subtitle="Money from confirmed jobs. Cash out to your bank, or collect cash at a shop with no bank account needed." />

      <Card className="overflow-hidden">
        <div className="bg-brand-600 p-5 text-white">
          <p className="text-sm font-semibold text-brand-100">Available to cash out</p>
          <p className="text-4xl font-extrabold">{formatRand(w.available_cents)}</p>
          <p className="mt-1 text-xs text-brand-100">
            {w.free_cashout_available ? 'Your first cash-out this week is free.' : 'You have used this week’s free cash-out; the next one costs R3 to a bank or R20 for cash.'}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-px bg-line">
          <div className="bg-surface p-4">
            <dt className="text-xs text-muted">{ibanks ? 'Waiting for payment or on hold' : 'Waiting for clients to confirm'}</dt>
            <dd className="text-lg font-extrabold">{formatRand(w.held_cents)}</dd>
          </div>
          <div className="bg-surface p-4">
            <dt className="text-xs text-muted">Earned on KashWise</dt>
            <dd className="text-lg font-extrabold">{formatRand(w.earned_cents)}</dd>
          </div>
        </dl>
      </Card>

      <Card className="mt-4 p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><FileCheck2 className="size-5" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <h2 className="font-bold">Proof of income</h2>
            <p className="mt-1 text-sm text-muted">
              No payslip? Get a statement of what you earned from confirmed jobs, month by month, signed by KashWise so a lender,
              landlord or employer can check it is genuine.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {STATEMENT_MONTHS.map((m) => (
                <ButtonLink key={m} to={`/wallet/statement?months=${m}`} size="sm" variant={m === 3 ? 'primary' : 'secondary'}>Last {m} months</ButtonLink>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {done && (
        <div role="status" className="mt-4 rounded-2xl bg-brand-50 p-4 ring-1 ring-brand-100">
          <p className="flex items-center gap-2 font-bold text-brand-800"><CheckCircle2 className="size-5" aria-hidden /> {formatRand(done.amount_cents - done.fee_cents)} on its way · {done.reference}</p>
          <p className="mt-1 text-sm text-brand-800">
            {done.method === 'cash'
              ? `In the live version you get an SMS with a voucher number. Take it to ${CASH_SHOPS}, and enter your PIN at the till to collect your cash.`
              : `In the live version our licensed payment partner sends this to ${done.destination}.`}
          </p>
        </div>
      )}

      {canCashOut ? (
        <form onSubmit={onSubmit} noValidate className="mt-4">
          <Card className="space-y-4 p-5">
            <h2 className="text-lg font-bold">Cash out</h2>
            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-semibold">How do you want your money?</legend>
              <MethodOption method="cash" current={method} onPick={setMethod} icon={<Store className="size-5" aria-hidden />} title="Cash at a shop" fee={feeLabel('cash')}
                body={`No bank account needed. Get an SMS voucher and collect cash with your PIN at ${CASH_SHOPS}.`} />
              {ibanks && (
                <>
                  <MethodOption method="payshap" current={method} onPick={setMethod} icon={<Zap className="size-5" aria-hidden />} title="PayShap (instant)" fee={feeLabel('payshap')}
                    body="Instant payment to a bank account or ShapID. Simulated: no PayShap connection exists yet." />
                  <MethodOption method="ewallet" current={method} onPick={setMethod} icon={<Smartphone className="size-5" aria-hidden />} title="eWallet to my cellphone" fee={feeLabel('ewallet')}
                    body={`Money sent to your cellphone number, withdrawable as cash. Up to ${formatRand(EWALLET_MAX_CENTS)}. Simulated: no eWallet connection exists yet.`} />
                </>
              )}
              <MethodOption method="bank" current={method} onPick={setMethod} icon={<Landmark className="size-5" aria-hidden />} title="My bank account" fee={feeLabel('bank')}
                body="Any South African bank account. Some banks, such as TymeBank, open a free account with just your ID at kiosks in Boxer and Pick n Pay." />
            </fieldset>

            {method === 'bank' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Bank" htmlFor="bank">
                  <select id="bank" className="input" value={bank} onChange={(e) => setBank(e.target.value)}>
                    <option value="">Choose your bank</option>
                    {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </Field>
                <Field label="Last 4 digits of your account" htmlFor="last4" hint="We never ask for your PIN or password.">
                  <input id="last4" className="input" inputMode="numeric" autoComplete="off" maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ''))} />
                </Field>
              </div>
            )}
            {method !== 'bank' && needsLast4 && (
              <Field label={last4Label} htmlFor="last4b" hint="Only the last 4 digits are kept. We never ask for your PIN or password.">
                <input id="last4b" className="input" inputMode="numeric" autoComplete="off" maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ''))} />
              </Field>
            )}

            <Field label="Amount" htmlFor="amount" hint={`From R50 to ${formatRand(maxCents)}${method === 'cash' ? ' (cash vouchers: up to R5 000 a day)' : ''}.`}>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute inset-y-0 left-3.5 grid place-items-center font-bold text-muted">R</span>
                  <input id="amount" type="number" inputMode="decimal" min={50} step={0.01} className="input pl-8 text-lg font-bold" placeholder="200"
                    value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <Button variant="secondary" onClick={() => setAmount(String(maxCents / 100))}>All</Button>
              </div>
            </Field>

            {cents >= CASHOUT_MIN_CENTS && cents > fee && (
              <p className="rounded-xl bg-canvas px-4 py-3 text-sm">
                You receive <strong>{formatRand(cents - fee)}</strong>{fee ? ` (${formatRand(fee)} cash-out fee)` : ' — this cash-out is free'}.
              </p>
            )}
            {error && <p role="alert" className="rounded-lg bg-clay-50 px-3 py-2 text-sm font-medium text-clay-700">{error}</p>}
            <Button type="submit" size="lg" block loading={busy}>
              {{ cash: 'Send me a cash voucher', bank: 'Pay into my bank account', payshap: 'Pay me with PayShap', ewallet: 'Send to my eWallet' }[method]}
            </Button>
          </Card>
        </form>
      ) : (
        <Card className="mt-4 p-5 text-sm text-muted">
          You can cash out from R50. When a client confirms a job, your money lands here. <Link to="/my-work" className="font-semibold text-brand-700 underline">Go to My work</Link>
        </Card>
      )}

      <section aria-labelledby="history-h" className="mt-6">
        <h2 id="history-h" className="mb-3 text-lg font-bold">Recent cash-outs</h2>
        {w.cashouts.length === 0 ? (
          <p className="card p-4 text-sm text-muted">No cash-outs yet.</p>
        ) : (
          <ul className="space-y-3">{w.cashouts.map((c) => <CashoutRow key={c.id} c={c} onSimulate={ibanks ? (o) => simulatePayout(c.reference, o) : undefined} />)}</ul>
        )}
      </section>

      <div className="mt-6 space-y-3">
        {profile?.is_demo && (
          <p className="rounded-lg bg-sun-50 px-3 py-2 text-xs font-medium text-sun-700 ring-1 ring-inset ring-sun-100">
            <strong>Shared demo account.</strong> Cash-outs reset after 30 minutes so the next person can try.
          </p>
        )}
        <SimulationNote>No real money moves. In the live version a licensed banking partner holds your earnings and sends each payout; KashWise never holds your money itself.</SimulationNote>
      </div>
    </div>
  )
}
