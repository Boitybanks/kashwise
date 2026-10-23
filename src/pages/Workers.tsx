import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import { BadgeCheck, MapPin, Star, Users } from 'lucide-react'
import { discoverWorkers, PAGE_SIZE } from '../lib/api'
import { useAuth } from '../lib/auth'
import { CATEGORIES, categoryLabel } from '../lib/categories'
import { formatDistance } from '../lib/geo'
import { Avatar, Button, DemoBadge, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui'
import { avatarUrl } from '../lib/supabase'
import { AreaSelect } from '../components/AreaSelect'

export default function Workers() {
  const { profile } = useAuth()
  const [areaOverride, setAreaOverride] = useState<string | null>(null)
  const [skill, setSkill] = useState<string | null>(null)
  const area = areaOverride ?? profile?.area_slug ?? ''

  const q = useInfiniteQuery({
    queryKey: ['workers', area, skill],
    queryFn: ({ pageParam }) => discoverWorkers({ area: area || null, skill, page: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.length === PAGE_SIZE ? pages.length : undefined),
  })
  const workers = useMemo(() => q.data?.pages.flat() ?? [], [q.data])

  return (
    <div>
      <PageHeader title="Capable people near you" subtitle="Every rating comes from a customer-confirmed KashWise job." />
      <div className="mb-5 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="w-area" className="text-sm font-semibold sm:w-24">Near</label>
          <div className="sm:w-72"><AreaSelect id="w-area" value={area} onChange={setAreaOverride} placeholder="Anywhere in South Africa" /></div>
        </div>
        <div className="-mx-4 overflow-x-auto px-4 pb-1" role="group" aria-label="Filter by skill">
          <div className="flex w-max gap-2">
            <button type="button" className="chip" aria-pressed={skill === null} onClick={() => setSkill(null)}>All skills</button>
            {CATEGORIES.map((c) => (
              <button key={c.slug} type="button" className="chip" aria-pressed={skill === c.slug} onClick={() => setSkill(skill === c.slug ? null : c.slug)}>
                <span aria-hidden>{c.emoji}</span> {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {q.isPending ? (
        <div className="grid gap-3 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : workers.length === 0 ? (
        <EmptyState icon={<Users className="size-5" aria-hidden />} title="No workers with that skill yet">
          Post a gig anyway — workers nearby are notified when they browse.
        </EmptyState>
      ) : (
        <>
          <ul className="grid gap-3 md:grid-cols-2">
            {workers.map((w) => (
              <li key={w.id}>
                <Link to={`/w/${w.id}`} className="card flex gap-3 p-4 hover:border-brand-200">
                  <Avatar name={w.display_name} id={w.id} src={avatarUrl(w.avatar_path)} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold">{w.display_name}</p>
                      {w.is_demo && <DemoBadge />}
                    </div>
                    {w.headline && <p className="truncate text-sm text-muted">{w.headline}</p>}
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden />{w.area_name}{w.distance_km !== null && ` · ${formatDistance(w.distance_km)}`}</span>
                      <span className="inline-flex items-center gap-1 font-semibold text-ink-soft"><BadgeCheck className="size-3.5 text-brand-600" aria-hidden />{w.completed} verified</span>
                      {w.avg_rating && <span className="inline-flex items-center gap-1 font-semibold text-ink-soft"><Star className="size-3.5 fill-sun-400 text-sun-400" aria-hidden />{w.avg_rating} ({w.review_count})</span>}
                    </p>
                    {w.skills.length > 0 && <p className="mt-1 truncate text-xs text-muted">{w.skills.map(categoryLabel).join(' · ')}</p>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {q.hasNextPage && (
            <div className="mt-6 text-center">
              <Button variant="secondary" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>Load more</Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
