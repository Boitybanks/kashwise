// iBanks intelligence (FNB brief §G "Forecast tests"): outlook ranges, backtest, low-data honesty, determinism,
// earning patterns and their event-driven insights. Synthetic, labelled series: these tests check the method's
// behaviour, they say nothing about real-world forecast accuracy.
import { describe, expect, it } from 'vitest'
import { providerEventSchema, type ProviderEvent } from '../src/lib/ibanks/contracts'
import { applyEvent, emptyLedger, type LedgerState } from '../src/lib/ibanks/ledger'
import { earningsIntelligence, type JobInfo } from '../src/lib/ibanks/analytics'
import { backtest, incomeOutlook, MIN_OUTLOOK_WEEKS, OUTLOOK_METHOD, weightedQuantile } from '../src/lib/ibanks/forecast'
import { earningPatterns, MIN_PATTERN_JOBS } from '../src/lib/ibanks/patterns'
import { dispatch, OUTLOOK_RULE, PATTERN_RULE } from '../src/lib/ibanks/orchestrator'
import { allowedAmounts, answerDeterministic, groundingViolations, type AgentFacts } from '../src/lib/ibanks/agent'

const SIPHO = '11111111-1111-4111-8111-111111111111'
const NOW = Date.parse('2026-10-08T10:00:00Z') // Thursday
const WEEK = 7 * 86_400_000
const jobId = (n: number) => `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`

function settle(n: number, at: number, netRand: number): ProviderEvent {
  const net = netRand * 100
  const fee = Math.round(net / 9) // ≈10% of gross; the contract only needs gross = fee + net
  return providerEventSchema.parse({
    event_id: `evt_${n}`,
    schema_version: 1,
    event_type: 'payment_settled',
    occurred_at: new Date(at).toISOString(),
    source: 'sandbox_payment_provider',
    worker_id: SIPHO,
    job_id: jobId(n),
    payment_id: `pay_${n}`,
    payout_id: null,
    provider_ref: `ref_${n}`,
    currency: 'ZAR',
    gross_cents: net + fee,
    marketplace_fee_cents: fee,
    processor_fee_cents: 0,
    worker_net_cents: net,
    amount_cents: 0,
    destination_label: null,
    failure_reason: null,
    simulation: true,
  })
}

describe('income outlook (forecast.ts)', () => {
  it('refuses to forecast from 0–3 complete weeks: "not enough data", never a number', () => {
    for (const n of [0, 1, MIN_OUTLOOK_WEEKS - 1]) {
      expect(incomeOutlook(new Array(n).fill(50_000))).toEqual({ kind: 'insufficient_history', method: OUTLOOK_METHOD, complete_weeks: n, needed_weeks: 4 })
    }
  })

  it('known series → expected recency-weighted range, 30-day scaling and no backtest yet', () => {
    const o = incomeOutlook([10_000, 20_000, 30_000, 40_000])
    expect(o).toMatchObject({
      kind: 'range',
      basis_weeks: 4,
      next_7_days: { low_cents: 20_000, central_cents: 30_000, high_cents: 40_000 },
      next_30_days: { low_cents: 85_714, central_cents: 128_571, high_cents: 171_429 },
      confidence: 'low',
      backtest: null,
      label: 'estimate, not a guarantee',
    })
  })

  it('weights recent weeks more than a plain median would', () => {
    const o = incomeOutlook([10_000, 20_000, 30_000, 40_000, 50_000])
    if (o.kind !== 'range') throw new Error('expected a range')
    expect(o.next_7_days.central_cents).toBe(40_000) // the unweighted median is 30 000
    // Backtest: forecast week 5 from weeks 1–4 (range 20 000–40 000, centre 30 000); actual 50 000.
    expect(o.backtest).toEqual({ tests: 1, mean_abs_error_cents: 20_000, coverage_bps: 0 })
  })

  it('reports holdout error and coverage on a stable series; moderate confidence only from 8+ weeks', () => {
    const series = [60_000, 0, 55_000, 70_000, 62_000, 58_000, 66_000, 61_000, 59_000, 64_000]
    const o = incomeOutlook(series)
    if (o.kind !== 'range') throw new Error('expected a range')
    expect(o.confidence).toBe('moderate')
    expect(o.zero_weeks_in_basis).toBe(1)
    expect(o.backtest?.tests).toBe(6)
    expect(o.backtest!.coverage_bps).toBeGreaterThanOrEqual(0)
    expect(o.backtest!.coverage_bps).toBeLessThanOrEqual(10_000)
    expect(o.next_7_days.low_cents).toBeLessThanOrEqual(o.next_7_days.central_cents)
    expect(o.next_7_days.central_cents).toBeLessThanOrEqual(o.next_7_days.high_cents)
    for (const v of Object.values(o.next_30_days)) expect(Number.isSafeInteger(v)).toBe(true)
    expect(incomeOutlook(series.slice(0, 7))).toMatchObject({ confidence: 'low' })
  })

  it('is deterministic: same inputs, same amounts', () => {
    const s = [12_000, 0, 34_000, 8_000, 21_000, 0, 15_000]
    expect(incomeOutlook(s)).toEqual(incomeOutlook([...s]))
  })

  it('only ever returns observed values from the weighted quantile, and rejects non-integer cents', () => {
    expect(weightedQuantile([5, 1, 3], [1, 1, 1], 0.5)).toBe(3)
    expect(() => incomeOutlook([1, 2, 3, 4.5])).toThrow(RangeError)
    expect(backtest([1, 2, 3])).toBeNull()
  })
})

describe('earning patterns (patterns.ts)', () => {
  const jobs = new Map<string, JobInfo>([
    [jobId(1), { title: 'Paint lounge', category: 'painting', completed_at: '2026-09-05T10:00:00Z', client_key: 'a' }], // Saturday
    [jobId(2), { title: 'Paint fence', category: 'painting', completed_at: '2026-09-12T10:00:00Z', client_key: 'a' }], // Saturday
    [jobId(3), { title: 'Fix tap', category: 'plumbing', completed_at: '2026-09-16T10:00:00Z', client_key: 'b' }], // Wednesday
    [jobId(4), { title: 'Paint door', category: 'painting', completed_at: '2026-09-19T10:00:00Z', client_key: 'c' }], // Saturday
  ])

  it('says "too early" below the minimum sample', () => {
    const s = emptyLedger()
    applyEvent(s, settle(1, NOW - WEEK, 900))
    const p = earningPatterns(s.entries, jobs)
    expect(p.suggestion).toEqual({ kind: 'too_early', paid_jobs: 1, needed_jobs: MIN_PATTERN_JOBS })
  })

  it('names the top category and weekday with their sample sizes, and counts repeat clients', () => {
    const s = emptyLedger()
    ;[900, 450, 300, 600].forEach((r, i) => applyEvent(s, settle(i + 1, NOW - (4 - i) * WEEK, r)))
    const p = earningPatterns(s.entries, jobs)
    expect(p.paid_jobs).toBe(4)
    expect(p.categories[0]).toEqual({ category: 'painting', jobs: 3, net_cents: 195_000, avg_net_per_job_cents: 65_000 })
    expect(p.suggestion).toMatchObject({ kind: 'focus_category', category: 'painting', jobs: 3, of_jobs: 4, busiest_weekday: 'Saturday', weekday_jobs: 3 })
    expect(p.repeat_clients).toBe(1)
  })

  it('a fully refunded job is not paid work', () => {
    const s = emptyLedger()
    ;[900, 450, 300].forEach((r, i) => applyEvent(s, settle(i + 1, NOW - (4 - i) * WEEK, r)))
    const original = settle(3, NOW - 2 * WEEK, 300)
    applyEvent(s, { ...original, event_id: 'evt_refund_3', event_type: 'refund_settled', occurred_at: new Date(NOW - WEEK).toISOString() })
    expect(earningPatterns(s.entries, jobs).paid_jobs).toBe(2)
  })
})

describe('event-driven outlook (orchestrator)', () => {
  function history(): LedgerState {
    const s = emptyLedger()
    // Six complete weeks of synthetic income, then a new settlement today.
    ;[600, 0, 550, 700, 620, 580].forEach((r, i) => {
      if (r) applyEvent(s, settle(i + 1, NOW - (6 - i) * WEEK, r))
    })
    return s
  }
  const jobs = new Map<string, JobInfo>()

  it('a settled payment wakes iBanks: the outlook is recomputed, persisted as an insight and audited with its rule version', () => {
    const s = history()
    const e = settle(99, NOW - 3_600_000, 900)
    const ingest = applyEvent(s, e)
    const out = dispatch({ event: e, ingest, entries: s.entries, payouts: [], jobs, now: NOW })
    const outlook = out.insights.find((i) => i.kind === 'forecast:outlook')!
    expect(outlook.title).toBe('Your income outlook was updated')
    expect(outlook.source_event_ids).toEqual(['evt_99'])
    expect(outlook.fact_snapshot).toMatchObject({ method: OUTLOOK_METHOD, basis_weeks: 6, confidence: 'low' })
    expect(outlook.body).toMatch(/estimate, not a guarantee/i)
    const audit = out.audits.find((a) => a.rule_id === OUTLOOK_RULE.rule_id)!
    expect(audit).toMatchObject({ rule_version: 1, proposed_action: 'notify', decision: { outcome: 'allow' } })
    expect(out.audits.some((a) => a.rule_id === PATTERN_RULE.rule_id)).toBe(true) // 6 paid jobs ≥ 3
  })

  it('a replayed event changes nothing and produces no new outlook', () => {
    const s = history()
    const e = settle(99, NOW - 3_600_000, 900)
    applyEvent(s, e)
    const replay = applyEvent(s, e)
    const out = dispatch({ event: e, ingest: replay, entries: s.entries, payouts: [], jobs, now: NOW })
    expect(replay.status).toBe('duplicate')
    expect(out.insights.filter((i) => i.kind.startsWith('forecast:'))).toHaveLength(0)
  })

  it('with one transaction the insight is the honest low-data message', () => {
    const s = emptyLedger()
    const e = settle(1, NOW - 3_600_000, 900)
    const out = dispatch({ event: e, ingest: applyEvent(s, e), entries: s.entries, payouts: [], jobs, now: NOW })
    const o = out.insights.find((i) => i.kind === 'forecast:outlook')!
    expect(o.title).toBe('Not enough history to forecast yet')
    expect(out.insights.some((i) => i.kind === 'pattern:suggestion')).toBe(false)
  })

  it('Ask iBanks states only forecast amounts that are in the computed facts', () => {
    const s = history()
    const intel = earningsIntelligence(s.entries, jobs, NOW)
    const facts: AgentFacts = { intel, insights: [], proof: { confirmed_jobs: 5, reviews: 0, average_rating: null, record_codes: [] }, source_event_ids: [], simulation: true }
    const { output } = answerDeterministic('What will I earn next week?', facts)
    expect(output.intent).toBe('forecast_income')
    expect(output.answer).toMatch(/next 7 days/)
    expect(output.answer).toMatch(/next 30 days/i)
    expect(groundingViolations(output.answer, allowedAmounts(facts))).toEqual([])
    // An "AI" answer that invents a forecast amount is caught by the same check.
    expect(groundingViolations('You will earn R5 000 next week.', allowedAmounts(facts))).toEqual(['R5 000'])
  })
})
