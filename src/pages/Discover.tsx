import { useMemo, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Compass, Search } from 'lucide-react'
import { discoverGigs, PAGE_SIZE } from '../lib/api'
import { useAuth } from '../lib/auth'
import { CATEGORIES } from '../lib/categories'
import { useAreaLookup } from '../lib/hooks'
import { Button, ButtonLink, EmptyState, ErrorState, Skeleton } from '../components/ui'
import { CategoryIcon } from '../components/CategoryIcon'
import { GigCard } from '../components/gig/GigCard'
import { AreaSelect } from '../components/AreaSelect'
import { LiveJobsActivitySlider } from '../components/activity/LiveJobsActivitySlider'

export default function Discover() {
  const { profile } = useAuth()
  const areaOf = useAreaLookup()
  const [areaOverride, setAreaOverride] = useState<string | null>(null)
  const [params, setParams] = useSearchParams()
  const category = CATEGORIES.some((c) => c.slug === params.get('category')) ? params.get('category') : null
  const setCategory = (value: string | null) => setParams((previous) => { const next = new URLSearchParams(previous); if (value) next.set('category', value); else next.delete('category'); return next })
  const hasSkills = Boolean(profile?.skills?.length)
  const [skillsOnly, setSkillsOnly] = useState(false)

  const area = areaOverride ?? profile?.area_slug ?? ''
  const skills = skillsOnly && hasSkills ? profile!.skills : null

  const query = useInfiniteQuery({
    queryKey: ['discover', area, category, skills],
    queryFn: ({ pageParam }) => discoverGigs({ area: area || null, category, skills, page: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.length === PAGE_SIZE ? pages.length : undefined),
  })
  const gigs = useMemo(() => query.data?.pages.flat() ?? [], [query.data])
  const skillSet = new Set(profile?.skills ?? [])

  return (
    <div>
      <div className="relative mb-6 overflow-hidden rounded-2xl border border-line bg-surface p-6 sm:p-8 shadow-sm">
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-brand-500">
          <span className="size-1.5 rounded-full bg-brand-600" aria-hidden /> Work Marketplace
        </span>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-4xl [&>em]:font-normal [&>em]:text-brand-500">
          Find verified work <em>close to home.</em>
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft sm:text-base">
          Transparent pay before you apply. Every client-confirmed job directly builds your tamper-proof ProofScript reputation.
        </p>
      </div>

      {profile?.role === 'worker' && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 sm:p-5">
          <div>
            <h2 className="font-semibold text-ink">Working towards an earnings target?</h2>
            <p className="text-sm text-ink-soft">Build an income plan around your skills, time and goal.</p>
          </div>
          <ButtonLink to="/money/earn-goal" size="sm">
            Earn My Goal →
          </ButtonLink>
        </div>
      )}

      <div className="relative mb-6 overflow-hidden rounded-2xl border border-deep-soft bg-deep p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label htmlFor="area-filter" className="text-xs font-semibold uppercase tracking-wider text-deep-ink sm:w-20">
              Location
            </label>
            <div className="sm:w-72">
              <AreaSelect id="area-filter" value={area} onChange={(v) => setAreaOverride(v)} placeholder="Anywhere in South Africa" />
            </div>
            {hasSkills && (
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-xs font-semibold text-deep-ink sm:ml-3">
                <input
                  type="checkbox"
                  className="size-4 accent-brand-600 rounded"
                  checked={skillsOnly}
                  onChange={(e) => setSkillsOnly(e.target.checked)}
                />
                Only gigs that match my skills
              </label>
            )}
          </div>
          <p className="text-xs text-deep-ink/80">{area ? `Sorted closest to ${areaOf(area)?.name ?? 'your area'}` : 'Choose an area to sort by proximity'}</p>
        </div>

        <div className="-mx-5 overflow-x-auto px-5 pb-1 no-scrollbar" role="group" aria-label="Filter by category">
          <div className="flex w-max gap-2">
            <button
              type="button"
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                category === null
                  ? 'bg-canvas text-deep font-semibold'
                  : 'bg-white/5 border border-white/15 text-deep-ink hover:bg-white/15 hover:text-white'
              }`}
              aria-pressed={category === null}
              onClick={() => setCategory(null)}
            >
              All work
            </button>
            {CATEGORIES.map((c) => {
              const active = category === c.slug
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
                  onClick={() => setCategory(active ? null : c.slug)}
                >
                  <CategoryIcon category={c.slug} className="size-4" /> {c.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <LiveJobsActivitySlider />

      {query.isPending ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : gigs.length === 0 ? (
        <EmptyState
          icon={<Search className="size-5" aria-hidden />}
          title="No open gigs match yet"
          action={
            <Button variant="secondary" onClick={() => { setCategory(null); setSkillsOnly(false); setAreaOverride('') }}>
              Show all gigs
            </Button>
          }
        >
          Try a different category or remove the skills filter. You can also check back for new opportunities.
        </EmptyState>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between text-xs text-ink-soft">
            <p className="inline-flex items-center gap-1.5 font-medium" aria-live="polite">
              <Compass className="size-3.5 text-brand-500" aria-hidden />
              Showing <strong className="text-ink">{gigs.length}{query.hasNextPage ? '+' : ''}</strong> open gig{gigs.length === 1 ? '' : 's'}
            </p>
            <span className="hidden sm:inline-block text-[11px] text-muted">Direct payout upon customer confirmation</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {gigs.map((g) => (
              <GigCard key={g.id} gig={g} matchesSkills={skillSet.has(g.category)} />
            ))}
          </div>
          {query.hasNextPage && (
            <div className="mt-6 text-center">
              <Button variant="secondary" loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
                Load more gigs
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
