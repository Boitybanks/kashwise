import { describe, expect, it } from 'vitest'
import {
  breakdown,
  cashoutFee,
  feeCents,
  formatRand,
  MAX_PAYOUT_CENTS,
  MAX_TAKE_HOME_CENTS,
  MIN_PAYOUT_CENTS,
  MIN_TAKE_HOME_CENTS,
  priceForTakeHome,
  randsToCents,
  workerNetCents,
} from '../src/lib/money'

describe('pricing: 10% SideGigs fee from the provider’s pay, no VAT withheld', () => {
  it('R500 job → client pays R500, fee R50, provider receives R450', () => {
    expect(breakdown(50_000)).toEqual({ price: 50_000, fee: 5_000, workerNet: 45_000 })
    expect(workerNetCents(50_000)).toBe(45_000)
  })
  it('rounds the fee half-up to the cent, like the database column', () => {
    expect(feeCents(335)).toBe(34) // 33.5 → 34
    expect(feeCents(20_004)).toBe(2_000) // 2000.4 → 2000
    expect(workerNetCents(335)).toBe(301)
  })
  it('a provider’s take-home maps to the smallest client price that pays exactly that', () => {
    expect(priceForTakeHome(45_000)).toBe(50_000)
    expect(priceForTakeHome(40_000)).toBe(44_444)
    expect(priceForTakeHome(MIN_TAKE_HOME_CENTS)).toBe(MIN_PAYOUT_CENTS)
    expect(priceForTakeHome(MAX_TAKE_HOME_CENTS)).toBe(MAX_PAYOUT_CENTS)
    for (let n = MIN_TAKE_HOME_CENTS; n < MIN_TAKE_HOME_CENTS + 20_000; n++) {
      const p = priceForTakeHome(n)
      expect(workerNetCents(p)).toBe(n)
      expect(workerNetCents(p - 1)).toBeLessThan(n)
    }
  })
  it('one cash-out a week is free; after that it costs what the payout costs', () => {
    expect(cashoutFee('cash', true)).toBe(0)
    expect(cashoutFee('bank', true)).toBe(0)
    expect(cashoutFee('cash', false)).toBe(2_000)
    expect(cashoutFee('bank', false)).toBe(300)
  })
  it('formats rands for South African readers', () => {
    expect(formatRand(42_500)).toBe('R425')
    expect(formatRand(115_000)).toBe('R1 150')
    expect(formatRand(4_995)).toBe('R49.95')
    expect(randsToCents(12.5)).toBe(1_250)
  })
})
