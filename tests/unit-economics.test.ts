import { describe, expect, it } from 'vitest'
import { SCENARIOS, unitEconomics } from '../src/lib/unit-economics'

describe('unit economics scenarios (assumptions, not results)', () => {
  it('base case: exact integer-cent contribution, margin and break-even', () => {
    expect(unitEconomics(SCENARIOS.base.input)).toEqual({
      gmv_cents: 75_000_000,
      platform_revenue_cents: 7_500_000, // 10% of R500 = R50 per job
      worker_earnings_cents: 67_500_000,
      processor_cost_cents: 1_125_000, // 1.5% of R500 = R7.50, paid by KashWise
      payout_cost_cents: 450_000,
      ai_cost_cents: 75_000,
      contribution_cents: 5_850_000,
      contribution_per_job_cents: 3_900,
      contribution_margin_bps: 7_800,
      fixed_cents: 4_000_000,
      operating_result_cents: 1_850_000,
      break_even_jobs: 1_026,
      min_viable_job_cents: 4_125,
      label: 'scenario, not a result',
    })
  })

  it('the cautious pilot loses money and says how many jobs would cover fixed costs', () => {
    const r = unitEconomics(SCENARIOS.cautious.input)
    expect(r.operating_result_cents).toBe(-965_000)
    expect(r.break_even_jobs).toBe(561)
  })

  it('small tickets: a job below the minimum viable price loses money on every job', () => {
    const r = unitEconomics({ ...SCENARIOS.base.input, avgJobCents: 4_000 })
    expect(r.contribution_per_job_cents).toBeLessThanOrEqual(0)
    expect(r.break_even_jobs).toBeNull()
  })

  it('rejects floats and negative inputs', () => {
    expect(() => unitEconomics({ ...SCENARIOS.base.input, avgJobCents: 100.5 })).toThrow(RangeError)
    expect(() => unitEconomics({ ...SCENARIOS.base.input, jobsPerMonth: -1 })).toThrow(RangeError)
  })

  it('no revenue → no margin, and processor costs above the fee mean no viable price', () => {
    expect(unitEconomics({ ...SCENARIOS.base.input, jobsPerMonth: 0 }).contribution_margin_bps).toBeNull()
    expect(unitEconomics({ ...SCENARIOS.base.input, processorCostBps: 1_000 }).min_viable_job_cents).toBeNull()
  })
})
