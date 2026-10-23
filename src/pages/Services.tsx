import { useMemo, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Search, Store } from 'lucide-react'
import { discoverServices, PAGE_SIZE } from '../lib/api'
import { useAuth } from '../lib/auth'
import { CATEGORIES } from '../lib/categories'
import { useAreaLookup } from '../lib/hooks'
import { Button, ButtonLink, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui'
import { CategoryIcon } from '../components/CategoryIcon'
import { AreaSelect } from '../components/AreaSelect'
import { ServiceCard } from '../components/service/ServiceCard'

/** Clients browse services that providers have priced. Prices shown are what the client pays, nothing added. */
export default function Services() {
  const { profile, userId } = useAuth()
  const areaOf = useAreaLookup()
  const [areaOverride, setAreaOverride] = useState<string | null>(null)
  const [params, setParams] = useSearchParams()
  const category = CATEGORIES.some((c) => c.slug === params.get('category')) ? params.get('category') : null
  const setCategory = (value: string | null) => setParams((previous) => { const next = new URLSearchParams(previous); if (value) next.set('category', value); else next.delete('category'); return next })
  const area = areaOverride ?? profile?.area_slug ?? ''

  const query = useInfiniteQuery({
    queryKey: ['services', area, category],
    queryFn: ({ pageParam }) => discoverServices({ area: area || null, category, page: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.length === PAGE_SIZE ? pages.length : undefined),
  })
  const services = useMemo(() => query.data?.pages.flat() ?? [], [query.data])

  return (
    <div>
      <PageHeader
        title="Book a service near you"
        subtitle="Local people list what they do and what it costs. The price you see is the price you pay — nothing is added later."
        action={profile?.role === 'worker' ? <ButtonLink to="/my-services" variant="secondary">List your own service</ButtonLink> : undefined}
      />

      <div className="mb-6 space-y-4 rounded-xl border border-line bg-white p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="service-area" className="text-sm font-semibold sm:w-24">Near</label>
          <div className="sm:w-72">
            <AreaSelect id="service-area" value={area} onChange={(v) => setAreaOverride(v)} placeholder="Anywhere in South Africa" />
          </div>
          <p className="text-xs text-muted sm:ml-auto">{area ? `Closest to ${areaOf(area)?.name ?? 'your area'} first` : 'Choose an area to sort by distance'}</p>
        </div>
        <div className="-mx-4 overflow-x-auto px-4 pb-1" role="group" aria-label="Filter by category">
          <div className="flex w-max gap-2">
            <button type="button" className="chip" aria-pressed={category === null} onClick={() => setCategory(null)}>All services</button>
            {CATEGORIES.map((c) => (
              <button key={c.slug} type="button" className="chip" aria-pressed={category === c.slug} onClick={() => setCategory(category === c.slug ? null : c.slug)}>
                <CategoryIcon category={c.slug} className="size-4" /> {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {query.isPending ? (
        <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-48" />)}</div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : services.length === 0 ? (
        <EmptyState
          icon={<Search className="size-5" aria-hidden />}
          title="No services listed here yet"
          action={userId && profile?.role === 'customer' ? <ButtonLink to="/gigs/new">Post a gig instead</ButtonLink> : <Button variant="secondary" onClick={() => { setCategory(null); setAreaOverride('') }}>Show all services</Button>}
        >
          Try another category or area, or post a gig and let nearby people apply.
        </EmptyState>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted" aria-live="polite">
            <Store className="mr-1 inline size-4" aria-hidden />
            {services.length}{query.hasNextPage ? '+' : ''} service{services.length === 1 ? '' : 's'}
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {services.map((s) => <ServiceCard key={s.id} service={s} />)}
          </div>
          {query.hasNextPage && (
            <div className="mt-6 text-center">
              <Button variant="secondary" loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>Load more services</Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
