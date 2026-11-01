import { useMemo, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { discoverGigs, PAGE_SIZE, updateProfile } from '../lib/api'
import { useAuth } from '../lib/auth'
import { CATEGORIES } from '../lib/categories'
import { Button, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui'
import { GigCard } from '../components/gig/GigCard'
import { AreaSelect } from '../components/AreaSelect'

export default function Discover() {
  const { profile, userId, refreshProfile } = useAuth()
  const [areaOverride, setAreaOverride] = useState<string | null>(null)
  const [params, setParams] = useSearchParams()
  const category = CATEGORIES.some((c) => c.slug === params.get('category')) ? params.get('category') : null
  const setCategory = (value: string | null) => setParams((previous) => {
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
  // Workers see work that fits their skills first. Choosing a category or "All work" widens it.
  const matched = hasSkills && !showAll && !category
  const skills = matched ? profile!.skills : null

  const query = useInfiniteQuery({
    queryKey: ['discover', area, category, skills],
    queryFn: ({ pageParam }) => discoverGigs({ area: area || null, category, skills, page: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.length === PAGE_SIZE ? pages.length : undefined),
  })
  const gigs = useMemo(() => query.data?.pages.flat() ?? [], [query.data])

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
          <Button size="sm" variant="secondary" onClick={resume}>Open to work</Button>
        </div>
      )}

      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-deep-soft bg-deep p-3 sm:flex-row sm:items-center">
        {hasSkills && (
          <div className="flex shrink-0 rounded-lg bg-white/5 p-1" role="group" aria-label="Which work to show">
            {[{ label: 'My skills', all: false }, { label: 'All work', all: true }].map((o) => {
              const active = o.all ? !matched : matched
              return (
                <button key={o.label} type="button" aria-pressed={active} onClick={() => { setShowAll(o.all); if (!o.all) setCategory(null) }}
                  className={`min-h-9 flex-1 whitespace-nowrap rounded-md px-3.5 text-sm font-medium transition-colors ${active ? 'bg-brand-600 text-white' : 'text-deep-ink hover:text-white'}`}>
                  {o.label}
                </button>
              )
            })}
          </div>
        )}
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="area-filter" className="sr-only">Area</label>
            <AreaSelect id="area-filter" value={area} onChange={(v) => setAreaOverride(v)} placeholder="Anywhere in South Africa" />
          </div>
          <div>
            <label htmlFor="category-filter" className="sr-only">Type of work</label>
            <select id="category-filter" className="input" value={category ?? ''} onChange={(e) => setCategory(e.target.value || null)}>
              <option value="">{matched ? 'All my skills' : 'All types of work'}</option>
              {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {query.isPending ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-44" />)}
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : gigs.length === 0 ? (
        <EmptyState
          title={matched ? 'Nothing open for your skills right now' : 'No open gigs here yet'}
          action={<Button variant="secondary" onClick={() => { setCategory(null); setShowAll(true); setAreaOverride('') }}>See all work</Button>}
        />
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {gigs.map((g) => <GigCard key={g.id} gig={g} />)}
          </div>
          <div className="mt-6 flex items-center justify-between gap-3">
            {gigs.some((g) => g.is_demo) ? <p className="text-xs text-muted">Sample listings</p> : <span />}
            {query.hasNextPage && <Button variant="secondary" size="sm" loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>Load more</Button>}
          </div>
        </>
      )}
    </div>
  )
}
