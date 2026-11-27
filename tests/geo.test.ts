import { describe, expect, it } from 'vitest'
import {
  distanceKm,
  filterGigsByVicinity,
  formatDistance,
  nextVicinityRadius,
  resolveAreaFromAddress,
  vicinityLabel,
} from '../src/lib/geo'

const AREAS = [
  { slug: 'soweto', name: 'Soweto', city: 'Johannesburg', lat: -26.2485, lng: 27.854 },
  { slug: 'braamfontein', name: 'Braamfontein', city: 'Johannesburg', lat: -26.1929, lng: 28.0339 },
  { slug: 'sandton', name: 'Sandton', city: 'Johannesburg', lat: -26.1076, lng: 28.0567 },
  { slug: 'cape-town-cbd', name: 'Cape Town CBD', city: 'Cape Town', lat: -33.9249, lng: 18.4241 },
]

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

describe('flexible area & expanding vicinity', () => {
  const sampleGigs = [
    { id: '1', area_slug: 'soweto', distance_km: 0 },
    { id: '2', area_slug: 'roodepoort', distance_km: 9.8 },
    { id: '3', area_slug: 'sandton', distance_km: 25.4 },
    { id: '4', area_slug: 'pretoria-cbd', distance_km: 65.0 },
  ]

  it('checks gigs in my area first (radius = 0), then expands step by step', () => {
    expect(filterGigsByVicinity(sampleGigs, 'soweto', 0).map((g) => g.id)).toEqual(['1'])
    expect(filterGigsByVicinity(sampleGigs, 'soweto', 10).map((g) => g.id)).toEqual(['1', '2'])
    expect(filterGigsByVicinity(sampleGigs, 'soweto', 50).map((g) => g.id)).toEqual(['1', '2', '3'])
    expect(filterGigsByVicinity(sampleGigs, 'soweto', null).map((g) => g.id)).toEqual(['1', '2', '3', '4'])
  })

  it('steps through vicinity radii in order', () => {
    expect(nextVicinityRadius(0)).toBe(10)
    expect(nextVicinityRadius(10)).toBe(25)
    expect(nextVicinityRadius(25)).toBe(50)
    expect(nextVicinityRadius(50)).toBeNull()
    expect(nextVicinityRadius(null)).toBeUndefined()
    expect(vicinityLabel(0, 'Soweto')).toBe('In Soweto')
    expect(vicinityLabel(25, 'Soweto')).toBe('Within 25 km')
    expect(vicinityLabel(null, 'Soweto')).toBe('Anywhere in SA')
  })

  it('resolves the public area from the poster address or falls back to their profile area', () => {
    expect(resolveAreaFromAddress('14 Vilakazi Street, Orlando West', 'sandton', AREAS)).toBe('soweto')
    expect(resolveAreaFromAddress('22 Rivonia Road, Sandton', 'soweto', AREAS)).toBe('sandton')
    expect(resolveAreaFromAddress('7 Smoke Test Lane', 'soweto', AREAS)).toBe('soweto')
  })
})
