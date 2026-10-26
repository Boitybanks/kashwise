// Unit economics SCENARIO calculator for founders and judges. Every input is an editable assumption; nothing on
// this page is a KashWise result, a forecast or traction. Maths: src/lib/unit-economics.ts (integer cents).
import { useState } from 'react'
import { formatRand } from '../lib/money'
import { SCENARIOS, unitEconomics, type EconomicsInput } from '../lib/unit-economics'
import { Badge, Card, PageHeader } from '../components/ui'

type Key = keyof typeof SCENARIOS

const FIELDS: { key: keyof EconomicsInput; label: string; unit: 'rand' | 'count' | 'percent'; hint: string }[] = [
  { key: 'jobsPerMonth', label: 'Paid jobs per month', unit: 'count', hint: 'Assumption' },
  { key: 'avgJobCents', label: 'Average job price', unit: 'rand', hint: 'What the client pays' },
  { key: 'processorCostBps', label: 'Payment processing cost', unit: 'percent', hint: 'Paid by KashWise, not taken from workers' },
  { key: 'payoutCostCentsPerJob', label: 'Payout cost per job', unit: 'rand', hint: 'KashWise’s share' },
  { key: 'aiCostCentsPerJob', label: 'AI explanation cost per job', unit: 'rand', hint: '0 when iBanks runs rules-only' },
  { key: 'fixedMonthlyCents', label: 'Fixed costs per month', unit: 'rand', hint: 'Hosting, support, moderation' },
]

const toDisplay = (unit: string, v: number) => (unit === 'rand' ? v / 100 : unit === 'percent' ? v / 100 : v)
const fromDisplay = (unit: string, v: number) => Math.max(0, Math.round(unit === 'count' ? v : v * 100))

export default function Economics() {
  const [key, setKey] = useState<Key>('base')
  const [input, setInput] = useState<EconomicsInput>(SCENARIOS.base.input)
  let r: ReturnType<typeof unitEconomics> | null = null
  let error: string | null = null
  try {
    r = unitEconomics(input)
  } catch (e) {
    error = (e as Error).message
  }
  const pick = (k: Key) => {
    setKey(k)
    setInput(SCENARIOS[k].input)
  }
  const row = (label: string, cents: number, strong = false) => (
    <div className="flex justify-between border-t border-line py-1.5 text-sm">
      <dt>{label}</dt>
      <dd className={strong ? 'font-extrabold' : 'font-semibold'}>{formatRand(cents)}</dd>
    </div>
  )

  return (
    <div>
      <PageHeader title="Unit economics" subtitle="How a 10% success fee could sustain KashWise. Editable scenarios, not results." />
      <p className="mb-4 rounded-lg bg-sun-50 px-3 py-2 text-xs font-medium text-sun-700 ring-1 ring-inset ring-sun-100">
        <strong>Scenario only.</strong> KashWise has no live payments or revenue yet. Change any assumption to see its effect.
      </p>
      <div role="tablist" aria-label="Scenario" className="mb-4 flex flex-wrap gap-1">
        {(Object.keys(SCENARIOS) as Key[]).map((k) => (
          <button key={k} role="tab" aria-selected={key === k} onClick={() => pick(k)} className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${key === k ? 'bg-brand-600 text-white' : 'text-ink-soft hover:bg-surface-elevated hover:text-ink'}`}>
            {SCENARIOS[k].title}
          </button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-3 p-4">
          <h2 className="font-extrabold">Assumptions</h2>
          {FIELDS.map((f) => (
            <label key={f.key} className="block text-sm">
              <span className="flex justify-between font-semibold"><span>{f.label}</span><span className="text-xs font-normal text-muted">{f.hint}</span></span>
              <span className="mt-1 flex items-center gap-2">
                {f.unit === 'rand' && <span aria-hidden>R</span>}
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={f.unit === 'count' ? 1 : 0.01}
                  value={toDisplay(f.unit, input[f.key])}
                  onChange={(e) => setInput({ ...input, [f.key]: fromDisplay(f.unit, Number(e.target.value)) })}
                  className="input min-h-11 w-full rounded-xl border border-line px-3"
                />
                {f.unit === 'percent' && <span aria-hidden>%</span>}
              </span>
            </label>
          ))}
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2"><h2 className="font-extrabold">Per month</h2><Badge tone="gray">Scenario, not a result</Badge></div>
          {error && <p className="mt-2 text-sm text-clay-700">{error}</p>}
          {r && (
            <>
              <dl className="mt-2">
                {row('Paid by clients (GMV)', r.gmv_cents)}
                {row('Earned by workers (90%)', r.worker_earnings_cents)}
                {row('KashWise fee revenue (10%)', r.platform_revenue_cents)}
                {row('− Payment processing', -r.processor_cost_cents)}
                {row('− Payouts', -r.payout_cost_cents)}
                {row('− AI explanations', -r.ai_cost_cents)}
                {row('Contribution', r.contribution_cents, true)}
                {row('− Fixed costs', -r.fixed_cents)}
                {row('Operating result', r.operating_result_cents, true)}
              </dl>
              <ul className="mt-3 space-y-1 text-sm">
                <li>Contribution per job: <strong>{formatRand(r.contribution_per_job_cents)}</strong>{r.contribution_margin_bps != null && <> ({Math.round(r.contribution_margin_bps / 100)}% of fee revenue)</>}.</li>
                <li>{r.break_even_jobs != null ? <>Covers fixed costs from <strong>{r.break_even_jobs.toLocaleString('en-ZA')}</strong> paid jobs a month at this price.</> : <>Each job loses money at this price, so no volume breaks even.</>}</li>
                {r.min_viable_job_cents != null && <li>Small-ticket risk: jobs under <strong>{formatRand(r.min_viable_job_cents)}</strong> do not cover their own costs.</li>}
              </ul>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
