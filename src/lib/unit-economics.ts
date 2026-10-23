// KashWise unit economics: SCENARIO maths for planning, never reported results (FNB brief §D).
// Integer cents throughout; the fee uses the same rule as the database (money.ts feeCents). Every input is an
// assumption the founder can edit; none of the defaults below are measured KashWise numbers.
import { feeCents } from './money'

export interface EconomicsInput {
  /** Paid jobs per month. */
  jobsPerMonth: number
  /** Average job price the client pays, cents. */
  avgJobCents: number
  /** Payment processing cost, basis points of the job price, paid by KashWise (not deducted from workers). */
  processorCostBps: number
  /** KashWise's share of each payout's cost, cents per job (first payout each week is free to the worker). */
  payoutCostCentsPerJob: number
  /** Optional AI explanation cost per job, cents (0 when Ask iBanks runs rules-only). */
  aiCostCentsPerJob: number
  /** Hosting, database, support and moderation per month, cents. */
  fixedMonthlyCents: number
}

export interface EconomicsResult {
  gmv_cents: number
  platform_revenue_cents: number
  worker_earnings_cents: number
  processor_cost_cents: number
  payout_cost_cents: number
  ai_cost_cents: number
  contribution_cents: number
  contribution_per_job_cents: number
  /** Contribution as a share of platform revenue, basis points; null when there is no revenue. */
  contribution_margin_bps: number | null
  fixed_cents: number
  operating_result_cents: number
  /** Paid jobs a month needed to cover fixed costs at this average price; null when each job loses money. */
  break_even_jobs: number | null
  /** Smallest average job price at which a job covers its own variable costs; null if no price does. */
  min_viable_job_cents: number | null
  label: 'scenario, not a result'
}

const checkInt = (name: string, v: number, max = 1e12) => {
  if (!Number.isSafeInteger(v) || v < 0 || v > max) throw new RangeError(`${name} must be a whole number between 0 and ${max}`)
}

export function unitEconomics(i: EconomicsInput): EconomicsResult {
  checkInt('jobsPerMonth', i.jobsPerMonth, 10_000_000)
  checkInt('avgJobCents', i.avgJobCents, 5_000_000)
  checkInt('processorCostBps', i.processorCostBps, 10_000)
  checkInt('payoutCostCentsPerJob', i.payoutCostCentsPerJob, 100_000)
  checkInt('aiCostCentsPerJob', i.aiCostCentsPerJob, 100_000)
  checkInt('fixedMonthlyCents', i.fixedMonthlyCents)

  const feePerJob = feeCents(i.avgJobCents)
  const processorPerJob = Math.floor((i.avgJobCents * i.processorCostBps + 5_000) / 10_000)
  const perJob = feePerJob - processorPerJob - i.payoutCostCentsPerJob - i.aiCostCentsPerJob
  const n = i.jobsPerMonth
  const revenue = feePerJob * n
  const contribution = perJob * n

  // Fee rate 10% minus processor bps must exceed the fixed per-job costs: price × (1000 − bps) / 10 000 > fixed.
  const variableFixed = i.payoutCostCentsPerJob + i.aiCostCentsPerJob
  let minViable: number | null = null
  if (1_000 > i.processorCostBps) {
    let p = Math.ceil((variableFixed * 10_000) / (1_000 - i.processorCostBps))
    // Rounding in feeCents can differ by a cent: step to the first price that really covers its costs.
    while (feeCents(p) - Math.floor((p * i.processorCostBps + 5_000) / 10_000) - variableFixed <= 0 && p < 5_000_000) p++
    minViable = p
  }

  return {
    gmv_cents: i.avgJobCents * n,
    platform_revenue_cents: revenue,
    worker_earnings_cents: (i.avgJobCents - feePerJob) * n,
    processor_cost_cents: processorPerJob * n,
    payout_cost_cents: i.payoutCostCentsPerJob * n,
    ai_cost_cents: i.aiCostCentsPerJob * n,
    contribution_cents: contribution,
    contribution_per_job_cents: perJob,
    contribution_margin_bps: revenue > 0 ? Math.round((contribution / revenue) * 10_000) : null,
    fixed_cents: i.fixedMonthlyCents,
    operating_result_cents: contribution - i.fixedMonthlyCents,
    break_even_jobs: perJob > 0 ? Math.ceil(i.fixedMonthlyCents / perJob) : null,
    min_viable_job_cents: minViable,
    label: 'scenario, not a result',
  }
}

/** Three editable starting points. ASSUMPTIONS for discussion, not forecasts or traction. */
export const SCENARIOS: Record<'cautious' | 'base' | 'growth', { title: string; input: EconomicsInput }> = {
  cautious: {
    title: 'Cautious pilot',
    input: { jobsPerMonth: 200, avgJobCents: 35_000, processorCostBps: 150, payoutCostCentsPerJob: 300, aiCostCentsPerJob: 0, fixedMonthlyCents: 1_500_000 },
  },
  base: {
    title: 'One metro, steady',
    input: { jobsPerMonth: 1_500, avgJobCents: 50_000, processorCostBps: 150, payoutCostCentsPerJob: 300, aiCostCentsPerJob: 50, fixedMonthlyCents: 4_000_000 },
  },
  growth: {
    title: 'Gauteng-wide',
    input: { jobsPerMonth: 12_000, avgJobCents: 60_000, processorCostBps: 150, payoutCostCentsPerJob: 300, aiCostCentsPerJob: 50, fixedMonthlyCents: 15_000_000 },
  },
}
