import { useMemo, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Compass, MapPin } from 'lucide-react'
import { discoverGigs, updateProfile } from '../lib/api'
import { useAuth } from '../lib/auth'
import { CATEGORIES } from '../lib/categories'
import {
  filterGigsByVicinity,
  nextVicinityRadius,
  VICINITY_STEPS,
  vicinityLabel,
  type VicinityRadius,
} from '../lib/geo'
import { useAreaLookup } from '../lib/hooks'
import { Button, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui'
import { GigCard } from '../components/gig/GigCard'
import { matchReasons } from '../lib/ibanks/match'
import { AreaSelect } from '../components/AreaSelect'

const DISCOVER_BATCH = 50

export default function Discover() {
  const { profile, userId, refreshProfile } = useAuth()
  const areaOf = useAreaLookup()
  const [areaOverride, setAreaOverride] = useState<string | null>(null)
  // Check gigs in my area first (radiusKm = 0), then let the user expand the vicinity step by step.
  const [radiusKm, setRadiusKm] = useState<VicinityRadius>(0)
  const [params, setParams] = useSearchParams()
  const category = CATEGORIES.some((c) => c.slug === params.get('category')) ? params.get('category') : null
  const setCategory = (value: string | null) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      if (value) next.set('category', value)
      else next.delete('category')
      return next
    })
  const isWorker = profile?.role === 'worker'
  const hasSkills = isWorker && Boolean(profile?.skills?.length)
  const [showAll, setShowAll] = useState(false)
  const paused = isWorker && profile?.open_to_work === false

  const area = areaOverride ?? profile?.area_slug ?? ''
  const selectedArea = areaOf(area)
  const myArea = areaOf(profile?.area_slug)
  // Workers see work that fits their skills first. Choosing a category or "All work" widens it.
  const matched = hasSkills && !showAll && !category
  const skills = matched ? profile!.skills : null

  const query = useInfiniteQuery({
    queryKey: ['discover', area, category, skills],
    queryFn: ({ pageParam }) =>
      discoverGigs({ area: area || null, category, skills, page: pageParam, limit: DISCOVER_BATCH }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.length === DISCOVER_BATCH ? pages.length : undefined),
  })
  const allGigs = useMemo(() => query.data?.pages.flat() ?? [], [query.data])

  const effectiveRadius: VicinityRadius = area ? radiusKm : null
  const gigs = useMemo(
    () => filterGigsByVicinity(allGigs, area, effectiveRadius, areaOf),
    [allGigs, area, effectiveRadius, areaOf],
  )

  const nextRadius = area ? nextVicinityRadius(effectiveRadius) : undefined
  const nextRadiusCount = useMemo(() => {
    if (!area || nextRadius === undefined) return 0
    return filterGigsByVicinity(allGigs, area, nextRadius, areaOf).length
  }, [allGigs, area, nextRadius, areaOf])

  function handleAreaChange(newArea: string) {
    setAreaOverride(newArea)
    // When choosing a specific area, check gigs in that area first; when choosing "Anywhere", show all.
    setRadiusKm(newArea ? 0 : null)
  }

  function expandVicinity() {
    if (nextRadius !== undefined) {
      setRadiusKm(nextRadius)
    } else {
      setAreaOverride('')
      setRadiusKm(null)
    }
  }

  async function resume() {
    if (!userId) return
    await updateProfile(userId, { open_to_work: true })
    await refreshProfile()
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Find work" />

      {paused && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
          <p className="text-sm">You’re not open to work.</p>
          <Button size="sm" variant="secondary" onClick={resume}>
            Open to work
          </Button>
        </div>
      )}

      <div className="mb-6 space-y-3 rounded-xl border border-deep-soft bg-deep p-3.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {hasSkills && (
            <div className="flex shrink-0 rounded-lg bg-white/5 p-1" role="group" aria-label="Which work to show">
              {[
                { label: 'My skills', all: false },
                { label: 'All work', all: true },
              ].map((o) => {
                const active = o.all ? !matched : matched
                return (
                  <button
                    key={o.label}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setShowAll(o.all)
                      if (!o.all) setCategory(null)
                    }}
                    className={`min-h-9 flex-1 whitespace-nowrap rounded-md px-3.5 text-sm font-medium transition-colors ${
                      active ? 'bg-brand-600 text-white' : 'text-deep-ink hover:text-white'
                    }`}
                  >
                    {o.label}
                  </button>
                )
              })}
            </div>
          )}
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="area-filter" className="sr-only">
                Area
              </label>
              <AreaSelect
                id="area-filter"
                value={area}
                onChange={handleAreaChange}
                placeholder="Anywhere in South Africa"
              />
            </div>
            <div>
              <label htmlFor="category-filter" className="sr-only">
                Type of work
              </label>
              <select
                id="category-filter"
                className="input"
                value={category ?? ''}
                onChange={(e) => setCategory(e.target.value || null)}
              >
                <option value="">{matched ? 'All my skills' : 'All types of work'}</option>
                {CATEGORIES.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Flexible area & expanding vicinity controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2.5">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Vicinity radius">
            <span className="mr-1 inline-flex items-center gap-1 text-xs font-semibold text-deep-ink">
              <MapPin className="size-3.5 text-brand-400" aria-hidden />
              Vicinity:
            </span>
            {profile?.area_slug && area !== profile.area_slug && (
              <button
                type="button"
                onClick={() => {
                  setAreaOverride(profile.area_slug)
                  setRadiusKm(0)
                }}
                className="rounded-lg border border-brand-400/40 bg-brand-500/15 px-2.5 py-1 text-xs font-semibold text-brand-300 transition hover:bg-brand-500/25"
              >
                My area ({myArea?.name ?? profile.area_slug})
              </button>
            )}
            {area ? (
              VICINITY_STEPS.map((step) => {
                const active = effectiveRadius === step
                const count = filterGigsByVicinity(allGigs, area, step, areaOf).length
                return (
                  <button
                    key={step === null ? 'all' : step}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setRadiusKm(step)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      active
                        ? 'bg-brand-600 text-white'
                        : 'bg-white/5 text-deep-ink hover:bg-white/15 hover:text-white'
                    }`}
                  >
                    {vicinityLabel(step, selectedArea?.name ?? area)} ({count})
                  </button>
                )
              })
            ) : (
              <span className="text-xs text-deep-ink/80">
                Showing gigs across all areas · Pick any area above to check local gigs first
              </span>
            )}
          </div>

          {area && nextRadius !== undefined && (
            <button
              type="button"
              onClick={expandVicinity}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1 text-xs font-semibold text-white transition hover:bg-brand-600"
            >
              <Compass className="size-3.5" aria-hidden />
              Expand vicinity to {vicinityLabel(nextRadius, selectedArea?.name).toLowerCase()}
              {nextRadiusCount > gigs.length ? ` (+${nextRadiusCount - gigs.length} more)` : ''}
            </button>
          )}
        </div>
      </div>

      {query.isPending ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : gigs.length === 0 ? (
        <EmptyState
          title={
            area && effectiveRadius !== null
              ? `No open gigs ${vicinityLabel(effectiveRadius, selectedArea?.name ?? area).toLowerCase()} right now`
              : matched
                ? 'Nothing open for your skills right now'
                : 'No open gigs here yet'
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {area && nextRadius !== undefined && (
                <Button onClick={expandVicinity}>
                  <Compass className="size-4" aria-hidden /> Expand vicinity ({vicinityLabel(nextRadius, selectedArea?.name)})
                  {nextRadiusCount > 0 ? ` · ${nextRadiusCount} gig${nextRadiusCount === 1 ? '' : 's'}` : ''}
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => {
                  setCategory(null)
                  setShowAll(true)
                  setAreaOverride('')
                  setRadiusKm(null)
                }}
              >
                See all work
              </Button>
            </div>
          }
        >
          {area && effectiveRadius !== null
            ? 'Expand the vicinity radius to check neighbouring areas, or choose another area above.'
            : undefined}
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {gigs.map((g) => (
              <GigCard key={g.id} gig={g} reasons={isWorker ? matchReasons(g, profile) : []} />
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {gigs.some((g) => g.is_demo) ? <p className="text-xs text-muted">Sample listings</p> : <span />}
              {area && nextRadius !== undefined && (
                <Button variant="secondary" size="sm" onClick={expandVicinity}>
                  <Compass className="size-4" aria-hidden /> Expand vicinity to{' '}
                  {vicinityLabel(nextRadius, selectedArea?.name).toLowerCase()}
                  {nextRadiusCount > gigs.length ? ` (+${nextRadiusCount - gigs.length} more)` : ''}
                </Button>
              )}
            </div>
            {query.hasNextPage && (
              <Button
                variant="secondary"
                size="sm"
                loading={query.isFetchingNextPage}
                onClick={() => query.fetchNextPage()}
              >
                Load more
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
