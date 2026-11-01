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
import { CategoryIcon } from '../components/CategoryIcon'

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
      <PageHeader
        eyebrow="ProofScript Directory"
        title={<>Skilled hands. <em>Proven results.</em></>}
        subtitle="Every rating and verified count comes from a customer-confirmed KashWise job."
      />

      <div className="relative mb-6 overflow-hidden rounded-2xl border border-deep-soft bg-deep p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label htmlFor="w-area" className="text-xs font-semibold uppercase tracking-wider text-deep-ink sm:w-20">
              Location
            </label>
            <div className="sm:w-72">
              <AreaSelect id="w-area" value={area} onChange={setAreaOverride} placeholder="Anywhere in South Africa" />
            </div>
          </div>
          <p className="text-xs text-deep-ink/80">{area ? `Sorted closest to ${area}` : 'Choose an area to sort by proximity'}</p>
        </div>

        <div className="-mx-5 overflow-x-auto px-5 pb-1 no-scrollbar" role="group" aria-label="Filter by skill">
          <div className="flex w-max gap-2">
            <button
              type="button"
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                skill === null
                  ? 'bg-canvas text-deep font-semibold'
                  : 'bg-white/5 border border-white/15 text-deep-ink hover:bg-white/15 hover:text-white'
              }`}
              aria-pressed={skill === null}
              onClick={() => setSkill(null)}
            >
              All skills
            </button>
            {CATEGORIES.map((c) => {
              const active = skill === c.slug
              return (
                <button
                  key={c.slug}
                  type="button"
                  className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                    active
                      ? 'bg-canvas text-deep font-semibold'
                      : 'bg-white/5 border border-white/15 text-deep-ink hover:bg-white/15 hover:text-white'
                  }`}
                  aria-pressed={active}
                  onClick={() => setSkill(active ? null : c.slug)}
                >
                  <CategoryIcon category={c.slug} className="size-4" /> {c.label}
                </button>
              )
            })}
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
          <div className="mb-4 flex items-center justify-between text-xs text-ink-soft">
            <p className="inline-flex items-center gap-1.5 font-medium" aria-live="polite">
              <Users className="size-3.5 text-brand-500" aria-hidden />
              Showing <strong className="text-ink">{workers.length}{q.hasNextPage ? '+' : ''}</strong> verified profile{workers.length === 1 ? '' : 's'}
            </p>
            <span className="hidden sm:inline-block text-[11px] text-muted">Customer-confirmed ProofScripts</span>
          </div>
          <ul className="grid gap-4 md:grid-cols-2">
            {workers.map((w) => (
              <li key={w.id} className="min-w-0">
                <Link
                  to={`/w/${w.id}`}
                  className="group relative flex gap-4 rounded-2xl border border-line bg-surface p-5 transition-all duration-300 hover:-translate-y-1 hover:border-brand-200 hover:bg-surface-elevated hover:shadow-[0_12px_28px_rgba(0,0,0,0.4)]"
                >
                  <Avatar name={w.display_name} id={w.id} src={avatarUrl(w.avatar_path)} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink transition-colors group-hover:text-brand-700">{w.display_name}</p>
                      {w.is_demo && <DemoBadge />}
                    </div>
                    {w.headline && <p className="truncate text-sm text-ink-soft">{w.headline}</p>}
                    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-soft">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3.5 text-muted" aria-hidden />
                        {w.area_name}{w.distance_km !== null && ` · ${formatDistance(w.distance_km)}`}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-sun-50 px-2 py-0.5 font-semibold text-gold-600 border border-sun-300">
                        <BadgeCheck className="size-3.5 fill-gold-500/20 text-gold-600" aria-hidden />
                        {w.completed} verified
                      </span>
                      {w.avg_rating && (
                        <span className="inline-flex items-center gap-1 font-semibold text-ink">
                          <Star className="size-3.5 fill-gold-500 text-gold-600" aria-hidden />
                          {w.avg_rating} <span className="text-muted">({w.review_count})</span>
                        </span>
                      )}
                    </p>
                    {w.skills.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {w.skills.map((s) => (
                          <span key={s} className="rounded-md bg-canvas border border-line px-2 py-0.5 text-[11px] font-medium text-ink-soft">
                            {categoryLabel(s)}
                          </span>
                        ))}
                      </div>
                    )}
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
