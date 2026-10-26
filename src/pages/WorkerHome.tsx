import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, BadgeCheck, Compass, MapPin, PlusCircle, ShieldCheck, TrendingUp } from 'lucide-react'
import { discoverGigs, fetchPortfolio, fetchWorkerStats } from '../lib/api'
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
    queryKey: ['discover', profile?.area_slug ?? 'all', null, null],
    queryFn: () => discoverGigs({ area: profile?.area_slug || null, page: 0 }),
  })

  const statsQ = useQuery({
    queryKey: ['worker-stats', userId],
    queryFn: () => (userId ? fetchWorkerStats(userId) : null),
    enabled: Boolean(userId),
  })

  const portfolioQ = useQuery({
    queryKey: ['portfolio', userId],
    queryFn: () => (userId ? fetchPortfolio(userId) : []),
    enabled: Boolean(userId),
  })

  const stats = statsQ.data
  const portfolio = portfolioQ.data ?? []
  const availableGigs = useMemo(() => (gigsQ.data ?? []).slice(0, 3), [gigsQ.data])
  const totalNearby = gigsQ.data?.length ?? 0

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-12">
      {/* ── 1. Top Header: Greeting + Location ── */}
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#0D9488]">Worker Dashboard</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#F1F5F9] sm:text-4xl">
            {greeting}, {firstName}.
          </h1>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-[#94A3B8]">
            <MapPin className="size-4 text-[#0D9488]" aria-hidden />
            <span>{area ? `${area.name}, ${area.city}` : 'South Africa'}</span>
            <span className="text-[#64748B]">·</span>
            <span className="text-[#64748B]">Ready for work</span>
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
        <Card className="relative overflow-hidden border border-[#1E293B] bg-gradient-to-br from-[#141A21] via-[#141A21] to-[#0F2228] p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D4A017]/30 bg-[#D4A017]/10 px-2.5 py-0.5 text-xs font-semibold text-[#D4A017]">
                  <BadgeCheck className="size-3.5 fill-[#D4A017]/20 text-[#D4A017]" aria-hidden />
                  ProofScript Verified
                </span>
                <span className="text-xs text-[#64748B]">Cryptographically signed</span>
              </div>
              <h3 className="text-lg font-bold text-[#F1F5F9]">
                Your ProofScript reputation
              </h3>
              <p className="text-sm text-[#94A3B8]">
                {stats && stats.completed > 0
                  ? `${stats.completed} client-confirmed job${stats.completed === 1 ? '' : 's'} on record · ${portfolio.length} verified evidence items.`
                  : 'Every confirmed job builds tamper-proof evidence that opens better-paying opportunities.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 sm:shrink-0">
              <div className="flex items-baseline gap-2 rounded-xl bg-[#0B0F14]/80 px-4 py-2.5 border border-[#1E293B]">
                <span className="text-2xl font-extrabold tabular-nums text-[#F1F5F9]">{stats?.completed ?? 0}</span>
                <span className="text-xs text-[#94A3B8]">Verified</span>
              </div>
              {stats?.earned_cents != null && stats.earned_cents > 0 && (
                <div className="flex items-baseline gap-2 rounded-xl bg-[#0B0F14]/80 px-4 py-2.5 border border-[#1E293B]">
                  <span className="text-2xl font-extrabold tabular-nums text-[#0D9488]">
                    {formatRand(stats.earned_cents)}
                  </span>
                  <span className="text-xs text-[#94A3B8]">Earned</span>
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
            <h2 id="available-heading" className="text-xl font-bold tracking-tight text-[#F1F5F9] sm:text-2xl">
              Available near you
            </h2>
            <p className="mt-0.5 text-sm text-[#94A3B8]">
              {totalNearby > 0
                ? `${totalNearby} open gig${totalNearby === 1 ? '' : 's'} matching your area and verified skills.`
                : 'Showing active opportunities open for application.'}
            </p>
          </div>
          <Link
            to="/discover"
            className="hidden text-sm font-semibold text-[#0D9488] hover:text-[#14B8A6] hover:underline sm:inline-flex sm:items-center sm:gap-1"
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
            <Compass className="mx-auto size-8 text-[#0D9488]" aria-hidden />
            <h3 className="mt-3 text-base font-semibold text-[#F1F5F9]">No gigs open in your immediate area right now</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-[#94A3B8]">
              Expand your search radius or plan an income target with our structured earnings guide.
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
              <GigCard key={gig.id} gig={gig} matchesSkills={profile?.skills?.includes(gig.category)} />
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
        <Card className="flex flex-col justify-between p-5 border border-[#1E293B] bg-[#141A21]">
          <div>
            <div className="flex size-9 items-center justify-center rounded-xl bg-[#0D9488]/15 text-[#14B8A6]">
              <TrendingUp className="size-5" aria-hidden />
            </div>
            <h3 className="mt-3 text-base font-bold text-[#F1F5F9]">Earn My Goal</h3>
            <p className="mt-1 text-sm text-[#94A3B8]">
              Tell KashWise how much you need to make this week. We’ll calculate the optimal mix of gigs and hours.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-[#1E293B]">
            <Link to="/money/earn-goal" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0D9488] hover:text-[#14B8A6]">
              Plan weekly earnings <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </Card>

        <Card className="flex flex-col justify-between p-5 border border-[#1E293B] bg-[#141A21]">
          <div>
            <div className="flex size-9 items-center justify-center rounded-xl bg-[#D4A017]/15 text-[#D4A017]">
              <ShieldCheck className="size-5" aria-hidden />
            </div>
            <h3 className="mt-3 text-base font-bold text-[#F1F5F9]">Verifiable Proof Certificate</h3>
            <p className="mt-1 text-sm text-[#94A3B8]">
              Your ProofScript transcript can be downloaded and verified by any client, bank, or landlord offline.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-[#1E293B]">
            <Link to="/verify" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#D4A017] hover:text-[#E5B025]">
              Verify credential proof <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </Card>
      </section>
    </div>
  )
}
