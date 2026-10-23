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
