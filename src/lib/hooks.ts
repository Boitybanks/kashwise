import { useQuery } from '@tanstack/react-query'
import { fetchAreas } from './api'
import type { Area } from './types'

export function useAreas() {
  return useQuery({ queryKey: ['areas'], queryFn: fetchAreas, staleTime: Infinity, gcTime: Infinity })
}

export function useAreaLookup(): (slug: string | null | undefined) => Area | undefined {
  const { data } = useAreas()
  return (slug) => data?.find((a) => a.slug === slug)
}

export function areaLabel(area: Area | undefined, fallback = ''): string {
  return area ? `${area.name}, ${area.city}` : fallback
}
