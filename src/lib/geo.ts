// Distances are between AREA centres, never exact addresses (assumption A4).
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function formatDistance(km: number | null | undefined): string {
  if (km === null || km === undefined || Number.isNaN(km)) return ''
  if (km < 1) return 'In your area'
  if (km < 10) return `About ${Math.round(km)} km away`
  if (km < 100) return `About ${Math.round(km / 5) * 5} km away`
  return `${Math.round(km / 10) * 10} km away`
}

/** Step-by-step vicinity expansion radii (in km). 0 = in selected area only; null = anywhere in South Africa. */
export const VICINITY_STEPS = [0, 10, 25, 50, null] as const
export type VicinityRadius = (typeof VICINITY_STEPS)[number]

export function vicinityLabel(radiusKm: VicinityRadius, areaName?: string): string {
  if (radiusKm === 0) return areaName ? `In ${areaName}` : 'In this area'
  if (radiusKm === null) return 'Anywhere in SA'
  return `Within ${radiusKm} km`
}

export function nextVicinityRadius(current: VicinityRadius): VicinityRadius | undefined {
  const idx = VICINITY_STEPS.indexOf(current)
  return idx >= 0 && idx + 1 < VICINITY_STEPS.length ? VICINITY_STEPS[idx + 1] : undefined
}

/**
 * Filters gigs by the selected area and vicinity radius.
 * - radiusKm === 0: only gigs in the selected area (area_slug match or < 1 km).
 * - radiusKm > 0: gigs in the selected area or within radiusKm of it.
 * - radiusKm === null or no areaSlug: all gigs.
 */
export function filterGigsByVicinity<T extends { area_slug: string; distance_km: number | null }>(
  gigs: readonly T[],
  areaSlug: string | null | undefined,
  radiusKm: VicinityRadius,
  areaLookup?: (slug: string | null | undefined) => { lat: number; lng: number } | undefined,
): T[] {
  if (!areaSlug || radiusKm === null) return [...gigs]
  const origin = areaLookup?.(areaSlug)
  return gigs.filter((g) => {
    if (g.area_slug === areaSlug) return true
    if (radiusKm === 0) return g.distance_km !== null && g.distance_km < 1
    let dist = g.distance_km
    if (dist === null && origin && areaLookup) {
      const target = areaLookup(g.area_slug)
      if (target) dist = distanceKm(origin, target)
    }
    return dist !== null && dist <= radiusKm
  })
}

const SUBURB_ALIASES: Record<string, RegExp> = {
  soweto: /\b(soweto|orlando|diepkloof|meadowlands|dobsonville|pimville|protea glen|jabulani|zola|chiawelo|dube|mofolo|klipspruit|eldeorado park|naledi)\b/i,
  alexandra: /\b(alexandra|alex\b|tsutsumani|east bank)\b/i,
  sandton: /\b(sandton|rivonia|morningside|bryanston|fourways|sunninghill|paulshof|lonehill|hyde park)\b/i,
  randburg: /\b(randburg|ferndale|blairgowrie|linden|northcliff|cresta|bordeaux|cosmo city)\b/i,
  rosebank: /\b(rosebank|parkhurst|parktown|melrose|illovo|greenside|craighall)\b/i,
  braamfontein: /\b(braamfontein|auckland park|melville|newtown|brixton)\b/i,
  'joburg-cbd': /\b(johannesburg cbd|joburg cbd|marshalltown|maboneg|jeppestown|hillbrow|yeoville|berea|doornfontein)\b/i,
  roodepoort: /\b(roodepoort|florida|horison|weltevreden|honeydew|ruimsig|witpoortjie)\b/i,
  midrand: /\b(midrand|carlswald|vorna valley|halfway house|kyalami|noordwyk|waterfall)\b/i,
  tembisa: /\b(tembisa|thembisa|ivory park|ebony park|olifantsfontein|birchleigh)\b/i,
}

/**
 * Resolves the public area slug for a job from the poster's typed street address and their profile area.
 * Only the area is ever shown publicly; the actual street address stays encrypted in gig_private.
 */
export function resolveAreaFromAddress(
  address: string,
  posterAreaSlug: string | null | undefined,
  areas: readonly { slug: string; name: string; city: string }[] = [],
): string {
  const clean = address.trim()
  if (clean.length >= 3) {
    for (const a of areas) {
      const re = new RegExp(`\\b${a.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
      if (re.test(clean)) return a.slug
    }
    for (const [slug, re] of Object.entries(SUBURB_ALIASES)) {
      if (re.test(clean) && (areas.length === 0 || areas.some((a) => a.slug === slug))) {
        return slug
      }
    }
  }
  return posterAreaSlug || ''
}
