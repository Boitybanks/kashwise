import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, ClipboardList, Plus, Users } from 'lucide-react'
import { fetchPostedGigs, fetchSavedProviders } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatDay } from '../lib/format'
import { formatRand } from '../lib/money'
import { ButtonLink, EmptyState, ErrorState, PageHeader, Skeleton, StatusPill } from '../components/ui'
import { CategoryIcon } from '../components/CategoryIcon'
import { SavedProvidersSection } from '../components/service/SavedProvidersSection'

export default function MyGigs() {
  const { userId, profile } = useAuth()
  const [tab, setTab] = useState<'active' | 'past' | 'providers'>('active')
  const q = useQuery({ queryKey: ['posted', userId], queryFn: () => fetchPostedGigs(userId!), enabled: Boolean(userId), refetchInterval: 15000 })
  const providersQ = useQuery({
    queryKey: ['saved-providers', userId],
    queryFn: () => fetchSavedProviders(userId!),
    enabled: Boolean(userId),
  })

  const gigs = q.data ?? []
  const savedProviders = providersQ.data ?? []
  const waiting = (g: (typeof gigs)[number]) => (g.status === 'open' && g.applicant_count > 0) || (g.status === 'in_progress' && Boolean(g.worker_done_at))
  // Gigs waiting on the client come first.
  const active = gigs.filter((g) => ['open', 'matched', 'in_progress'].includes(g.status)).sort((a, b) => Number(waiting(b)) - Number(waiting(a)))
  const past = gigs.filter((g) => ['completed', 'cancelled'].includes(g.status))
  const shown = tab === 'active' ? active : past
  const needsAction = active.filter(waiting).length

  return (
    <div className="space-y-8">
      <div>
        <PageHeader
          title={<>Sawubona, <em>{profile?.display_name.split(' ')[0] ?? 'there'}.</em></>}
          subtitle={needsAction ? `${needsAction} gig${needsAction > 1 ? 's need' : ' needs'} you.` : undefined}
          action={<ButtonLink to="/gigs/new" size="lg"><Plus className="size-4" aria-hidden /> Post a gig</ButtonLink>}
        />
        <div role="tablist" aria-label="Gig list" className="mb-6 inline-flex flex-wrap rounded-2xl bg-surface p-1.5 border border-line">
          {([
            ['active', `Active (${active.length})`],
            ['past', `Past (${past.length})`],
            ['providers', `My service providers (${savedProviders.length})`],
          ] as const).map(([t, label]) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`min-h-10 rounded-xl px-4 text-xs font-semibold transition-all ${
                tab === t ? 'bg-brand-600 text-white shadow-sm' : 'text-ink-soft hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'providers' ? (
          userId && (
            <SavedProvidersSection
              clientId={userId}
              providers={savedProviders}
              isLoading={providersQ.isPending}
              onChanged={() => {
                providersQ.refetch()
              }}
            />
          )
        ) : q.isPending ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : shown.length === 0 ? (
          <EmptyState icon={<ClipboardList className="size-5" aria-hidden />} title={tab === 'active' ? 'No active gigs' : 'No past gigs yet'}
            action={tab === 'active' ? <ButtonLink to="/gigs/new">Post your first gig</ButtonLink> : undefined}>
            {tab === 'active' ? 'Post a job and people nearby can apply.' : 'Finished gigs show here.'}
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {shown.map((g) => (
              <li key={g.id}>
                <Link to={`/gigs/${g.id}`} className={`group flex items-center gap-4 rounded-2xl border ${waiting(g) ? 'border-gold-500/60' : 'border-line'} bg-surface p-4 transition-all hover:border-brand-200 hover:bg-surface-elevated shadow-sm`}>
                  <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-xl bg-canvas border border-line text-xl"><CategoryIcon category={g.category} className="size-5 text-brand-500" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink transition-colors group-hover:text-brand-400">{g.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                      <StatusPill status={g.status} />
                      <span>{formatDay(g.scheduled_date)}</span>
                      <span className="tabular-nums">· you pay {formatRand(g.total_cents)}</span>
                      {g.service_id && <span className="font-semibold text-brand-500">· Booked service</span>}
                      {g.status === 'open' && (
                        <span className={`inline-flex items-center gap-1 font-semibold ${g.applicant_count ? 'text-gold-600' : ''}`}>
                          <Users className="size-3.5" aria-hidden /> {g.applicant_count} applied
                        </span>
                      )}
                      {g.status === 'in_progress' && g.worker_done_at && <span className="font-semibold text-brand-500">Done — please confirm</span>}
                    </div>
                  </div>
                  <ChevronRight className="size-5 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand-400" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Always show My service providers panel on the client home so they can add & request services in one tap */}
      {tab !== 'providers' && userId && (
        <div className="border-t border-line pt-6">
          <SavedProvidersSection
            clientId={userId}
            providers={savedProviders}
            isLoading={providersQ.isPending}
            onChanged={() => {
              providersQ.refetch()
            }}
          />
        </div>
      )}
    </div>
  )
}
