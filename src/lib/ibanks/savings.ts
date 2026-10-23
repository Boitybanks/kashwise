// Opt-in savings and retirement SCENARIOS. Illustrative only: nothing here moves money, and nothing ever will
// without a licensed partner, explicit consent and a separate, non-AI flow (spec §5.6).

export const MAX_ALLOCATION_BPS = 2_000 // 20% of net, per goal

export interface SavingsScenario {
  base_net_cents: number
  savings_bps: number
  retirement_bps: number
  savings_cents: number
  retirement_cents: number
  remainder_cents: number
  /** True while any of the base is earned but not yet paid out to the worker. */
  includes_unpaid: boolean
  kind: 'simulation'
  money_moved: false
  warnings: string[]
}

/** bps of cents, rounded half-up, in exact integer arithmetic. */
export function bpsOf(cents: number, bps: number): number {
  return Math.floor((cents * bps + 5_000) / 10_000)
}

export function savingsScenario(input: {
  netCents: number
  savingsBps: number
  retirementBps: number
  paidOutCents?: number
}): SavingsScenario {
  const { netCents, savingsBps, retirementBps } = input
  for (const [name, v] of [
    ['netCents', netCents],
    ['savingsBps', savingsBps],
    ['retirementBps', retirementBps],
  ] as const) {
    if (!Number.isSafeInteger(v) || v < 0) throw new RangeError(`${name} must be a non-negative integer`)
  }
  if (savingsBps > MAX_ALLOCATION_BPS || retirementBps > MAX_ALLOCATION_BPS) {
    throw new RangeError('Each goal can be at most 20% of net earnings')
  }
  const savings = bpsOf(netCents, savingsBps)
  const retirement = bpsOf(netCents, retirementBps)
  const includesUnpaid = (input.paidOutCents ?? 0) < netCents
  const warnings: string[] = []
  if (netCents === 0) warnings.push('No settled earnings yet, so there is nothing to allocate.')
  if (includesUnpaid) warnings.push('Part of this money is earned but not yet paid out to you.')
  return {
    base_net_cents: netCents,
    savings_bps: savingsBps,
    retirement_bps: retirementBps,
    savings_cents: savings,
    retirement_cents: retirement,
    remainder_cents: netCents - savings - retirement,
    includes_unpaid: includesUnpaid,
    kind: 'simulation',
    money_moved: false,
    warnings,
  }
}

/** Hypothetical retirement pot: fixed monthly contributions, NO investment returns assumed (none are promised). */
export function retirementProjection(monthlyCents: number, months: number): { total_cents: number; assumption: string } {
  if (!Number.isSafeInteger(monthlyCents) || monthlyCents < 0 || !Number.isSafeInteger(months) || months < 0 || months > 600) {
    throw new RangeError('Invalid projection input')
  }
  return {
    total_cents: monthlyCents * months,
    assumption: 'Contributions only. No investment growth, fees or inflation are assumed. Hypothetical, not advice.',
  }
}
