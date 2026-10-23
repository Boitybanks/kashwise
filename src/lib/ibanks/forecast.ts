// iBanks income outlook: an inspectable statistical baseline, not a black box (spec §5.3, FNB brief §G.4).
// Recency-weighted median of complete weeks (half-life 4 weeks) with a weighted 20th–80th percentile range, a
// 30-day range scaled from it, and a rolling-origin backtest so the error is shown next to the estimate.
// Every output is an observed week value or an integer multiple of one: no floats leak into money.

export const OUTLOOK_METHOD = 'ibanks-outlook-v1'
export const OUTLOOK_METHOD_LABEL = 'Recency-weighted median of your complete weeks (half-life 4 weeks), with the weighted 20th–80th percentile as the range'
export const MIN_OUTLOOK_WEEKS = 4
/** At most this many recent complete weeks are used; older weeks say little about next week. */
export const MAX_BASIS_WEEKS = 12
const HALF_LIFE_WEEKS = 4
const LOW_Q = 0.2
const HIGH_Q = 0.8

export type Confidence = 'low' | 'moderate'

export interface Range {
  low_cents: number
  central_cents: number
  high_cents: number
}

export interface Backtest {
  /** Weeks we pretended not to know, forecast from the weeks before them, then compared with what happened. */
  tests: number
  mean_abs_error_cents: number
  /** Share of tested weeks whose actual net fell inside the forecast range, in basis points. */
  coverage_bps: number
}

export type Outlook =
  | { kind: 'insufficient_history'; method: typeof OUTLOOK_METHOD; complete_weeks: number; needed_weeks: number }
  | {
      kind: 'range'
      method: typeof OUTLOOK_METHOD
      basis_weeks: number
      zero_weeks_in_basis: number
      next_7_days: Range
      next_30_days: Range
      /** 'moderate' needs 8+ complete weeks AND a backtest. iBanks never claims 'high' confidence. */
      confidence: Confidence
      backtest: Backtest | null
      label: 'estimate, not a guarantee'
    }

/** Weights for `n` points, oldest first: the newest week counts 1, a week HALF_LIFE_WEEKS older counts 0.5. */
function weights(n: number): number[] {
  return Array.from({ length: n }, (_, i) => 0.5 ** ((n - 1 - i) / HALF_LIFE_WEEKS))
}

/** Weighted quantile that always returns one of the observed values (so cents stay integers). */
export function weightedQuantile(values: readonly number[], w: readonly number[], q: number): number {
  const order = values.map((v, i) => [v, w[i]] as const).sort((a, b) => a[0] - b[0])
  const total = order.reduce((t, [, x]) => t + x, 0)
  let acc = 0
  for (const [v, x] of order) {
    acc += x
    if (acc / total >= q - 1e-12) return v
  }
  return order[order.length - 1][0]
}

function weeklyRange(series: readonly number[]): Range {
  const basis = series.slice(-MAX_BASIS_WEEKS)
  const w = weights(basis.length)
  return {
    low_cents: weightedQuantile(basis, w, LOW_Q),
    central_cents: weightedQuantile(basis, w, 0.5),
    high_cents: weightedQuantile(basis, w, HIGH_Q),
  }
}

/** 30 days ≈ 30/7 weeks. Scaling the weekly bounds is deliberately cautious: it assumes no good week offsets a slow one. */
const to30 = (cents: number) => Math.round((cents * 30) / 7)

/** Rolling-origin backtest over the given complete weeks. Null when there is nothing to test against. */
export function backtest(series: readonly number[]): Backtest | null {
  let tests = 0
  let absError = 0
  let inside = 0
  for (let t = MIN_OUTLOOK_WEEKS; t < series.length; t++) {
    const r = weeklyRange(series.slice(0, t))
    const actual = series[t]
    tests++
    absError += Math.abs(actual - r.central_cents)
    if (actual >= r.low_cents && actual <= r.high_cents) inside++
  }
  if (tests === 0) return null
  return { tests, mean_abs_error_cents: Math.round(absError / tests), coverage_bps: Math.round((inside / tests) * 10_000) }
}

/** `completeWeeks`: net cents per COMPLETE week, oldest first, zero weeks included (coverage is known). */
export function incomeOutlook(completeWeeks: readonly number[]): Outlook {
  for (const v of completeWeeks) if (!Number.isSafeInteger(v)) throw new RangeError('weekly totals must be integer cents')
  if (completeWeeks.length < MIN_OUTLOOK_WEEKS) {
    return { kind: 'insufficient_history', method: OUTLOOK_METHOD, complete_weeks: completeWeeks.length, needed_weeks: MIN_OUTLOOK_WEEKS }
  }
  const week = weeklyRange(completeWeeks)
  const basis = completeWeeks.slice(-MAX_BASIS_WEEKS)
  const bt = backtest(completeWeeks)
  return {
    kind: 'range',
    method: OUTLOOK_METHOD,
    basis_weeks: basis.length,
    zero_weeks_in_basis: basis.filter((v) => v === 0).length,
    next_7_days: week,
    next_30_days: { low_cents: to30(week.low_cents), central_cents: to30(week.central_cents), high_cents: to30(week.high_cents) },
    confidence: completeWeeks.length >= 8 && bt ? 'moderate' : 'low',
    backtest: bt,
    label: 'estimate, not a guarantee',
  }
}
