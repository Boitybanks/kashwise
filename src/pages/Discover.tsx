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
      <div className="relative mb-6 overflow-hidden rounded-2xl border border-[#1E293B] bg-gradient-to-r from-[#141A21] via-[#141A21] to-[#0d2e2b] p-6 sm:p-8 shadow-sm">
        <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-teal-400/10 blur-3xl" aria-hidden />
        <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#14B8A6]">
          <span className="size-1.5 rounded-full bg-[#14B8A6] shadow-[0_0_8px_#14B8A6]" aria-hidden /> Work Marketplace
        </span>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[#F1F5F9] sm:text-4xl [&>em]:font-normal [&>em]:text-[#2dd4bf]">
          Find verified work <em>close to home.</em>
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#94A3B8] sm:text-base">
          Transparent pay before you apply. Every client-confirmed job directly builds your tamper-proof ProofScript reputation.
        </p>
      </div>

      {profile?.role === 'worker' && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#0D9488]/30 bg-gradient-to-r from-[#0D9488]/15 to-[#0D9488]/5 p-4 sm:p-5">
          <div>
            <h2 className="font-bold text-[#F1F5F9]">Working towards an earnings target?</h2>
            <p className="text-sm text-[#94A3B8]">Build an income plan around your skills, time and goal.</p>
          </div>
          <ButtonLink to="/money/earn-goal" size="sm">
            Earn My Goal →
          </ButtonLink>
        </div>
      )}

      <div className="relative mb-6 overflow-hidden rounded-2xl border border-[#24525b]/80 bg-[#1b3e45] p-5 shadow-[0_4px_24px_rgba(0,0,0,0.25)] space-y-4">
        <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-teal-400/10 blur-3xl" aria-hidden />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label htmlFor="area-filter" className="text-xs font-bold uppercase tracking-wider text-[#d4eff4] sm:w-20">
              Location
            </label>
            <div className="sm:w-72">
              <AreaSelect id="area-filter" value={area} onChange={(v) => setAreaOverride(v)} placeholder="Anywhere in South Africa" />
            </div>
            {hasSkills && (
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-xs font-semibold text-[#d4eff4] sm:ml-3">
                <input
                  type="checkbox"
                  className="size-4 accent-[#0D9488] rounded"
                  checked={skillsOnly}
                  onChange={(e) => setSkillsOnly(e.target.checked)}
                />
                Only gigs that match my skills
              </label>
            )}
          </div>
          <p className="text-xs text-[#d4eff4]/80">{area ? `Sorted closest to ${areaOf(area)?.name ?? 'your area'}` : 'Choose an area to sort by proximity'}</p>
        </div>

        <div className="-mx-5 overflow-x-auto px-5 pb-1 no-scrollbar" role="group" aria-label="Filter by category">
          <div className="flex w-max gap-2">
            <button
              type="button"
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                category === null
                  ? 'bg-gradient-to-r from-[#0D9488] to-[#14B8A6] text-white shadow-[0_4px_12px_rgba(13,148,136,0.35)]'
                  : 'bg-[#0B0F14]/50 border border-white/10 text-[#d4eff4] hover:bg-[#0B0F14]/80 hover:text-white hover:border-[#14B8A6]/40'
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
                      ? 'bg-gradient-to-r from-[#0D9488] to-[#14B8A6] text-white shadow-[0_4px_12px_rgba(13,148,136,0.35)]'
                      : 'bg-[#0B0F14]/50 border border-white/10 text-[#d4eff4] hover:bg-[#0B0F14]/80 hover:text-white hover:border-[#14B8A6]/40'
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
          <div className="mb-4 flex items-center justify-between text-xs text-[#94A3B8]">
            <p className="inline-flex items-center gap-1.5 font-medium" aria-live="polite">
              <Compass className="size-3.5 text-[#14B8A6]" aria-hidden />
              Showing <strong className="text-[#F1F5F9]">{gigs.length}{query.hasNextPage ? '+' : ''}</strong> open gig{gigs.length === 1 ? '' : 's'}
            </p>
            <span className="hidden sm:inline-block text-[11px] text-[#64748B]">Direct payout upon customer confirmation</span>
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
