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
import { LiveJobsActivitySlider } from '../components/activity/LiveJobsActivitySlider'

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
        eyebrow="Marketplace of Skills"
        title={<>Book a service <em>near you.</em></>}
        subtitle="Local people list what they do and what it costs. The price you see is the price you pay — nothing is added later."
        action={profile?.role === 'worker' ? <ButtonLink to="/my-services" variant="secondary">List your own service</ButtonLink> : undefined}
      />

      <div className="relative mb-6 overflow-hidden rounded-2xl border border-[#24525b]/80 bg-[#1b3e45] p-5 shadow-[0_4px_24px_rgba(0,0,0,0.25)] space-y-4">
        <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-teal-400/10 blur-3xl" aria-hidden />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label htmlFor="service-area" className="text-xs font-bold uppercase tracking-wider text-[#d4eff4] sm:w-20">
              Location
            </label>
            <div className="sm:w-72">
              <AreaSelect id="service-area" value={area} onChange={(v) => setAreaOverride(v)} placeholder="Anywhere in South Africa" />
            </div>
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
              All services
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

      <LiveJobsActivitySlider
        title="Recent Verified Bookings"
        subtitle="Confirmed customer ratings & reviews from local services"
      />

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
          <div className="mb-4 flex items-center justify-between text-xs text-[#94A3B8]">
            <p className="inline-flex items-center gap-1.5 font-medium" aria-live="polite">
              <Store className="size-3.5 text-[#14B8A6]" aria-hidden />
              Showing <strong className="text-[#F1F5F9]">{services.length}{query.hasNextPage ? '+' : ''}</strong> service{services.length === 1 ? '' : 's'}
            </p>
            <span className="hidden sm:inline-block text-[11px] text-[#64748B]">Transparent direct pricing · nothing added later</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
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
