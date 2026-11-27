import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, FileCheck2, Landmark, Smartphone, Store, Zap } from 'lucide-react'
import { fetchWallet, requestCashout } from '../lib/api'
import { friendlyError } from '../lib/errors'
import { timeAgo } from '../lib/format'
import {
  CASH_VOUCHER_MAX_CENTS,
  CASHOUT_MIN_CENTS,
  cashoutFee,
  EWALLET_MAX_CENTS,
  formatRand,
  randsToCents,
  type CashoutMethod,
} from '../lib/money'
import type { Cashout, WalletSummary } from '../lib/types'
import { STATEMENT_MONTHS } from '../lib/income-statement'
import { Badge, Button, ButtonLink, Card, ErrorState, Field, PageHeader, Skeleton } from '../components/ui'
import { useToast } from '../components/ui/toast'

const BANKS = ['Capitec', 'FNB', 'Standard Bank', 'Absa', 'Nedbank', 'TymeBank', 'African Bank', 'Discovery Bank', 'Other bank']
const EWALLET_PROVIDERS = ['FNB eWallet', 'Standard Bank Instant Money', 'Absa CashSend', 'Capitec Cash Send', 'Nedbank Send-iMali']
const SPAZA_VOUCHER_NETWORKS = [
  'Flash / 1Voucher (Spaza shops & retailers)',
  'Kazang Cash Voucher (Spaza shops)',
  'OTT Cash Voucher (Spaza shops)',
  'Boxer / Shoprite / Checkers / Usave Money Market',
  'Pick n Pay / PEP Cash Till',
]
const CASH_SHOPS = 'any local spaza shop with a Flash, Kazang or OTT terminal, or Boxer, Shoprite, Checkers, Usave, Pick n Pay, PEP and Spar'

function MethodOption({
  method,
  current,
  onPick,
  title,
  body,
  fee,
  icon,
}: {
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
    <label
      className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition ${
        on ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-line bg-surface hover:border-brand-500'
      }`}
    >
      <input
        type="radio"
        name="method"
        value={method}
        checked={on}
        onChange={() => onPick(method)}
        className="mt-1 size-4 accent-brand-600"
      />
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface text-brand-500 ring-1 ring-line">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold">{title}</span>
          <span className="text-xs font-semibold text-brand-500">{fee}</span>
        </span>
        <span className="mt-0.5 block text-sm text-ink-soft">{body}</span>
      </span>
    </label>
  )
}

const STATUS_BADGE = {
  processing: { tone: 'blue' as const, label: 'Processing' },
  paid: { tone: 'brand' as const, label: 'Paid out' },
  failed: { tone: 'clay' as const, label: 'Failed — money returned' },
}

function CashoutRow({ c }: { c: Cashout }) {
  const badge = STATUS_BADGE[c.status]
  return (
    <li className="card flex items-center gap-3 p-4">
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-canvas text-brand-500">
        {c.method === 'cash' ? (
          <Store className="size-5" />
        ) : c.method === 'ewallet' ? (
          <Smartphone className="size-5" />
        ) : c.method === 'payshap' || c.method === 'ozow' ? (
          <Zap className="size-5" />
        ) : (
          <Landmark className="size-5" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">
          {formatRand(c.amount_cents - c.fee_cents)}{' '}
          <span className="font-normal text-muted">· {c.destination}</span>
        </span>
        <span className="block text-xs text-muted">
          {c.reference} · {timeAgo(c.created_at)} · {c.fee_cents ? `${formatRand(c.fee_cents)} fee` : 'free cash-out'}
        </span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </span>
    </li>
  )
}

/** A provider's earnings from confirmed jobs — cashed out Mzansi-style via Spaza Shop Vouchers, eWallets, Ozow, or Bank EFT. */
export default function Wallet() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const q = useQuery({ queryKey: ['wallet'], queryFn: fetchWallet })
  const [picked, setMethod] = useState<CashoutMethod | null>(null)
  const [amount, setAmount] = useState('')
  const [bank, setBank] = useState(BANKS[0])
  const [ewalletProvider, setEwalletProvider] = useState(EWALLET_PROVIDERS[0])
  const [spazaNetwork, setSpazaNetwork] = useState(SPAZA_VOUCHER_NETWORKS[0])
  const [last4, setLast4] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Cashout | null>(null)

  if (q.isPending)
    return (
      <div className="space-y-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-72" />
      </div>
    )
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const w: WalletSummary = q.data

  // Default to Spaza shop / retailer cash voucher first — accessible to every South African worker
  const method: CashoutMethod = picked ?? 'cash'
  const isCash = method === 'cash' || method === 'ewallet'
  const cents = amount === '' ? 0 : randsToCents(Number(amount))
  const fee = cashoutFee(method, w.free_cashout_available)
  const cashLeftToday = Math.max(CASH_VOUCHER_MAX_CENTS - w.cash_today_cents, 0)
  const maxCents = isCash
    ? Math.min(w.available_cents, cashLeftToday, method === 'ewallet' ? EWALLET_MAX_CENTS : Infinity)
    : w.available_cents

  const last4Label =
    method === 'bank' || method === 'ozow'
      ? 'Last 4 digits of your bank account'
      : method === 'payshap'
        ? 'Last 4 digits of your ShapID or cellphone number'
        : 'Last 4 digits of your cellphone number (for SMS PIN)'

  const canCashOut = w.available_cents >= CASHOUT_MIN_CENTS
  const feeLabel = (m: CashoutMethod) =>
    w.free_cashout_available ? 'Free this week' : `${formatRand(cashoutFee(m, false))} fee`

  function problem(): string {
    if (!cents || Number.isNaN(cents)) return 'Enter how much you want to cash out.'
    if (cents < CASHOUT_MIN_CENTS) return 'The minimum cash-out is R50.'
    if (cents > w.available_cents) return `You can cash out up to ${formatRand(w.available_cents)}.`
    if (method === 'ewallet' && cents > EWALLET_MAX_CENTS)
      return `An eWallet payout can be at most ${formatRand(EWALLET_MAX_CENTS)}.`
    if (isCash && cents > cashLeftToday)
      return `Cash vouchers are limited to R5 000 a day. You can still take ${formatRand(cashLeftToday)} in cash today.`
    if ((method === 'bank' || method === 'ozow') && !bank) return 'Choose your bank.'
    if (method !== 'cash' && !/^\d{4}$/.test(last4)) return `Enter the ${last4Label.toLowerCase()}.`
    return ''
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const p = problem()
    setError(p)
    if (p) return
    setBusy(true)
    try {
      const selectedBankOrProvider =
        method === 'ewallet'
          ? ewalletProvider
          : method === 'cash'
            ? spazaNetwork
            : bank
      const result = await requestCashout({
        method,
        amountCents: cents,
        bankName: selectedBankOrProvider,
        accountLast4: last4 || '0000',
      })
      setDone(result)
      setAmount('')
      toast.show(`Cash-out requested: ${formatRand(result.amount_cents - result.fee_cents)} (${result.reference}).`)
      await queryClient.invalidateQueries({ queryKey: ['wallet'] })
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow="Earnings & Mzansi Payouts"
        title={
          <>
            My wallet, <em>your terms.</em>
          </>
        }
        subtitle="Withdraw your earnings via Spaza shop voucher (Flash, Kazang, OTT, 1Voucher), cellphone eWallet, Ozow instant payout, or any SA bank."
      />

      <Card className="relative overflow-hidden rounded-2xl border border-line">
        <div className="bg-deep p-6 text-white">
          <p className="text-xs font-semibold uppercase tracking-wider text-deep-ink">Available to cash out</p>
          <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight text-white sm:text-5xl">
            {formatRand(w.available_cents)}
          </p>
          <p className="mt-2 text-xs text-deep-ink/80">
            {w.free_cashout_available
              ? 'Your first cash-out this week is free.'
              : 'You have used this week’s free cash-out; the next one costs R3 (Ozow / bank) or R20 (spaza voucher / eWallet).'}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-px bg-line">
          <div className="bg-surface p-4">
            <dt className="text-xs text-ink-soft">Waiting for clients to confirm</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums text-ink">{formatRand(w.held_cents)}</dd>
          </div>
          <div className="bg-surface p-4">
            <dt className="text-xs text-muted">Earned on KashWise</dt>
            <dd className="text-lg font-semibold">{formatRand(w.earned_cents)}</dd>
          </div>
        </dl>
      </Card>

      <Card className="mt-4 p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-500">
            <FileCheck2 className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Proof of income</h2>
            <p className="mt-1 text-sm text-muted">
              No payslip? Download a signed statement of your verified KashWise earnings.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {STATEMENT_MONTHS.map((m) => (
                <ButtonLink
                  key={m}
                  to={`/wallet/statement?months=${m}`}
                  size="sm"
                  variant={m === 3 ? 'primary' : 'secondary'}
                >
                  Last {m} months
                </ButtonLink>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {done && (
        <div role="status" className="mt-4 rounded-2xl bg-brand-50 p-4 ring-1 ring-brand-100">
          <p className="flex items-center gap-2 font-semibold text-brand-300">
            <CheckCircle2 className="size-5" aria-hidden /> {formatRand(done.amount_cents - done.fee_cents)} ready ·{' '}
            {done.reference}
          </p>
          <p className="mt-1 text-sm text-brand-300">
            {done.method === 'cash'
              ? `Your SMS voucher PIN (${done.reference}) can be redeemed for cash at ${CASH_SHOPS}.`
              : done.method === 'ewallet'
                ? `Your ${ewalletProvider} payout has been sent to your cellphone. Use your SMS PIN to withdraw cash at an ATM or partner till.`
                : done.method === 'ozow'
                  ? `Your Ozow instant payout has been sent to ${done.destination}.`
                  : `Payout sent to ${done.destination}.`}
          </p>
        </div>
      )}

      {canCashOut ? (
        <form onSubmit={onSubmit} noValidate className="mt-4">
          <Card className="space-y-4 p-5">
            <h2 className="text-lg font-semibold">Cash out — Mzansi style</h2>
            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-semibold">Choose how you want to withdraw your money</legend>
              <MethodOption
                method="cash"
                current={method}
                onPick={setMethod}
                icon={<Store className="size-5" aria-hidden />}
                title="Spaza shop & retailer cash voucher (Flash · Kazang · OTT · 1Voucher)"
                fee={feeLabel('cash')}
                body={`No bank account needed. Receive an SMS voucher PIN and collect cash at ${CASH_SHOPS}.`}
              />
              <MethodOption
                method="ewallet"
                current={method}
                onPick={setMethod}
                icon={<Smartphone className="size-5" aria-hidden />}
                title="Cellphone eWallet (FNB eWallet · Instant Money · CashSend)"
                fee={feeLabel('ewallet')}
                body={`Sent straight to your SA cellphone number. Withdraw cardless cash at an ATM or spaza/retail partner. Up to ${formatRand(EWALLET_MAX_CENTS)}.`}
              />
              <MethodOption
                method="ozow"
                current={method}
                onPick={setMethod}
                icon={<Zap className="size-5" aria-hidden />}
                title="Ozow Instant Payout"
                fee={feeLabel('ozow')}
                body="Fast instant EFT payout via Ozow into your Capitec, FNB, Standard Bank, Absa, TymeBank or Nedbank account."
              />
              <MethodOption
                method="bank"
                current={method}
                onPick={setMethod}
                icon={<Landmark className="size-5" aria-hidden />}
                title="Bank account / PayShap"
                fee={feeLabel('bank')}
                body="Direct payout to any South African bank account."
              />
            </fieldset>

            {method === 'cash' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Spaza / voucher network" htmlFor="spaza-network">
                  <select
                    id="spaza-network"
                    className="input"
                    value={spazaNetwork}
                    onChange={(e) => setSpazaNetwork(e.target.value)}
                  >
                    {SPAZA_VOUCHER_NETWORKS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Last 4 digits of your cellphone"
                  htmlFor="last4-cash"
                  optional
                  hint="Where your voucher PIN SMS is sent."
                >
                  <input
                    id="last4-cash"
                    className="input"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={4}
                    placeholder="1234"
                    value={last4}
                    onChange={(e) => setLast4(e.target.value.replace(/\D/g, ''))}
                  />
                </Field>
              </div>
            )}

            {method === 'ewallet' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="eWallet service" htmlFor="ewallet-provider">
                  <select
                    id="ewallet-provider"
                    className="input"
                    value={ewalletProvider}
                    onChange={(e) => setEwalletProvider(e.target.value)}
                  >
                    {EWALLET_PROVIDERS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={last4Label} htmlFor="last4-ewallet" hint="We never ask for your PIN or password.">
                  <input
                    id="last4-ewallet"
                    className="input"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={4}
                    placeholder="1234"
                    value={last4}
                    onChange={(e) => setLast4(e.target.value.replace(/\D/g, ''))}
                  />
                </Field>
              </div>
            )}

            {(method === 'bank' || method === 'ozow') && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Bank" htmlFor="bank">
                  <select id="bank" className="input" value={bank} onChange={(e) => setBank(e.target.value)}>
                    <option value="">Choose your bank</option>
                    {BANKS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={last4Label} htmlFor="last4" hint="We never ask for your PIN or password.">
                  <input
                    id="last4"
                    className="input"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={4}
                    placeholder="1234"
                    value={last4}
                    onChange={(e) => setLast4(e.target.value.replace(/\D/g, ''))}
                  />
                </Field>
              </div>
            )}

            <Field
              label="Amount"
              htmlFor="amount"
              hint={`From R50 to ${formatRand(maxCents)}${
                method === 'cash' ? ' (spaza & retail vouchers: up to R5 000 a day)' : ''
              }.`}
            >
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute inset-y-0 left-3.5 grid place-items-center font-semibold text-muted">
                    R
                  </span>
                  <input
                    id="amount"
                    type="number"
                    inputMode="decimal"
                    min={50}
                    step={0.01}
                    className="input pl-8 text-lg font-semibold"
                    placeholder="200"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <Button variant="secondary" onClick={() => setAmount(String(maxCents / 100))}>
                  All
                </Button>
              </div>
            </Field>

            {cents >= CASHOUT_MIN_CENTS && cents > fee && (
              <p className="rounded-xl bg-canvas px-4 py-3 text-sm">
                You receive <strong>{formatRand(cents - fee)}</strong>
                {fee ? ` (${formatRand(fee)} cash-out fee)` : ' — this cash-out is free'}.
              </p>
            )}
            {error && (
              <p role="alert" className="rounded-lg bg-clay-50 px-3 py-2 text-sm font-medium text-clay-700">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" block loading={busy}>
              {
                {
                  cash: 'Send my spaza shop cash voucher',
                  ewallet: `Send to my ${ewalletProvider}`,
                  ozow: 'Withdraw via Ozow Instant Payout',
                  bank: 'Pay into my bank account',
                  payshap: 'Pay me with PayShap',
                }[method]
              }
            </Button>
          </Card>
        </form>
      ) : (
        <Card className="mt-4 p-5 text-sm text-muted">
          You can cash out from R50. When a client confirms a job, your money lands here.{' '}
          <Link to="/my-work" className="font-semibold text-brand-500 underline">
            Go to My work
          </Link>
        </Card>
      )}

      <section aria-labelledby="history-h" className="mt-6">
        <h2 id="history-h" className="mb-3 text-lg font-semibold">
          Recent cash-outs
        </h2>
        {w.cashouts.length === 0 ? (
          <p className="card p-4 text-sm text-muted">No cash-outs yet.</p>
        ) : (
          <ul className="space-y-3">
            {w.cashouts.map((c) => (
              <CashoutRow key={c.id} c={c} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
