import { useMemo } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, BadgeCheck, ChevronRight, Compass, FileBadge, MapPin, Star, TrendingUp } from 'lucide-react'
import { discoverGigs, fetchWorkerStats } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useAreaLookup } from '../lib/hooks'
import { formatRand } from '../lib/money'
import { ButtonLink, Card, Skeleton } from '../components/ui'
import { GigCard } from '../components/gig/GigCard'
import { matchReasons } from '../lib/ibanks/match'

function greetingByHour(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function WorkerHome() {
  const { userId, profile } = useAuth()
  const areaOf = useAreaLookup()
  const area = areaOf(profile?.area_slug)
  const firstName = profile?.display_name?.split(' ')[0] ?? 'there'

  const gigsQ = useQuery({
    queryKey: ['discover', profile?.area_slug ?? 'all', null, profile?.skills ?? null],
    queryFn: () => discoverGigs({ area: profile?.area_slug || null, skills: profile?.skills, page: 0 }),
  })

  const statsQ = useQuery({
    queryKey: ['worker-stats', userId],
    queryFn: () => (userId ? fetchWorkerStats(userId) : null),
    enabled: Boolean(userId),
  })

  const stats = statsQ.data
  const availableGigs = useMemo(() => (gigsQ.data ?? []).slice(0, 3), [gigsQ.data])

  // Clients have their own home: the gigs they posted.
  if (profile && profile.role !== 'worker') return <Navigate to="/my-gigs" replace />

  const record = [
    { value: stats?.completed ?? 0, label: 'Confirmed jobs' },
    { value: stats?.avg_rating ? <span className="inline-flex items-center gap-1">{stats.avg_rating}<Star className="size-4 fill-gold-500 text-gold-500" aria-hidden /></span> : '—', label: 'Rating' },
    { value: stats?.earned_cents ? formatRand(stats.earned_cents) : 'R0', label: 'Earned' },
  ]

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-12">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            {greetingByHour()}, {firstName}.
          </h1>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-ink-soft">
            <MapPin className="size-4 text-brand-500" aria-hidden />
            {area ? `${area.name}, ${area.city}` : 'South Africa'}
          </p>
        </div>
        <ButtonLink to="/discover" size="lg">
          <Compass className="size-4" aria-hidden /> Find work
        </ButtonLink>
      </section>

      <Link to="/proofscript" className="group block" aria-label="Open your ProofScript">
        <Card className="flex items-center gap-4 p-4 transition-colors group-hover:border-brand-200 sm:p-5">
          <BadgeCheck className="size-7 shrink-0 fill-gold-500/20 text-gold-600" aria-hidden />
          <dl className="grid flex-1 grid-cols-3 gap-2">
            {record.map((x) => (
              <div key={x.label} className="flex flex-col-reverse">
                <dt className="text-xs text-muted">{x.label}</dt>
                <dd className="text-lg font-semibold tabular-nums text-ink sm:text-xl">{x.value}</dd>
              </div>
            ))}
          </dl>
          <ChevronRight className="size-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Card>
      </Link>

      <section aria-labelledby="available-heading" className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="available-heading" className="text-xl font-semibold tracking-tight text-ink">Matched for you</h2>
            <p className="text-xs text-muted">iBanks picks open jobs for your skills, nearby first.</p>
          </div>
          <Link to="/discover" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-brand-500 hover:underline">
            See all <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>

        {gigsQ.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-44" />)}
          </div>
        ) : availableGigs.length === 0 ? (
          <Card className="p-8 text-center">
            <Compass className="mx-auto size-8 text-brand-500" aria-hidden />
            <h3 className="mt-3 text-base font-semibold text-ink">Nothing open near you right now</h3>
            <ButtonLink to="/discover" variant="secondary" size="sm" className="mt-4">Search all areas</ButtonLink>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {availableGigs.map((gig) => <GigCard key={gig.id} gig={gig} reasons={matchReasons(gig, profile)} />)}
          </div>
        )}
      </section>

      <nav aria-label="More" className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        <Link to="/money/earn-goal" className="group flex min-h-14 items-center gap-3 px-4 hover:bg-surface-elevated">
          <TrendingUp className="size-5 text-brand-500" aria-hidden />
          <span className="flex-1 font-medium">Set an earning goal</span>
          <ChevronRight className="size-4 text-muted" aria-hidden />
        </Link>
        <Link to={`/w/${userId}/cv`} className="group flex min-h-14 items-center gap-3 px-4 hover:bg-surface-elevated">
          <FileBadge className="size-5 text-gold-600" aria-hidden />
          <span className="flex-1 font-medium">My verified CV</span>
          <ChevronRight className="size-4 text-muted" aria-hidden />
        </Link>
      </nav>
    </div>
  )
}
