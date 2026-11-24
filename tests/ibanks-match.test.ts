import { describe, expect, it } from 'vitest'
import { bestFitIndex, fitScore, matchReasons } from '../src/lib/ibanks/match'
import type { WorkerStats } from '../src/lib/types'

const gig = { category: 'painting', area_slug: 'orlando', distance_km: 3, applicant_count: 0 }
const stats = (completed: number, painting: number, rating: number | null): WorkerStats => ({
  completed, active: 0, cancelled_after_match: 0, review_count: completed, avg_rating: rating, repeat_customers: 0,
  categories: painting ? [{ category: 'painting', count: painting }] : [], earned_cents: null,
})

describe('iBanks matching', () => {
  it('gives only reasons the data supports', () => {
    expect(matchReasons(gig, { skills: ['painting'], area_slug: 'orlando' })).toEqual(['Your skill', 'Near you', 'No applicants yet'])
    expect(matchReasons({ ...gig, distance_km: 40, area_slug: 'x', applicant_count: 3 }, { skills: ['tutoring'], area_slug: 'orlando' })).toEqual([])
    expect(matchReasons(gig, null)).toEqual([])
  })

  it('ranks proven work in the same kind of job highest', () => {
    const proven = fitScore({ skills: ['painting'], category: 'painting', stats: stats(3, 3, 4.8), distanceKm: 20 })
    const generalist = fitScore({ skills: ['tutoring'], category: 'painting', stats: stats(3, 0, 4.8), distanceKm: 20 })
    expect(proven).toBeGreaterThan(generalist)
  })

  it('flags a best fit only when one applicant clearly stands out', () => {
    expect(bestFitIndex([5])).toBeNull()
    expect(bestFitIndex([5, 5])).toBeNull()
    expect(bestFitIndex([0, 0])).toBeNull()
    expect(bestFitIndex([2, 9, 4])).toBe(1)
  })
})
