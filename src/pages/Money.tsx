// KashWise Money, powered by iBanks. Every figure comes from the worker's own ledger rows (RLS) via the same
// deterministic engine the server uses; nothing here is typed into the screen. docs/IBANKS_ARCHITECTURE.md.
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Bell, Clock, PiggyBank, Send, ShieldCheck, Sparkles, Wallet as WalletIcon } from 'lucide-react'
import { askIbanks, fetchIbanksDiagnostics, fetchMoney, insightFeedback, saveIbanksPreferences, type AskIbanksResponse, type MoneyData } from '../lib/api'
import { useAuth } from '../lib/auth'
import { friendlyError } from '../lib/errors'
import { formatDate, formatDay } from '../lib/format'
import { formatRand } from '../lib/money'
import { categoryLabel } from '../lib/categories'
import { earningsIntelligence, type EarningsIntelligence } from '../lib/ibanks/analytics'
import { SCOPE_LABEL, type LedgerEntry, type Provenance } from '../lib/ibanks/contracts'
import type { Insight } from '../lib/ibanks/orchestrator'
import { OUTLOOK_METHOD_LABEL } from '../lib/ibanks/forecast'
import { MAX_ALLOCATION_BPS, retirementProjection, savingsScenario } from '../lib/ibanks/savings'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui'
import { useToast } from '../components/ui/toast'

const TABS = ['Overview', 'Earnings', 'Insights', 'Goals', 'History'] as const
type Tab = (typeof TABS)[number]

const PROVENANCE: Record<Provenance, { label: string; tone: 'brand' | 'blue' | 'sun' | 'gray' }> = {
  system_verified: { label: 'System-verified', tone: 'brand' },
  user_provided: { label: 'User-provided', tone: 'blue' },
  estimated: { label: 'Estimated', tone: 'gray' },
  simulated: { label: 'Simulated', tone: 'sun' },
}
function Prov({ kind }: { kind: Provenance }) {
  return <Badge tone={PROVENANCE[kind].tone}>{PROVENANCE[kind].label}</Badge>
}

function Stat({ label, cents, hint, icon, prov = 'system_verified' }: { label: string; cents: number; hint: string; icon: ReactNode; prov?: Provenance }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="grid size-9 place-items-center rounded-lg bg-brand-50 text-brand-700" aria-hidden>{icon}</span>
        <Prov kind={prov} />
      </div>
      <p className="mt-3 text-sm font-semibold text-muted">{label}</p>
      <p className="text-2xl font-extrabold">{formatRand(cents)}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </Card>
  )
}

const severityTone = { info: 'brand', low: 'gray', medium: 'sun', high: 'clay' } as const

function InsightCard({ insight, onFeedback }: { insight: Insight & { id?: string }; onFeedback?: (status: 'dismissed' | null, helpful: boolean | null) => void }) {
  const risk = insight.kind.startsWith('risk:')
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${risk ? 'bg-sun-50 text-sun-700' : 'bg-brand-50 text-brand-700'}`} aria-hidden>
          {risk ? <AlertTriangle className="size-5" /> : <Bell className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold">{insight.title}</p>
            <Badge tone={severityTone[insight.severity]}>{risk ? 'Protection' : 'Update'}</Badge>
          </div>
          <p className="mt-1 text-sm">{insight.body}</p>
          <p className="mt-2 text-xs text-muted">
            {insight.scope} · as of {formatDate(insight.data_as_of)} · from {insight.source_event_ids.length} verified {insight.source_event_ids.length === 1 ? 'event' : 'events'}
          </p>
          {onFeedback && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={() => onFeedback(null, true)}>Helpful</Button>
              <Button size="sm" variant="ghost" onClick={() => onFeedback(null, false)}>Not helpful</Button>
              <Button size="sm" variant="ghost" onClick={() => onFeedback('dismissed', null)}>Dismiss</Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

const EXAMPLES = ['How much did I make this week?', 'Why is my payout pending?', 'Which gigs pay me best?', 'How much might I save?', 'What if next week is slow?', 'Show my proof of income']

function AskIbanks() {
  const [question, setQuestion] = useState('')
  const ask = useMutation({ mutationFn: (q: string) => askIbanks(q) })
  const submit = (q: string) => {
    if (!q.trim()) return
    setQuestion(q)
    ask.mutate(q.trim())
  }
  const a: AskIbanksResponse | undefined = ask.data
  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-2 text-lg font-extrabold"><Sparkles className="size-5 text-brand-600" aria-hidden /> Ask iBanks</h2>
      <p className="text-sm text-muted">Answers come from your verified KashWise records. iBanks explains; it cannot move money.</p>
      <form className="mt-3 flex gap-2" onSubmit={(e: FormEvent) => { e.preventDefault(); submit(question) }}>
        <label htmlFor="ask" className="sr-only">Your question</label>
        <input id="ask" value={question} maxLength={500} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about your earnings…" className="input min-h-11 flex-1 rounded-xl border border-line px-3" />
        <Button type="submit" disabled={ask.isPending} aria-label="Ask"><Send className="size-4" aria-hidden /></Button>
      </form>
      <div className="mt-2 flex flex-wrap gap-2">
        {EXAMPLES.map((q) => (
          <button key={q} type="button" onClick={() => submit(q)} className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink-soft hover:border-brand-200 hover:bg-brand-50">{q}</button>
        ))}
      </div>
      <div aria-live="polite">
        {ask.isPending && <Skeleton className="mt-3 h-16" />}
        {ask.error && <p className="mt-3 text-sm text-clay-700">{friendlyError(ask.error)}</p>}
        {a && !ask.isPending && (
          <div className="mt-3 rounded-xl bg-canvas p-4">
            <p>{a.answer}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <Badge tone={a.answered_by === 'ai' ? 'blue' : 'brand'}>{a.answered_by === 'ai' ? 'Phrased by AI · figures checked' : 'iBanks rules'}</Badge>
              <span>As of {formatDate(a.as_of)}</span>
              <span>· {a.source_refs.length} source {a.source_refs.length === 1 ? 'record' : 'records'}</span>
            </div>
            {a.limitations.length > 0 && <p className="mt-1 text-xs text-muted">{a.limitations.join(' · ')}</p>}
            {a.assumptions.length > 0 && <p className="mt-1 text-xs text-muted">Assumes: {a.assumptions.join('; ')}</p>}
          </div>
        )}
      </div>
    </Card>
  )
}

function Overview({ intel, insights }: { intel: EarningsIntelligence; insights: Insight[] }) {
  const L = intel.lifetime
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Earned this week" cents={intel.this_week.net_earned_cents} hint={`${intel.this_week.settled_jobs} settled ${intel.this_week.settled_jobs === 1 ? 'job' : 'jobs'}, after fees`} icon={<ArrowUpRight className="size-5" />} />
        <Stat label="Earned, not yet paid out" cents={L.available_cents} hint="Available to cash out" icon={<WalletIcon className="size-5" />} />
        <Stat label="Payout on its way" cents={L.payout_pending_cents} hint="Waiting for the payment provider" icon={<Clock className="size-5" />} />
        <Stat label="Paid out to you" cents={L.paid_out_cents} hint="Confirmed by the payment provider" icon={<ArrowDownRight className="size-5" />} />
      </div>
      {L.disputed_hold_cents > 0 && (
        <p className="rounded-xl bg-sun-50 p-3 text-sm text-sun-700 ring-1 ring-inset ring-sun-100">
          {formatRand(L.disputed_hold_cents)} is on hold while a client dispute is resolved.
        </p>
      )}
      {insights.slice(0, 2).map((i) => <InsightCard key={`${i.kind}:${i.source_event_ids[0]}`} insight={i} />)}
      <AskIbanks />
    </div>
  )
}

function Earnings({ intel }: { intel: EarningsIntelligence }) {
  const diff = intel.this_week.net_earned_cents - intel.last_week.net_earned_cents
  const max = Math.max(1, ...intel.weeks.map((w) => w.net_cents))
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="This week (net)" cents={intel.this_week.net_earned_cents} hint={`${diff >= 0 ? '+' : '−'}${formatRand(Math.abs(diff))} vs last week`} icon={<ArrowUpRight className="size-5" />} />
        <Stat label="This month (net)" cents={intel.this_month.net_earned_cents} hint={`Clients paid ${formatRand(intel.this_month.gross_cents)}; fees ${formatRand(intel.this_month.platform_fee_cents)}`} icon={<PiggyBank className="size-5" />} />
        <Stat label="All time (net)" cents={intel.lifetime.net_earned_cents} hint={`${intel.lifetime.settled_jobs} settled jobs · KashWise fee 10%`} icon={<ShieldCheck className="size-5" />} />
      </div>

      <Card className="p-4">
        <h2 className="font-extrabold">Weekly net earnings</h2>
        <p className="text-xs text-muted">Weeks run Monday to Sunday, South African time. Weeks with no settled jobs count as R0.</p>
        {intel.weeks.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No settled earnings yet.</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {intel.weeks.slice(-8).map((w) => (
              <li key={w.week_start} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 text-muted">{formatDay(new Date(Date.parse(w.week_start) + 2 * 3600_000).toISOString().slice(0, 10))}{w.complete ? '' : ' (now)'}</span>
                <span className="h-3 flex-1 rounded-full bg-canvas" aria-hidden>
                  <span className="block h-3 rounded-full bg-brand-600" style={{ width: `${(w.net_cents / max) * 100}%` }} />
                </span>
                <span className="w-20 text-right font-semibold">{formatRand(w.net_cents)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <h2 className="font-extrabold">Best-paying work</h2>
          {intel.by_category.length === 0 ? <p className="mt-2 text-sm text-muted">Nothing settled yet.</p> : (
            <ul className="mt-2 space-y-1 text-sm">
              {intel.by_category.map((c) => (
                <li key={c.category} className="flex justify-between"><span>{categoryLabel(c.category)} · {c.jobs} {c.jobs === 1 ? 'job' : 'jobs'}</span><strong>{formatRand(c.net_cents)}</strong></li>
              ))}
            </ul>
          )}
        </Card>
        <Outlook intel={intel} />
      </div>
      <Patterns intel={intel} />
    </div>
  )
}

function Outlook({ intel }: { intel: EarningsIntelligence }) {
  const o = intel.outlook
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2"><h2 className="font-extrabold">Looking ahead</h2><Prov kind="estimated" /></div>
      {o.kind === 'insufficient_history' ? (
        <p className="mt-2 text-sm">
          <strong>Not enough data to forecast reliably.</strong> You have {o.complete_weeks} of the {o.needed_weeks} complete weeks iBanks needs. It shows what is known instead of guessing.
        </p>
      ) : (
        <div className="mt-2 space-y-2 text-sm">
          <dl className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-canvas p-3">
              <dt className="text-xs text-muted">Next 7 days</dt>
              <dd className="font-extrabold">{formatRand(o.next_7_days.low_cents)} – {formatRand(o.next_7_days.high_cents)}</dd>
              <dd className="text-xs text-muted">about {formatRand(o.next_7_days.central_cents)}</dd>
            </div>
            <div className="rounded-xl bg-canvas p-3">
              <dt className="text-xs text-muted">Next 30 days</dt>
              <dd className="font-extrabold">{formatRand(o.next_30_days.low_cents)} – {formatRand(o.next_30_days.high_cents)}</dd>
              <dd className="text-xs text-muted">about {formatRand(o.next_30_days.central_cents)}</dd>
            </div>
          </dl>
          <p>
            Confidence: <strong>{o.confidence}</strong>, from {o.basis_weeks} complete weeks{o.zero_weeks_in_basis > 0 ? ` (${o.zero_weeks_in_basis} with no income)` : ''}.
            {o.backtest
              ? ` Tested on ${o.backtest.tests} past ${o.backtest.tests === 1 ? 'week' : 'weeks'}: off by ${formatRand(o.backtest.mean_abs_error_cents)} on average; ${Math.round(o.backtest.coverage_bps / 100)}% of them landed inside the range.`
              : ' Not yet tested against past weeks.'}
          </p>
          <p className="text-xs text-muted">An estimate, not a guarantee. Plan with the lower figure. Method: {OUTLOOK_METHOD_LABEL}.</p>
        </div>
      )}
      {intel.volatility_bps != null && <p className="mt-2 text-xs text-muted">Income varies by about {Math.round(intel.volatility_bps / 100)}% from week to week.</p>}
    </Card>
  )
}

function Patterns({ intel }: { intel: EarningsIntelligence }) {
  const p = intel.patterns
  const s = p.suggestion
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2"><h2 className="font-extrabold">Earning power</h2><Prov kind="system_verified" /></div>
      {s.kind === 'too_early' ? (
        <p className="mt-2 text-sm">Too early to see a pattern: {s.paid_jobs} of the {s.needed_jobs} paid jobs iBanks needs.</p>
      ) : (
        <p className="mt-2 text-sm">
          {s.jobs} of your {s.of_jobs} paid jobs were <strong>{categoryLabel(s.category).toLowerCase()}</strong>, averaging {formatRand(s.avg_net_per_job_cents)} net per job.
          {s.busiest_weekday && <> Most paid jobs were completed on a {s.busiest_weekday} ({s.weekday_jobs} of {p.weekday_sample}).</>}
          <span className="block text-xs text-muted">A pattern in your history, not a promise of future work.</span>
        </p>
      )}
      {p.categories.length > 0 && (
        <table className="mt-3 w-full text-sm">
          <caption className="sr-only">Paid jobs by kind of work</caption>
          <thead className="text-left text-xs text-muted"><tr><th className="py-1">Work</th><th className="py-1 text-right">Paid jobs</th><th className="py-1 text-right">Avg net / job</th></tr></thead>
          <tbody>
            {p.categories.map((c) => (
              <tr key={c.category} className="border-t border-line"><td className="py-1">{categoryLabel(c.category)}</td><td className="py-1 text-right">{c.jobs}</td><td className="py-1 text-right font-semibold">{formatRand(c.avg_net_per_job_cents)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      {p.repeat_clients > 0 && <p className="mt-2 text-xs text-muted">{p.repeat_clients} {p.repeat_clients === 1 ? 'client has' : 'clients have'} hired you more than once.</p>}
    </Card>
  )
}

function Diagnostics() {
  const [open, setOpen] = useState(false)
  const q = useQuery({ queryKey: ['ibanks-diagnostics'], queryFn: fetchIbanksDiagnostics, enabled: open })
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-extrabold">How iBanks decided</h2>
          <p className="text-xs text-muted">Read-only audit of the events, rules and policy checks behind your insights. Only your own records.</p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? 'Hide' : 'Show audit trail'}</Button>
      </div>
      {open && q.isLoading && <Skeleton className="mt-3 h-24" />}
      {open && q.error && <p className="mt-3 text-sm text-clay-700">{friendlyError(q.error)}</p>}
      {open && q.data && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted">{q.data.ledger_entries} ledger entries · {q.data.events.length} recent provider events · as of {formatDate(q.data.as_of)}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <caption className="sr-only">iBanks decisions, newest first</caption>
              <thead className="text-left text-muted"><tr><th className="p-1">When</th><th className="p-1">Event</th><th className="p-1">Rule</th><th className="p-1">Action</th><th className="p-1">Policy</th></tr></thead>
              <tbody>
                {q.data.decisions.map((d, n) => (
                  <tr key={n} className="border-t border-line align-top">
                    <td className="p-1 whitespace-nowrap">{formatDate(d.at)}</td>
                    <td className="p-1 font-mono">{d.trigger_event_id}<span className="block font-sans text-muted">{d.ingest_status}</span></td>
                    <td className="p-1 font-mono">{d.rule_id ? `${d.rule_id} v${d.rule_version}` : '—'}</td>
                    <td className="p-1">{d.proposed_action}</td>
                    <td className="p-1">{d.policy_outcome}<span className="block text-muted">{d.policy_version}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  )
}

function Goals({ net, paidOut, prefs }: { net: number; paidOut: number; prefs: MoneyData['preferences'] }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [savings, setSavings] = useState(prefs?.savings_bps ?? 500)
  const [retire, setRetire] = useState(prefs?.retirement_bps ?? 200)
  const [ai, setAi] = useState(prefs?.ai_explanations_opt_in ?? false)
  const s = savingsScenario({ netCents: net, savingsBps: savings, retirementBps: retire, paidOutCents: paidOut })
  const save = useMutation({
    mutationFn: () => saveIbanksPreferences(savings, retire, ai),
    onSuccess: () => { toast.show('Goals saved. Nothing will be deducted.'); qc.invalidateQueries({ queryKey: ['money'] }) },
    onError: (e) => toast.show(friendlyError(e), 'error'),
  })
  const slider = (id: string, label: string, value: number, set: (n: number) => void) => (
    <label htmlFor={id} className="block">
      <span className="flex justify-between text-sm font-semibold"><span>{label}</span><span>{value / 100}%</span></span>
      <input id={id} type="range" min={0} max={MAX_ALLOCATION_BPS} step={50} value={value} onChange={(e) => set(Number(e.target.value))} className="mt-1 w-full accent-brand-600" />
    </label>
  )
  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-2"><h2 className="font-extrabold">Savings scenario</h2><Prov kind="simulated" /></div>
        <p className="text-sm text-muted">Explore setting aside part of your net earnings. <strong>This is a simulation: no money is moved or deducted.</strong></p>
        {slider('sav', 'Emergency savings (easy to reach)', savings, setSavings)}
        {slider('ret', 'Retirement goal (long-term)', retire, setRetire)}
        <dl className="grid grid-cols-3 gap-2 rounded-xl bg-canvas p-3 text-center text-sm">
          <div><dt className="text-muted">Savings</dt><dd className="text-lg font-extrabold">{formatRand(s.savings_cents)}</dd></div>
          <div><dt className="text-muted">Retirement</dt><dd className="text-lg font-extrabold">{formatRand(s.retirement_cents)}</dd></div>
          <div><dt className="text-muted">Left for you</dt><dd className="text-lg font-extrabold">{formatRand(s.remainder_cents)}</dd></div>
        </dl>
        <p className="text-xs text-muted">From {formatRand(s.base_net_cents)} settled net earnings. {s.warnings.join(' ')} iBanks does not know your bills, so check them first.</p>
        <p className="text-xs text-muted">
          At {formatRand(s.retirement_cents)} a month for 12 months you would have contributed {formatRand(retirementProjection(s.retirement_cents, 12).total_cents)}.{' '}
          {retirementProjection(0, 0).assumption} A real retirement annuity needs a licensed provider.
        </p>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} className="mt-1 size-4 accent-brand-600" />
          <span>Let iBanks use AI to phrase answers more simply. Your figures are always calculated by KashWise and checked before you see them.</span>
        </label>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>Save my goals</Button>
      </Card>
    </div>
  )
}

const ACCOUNT_LABEL: Record<LedgerEntry['account'], string> = {
  gross: 'Client paid',
  platform_fee: 'KashWise fee',
  net_earned: 'Earned (net)',
  disputed_hold: 'Dispute hold',
  payout_pending: 'Payout in progress',
  paid_out: 'Paid out',
}

function History({ entries }: { entries: LedgerEntry[] }) {
  if (entries.length === 0) return <EmptyState title="No money movements yet">Settled job payments and payouts appear here, each with its source event.</EmptyState>
  const rows = [...entries].reverse().slice(0, 100)
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <caption className="sr-only">Ledger entries, newest first</caption>
        <thead className="bg-canvas text-left text-xs text-muted">
          <tr><th className="p-3">When</th><th className="p-3">What</th><th className="p-3 text-right">Amount</th><th className="hidden p-3 sm:table-cell">Source event</th></tr>
        </thead>
        <tbody>
          {rows.map((e, n) => (
            <tr key={`${e.event_id}-${e.account}-${n}`} className="border-t border-line">
              <td className="p-3 whitespace-nowrap">{formatDate(e.occurred_at)}</td>
              <td className="p-3">{ACCOUNT_LABEL[e.account]}{e.reversal_of && <Badge tone="gray" className="ml-2">Reversal</Badge>}</td>
              <td className={`p-3 text-right font-semibold ${e.amount_cents < 0 ? 'text-clay-700' : ''}`}>{formatRand(e.amount_cents)}</td>
              <td className="hidden p-3 font-mono text-xs text-muted sm:table-cell">{e.event_id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

export default function Money() {
  const { userId } = useAuth()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('Overview')
  const q = useQuery({ queryKey: ['money', userId], queryFn: () => fetchMoney(userId!), enabled: Boolean(userId), refetchInterval: 30_000 })
  // "As of" is when the rows were fetched, so the figures and their timestamp always match.
  const intel = useMemo(() => (q.data ? earningsIntelligence(q.data.entries, q.data.jobs, q.dataUpdatedAt) : null), [q.data, q.dataUpdatedAt])
  const feedback = useMutation({
    mutationFn: (v: { id: string; status: 'dismissed' | null; helpful: boolean | null }) => insightFeedback(v.id, v.status, v.helpful),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['money'] }),
  })

  return (
    <div>
      <PageHeader
        title={<>KashWise Money <span className="block text-sm font-semibold text-brand-700 sm:inline sm:pl-2">Powered by iBanks</span></>}
        subtitle={<>{SCOPE_LABEL}. {intel && <>Updated {formatDate(intel.as_of)}.</>}</>}
        action={<Link to="/wallet" className="text-sm font-semibold text-brand-700 hover:underline">Cash out →</Link>}
      />
      <p className="mb-4 rounded-lg bg-sun-50 px-3 py-2 text-xs font-medium text-sun-700 ring-1 ring-inset ring-sun-100">
        <strong>Payment simulation.</strong> Payments and payouts come from a labelled provider simulator. No real money moves, and no bank is connected.
      </p>

      <div role="tablist" aria-label="KashWise Money" className="mb-4 flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${tab === t ? 'bg-brand-600 text-white' : 'text-ink-soft hover:bg-white'}`}>
            {t}
          </button>
        ))}
      </div>

      {q.isLoading && <Skeleton className="h-48" />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data && !q.data.enabled && (
        <EmptyState title="iBanks is not switched on yet">KashWise Money needs the iBanks database update, which has not been applied to this environment.</EmptyState>
      )}
      {q.data?.enabled && intel && (
        <div role="tabpanel" aria-label={tab}>
          {tab === 'Overview' && <Overview intel={intel} insights={q.data.insights} />}
          {tab === 'Earnings' && <Earnings intel={intel} />}
          {tab === 'Insights' && (
            <div className="space-y-3">
              {q.data.insights.length === 0 ? <EmptyState title="No insights yet">iBanks writes insights when a payment settles, a payout changes or something needs your attention.</EmptyState> : (
                (q.data.insights as (Insight & { id: string })[]).map((i) => (
                  <InsightCard key={i.id} insight={i} onFeedback={(status, helpful) => feedback.mutate({ id: i.id, status, helpful })} />
                ))
              )}
              <Diagnostics />
            </div>
          )}
          {tab === 'Goals' && <Goals net={intel.lifetime.net_earned_cents} paidOut={intel.lifetime.paid_out_cents} prefs={q.data.preferences} />}
          {tab === 'History' && <History entries={q.data.entries} />}
        </div>
      )}
    </div>
  )
}
