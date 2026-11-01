import { useEffect, useState, type ReactNode } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BadgeCheck, CalendarCheck, Copy, Eye, EyeOff, FileBadge, MapPin, QrCode as QrIcon, Share2, Star } from 'lucide-react'
import { fetchPortfolio, fetchProfile, fetchWorkerStats } from '../lib/api'
import { useAuth } from '../lib/auth'
import { categoryLabel } from '../lib/categories'
import { formatMonthYear } from '../lib/format'
import { useAreaLookup } from '../lib/hooks'
import { formatRand } from '../lib/money'
import { avatarUrl } from '../lib/supabase'
import type { WorkerStats } from '../lib/types'
import { Avatar, Button, ButtonLink, Card, ErrorState, Spinner } from '../components/ui'
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
        <p className="mt-3 text-sm text-muted">No confirmed gigs yet. Proven skills appear here as customers confirm completed work.</p>
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

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      toast.show('ProofScript link copied.')
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
            {isWorker && <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-500">ProofScript</p>}
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
            {isWorker && <ButtonLink to={`/w/${p.id}/cv`}><FileBadge className="size-4" aria-hidden /> View verified CV</ButtonLink>}
            <Button variant="secondary" onClick={share}><Share2 className="size-4" aria-hidden /> Share ProofScript</Button>
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
        <div className="[&>.card]:mt-4">
          {p.bio && <Card className="mt-4 p-5"><p className="whitespace-pre-line">{p.bio}</p></Card>}
          <SharedDocuments ownerId={p.id} firstName={first} />
          <Card className="mt-4 p-5 text-sm text-muted">{first} hires people on KashWise.</Card>
          {!isOwner && <div className="mt-6 flex justify-end"><ReportButton userId={p.id} label={`Report ${first}`} /></div>}
        </div>
      )}
    </div>
  )
}
