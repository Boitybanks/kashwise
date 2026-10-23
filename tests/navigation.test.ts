import { describe, expect, it } from 'vitest'
import { safeNext } from '../src/lib/navigation'

describe('authentication return destinations', () => {
  it('keeps the selected gig and its query or anchor through onboarding', () => {
    expect(safeNext('/gigs/example?from=discover#apply')).toBe('/gigs/example?from=discover#apply')
    expect(safeNext('/gigs/new')).toBe('/gigs/new')
  })

  it('rejects external destinations and browser backslash normalization', () => {
    for (const value of ['https://example.com', '//example.com', '/\\example.com', '/\n/example.com', null]) {
      expect(safeNext(value)).toBeNull()
    }
  })

  it('avoids sending signed-in users back into authentication', () => {
    expect(safeNext('/login?next=/signup')).toBeNull()
    expect(safeNext('/signup')).toBeNull()
  })
})
