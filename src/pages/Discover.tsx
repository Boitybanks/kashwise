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
      <div className="mb-6 rounded-2xl border border-[#1E293B] bg-gradient-to-r from-[#141A21] via-[#141A21] to-[#0d2e2b] p-6 sm:p-8">
        <span className="text-xs font-bold uppercase tracking-widest text-[#0D9488]">Work Marketplace</span>
        <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-[#F1F5F9] sm:text-3xl">Find verified work near you</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#94A3B8]">
          Transparent pay before you apply. Every client-confirmed job directly builds your tamper-proof ProofScript reputation.
        </p>
      </div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold tracking-tight">Find work near you</h2><p className="text-xs text-muted">{area ? `Closest to ${areaOf(area)?.name ?? 'your area'} first` : 'Choose an area to sort by distance'}</p></div>

      {profile?.role === 'worker' && <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#0D9488]/30 bg-[#0D9488]/15 p-4"><div><h2 className="font-semibold text-[#F1F5F9]">Working towards an earnings target?</h2><p className="text-sm text-[#94A3B8]">Build an income plan around your skills, time and goal.</p></div><ButtonLink to="/money/earn-goal" size="sm">Earn My Goal →</ButtonLink></div>}

      <div className="mb-6 space-y-4 rounded-2xl border border-[#24525b]/60 bg-[#1b3e45] p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="area-filter" className="text-sm font-semibold sm:w-24">Near</label>
          <div className="sm:w-72">
            <AreaSelect id="area-filter" value={area} onChange={(v) => setAreaOverride(v)} placeholder="Anywhere in South Africa" />
          </div>
          {hasSkills && (
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold sm:ml-4">
              <input type="checkbox" className="size-5 accent-brand-600" checked={skillsOnly} onChange={(e) => setSkillsOnly(e.target.checked)} />
              Only gigs that match my skills
            </label>
          )}
        </div>
        <div className="-mx-4 overflow-x-auto px-4 pb-1 no-scrollbar" role="group" aria-label="Filter by category">
          <div className="flex w-max gap-2">
            <button type="button" className="chip" aria-pressed={category === null} onClick={() => setCategory(null)}>
              All work
            </button>
            {CATEGORIES.map((c) => (
              <button key={c.slug} type="button" className="chip" aria-pressed={category === c.slug} onClick={() => setCategory(category === c.slug ? null : c.slug)}>
                <CategoryIcon category={c.slug} className="size-4" /> {c.label}
              </button>
            ))}
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
          <p className="mb-3 text-sm text-muted" aria-live="polite">
            <Compass className="mr-1 inline size-4" aria-hidden />
            {gigs.length}{query.hasNextPage ? '+' : ''} open gig{gigs.length === 1 ? '' : 's'}
          </p>
          <div className="grid gap-3 md:grid-cols-2">
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
