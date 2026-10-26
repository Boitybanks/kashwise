import { useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, BadgeCheck, CalendarDays, CheckCircle2, MapPin, ScanLine, Share2 } from 'lucide-react'
import * as api from '../lib/api'
import { useAuth } from '../lib/auth'
import { categoryEmoji, categoryLabel } from '../lib/categories'
import { friendlyError } from '../lib/errors'
import { formatDay, timeAgo } from '../lib/format'
import { distanceKm, formatDistance } from '../lib/geo'
import { allowedActions, nextStepText, TIME_WINDOW_LABEL, viewerOf } from '../lib/gig-rules'
import { useAreaLookup } from '../lib/hooks'
import { Avatar, Button, ButtonLink, Card, DemoBadge, ErrorState, Spinner, Stars, StatusPill } from '../components/ui'
import { useToast } from '../components/ui/toast'
import { FeeBreakdown } from '../components/gig/FeeBreakdown'
import { LifecycleStepper, Timeline } from '../components/gig/Lifecycle'
import { PaymentPanel } from '../components/gig/PaymentPanel'
import { ContactReveal } from '../components/gig/ContactReveal'
import { WorkIdCard } from '../components/gig/WorkIdCard'
import { JobQrMenu } from '../components/gig/JobQrMenu'
import { ScanCodeDialog } from '../components/gig/ScanCodeDialog'
import type { HandshakeStep } from '../lib/qr-scan'
import { avatarUrl } from '../lib/supabase'
import { Applicants } from '../components/gig/Applicants'
import { ReviewForm } from '../components/gig/ReviewForm'
import { ReportButton } from '../components/ReportButton'
import NotFound from './NotFound'

function ConfirmAction({ label, confirmText, variant = 'primary', icon, onConfirm }: {
  label: string
  confirmText: string
  variant?: 'primary' | 'danger'
  icon?: ReactNode
  onConfirm: () => Promise<void>
}) {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!asking) {
    return (
      <Button variant={variant} block={variant === 'primary'} size={variant === 'primary' ? 'lg' : 'md'} onClick={() => setAsking(true)}>
        {icon}
        {label}
      </Button>
    )
  }
  return (
    <div className={`rounded-xl p-3 ${variant === 'danger' ? 'bg-clay-50' : 'bg-brand-50'}`}>
      <p className="text-sm">{confirmText}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant={variant}
          size="sm"
          loading={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await onConfirm()
            } finally {
              setBusy(false)
              setAsking(false)
            }
          }}
        >
          Yes, {label.toLowerCase()}
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setAsking(false)}>Go back</Button>
      </div>
    </div>
  )
}

export default function GigDetail() {
  const { id = '' } = useParams()
  const { userId, profile } = useAuth()
  const queryClient = useQueryClient()
  const toast = useToast()
  const areaOf = useAreaLookup()
  const [message, setMessage] = useState('')
  const [scan, setScan] = useState<HandshakeStep | null>(null)
  // A phone's own camera app opens /gigs/:id?step=start&code=… from the customer's QR code.
  const [params, setParams] = useSearchParams()
  const linkStep = params.get('step')
  const linkCode = params.get('code') ?? ''
  const [applyBusy, setApplyBusy] = useState(false)

  const gigQ = useQuery({
    queryKey: ['gig', id, userId],
    queryFn: () => api.fetchGig(id),
    refetchInterval: (q) => {
      const g = q.state.data
      if (!g || !userId || g.status === 'completed' || g.status === 'cancelled') return false
      return g.status === 'open' || g.customer_id === userId || g.assigned_worker_id === userId ? 8000 : false
    },
  })
  const gig = gigQ.data
  const viewer = gig ? viewerOf(gig, userId) : 'guest'
  const isParticipant = viewer === 'customer' || viewer === 'assigned_worker'

  const appsQ = useQuery({
    queryKey: ['applications', id, gig?.status],
    queryFn: () => api.fetchApplications(id),
    enabled: viewer === 'customer' && gig?.status === 'open',
    refetchInterval: 8000,
  })
  const myAppQ = useQuery({
    queryKey: ['my-application', id, userId],
    queryFn: () => api.fetchMyApplication(id, userId!),
    enabled: Boolean(userId) && viewer === 'other_worker',
    refetchInterval: gig?.status === 'open' ? 8000 : false,
  })
  const eventsQ = useQuery({
    queryKey: ['events', id, gig?.status, gig?.worker_done_at],
    queryFn: () => api.fetchEvents(id),
    enabled: isParticipant,
  })
  const txnQ = useQuery({
    queryKey: ['transaction', id, gig?.status],
    queryFn: () => api.fetchTransaction(id),
    enabled: isParticipant && gig?.status !== 'open',
  })
  const reviewQ = useQuery({
    queryKey: ['review', id],
    queryFn: () => api.fetchReview(id),
    enabled: gig?.status === 'completed',
  })
  const recordQ = useQuery({
    queryKey: ['record', id],
    queryFn: () => api.fetchPortfolioItemForGig(id),
    enabled: gig?.status === 'completed' && isParticipant,
  })

  if (gigQ.isPending) return <Spinner label="Loading gig…" />
  if (gigQ.isError) return <ErrorState error={gigQ.error} onRetry={() => gigQ.refetch()} />
  if (!gig) return <NotFound what="gig" hint="It may have been filled or cancelled, or you may need to sign in to see it." />

  const refresh = async () => {
    await queryClient.invalidateQueries({ predicate: (q) => ['gig', 'applications', 'my-application', 'events', 'transaction', 'review', 'record', 'posted', 'assigned', 'my-applications', 'discover', 'portfolio', 'worker-stats', 'impact'].includes(String(q.queryKey[0])) })
  }
  const run = async (fn: () => Promise<unknown>, success: string) => {
    try {
      await fn()
      toast.show(success)
    } catch (e) {
      toast.show(friendlyError(e), 'error')
    } finally {
      await refresh()
    }
  }

  const myApp = myAppQ.data
  const review = reviewQ.data
  const actions = allowedActions(gig, viewer, {
    hasApplied: Boolean(myApp && myApp.status !== 'withdrawn'),
    applicationPending: myApp?.status === 'pending',
    hasReview: Boolean(review),
  })
  const gigArea = areaOf(gig.area_slug)
  // Opening the customer's QR link on the worker's phone goes straight to the right scan step.
  const linkedScan: HandshakeStep | null =
    (linkStep === 'start' && actions.includes('start')) || (linkStep === 'finish' && actions.includes('mark_done')) ? linkStep : null
  const activeScan = scan ?? linkedScan
  const closeScan = () => {
    setScan(null)
    if (linkStep) setParams({}, { replace: true })
  }
  const myArea = areaOf(profile?.area_slug)
  const dist = gigArea && myArea && viewer !== 'customer' ? distanceKm(gigArea, myArea) : null
  const names: Record<string, string> = {}
  for (const a of appsQ.data ?? []) if (a.worker) names[a.worker_id] = a.worker.display_name
  if (gig.customer) names[gig.customer.id] = gig.customer.display_name
  if (gig.worker) names[gig.worker.id] = gig.worker.display_name
  if (userId) names[userId] = 'You'
  const workerFirst = gig.worker?.display_name.split(' ')[0] ?? 'the worker'

  async function share() {
    const url = window.location.href
    try {
      if (navigator.share) await navigator.share({ title: gig!.title, text: `Paid gig on KashWise: ${gig!.title}`, url })
      else {
        await navigator.clipboard.writeText(url)
        toast.show('Link copied — share it on WhatsApp or anywhere.')
      }
    } catch {
      /* user dismissed the share sheet */
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link to={viewer === 'customer' ? '/my-gigs' : viewer === 'assigned_worker' ? '/my-work' : '/discover'} className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Back
      </Link>

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-xl bg-canvas text-2xl">{categoryEmoji(gig.category)}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={gig.status} />
              <span className="text-xs font-semibold text-muted">{categoryLabel(gig.category)}</span>
              {gig.is_demo && <DemoBadge />}
            </div>
            <h1 className="mt-1 text-2xl font-extrabold leading-tight">{gig.title}</h1>
          </div>
          <button type="button" onClick={share} className="grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-canvas hover:text-ink" aria-label="Share this gig">
            <Share2 className="size-5" aria-hidden />
          </button>
        </div>

        <div className="mt-4 grid gap-2 text-sm text-ink-soft sm:grid-cols-2">
          <p className="flex items-center gap-2"><MapPin className="size-4 text-muted" aria-hidden />{gigArea ? `${gigArea.name}, ${gigArea.city}` : gig.area_slug}{dist !== null && <span className="text-muted">· {formatDistance(dist)}</span>}</p>
          <p className="flex items-center gap-2"><CalendarDays className="size-4 text-muted" aria-hidden />{formatDay(gig.scheduled_date)} · {TIME_WINDOW_LABEL[gig.time_window]}</p>
        </div>
        <p className="mt-4 whitespace-pre-line">{gig.description}</p>
        <p className="mt-4 text-xs text-muted">
          {gig.service_id ? 'Booked' : 'Posted'} by <strong className="text-ink-soft">{gig.customer?.display_name ?? 'a customer'}</strong>
          {gig.service_id && gig.worker && <> from {viewer === 'assigned_worker' ? 'your' : `${gig.worker.display_name.split(' ')[0]}’s`} listed service</>} · {timeAgo(gig.created_at)}
        </p>

        <div className="mt-5">
          {viewer === 'customer' ? <FeeBreakdown payoutCents={gig.payout_cents} perspective="customer" /> : <FeeBreakdown payoutCents={gig.payout_cents} perspective="worker" />}
        </div>
      </Card>

      <Card className="mt-4 space-y-4 p-5">
        <LifecycleStepper status={gig.status} />
        <p className="rounded-xl bg-[#0B0F14]/70 border border-[#1E293B] px-4 py-3 font-medium text-[#F1F5F9]" aria-live="polite">{viewer === 'other_worker' && myApp?.status === 'pending' && gig.status === 'open' ? 'Application sent. The customer will review your profile and choose a worker. Track this gig in My work.' : nextStepText(gig, viewer)}</p>

        {/* ── Guest ── */}
        {viewer === 'guest' && gig.status === 'open' && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <ButtonLink to={`/signup?role=worker&next=${encodeURIComponent(`/gigs/${gig.id}`)}`} size="lg">I’m interested — Join free</ButtonLink>
            <ButtonLink to={`/login?next=/gigs/${gig.id}`} variant="secondary" size="lg">I have an account</ButtonLink>
          </div>
        )}

        {/* ── Worker who is not (yet) assigned ── */}
        {viewer === 'other_worker' && myAppQ.isPending && <Spinner label="Checking your application…" />}
        {viewer === 'other_worker' && myAppQ.isError && <ErrorState error={myAppQ.error} onRetry={() => myAppQ.refetch()} />}
        {actions.includes('apply') && viewer === 'other_worker' && myAppQ.isSuccess && (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault()
              setApplyBusy(true)
              await run(() => api.applyToGig(gig.id, message), 'Application sent! The customer will see your portfolio.')
              setApplyBusy(false)
            }}
          >
            <label htmlFor="apply-message" className="block text-sm font-semibold">
              Message to {gig.customer?.display_name.split(' ')[0] ?? 'the customer'} <span className="font-normal text-muted">(optional)</span>
            </label>
            <textarea id="apply-message" rows={3} maxLength={300} className="input" placeholder="e.g. I live nearby and did a similar job last month." value={message} onChange={(e) => setMessage(e.target.value)} />
            <Button type="submit" size="lg" block loading={applyBusy}>I’m interested in this job</Button>
            <p className="text-sm text-muted">Applying is free. Check that the date, area and payout work for you. The customer reviews your profile before choosing a worker; applying does not book the job.</p>
            <Link to={`/profile?welcome=1&next=${encodeURIComponent(`/gigs/${gig.id}`)}`} className="inline-block text-sm font-semibold text-brand-700 underline">Improve your profile before applying</Link>
          </form>
        )}
        {viewer === 'other_worker' && myApp?.status === 'pending' && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#0D9488]/15 border border-[#0D9488]/30 p-4">
            <p className="flex items-center gap-2 font-semibold text-[#14B8A6]"><CheckCircle2 className="size-5" aria-hidden /> You applied {timeAgo(myApp.created_at)}. Waiting for the customer to choose.</p>
            <div className="flex flex-wrap gap-2"><ButtonLink to="/my-work" variant="secondary" size="sm">Track in My work</ButtonLink><ConfirmAction variant="danger" label="Withdraw application" confirmText="Withdraw your application? You can apply again while this gig is still open." onConfirm={() => run(() => api.withdrawApplication(gig.id), 'Application withdrawn.')} /></div>
          </div>
        )}
        {viewer === 'other_worker' && myApp?.status === 'declined' && (
          <p className="rounded-xl bg-canvas p-4 text-sm">The customer chose someone else this time. <Link to="/discover" className="font-semibold text-brand-700 underline">Find more work</Link></p>
        )}

        {/* ── Assigned worker ── */}
        {actions.includes('start') && (
          <Button block size="lg" onClick={() => setScan('start')}><ScanLine className="size-5" aria-hidden /> Start job</Button>
        )}
        {actions.includes('mark_done') && (
          <Button block size="lg" onClick={() => setScan('finish')}><ScanLine className="size-5" aria-hidden /> Mark as done</Button>
        )}
        {actions.includes('decline_booking') && (
          <ConfirmAction variant="danger" label="Decline booking" confirmText={`Decline this booking? ${gig.customer?.display_name.split(' ')[0] ?? 'The client'} is refunded (simulation) and the job is cancelled.`} onConfirm={() => run(() => api.declineBooking(gig.id), 'Booking declined. The client has been refunded.')} />
        )}
        {activeScan && (
          <ScanCodeDialog
            step={activeScan}
            gigId={gig.id}
            initialCode={scan ? '' : linkCode}
            onClose={closeScan}
            onSubmit={async (code) => {
              if (activeScan === 'start') await api.startGig(gig.id, code)
              else await api.markGigDone(gig.id, code)
              closeScan()
              toast.show(activeScan === 'start' ? 'Job started. Good luck!' : 'Marked as done. The customer has been asked to confirm.')
              await refresh()
            }}
          />
        )}

        {/* ── Customer ── */}
        {viewer === 'customer' && gig.status === 'open' && (
          <div>
            <h2 className="mb-3 text-lg font-bold">People who applied</h2>
            {appsQ.isPending ? <Spinner label="Loading applicants…" /> : appsQ.isError ? <ErrorState error={appsQ.error} onRetry={() => appsQ.refetch()} /> : (
              <Applicants
                applications={appsQ.data ?? []}
                gigArea={gig.area_slug}
                totalCents={gig.total_cents}
                onSelect={(appId) => run(() => api.selectWorker(gig.id, appId), 'Worker chosen! The payment provider is holding the payment (simulation).')}
              />
            )}
          </div>
        )}
        {viewer === 'customer' && gig.worker && gig.status !== 'open' && gig.status !== 'cancelled' && (
          <div className="flex items-center gap-3 rounded-xl border border-line p-3">
            <Avatar name={gig.worker.display_name} id={gig.worker.id} src={avatarUrl(gig.worker.avatar_path)} />
            <div className="flex-1">
              <p className="font-bold">{gig.worker.display_name} {gig.worker.is_demo && <DemoBadge />}</p>
              <p className="text-xs text-muted">{gig.worker.headline}</p>
            </div>
            <Link to={`/w/${gig.worker.id}`} className="text-sm font-semibold text-brand-700 hover:underline">Portfolio</Link>
          </div>
        )}
        {viewer === 'customer' && gig.worker && (gig.status === 'matched' || (gig.status === 'in_progress' && !gig.worker_done_at)) && (
          <JobQrMenu gig={gig} workerName={gig.worker.display_name.split(' ')[0]} />
        )}
        {actions.includes('confirm_completion') && (
          <ConfirmAction
            label="Confirm job is complete"
            icon={<BadgeCheck className="size-5" aria-hidden />}
            confirmText={`Confirm ${workerFirst} finished the job? A verified record is added to their portfolio, and your payment is then settled by the payment provider (simulation).`}
            onConfirm={() =>
              run(async () => {
                await api.confirmCompletion(gig.id)
                // Money is earned only when the provider settles. The simulator stands in for it; if it is switched off,
                // the payment simply stays authorised and the button below lets the client retry.
                await api.sandboxPayment({ action: 'settle', gigId: gig.id }).catch(() => undefined)
              }, `Work verified. Added to ${workerFirst}’s ProofScript.`)
            }
          />
        )}
        {actions.includes('review') && gig.worker && (
          <div className="rounded-xl border border-sun-100 bg-sun-50/50 p-4">
            <ReviewForm workerName={workerFirst} onSubmit={(rating, comment) => run(() => api.submitReview(gig.id, rating, comment), 'Thank you! Your review is now on their portfolio.')} />
          </div>
        )}

        {/* ── Completed ── */}
        {gig.status === 'completed' && review && (
          <div className="rounded-xl bg-canvas p-4">
            <div className="flex items-center gap-2"><Stars value={review.rating} size="md" /><span className="text-sm font-semibold">{review.rating}/5</span></div>
            {review.comment && <p className="mt-2">“{review.comment}”</p>}
          </div>
        )}
        {gig.status === 'completed' && recordQ.data && gig.worker && (
          <Link to={`/w/${gig.worker.id}#${recordQ.data.record_code}`} className="flex items-center gap-3 rounded-xl bg-brand-600 p-4 text-white hover:bg-brand-700">
            <BadgeCheck className="size-6 shrink-0" aria-hidden />
            <span className="flex-1">
              <span className="block font-bold">Verified record {recordQ.data.record_code}</span>
              <span className="block text-sm text-brand-50">{viewer === 'assigned_worker' ? 'Now on your portfolio — tap to see and share it.' : `Added to ${workerFirst}’s portfolio.`}</span>
            </span>
          </Link>
        )}

        {actions.includes('cancel') && (
          <ConfirmAction variant="danger" label="Cancel gig" confirmText={gig.status === 'matched' ? 'Cancel this gig? The held payment is refunded (simulation) and the worker is released.' : 'Cancel this gig? Applicants will see it has been cancelled.'} onConfirm={() => run(() => api.cancelGig(gig.id), 'Gig cancelled.')} />
        )}
      </Card>

      {isParticipant && gig.status !== 'open' && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {gig.status !== 'cancelled' && gig.customer && gig.worker && (
            <WorkIdCard
              gigId={gig.id}
              gigTitle={gig.title}
              perspective={viewer === 'customer' ? 'customer' : 'worker'}
              myName={(viewer === 'customer' ? gig.customer : gig.worker).display_name.split(' ')[0]}
              partnerName={(viewer === 'customer' ? gig.worker : gig.customer).display_name.split(' ')[0]}
            />
          )}
          {actions.includes('reveal_contact') && <ContactReveal gigId={gig.id} onRevealed={() => queryClient.invalidateQueries({ queryKey: ['events', id] })} />}
          {txnQ.data && <PaymentPanel txn={txnQ.data} perspective={viewer === 'customer' ? 'customer' : 'worker'} />}
          {viewer === 'customer' && gig.status === 'completed' && txnQ.data?.status === 'held' && (
            <Button
              variant="secondary"
              onClick={() => run(() => api.sandboxPayment({ action: 'settle', gigId: gig.id }), 'The payment provider settled your payment (simulation).')}
            >
              Settle payment through the provider (simulation)
            </Button>
          )}
          {viewer === 'customer' && gig.status === 'completed' && txnQ.data?.status === 'released' && (
            <Button
              variant="ghost"
              onClick={() =>
                run(async () => {
                  const r = await api.sandboxPayment({ action: 'settle', gigId: gig.id })
                  if (r.status !== 'duplicate') throw new Error(`The provider replay was ${r.status}.`)
                }, 'Same provider event sent again: recognised as a duplicate, nothing was added and iBanks logged the replay.')
              }
            >
              Replay the settlement event (simulation test)
            </Button>
          )}
        </div>
      )}

      {isParticipant && eventsQ.data && (
        <Card className="mt-4 p-5">
          <h2 className="mb-3 font-bold">Timeline</h2>
          <Timeline events={eventsQ.data} names={names} />
        </Card>
      )}

      {viewer !== 'customer' && (
        <div className="mt-4 flex justify-end">
          <ReportButton gigId={gig.id} label="Report this gig" />
        </div>
      )}
    </div>
  )
}
