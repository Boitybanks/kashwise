import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { BadgeCheck, CalendarDays, MapPin, Plus, Search, Star, UserCheck, Users } from 'lucide-react'
import {
  discoverWorkers,
  fetchHiredBefore,
  fetchSavedProviders,
  PAGE_SIZE,
  removeClientProvider,
  saveClientProvider,
  searchWorkersByName,
  type WorkerHit,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { CATEGORIES, categoryLabel } from '../lib/categories'
import { friendlyError } from '../lib/errors'
import { formatDistance } from '../lib/geo'
import { Avatar, Button, DemoBadge, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui'
import { useToast } from '../components/ui/toast'
import { avatarUrl } from '../lib/supabase'
import { AreaSelect } from '../components/AreaSelect'
import { CategoryIcon } from '../components/CategoryIcon'
import { RequestServiceModal, SavedProvidersSection, type RequestableWorker } from '../components/service/SavedProvidersSection'

function WorkerRow({
  w,
  isClient,
  isSaved,
  onToggleSave,
  onRequest,
}: {
  w: WorkerHit
  isClient: boolean
  isSaved: boolean
  onToggleSave: (w: WorkerHit) => void
  onRequest: (w: WorkerHit) => void
}) {
  return (
    <li className="min-w-0">
      <div className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface p-3 hover:border-brand-200">
        <Link to={`/w/${w.id}`} className="group flex min-w-0 flex-1 items-center gap-3">
          <Avatar name={w.display_name} id={w.id} src={avatarUrl(w.avatar_path)} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold group-hover:text-brand-400">{w.display_name}</span>
            <span className="block truncate text-xs text-ink-soft">{w.headline || w.skills.map(categoryLabel).join(' · ')}</span>
          </span>
        </Link>
        {isClient && (
          <div className="flex shrink-0 items-center gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => onToggleSave(w)}>
              {isSaved ? <><UserCheck className="size-3.5" aria-hidden /> Saved</> : <><Plus className="size-3.5" aria-hidden /> Add</>}
            </Button>
            <Button size="sm" onClick={() => onRequest(w)}>
              Request service
            </Button>
          </div>
        )}
      </div>
    </li>
  )
}

export default function Workers() {
  const { profile, userId } = useAuth()
  const toast = useToast()
  const isClient = Boolean(userId) && profile?.role === 'customer'
  const [query, setQuery] = useState('')
  const [term, setTerm] = useState('')
  const [requestingWorker, setRequestingWorker] = useState<RequestableWorker | null>(null)
  useEffect(() => {
    const t = window.setTimeout(() => setTerm(query.trim()), 300)
    return () => window.clearTimeout(t)
  }, [query])
  const searching = term.length >= 2
  const searchQ = useQuery({ queryKey: ['worker-search', term], queryFn: () => searchWorkersByName(term), enabled: searching })
  const hiredQ = useQuery({ queryKey: ['hired-before', userId], queryFn: () => fetchHiredBefore(userId!), enabled: isClient })
  const savedQ = useQuery({
    queryKey: ['saved-providers', userId],
    queryFn: () => fetchSavedProviders(userId!),
    enabled: isClient,
  })
  const hired = hiredQ.data ?? []
  const savedProviders = useMemo(() => savedQ.data ?? [], [savedQ.data])
  const savedIds = useMemo(() => new Set(savedProviders.map((p) => p.worker_id)), [savedProviders])

  const [areaOverride, setAreaOverride] = useState<string | null>(null)
  const [skill, setSkill] = useState<string | null>(null)
  const area = areaOverride ?? profile?.area_slug ?? ''

  const q = useInfiniteQuery({
    queryKey: ['workers', area, skill],
    queryFn: ({ pageParam }) => discoverWorkers({ area: area || null, skill, page: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.length === PAGE_SIZE ? pages.length : undefined),
  })
  const workers = useMemo(
    () => (q.data?.pages.flat() ?? []).filter((w) => !w.is_demo),
    [q.data],
  )

  async function toggleSavedProvider(w: { id: string; display_name: string }) {
    if (!userId) return
    try {
      if (savedIds.has(w.id)) {
        await removeClientProvider(userId, w.id)
        toast.show(`${w.display_name} removed from your service providers.`)
      } else {
        await saveClientProvider(userId, w.id, null)
        toast.show(`${w.display_name} added to your service providers.`)
      }
      await savedQ.refetch()
    } catch (err) {
      toast.show(friendlyError(err), 'error')
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="ProofScript Directory"
        title={<>Skilled hands. <em>Proven results.</em></>}
        subtitle="Every rating and verified count comes from a customer-confirmed KashWise job."
      />

      {isClient && userId && (
        <div className="mb-8 rounded-2xl border border-line bg-surface/60 p-5">
          <SavedProvidersSection
            clientId={userId}
            providers={savedProviders}
            isLoading={savedQ.isPending}
            onChanged={() => savedQ.refetch()}
          />
        </div>
      )}

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input type="search" aria-label="Search workers by name" placeholder="Search by name" className="input pl-10"
          value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {searching ? (
        searchQ.isPending ? <Skeleton className="h-20" /> : searchQ.isError ? <ErrorState error={searchQ.error} onRetry={() => searchQ.refetch()} /> : (searchQ.data ?? []).length === 0 ? (
          <EmptyState icon={<Search className="size-5" aria-hidden />} title={`No worker called “${term}”`}>Check the spelling, or browse by skill below.</EmptyState>
        ) : (
          <ul className="space-y-2" aria-label="Search results">
            {searchQ.data!.map((w) => (
              <WorkerRow
                key={w.id}
                w={w}
                isClient={isClient}
                isSaved={savedIds.has(w.id)}
                onToggleSave={toggleSavedProvider}
                onRequest={(worker) => setRequestingWorker(worker)}
              />
            ))}
          </ul>
        )
      ) : (
      <>
      {hired.length > 0 && (
        <section aria-labelledby="hired-h" className="mb-6">
          <h2 id="hired-h" className="mb-2 text-sm font-semibold">Hired before</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {hired.map((w) => (
              <WorkerRow
                key={w.id}
                w={w}
                isClient={isClient}
                isSaved={savedIds.has(w.id)}
                onToggleSave={toggleSavedProvider}
                onRequest={(worker) => setRequestingWorker(worker)}
              />
            ))}
          </ul>
        </section>
      )}

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
                  ? 'bg-brand-600 text-white font-semibold'
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
                      ? 'bg-brand-600 text-white font-semibold'
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
          </div>
          <ul className="grid gap-4 md:grid-cols-2">
            {workers.map((w) => {
              const isSaved = savedIds.has(w.id)
              return (
                <li key={w.id} className="min-w-0">
                  <div className="group relative flex flex-col justify-between gap-3 rounded-2xl border border-line bg-surface p-5 transition-all duration-300 hover:border-brand-200 hover:bg-surface-elevated">
                    <Link to={`/w/${w.id}`} className="flex gap-4">
                      <Avatar name={w.display_name} id={w.id} src={avatarUrl(w.avatar_path)} size="lg" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-ink transition-colors group-hover:text-brand-400">{w.display_name}</p>
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

                    {isClient && (
                      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => toggleSavedProvider(w)}
                        >
                          {isSaved ? (
                            <><UserCheck className="size-3.5" aria-hidden /> In my providers</>
                          ) : (
                            <><Plus className="size-3.5" aria-hidden /> Add service provider</>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            setRequestingWorker({
                              id: w.id,
                              display_name: w.display_name,
                              headline: w.headline,
                              area_slug: w.area_slug,
                              skills: w.skills,
                              avatar_path: w.avatar_path,
                              is_demo: w.is_demo,
                            })
                          }
                        >
                          <CalendarDays className="size-3.5" aria-hidden /> Request service
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          {q.hasNextPage && (
            <div className="mt-6 text-center">
              <Button variant="secondary" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>Load more</Button>
            </div>
          )}
        </>
      )}
      </>
      )}

      {requestingWorker && (
        <RequestServiceModal worker={requestingWorker} onClose={() => setRequestingWorker(null)} />
      )}
    </div>
  )
}
