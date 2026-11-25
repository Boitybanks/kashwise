// iBanks matching signals: short, factual reasons a gig suits a provider, and which applicant fits a gig best.
// Every reason comes from data on screen (skills, area, distance, applicant count); nothing is guessed.
import type { DiscoverGig, WorkerStats } from '../types'

export const NEAR_KM = 10

export function matchReasons(gig: Pick<DiscoverGig, 'category' | 'area_slug' | 'distance_km' | 'applicant_count'>, me: { skills?: string[] | null; area_slug?: string | null } | null): string[] {
  if (!me) return []
  const reasons: string[] = []
  if (me.skills?.includes(gig.category)) reasons.push('Your skill')
  if (gig.area_slug === me.area_slug || (gig.distance_km != null && gig.distance_km <= NEAR_KM)) reasons.push('Near you')
  if (gig.applicant_count === 0) reasons.push('No applicants yet')
  return reasons
}

/** Higher is a better fit: proven work in this kind of job counts most, then rating, then closeness. */
export function fitScore(input: { skills: string[]; category: string; stats: WorkerStats | undefined; distanceKm: number | null }): number {
  const { stats } = input
  const provenHere = stats?.categories.find((c) => c.category === input.category)?.count ?? 0
  return (
    provenHere * 3 +
    (input.skills.includes(input.category) ? 2 : 0) +
    (stats?.completed ?? 0) +
    (stats?.avg_rating ?? 0) +
    (stats?.repeat_customers ?? 0) +
    (input.distanceKm != null && input.distanceKm <= NEAR_KM ? 1 : 0)
  )
}

/** Index of the single best-fit applicant, or null when there is no clear standout (fewer than two, or a tie). */
export function bestFitIndex(scores: number[]): number | null {
  if (scores.length < 2) return null
  const top = Math.max(...scores)
  if (top <= 0 || scores.filter((s) => s === top).length > 1) return null
  return scores.indexOf(top)
}
