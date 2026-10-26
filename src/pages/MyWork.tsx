import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Award, BadgeCheck, Briefcase, ChevronRight, Compass, Hourglass, Wallet } from 'lucide-react'
import { fetchAssignedGigs, fetchMyApplications, fetchWorkerStats } from '../lib/api'
import { useAuth } from '../lib/auth'
import { categoryEmoji } from '../lib/categories'
import { formatDay, timeAgo } from '../lib/format'
import { formatRand, workerNetCents } from '../lib/money'
import type { Gig } from '../lib/types'
import { ButtonLink, Card, EmptyState, ErrorState, PageHeader, Skeleton, StatusPill } from '../components/ui'

function GigRow({ gig, note }: { gig: Gig; note?: string }) {
  return (
    <Link to={`/gigs/${gig.id}`} className="group flex items-center gap-4 rounded-2xl border border-[#1E293B] bg-[#141A21] p-4 transition-all hover:border-[#0D9488]/50 hover:bg-[#18232d] shadow-sm">
      <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#0B0F14] border border-[#24525b]/50 text-xl">{categoryEmoji(gig.category)}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-[#F1F5F9] transition-colors group-hover:text-white">{gig.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#94A3B8]">
          <StatusPill status={gig.status} />
          <span>{formatDay(gig.scheduled_date)}</span>
          <span className="font-semibold text-[#14B8A6] tabular-nums">· you receive {formatRand(workerNetCents(gig.payout_cents))}</span>
          {note && <span className="text-[#64748B]">· {note}</span>}
        </div>
      </div>
      <ChevronRight className="size-5 text-[#64748B] transition-transform group-hover:translate-x-0.5 group-hover:text-white" aria-hidden />
    </Link>
  )
}

export default function MyWork() {
  const { userId, profile } = useAuth()
  const jobsQ = useQuery({ queryKey: ['assigned', userId], queryFn: () => fetchAssignedGigs(userId!), enabled: Boolean(userId), refetchInterval: 15000 })
  const appsQ = useQuery({ queryKey: ['my-applications', userId], queryFn: () => fetchMyApplications(userId!), enabled: Boolean(userId) })
  const statsQ = useQuery({ queryKey: ['worker-stats', userId], queryFn: () => fetchWorkerStats(userId!), enabled: Boolean(userId) })

  const jobs = jobsQ.data ?? []
  const current = jobs.filter((g) => g.status === 'matched' || g.status === 'in_progress')
  const done = jobs.filter((g) => g.status === 'completed')
  const pending = (appsQ.data ?? []).filter((a) => a.status === 'pending' && a.gig)
  const s = statsQ.data

  return (
    <div>
      <PageHeader
        eyebrow="Worker Dashboard"
        title={<>Your work, <em>{profile?.display_name.split(' ')[0] ?? 'there'}.</em></>}
        subtitle="Jobs you’re doing, applications you’ve sent and what you’ve earned."
      />

      <div className="mb-8 grid grid-cols-3 gap-3 sm:gap-4">
        <Card className="p-4 sm:p-5 border border-[#1E293B] bg-gradient-to-b from-[#141A21] to-[#10161d] rounded-2xl">
          <Wallet className="size-5 text-[#14B8A6]" aria-hidden />
          <p className="mt-2 text-xl font-extrabold tabular-nums sm:text-2xl text-[#F1F5F9]">{s?.earned_cents !== undefined && s?.earned_cents !== null ? formatRand(s.earned_cents) : '—'}</p>
          <Link to="/wallet" className="text-xs font-semibold text-[#14B8A6] hover:underline">earned · open wallet →</Link>
        </Card>
        <Card className="p-4 sm:p-5 border border-[#1E293B] bg-gradient-to-b from-[#141A21] to-[#10161d] rounded-2xl">
          <BadgeCheck className="size-5 text-[#D4A017] fill-[#D4A017]/20" aria-hidden />
          <p className="mt-2 text-xl font-extrabold tabular-nums sm:text-2xl text-[#F1F5F9]">{s?.completed ?? '—'}</p>
          <p className="text-xs text-[#94A3B8]">verified gigs</p>
        </Card>
        <Card className="p-4 sm:p-5 border border-[#1E293B] bg-gradient-to-b from-[#141A21] to-[#10161d] rounded-2xl">
          <Award className="size-5 text-[#D4A017]" aria-hidden />
          <p className="mt-2 text-xl font-extrabold tabular-nums sm:text-2xl text-[#F1F5F9]">{s?.avg_rating ?? '—'}</p>
          <p className="text-xs text-[#94A3B8]">average rating</p>
        </Card>
      </div>

      <section aria-labelledby="current-h" className="mb-8">
        <h2 id="current-h" className="mb-3 flex items-center gap-2 text-lg font-bold"><Briefcase className="size-5 text-brand-600" aria-hidden /> Current jobs</h2>
        {jobsQ.isPending ? <Skeleton className="h-20" /> : jobsQ.isError ? <ErrorState error={jobsQ.error} onRetry={() => jobsQ.refetch()} /> : current.length === 0 ? (
          <EmptyState icon={<Compass className="size-5" aria-hidden />} title="No jobs in progress" action={<ButtonLink to="/discover">Find work near you</ButtonLink>}>
            When a customer chooses you, the job shows up here.
          </EmptyState>
        ) : (
          <ul className="space-y-3">{current.map((g) => <li key={g.id}><GigRow gig={g} note={g.status === 'matched' ? (g.service_id ? 'new booking · tap to start' : 'tap to start') : g.worker_done_at ? 'waiting for confirmation' : 'mark as done when finished'} /></li>)}</ul>
        )}
      </section>

      <section aria-labelledby="apps-h" className="mb-8">
        <h2 id="apps-h" className="mb-3 flex items-center gap-2 text-lg font-bold"><Hourglass className="size-5 text-sun-600" aria-hidden /> Waiting to hear back</h2>
        {appsQ.isPending ? <Skeleton className="h-20" /> : pending.length === 0 ? (
          <p className="card p-4 text-sm text-muted">No pending applications. <Link to="/discover" className="font-semibold text-brand-700 underline">Browse open gigs</Link></p>
        ) : (
          <ul className="space-y-3">{pending.map((a) => <li key={a.id}><GigRow gig={a.gig!} note={`applied ${timeAgo(a.created_at)}`} /></li>)}</ul>
        )}
      </section>

      <p className="card mb-8 flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
        <span>Let clients book you directly: list a service at the amount you want to receive.</span>
        <ButtonLink to="/my-services" variant="secondary" size="sm">My services</ButtonLink>
      </p>

      <section aria-labelledby="done-h">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="done-h" className="flex items-center gap-2 text-lg font-bold"><BadgeCheck className="size-5 text-brand-600" aria-hidden /> Completed</h2>
          <ButtonLink to={`/w/${userId}`} variant="ghost" size="sm">View my portfolio</ButtonLink>
        </div>
        {done.length === 0 ? (
          <p className="card p-4 text-sm text-muted">Completed gigs become verified records on your portfolio automatically.</p>
        ) : (
          <ul className="space-y-3">{done.map((g) => <li key={g.id}><GigRow gig={g} /></li>)}</ul>
        )}
      </section>
    </div>
  )
}
