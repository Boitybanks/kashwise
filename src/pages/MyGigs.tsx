import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, ClipboardList, Plus, Store, Users } from 'lucide-react'
import { fetchPostedGigs } from '../lib/api'
import { useAuth } from '../lib/auth'
import { categoryEmoji } from '../lib/categories'
import { formatDay } from '../lib/format'
import { formatRand } from '../lib/money'
import { ButtonLink, EmptyState, ErrorState, PageHeader, Skeleton, StatusPill } from '../components/ui'

export default function MyGigs() {
  const { userId, profile } = useAuth()
  const [tab, setTab] = useState<'active' | 'past'>('active')
  const q = useQuery({ queryKey: ['posted', userId], queryFn: () => fetchPostedGigs(userId!), enabled: Boolean(userId), refetchInterval: 15000 })

  const gigs = q.data ?? []
  const active = gigs.filter((g) => ['open', 'matched', 'in_progress'].includes(g.status))
  const past = gigs.filter((g) => ['completed', 'cancelled'].includes(g.status))
  const shown = tab === 'active' ? active : past
  const needsAction = active.filter((g) => (g.status === 'open' && g.applicant_count > 0) || (g.status === 'in_progress' && g.worker_done_at)).length

  return (
    <div>
      <PageHeader
        title={`Sawubona, ${profile?.display_name.split(' ')[0] ?? 'there'}`}
        subtitle={needsAction ? `${needsAction} gig${needsAction > 1 ? 's need' : ' needs'} your attention.` : 'Your posted gigs, booked services and their progress.'}
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink to="/services" variant="secondary"><Store className="size-4" aria-hidden /> Book a service</ButtonLink>
            <ButtonLink to="/gigs/new"><Plus className="size-4" aria-hidden /> Post a gig</ButtonLink>
          </div>
        }
      />
      <div role="tablist" aria-label="Gig list" className="mb-4 inline-flex rounded-xl bg-white p-1 ring-1 ring-line">
        {(['active', 'past'] as const).map((t) => (
          <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${tab === t ? 'bg-brand-600 text-white' : 'text-ink-soft'}`}>
            {t === 'active' ? `Active (${active.length})` : `Past (${past.length})`}
          </button>
        ))}
      </div>

      {q.isPending ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : shown.length === 0 ? (
        <EmptyState icon={<ClipboardList className="size-5" aria-hidden />} title={tab === 'active' ? 'No active gigs' : 'No past gigs yet'}
          action={tab === 'active' ? <ButtonLink to="/gigs/new">Post your first gig</ButtonLink> : undefined}>
          {tab === 'active' ? 'Need a hand with something? Post it and people nearby can apply.' : 'Completed and cancelled gigs will appear here.'}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {shown.map((g) => (
            <li key={g.id}>
              <Link to={`/gigs/${g.id}`} className="card flex items-center gap-3 p-4 hover:border-brand-200">
                <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-canvas text-xl">{categoryEmoji(g.category)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{g.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <StatusPill status={g.status} />
                    <span>{formatDay(g.scheduled_date)}</span>
                    <span>· you pay {formatRand(g.total_cents)}</span>
                    {g.service_id && <span className="font-semibold text-sky-800">· Booked service</span>}
                    {g.status === 'open' && (
                      <span className={`inline-flex items-center gap-1 font-semibold ${g.applicant_count ? 'text-clay-600' : ''}`}>
                        <Users className="size-3.5" aria-hidden /> {g.applicant_count} applied
                      </span>
                    )}
                    {g.status === 'in_progress' && g.worker_done_at && <span className="font-semibold text-clay-600">Worker says it’s done — confirm</span>}
                  </div>
                </div>
                <ChevronRight className="size-5 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
