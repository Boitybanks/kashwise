import { useEffect, useState, type ReactNode } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { BadgeCheck, CalendarCheck, ChevronRight, Copy, Eye, EyeOff, FileBadge, MapPin, QrCode as QrIcon, Share2, Star } from 'lucide-react'
import { discoverServices, fetchClientActivity, fetchPortfolio, fetchProfile, fetchWorkerStats } from '../lib/api'
import { useAuth } from '../lib/auth'
import { categoryLabel } from '../lib/categories'
import { formatDay, formatMonthYear } from '../lib/format'
import { useAreaLookup } from '../lib/hooks'
import { formatRand, workerNetCents } from '../lib/money'
import { avatarUrl } from '../lib/supabase'
import type { WorkerStats } from '../lib/types'
import { Avatar, Button, ButtonLink, Card, ErrorState, Spinner, Stars } from '../components/ui'
import { QrCode } from '../components/ui/QrCode'
import { useToast } from '../components/ui/toast'
import { SharedDocuments } from '../components/profile/Documents'
import { PortfolioRecord } from '../components/portfolio/PortfolioRecord'
import { ProofScriptEmptyState } from '../components/portfolio/ProofScriptEmptyState'
import { SkillsProfile } from '../components/portfolio/SkillsProfile'
import { WorkerServices } from '../components/service/WorkerServices'
import { ReportButton } from '../components/ReportButton'
import NotFound from './NotFound'
import { CategoryIcon } from '../components/CategoryIcon'

function ProvenSkills({ stats, claimed }: { stats: WorkerStats | undefined; claimed: string[] }) {
  const proven = [...(stats?.categories ?? [])].sort((a, b) => b.count - a.count)
  const max = proven[0]?.count ?? 1
  const alsoOffers = claimed.filter((c) => !proven.some((p) => p.category === c))
  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold">Proven skills</h2>
      
      {proven.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {proven.map((c) => (
            <li key={c.category} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
              <span className="truncate font-medium"><span aria-hidden><CategoryIcon category={c.category} className="size-5 text-brand-500" /></span> {categoryLabel(c.category)}</span>
              <span aria-hidden className="h-2 overflow-hidden rounded-full bg-line">
                <span className="block h-full rounded-full bg-brand-600" style={{ width: `${Math.max(8, (c.count / max) * 100)}%` }} />
              </span>
              <span className="text-xs tabular-nums text-muted">{c.count} gig{c.count === 1 ? '' : 's'}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">Skills appear here as customers confirm jobs.</p>
      )}
      {alsoOffers.length > 0 && (
        <div className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Also offers</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {alsoOffers.map((sk) => (
              <li key={sk} className="rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-300">
                <span aria-hidden><CategoryIcon category={sk} className="size-5 text-brand-500" /></span> {categoryLabel(sk)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

function PassportQr({ url, first, onCopy }: { url: string; first: string; onCopy: () => void }) {
  return (
    <Card className="p-5 text-center">
      <h2 className="font-semibold">ProofScript QR</h2>
      <QrCode value={url} label={`QR code that opens ${first}’s ProofScript`} className="mx-auto mt-3 size-44 rounded-lg ring-1 ring-line" />
      <p className="mt-3 text-sm text-muted">Scan to view {first}’s verified experience.</p>
      <Button variant="secondary" size="sm" className="mt-3" onClick={onCopy}><Copy className="size-4" aria-hidden /> Copy link</Button>
    </Card>
  )
}

/** A client's public page: what a provider wants to know before taking their work. */
function ClientSections({ clientId, first, bio, isOwner }: { clientId: string; first: string; bio: string | null; isOwner: boolean }) {
  const q = useQuery({ queryKey: ['client-activity', clientId], queryFn: () => fetchClientActivity(clientId) })
  const reviews = q.data?.reviews ?? []
  const openGigs = q.data?.openGigs ?? []
  return (
    <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-4">
        {bio && (
          <Card className="p-5">
            <h2 className="text-lg font-semibold">About {first}</h2>
            <p className="mt-1 whitespace-pre-line text-ink-soft">{bio}</p>
          </Card>
        )}
        <Card className="p-5">
          <h2 className="text-lg font-semibold">Open gigs</h2>
          {q.isPending ? <Spinner /> : openGigs.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nothing open right now.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {openGigs.map((g) => (
                <li key={g.id}>
                  <Link to={`/gigs/${g.id}`} className="group flex min-h-14 items-center gap-3 py-2">
                    <CategoryIcon category={g.category} className="size-5 shrink-0 text-brand-500" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium group-hover:text-brand-400">{g.title}</span>
                      <span className="text-xs text-muted">{categoryLabel(g.category)} · {formatDay(g.scheduled_date)}</span>
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-brand-400">{formatRand(isOwner ? g.total_cents : workerNetCents(g.payout_cents))}</span>
                    <ChevronRight className="size-4 text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="text-lg font-semibold">Reviews {first} has left</h2>
          {q.isPending ? <Spinner /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : reviews.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No reviews yet.</p>
          ) : (
            <ul className="mt-3 space-y-4">
              {reviews.slice(0, 6).map((r) => (
                <li key={r.id} className="flex gap-3">
                  <Avatar name={r.worker?.display_name ?? '?'} id={r.worker?.id} src={avatarUrl(r.worker?.avatar_path ?? null)} size="sm" />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-x-2 text-sm">
                      {r.worker ? <Link to={`/w/${r.worker.id}`} className="font-semibold hover:text-brand-400">{r.worker.display_name}</Link> : <span className="font-semibold">A provider</span>}
                      <Stars value={r.rating} />
                      <span className="text-xs text-muted">{formatMonthYear(r.created_at)}</span>
                    </p>
                    {r.comment && <p className="mt-0.5 text-sm text-ink-soft">“{r.comment}”</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <aside className="flex flex-col gap-4 [&>.card]:mt-0" aria-label="Documents">
        <SharedDocuments ownerId={clientId} firstName={first} />
        {!isOwner && <div className="flex justify-end"><ReportButton userId={clientId} label={`Report ${first}`} /></div>}
      </aside>
    </div>
  )
}

/** Public ProofScript: what a customer sees when choosing a worker. */
export default function WorkerProfile() {
  const { id = '' } = useParams()
  const { hash } = useLocation()
  const { userId } = useAuth()
  const toast = useToast()
  const areaOf = useAreaLookup()
  const [showQr, setShowQr] = useState(false)
  const [hideEarnings, setHideEarnings] = useState(false)
  const isOwner = userId === id

  const profileQ = useQuery({ queryKey: ['profile', id], queryFn: () => fetchProfile(id) })
  const statsQ = useQuery({ queryKey: ['worker-stats', id], queryFn: () => fetchWorkerStats(id) })
  const portfolioQ = useQuery({ queryKey: ['portfolio', id], queryFn: () => fetchPortfolio(id) })
  const servicesQ = useQuery({ queryKey: ['services', 'worker', id], queryFn: () => discoverServices({ worker: id, page: 0 }), enabled: profileQ.data?.role === 'worker' })
  const clientQ = useQuery({ queryKey: ['client-activity', id], queryFn: () => fetchClientActivity(id), enabled: profileQ.data?.role === 'customer' })
  const highlighted = hash ? decodeURIComponent(hash.slice(1)) : ''

  useEffect(() => {
    if (highlighted && portfolioQ.data) document.getElementById(highlighted)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlighted, portfolioQ.data])

  if (profileQ.isPending) return <Spinner label="Loading ProofScript…" />
  if (profileQ.isError) return <ErrorState error={profileQ.error} onRetry={() => profileQ.refetch()} />
  const p = profileQ.data
  if (!p) return <NotFound what="profile" />

  const s = statsQ.data
  const items = portfolioQ.data ?? []
  const area = areaOf(p.area_slug)
  const first = p.display_name.split(' ')[0]
  const url = `${window.location.origin}/w/${p.id}`
  const isWorker = p.role === 'worker' || items.length > 0
  const tagline = p.headline || p.skills.slice(0, 3).map(categoryLabel).join(' • ')
  const decided = s ? s.completed + s.cancelled_after_match : 0

  const stats: { value: ReactNode; label: string }[] = [
    { value: s?.completed ?? '—', label: 'Completed gigs' },
    {
      value: s?.avg_rating ? <span className="inline-flex items-center gap-1">{s.avg_rating}<Star className="size-5 fill-gold-500 text-gold-500" aria-hidden /></span> : 'New',
      label: s ? `Rating · ${s.review_count} review${s.review_count === 1 ? '' : 's'}` : 'Rating',
    },
    { value: decided ? `${Math.round((s!.completed / decided) * 100)}%` : '—', label: 'Completion rate' },
    isOwner && s?.earned_cents != null
      ? {
          value: (
            <span className="inline-flex items-center gap-2">
              <span>{hideEarnings ? '••••••' : formatRand(s.earned_cents)}</span>
              <button
                type="button"
                onClick={() => setHideEarnings((h) => !h)}
                className="text-muted hover:text-ink transition"
                title={hideEarnings ? 'Show earnings' : 'Hide earnings for privacy'}
                aria-label={hideEarnings ? 'Show earnings' : 'Hide earnings for privacy'}
              >
                {hideEarnings ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </span>
          ),
          label: 'Total earned (private to you)',
        }
      : { value: s?.repeat_customers ?? '—', label: 'Repeat customers' },
  ]

  const given = clientQ.data?.reviews ?? []
  const clientStats = clientQ.data
    ? [
        { value: given.length, label: 'Providers reviewed' },
        { value: given.length ? (given.reduce((a, r) => a + r.rating, 0) / given.length).toFixed(1) : '—', label: 'Average rating given' },
        { value: clientQ.data.openGigs.length, label: 'Open gigs' },
      ]
    : null

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      toast.show('Link copied.')
    } catch {
      toast.show('Copying isn’t available here — use Share instead.', 'error')
    }
  }

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: `${p!.display_name} on KashWise`, text: `See ${first}’s ProofScript on KashWise`, url })
      else await copyLink()
    } catch {
      /* dismissed */
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <Card className="overflow-hidden">
        <div className="flex flex-col items-center gap-4 p-5 text-center sm:flex-row sm:gap-5 sm:text-left">
          <span className="rounded-full ring-2 ring-brand-200"><Avatar name={p.display_name} id={p.id} src={avatarUrl(p.avatar_path)} size="xl" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-500">{isWorker ? 'ProofScript' : 'Client'}</p>
            <div className="mt-0.5 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <h1 className="text-2xl font-semibold sm:text-3xl">{p.display_name}</h1>
              {(s?.completed ?? 0) > 0 && (
                <span className="text-gold-600" title="Has customer-confirmed gigs">
                  <BadgeCheck className="size-6 fill-gold-500/20 text-gold-600" aria-hidden /><span className="sr-only">Has customer-confirmed gigs</span>
                </span>
              )}
            </div>
            {tagline && <p className="mt-0.5 text-ink-soft">{tagline}</p>}
            <p className="mt-1.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-muted sm:justify-start">
              <span className="inline-flex items-center gap-1"><MapPin className="size-4" aria-hidden />{area ? `${area.name}, ${area.city}` : p.area_slug}</span>
              <span className="inline-flex items-center gap-1"><CalendarCheck className="size-4" aria-hidden />On KashWise since {formatMonthYear(p.created_at)}</span>
            </p>
          </div>
          <div className="flex w-full flex-wrap justify-center gap-2 sm:w-auto sm:flex-col sm:items-stretch">
            {isWorker && !isOwner && (servicesQ.data?.length
              ? <Button onClick={() => document.getElementById('services-h')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Book {first}</Button>
              : <ButtonLink to="/gigs/new">Post a job</ButtonLink>)}
            {isWorker && <ButtonLink to={`/w/${p.id}/cv`} variant={isOwner ? 'primary' : 'secondary'}><FileBadge className="size-4" aria-hidden /> View verified CV</ButtonLink>}
            <Button variant="secondary" onClick={share}><Share2 className="size-4" aria-hidden /> {isWorker ? 'Share ProofScript' : 'Share profile'}</Button>
            {isWorker && (
              <Button variant="sun" className="lg:hidden" aria-expanded={showQr} aria-controls="passport-qr" onClick={() => setShowQr((v) => !v)}>
                <QrIcon className="size-4" aria-hidden /> {showQr ? 'Hide QR code' : 'Show QR code'}
              </Button>
            )}
            {isOwner && <ButtonLink to="/profile" variant="secondary">Edit profile</ButtonLink>}
          </div>
        </div>
        {isWorker && (
          <dl aria-label="Reputation" className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4">
            {stats.map((x) => (
              <div key={x.label} className="flex flex-col-reverse bg-surface p-4 text-center sm:text-left">
                <dt className="text-xs text-muted">{x.label}</dt>
                <dd className="text-2xl font-semibold">{x.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {!isWorker && clientStats && (
          <dl aria-label="As a client" className="grid grid-cols-3 gap-px border-t border-line bg-line">
            {clientStats.map((x) => (
              <div key={x.label} className="flex flex-col-reverse bg-surface p-4 text-center sm:text-left">
                <dt className="text-xs text-muted">{x.label}</dt>
                <dd className="text-2xl font-semibold">{x.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>

      {isWorker && showQr && (
        <div id="passport-qr" className="mt-4 lg:hidden">
          <PassportQr url={url} first={first} onCopy={copyLink} />
        </div>
      )}

      {isWorker ? (
        <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-4">
            {p.bio && (
              <Card className="p-5">
                <h2 className="text-lg font-semibold">About {first}</h2>
                <p className="mt-1 whitespace-pre-line text-ink-soft">{p.bio}</p>
              </Card>
            )}
            <SkillsProfile workerId={p.id} first={first} isOwner={isOwner} codes={items.map((i) => i.record_code)} />
            <ProvenSkills stats={s} claimed={p.skills} />
            <WorkerServices workerId={p.id} first={first} isOwner={isOwner} />
            <section id="experience" aria-labelledby="records-h">
              <h2 id="records-h" className="text-lg font-semibold text-ink">Work gallery</h2>
              <div className="mb-3" />
              {portfolioQ.isPending ? <Spinner /> : portfolioQ.isError ? <ErrorState error={portfolioQ.error} onRetry={() => portfolioQ.refetch()} /> : items.length === 0 ? (
                <ProofScriptEmptyState isOwner={isOwner} firstName={first} />



              ) : (
                <div className="space-y-3">
                  {items.map((item) => <PortfolioRecord key={item.id} item={item} isOwner={isOwner} highlighted={item.record_code === highlighted} />)}
                </div>
              )}
            </section>
          </div>

          <aside className="flex flex-col gap-4 [&>.card]:mt-0" aria-label="Verification">
            <div className="hidden lg:block"><PassportQr url={url} first={first} onCopy={copyLink} /></div>
            <SharedDocuments ownerId={p.id} firstName={first} />
            {!isOwner && <div className="flex justify-end"><ReportButton userId={p.id} label={`Report ${first}`} /></div>}
          </aside>
        </div>
      ) : (
        <ClientSections clientId={p.id} first={first} bio={p.bio} isOwner={isOwner} />
      )}
    </div>
  )
}
