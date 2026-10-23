// UI mirror of the lifecycle enforced by the database RPCs (supabase/migrations/*_rpc_functions.sql).
import type { Gig, GigStatus } from './types'

export const STATUS_LABEL: Record<GigStatus, string> = {
  open: 'Open',
  matched: 'Worker chosen',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export const LIFECYCLE: GigStatus[] = ['open', 'matched', 'in_progress', 'completed']

export type Viewer = 'customer' | 'assigned_worker' | 'other_worker' | 'guest'

export function viewerOf(gig: Pick<Gig, 'customer_id' | 'assigned_worker_id'>, userId: string | null | undefined): Viewer {
  if (!userId) return 'guest'
  if (gig.customer_id === userId) return 'customer'
  if (gig.assigned_worker_id === userId) return 'assigned_worker'
  return 'other_worker'
}

export type GigAction =
  | 'apply'
  | 'withdraw'
  | 'select_worker'
  | 'start'
  | 'mark_done'
  | 'confirm_completion'
  | 'review'
  | 'cancel'
  | 'decline_booking'
  | 'reveal_contact'

interface Context {
  hasApplied?: boolean
  applicationPending?: boolean
  hasReview?: boolean
}

export function allowedActions(
  gig: Pick<Gig, 'status' | 'worker_done_at' | 'customer_id' | 'assigned_worker_id'> & { service_id?: string | null },
  viewer: Viewer,
  ctx: Context = {},
): GigAction[] {
  const actions: GigAction[] = []
  switch (viewer) {
    case 'customer':
      if (gig.status === 'open') actions.push('select_worker', 'cancel')
      if (gig.status === 'matched') actions.push('cancel', 'reveal_contact')
      if (gig.status === 'in_progress') {
        if (gig.worker_done_at) actions.push('confirm_completion')
        actions.push('reveal_contact')
      }
      if (gig.status === 'completed') {
        actions.push('reveal_contact')
        if (!ctx.hasReview) actions.push('review')
      }
      break
    case 'assigned_worker':
      if (gig.status === 'matched') {
        actions.push('start', 'reveal_contact')
        // A booked service skipped the application step, so the provider can still turn it down before starting.
        if (gig.service_id) actions.push('decline_booking')
      }
      if (gig.status === 'in_progress') {
        if (!gig.worker_done_at) actions.push('mark_done')
        actions.push('reveal_contact')
      }
      if (gig.status === 'completed') actions.push('reveal_contact')
      break
    case 'other_worker':
      if (gig.status === 'open') {
        if (ctx.applicationPending) actions.push('withdraw')
        else if (!ctx.hasApplied) actions.push('apply')
      }
      break
    case 'guest':
      if (gig.status === 'open') actions.push('apply')
      break
  }
  return actions
}

/** Plain-language next step, shown at the top of the gig page. */
export function nextStepText(gig: Pick<Gig, 'status' | 'worker_done_at'> & { service_id?: string | null }, viewer: Viewer): string {
  if (gig.status === 'cancelled') return 'This gig was cancelled.'
  if (gig.status === 'completed') return viewer === 'assigned_worker'
    ? 'Done! This job is now a verified record on your portfolio.'
    : 'This gig is complete.'
  if (viewer === 'customer') {
    if (gig.status === 'open') return 'Review the people who applied and choose one.'
    if (gig.status === 'matched') return gig.service_id
      ? 'Booked! When your service provider arrives, open “Job QR codes” and show them the start-job code.'
      : 'Your worker is confirmed. When they arrive, open “Job QR codes” and show them the start-job code.'
    return gig.worker_done_at
      ? 'Your worker says the job is done. Check it and confirm completion.'
      : 'Work is in progress. When it’s finished, show your worker the finish-job QR code, then confirm completion.'
  }
  if (viewer === 'assigned_worker') {
    if (gig.status === 'matched') return gig.service_id
      ? 'New booking for your service! When you arrive, tap “Start job” and scan the customer’s start-job QR code. Can’t make it? Decline below.'
      : 'You got the job! When you arrive, tap “Start job” and scan the customer’s start-job QR code.'
    return gig.worker_done_at
      ? 'Waiting for the customer to confirm completion.'
      : 'When you finish, tap “Mark as done” and scan the customer’s finish-job QR code.'
  }
  if (gig.status === 'open') return 'Apply to let the customer know you can do this.'
  return 'This gig has been filled.'
}

export const TIME_WINDOW_LABEL = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  flexible: 'Flexible time',
} as const
