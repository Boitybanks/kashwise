import { useMemo } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ArrowUpRight, BadgeCheck, Briefcase, ChevronRight, Compass, FileBadge, MapPin, Star, TrendingUp } from 'lucide-react'
import { discoverGigs, fetchWorkerStats } from '../lib/api'
import { useAuth } from '../lib/auth'
import { loadStoredCvDraft, suggestJobsFromCv } from '../lib/cv-parser'
import { useAreaLookup } from '../lib/hooks'
import { formatRand } from '../lib/money'
import { avatarUrl } from '../lib/supabase'
import { Avatar, Badge, ButtonLink, Card, Skeleton } from '../components/ui'
import { CategoryIcon } from '../components/CategoryIcon'
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

  const storedCv = useMemo(() => loadStoredCvDraft(userId), [userId])
  const allSkills = useMemo(
    () => [...new Set([...(profile?.skills ?? []), ...(storedCv?.skills ?? [])])],
    [profile?.skills, storedCv?.skills],
  )
  const cvSuggestedJobs = useMemo(
    () =>
      storedCv?.suggested_jobs?.length
        ? storedCv.suggested_jobs
        : suggestJobsFromCv(`${profile?.headline ?? ''} ${profile?.bio ?? ''}`, allSkills),
    [storedCv, profile?.headline, profile?.bio, allSkills],
  )

  const gigsQ = useQuery({
    queryKey: ['discover-gigs', 0],
    queryFn: () => discoverGigs({ area: null, category: null, skills: null, page: 0, limit: 50 }),
    staleTime: 60_000,
  })

  const statsQ = useQuery({
    queryKey: ['worker-stats', userId],
    queryFn: () => (userId ? fetchWorkerStats(userId) : null),
    enabled: Boolean(userId),
  })

  const stats = statsQ.data
  const availableGigs = useMemo(() => {
    const all = gigsQ.data ?? []
    const matchedBySkill = allSkills.length > 0 ? all.filter((g) => allSkills.includes(g.category)) : all
    const pool = matchedBySkill.length > 0 ? matchedBySkill : all
    // Prioritize gigs in the worker's area first
    return [...pool]
      .sort((a, b) => (a.area_slug === profile?.area_slug ? -1 : 1) - (b.area_slug === profile?.area_slug ? -1 : 1))
      .slice(0, 3)
  }, [gigsQ.data, allSkills, profile?.area_slug])

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
        <div className="flex items-center gap-4">
          {profile && (
            <Link to="/profile" className="shrink-0 rounded-full ring-2 ring-brand-500/40 transition hover:ring-brand-400" aria-label="Edit your profile">
              <Avatar name={profile.display_name} id={profile.id} src={avatarUrl(profile.avatar_path)} size="lg" />
            </Link>
          )}
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              {greetingByHour()}, {firstName}.
            </h1>
            <p className="mt-1.5 flex items-center gap-1.5 text-sm text-ink-soft">
              <MapPin className="size-4 text-brand-500" aria-hidden />
              {area ? `${area.name}, ${area.city}` : 'South Africa'}
            </p>
          </div>
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

      {cvSuggestedJobs.length > 0 && (
        <section aria-labelledby="cv-jobs-heading" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 id="cv-jobs-heading" className="text-xl font-semibold tracking-tight text-ink">
                  Jobs you can do from your CV
                </h2>
                <Badge tone="brand">
                  <Briefcase className="size-3" aria-hidden /> {cvSuggestedJobs.length} matched
                </Badge>
              </div>
              <p className="text-xs text-muted">
                Based on your extracted CV and profile skills. Set an earning goal and iBanks works out how to match and meet it.
              </p>
            </div>
            <Link to="/money/earn-goal" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-brand-500 hover:underline">
              Match with iBanks Goal <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cvSuggestedJobs.slice(0, 3).map((job) => (
              <Card key={job.category} className="flex flex-col justify-between p-4">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-400">
                      <CategoryIcon category={job.category} className="size-4" />
                      {job.category_label}
                    </span>
                    <span className="text-xs font-semibold text-ink">
                      ~{formatRand(job.typical_net_cents)} <span className="font-normal text-muted">net</span>
                    </span>
                  </div>
                  <h3 className="mt-1.5 font-semibold text-ink">{job.title}</h3>
                  <p className="mt-1 text-xs text-muted">{job.description}</p>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5 text-xs">
                  <Link
                    to={`/discover?category=${encodeURIComponent(job.category)}`}
                    className="inline-flex items-center gap-1 font-semibold text-brand-500 hover:underline"
                  >
                    Find {job.category_label.toLowerCase()} gigs <ArrowUpRight className="size-3.5" aria-hidden />
                  </Link>
                  <Link to="/money/earn-goal" className="text-muted hover:text-ink">
                    Add to goal →
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="available-heading" className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="available-heading" className="text-xl font-semibold tracking-tight text-ink">Matched for you</h2>
            <p className="text-xs text-muted">iBanks picks open jobs for your CV &amp; profile skills, nearby first.</p>
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
            {availableGigs.map((gig) => <GigCard key={gig.id} gig={gig} reasons={matchReasons(gig, profile ? { ...profile, skills: allSkills } : profile)} />)}
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
