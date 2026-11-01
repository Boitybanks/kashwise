import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, BadgeCheck, Compass, MapPin, PlusCircle, ShieldCheck, TrendingUp } from 'lucide-react'
import { discoverGigs, fetchWorkerStats } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useAreaLookup } from '../lib/hooks'
import { formatRand } from '../lib/money'
import { ButtonLink, Card, Skeleton } from '../components/ui'
import { GigCard } from '../components/gig/GigCard'

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
  const greeting = greetingByHour()

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
  const totalNearby = gigsQ.data?.length ?? 0

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-12">
      {/* ── 1. Top Header: Greeting + Location ── */}
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-500">Dashboard</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            {greeting}, {firstName}.
          </h1>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-ink-soft">
            <MapPin className="size-4 text-brand-500" aria-hidden />
            <span>{area ? `${area.name}, ${area.city}` : 'South Africa'}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <ButtonLink to="/discover" variant="primary" size="md">
            <Compass className="size-4" aria-hidden /> Find work
          </ButtonLink>
          <ButtonLink to="/gigs/new" variant="secondary" size="md">
            <PlusCircle className="size-4" aria-hidden /> Post a task
          </ButtonLink>
        </div>
      </section>

      {/* ── 2. "Your ProofScript" Progress Strip ── */}
      <section aria-labelledby="proofscript-strip-heading">
        <h2 id="proofscript-strip-heading" className="sr-only">Your ProofScript Progress</h2>
        <Card className="relative overflow-hidden border border-line bg-surface p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-sun-300 bg-sun-50 px-2.5 py-0.5 text-xs font-semibold text-gold-600">
                  <BadgeCheck className="size-3.5 fill-gold-500/20 text-gold-600" aria-hidden />
                  ProofScript Verified
                </span>
              </div>
              <h3 className="text-lg font-semibold text-ink">
                Your ProofScript reputation
              </h3>
              <p className="text-sm text-ink-soft">
                {stats && stats.completed > 0
                  ? `${stats.completed} confirmed job${stats.completed === 1 ? '' : 's'} on record.`
                  : 'Your confirmed jobs will appear here.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 sm:shrink-0">
              <div className="flex items-baseline gap-2 rounded-xl bg-canvas px-4 py-2.5 border border-line">
                <span className="text-2xl font-semibold tabular-nums text-ink">{stats?.completed ?? 0}</span>
                <span className="text-xs text-ink-soft">Verified</span>
              </div>
              {stats?.earned_cents != null && stats.earned_cents > 0 && (
                <div className="flex items-baseline gap-2 rounded-xl bg-canvas px-4 py-2.5 border border-line">
                  <span className="text-2xl font-semibold tabular-nums text-brand-500">
                    {formatRand(stats.earned_cents)}
                  </span>
                  <span className="text-xs text-ink-soft">Earned</span>
                </div>
              )}
              <ButtonLink to="/proofscript" variant="secondary" size="sm">
                View ProofScript <ArrowRight className="size-3.5" aria-hidden />
              </ButtonLink>
            </div>
          </div>
        </Card>
      </section>

      {/* ── 3. "Available near you" Section ── */}
      <section aria-labelledby="available-heading" className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="available-heading" className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
              Available near you
            </h2>
            <p className="mt-0.5 text-sm text-ink-soft">
              {totalNearby > 0
                ? `${totalNearby} open gig${totalNearby === 1 ? '' : 's'} for your skills.`
                : ''}
            </p>
          </div>
          <Link
            to="/discover"
            className="hidden text-sm font-semibold text-brand-500 hover:text-brand-500 hover:underline sm:inline-flex sm:items-center sm:gap-1"
          >
            <span>Browse all work</span>
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>

        {gigsQ.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-44" />
            ))}
          </div>
        ) : availableGigs.length === 0 ? (
          <Card className="p-8 text-center">
            <Compass className="mx-auto size-8 text-brand-500" aria-hidden />
            <h3 className="mt-3 text-base font-semibold text-ink">No gigs open in your immediate area right now</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
              Try all work, or set an income goal.
            </p>
            <div className="mt-4 flex justify-center gap-3">
              <ButtonLink to="/discover" variant="primary" size="sm">
                Search all South Africa
              </ButtonLink>
              <ButtonLink to="/money/earn-goal" variant="secondary" size="sm">
                Set an income goal
              </ButtonLink>
            </div>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {availableGigs.map((gig) => (
              <GigCard key={gig.id} gig={gig} />
            ))}
          </div>
        )}

        <div className="pt-2 text-center sm:hidden">
          <ButtonLink to="/discover" variant="secondary" block size="md">
            View all {totalNearby} open gigs
          </ButtonLink>
        </div>
      </section>

      {/* ── 4. Quick Tools: Goal Planning & iBanks ── */}
      <section className="grid gap-4 sm:grid-cols-2">
        <Card className="flex flex-col justify-between p-5 border border-line bg-surface">
          <div>
            <div className="flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
              <TrendingUp className="size-5" aria-hidden />
            </div>
            <h3 className="mt-3 text-base font-semibold text-ink">Earn My Goal</h3>
            <p className="mt-1 text-sm text-ink-soft">
              Say how much you want to make. iBanks finds the jobs to get you there.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-line">
            <Link to="/money/earn-goal" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-500 hover:text-brand-500">
              Plan weekly earnings <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </Card>

        <Card className="flex flex-col justify-between p-5 border border-line bg-surface">
          <div>
            <div className="flex size-9 items-center justify-center rounded-xl bg-sun-50 text-gold-600">
              <ShieldCheck className="size-5" aria-hidden />
            </div>
            <h3 className="mt-3 text-base font-semibold text-ink">Your verified CV</h3>
            <p className="mt-1 text-sm text-ink-soft">
              Built from jobs your customers confirmed. Download it and apply anywhere.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-line">
            <Link to={`/w/${userId}/cv`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-gold-600 hover:text-gold-600">
              Open my verified CV <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </Card>
      </section>
    </div>
  )
}
