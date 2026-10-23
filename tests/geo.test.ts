import { describe, expect, it } from 'vitest'
import { distanceKm, formatDistance } from '../src/lib/geo'

describe('area distances', () => {
  it('Soweto to Sandton is roughly 25 km', () => {
    const d = distanceKm({ lat: -26.2485, lng: 27.854 }, { lat: -26.1076, lng: 28.0567 })
    expect(d).toBeGreaterThan(20)
    expect(d).toBeLessThan(30)
  })
  it('formats for humans', () => {
    expect(formatDistance(0.2)).toBe('In your area')
    expect(formatDistance(7.4)).toBe('About 7 km away')
    expect(formatDistance(23)).toBe('About 25 km away')
    expect(formatDistance(null)).toBe('')
  })
})
