import { Check } from 'lucide-react'
import { LIFECYCLE, STATUS_LABEL } from '../../lib/gig-rules'
import type { GigEvent, GigStatus } from '../../lib/types'
import { timeAgo } from '../../lib/format'

export function LifecycleStepper({ status }: { status: GigStatus }) {
  if (status === 'cancelled') return null
  const current = LIFECYCLE.indexOf(status)
  return (
    <ol className="grid grid-cols-4 gap-1" aria-label="Gig progress">
      {LIFECYCLE.map((s, i) => {
        const done = i < current || status === 'completed'
        const active = i === current && status !== 'completed'
        return (
          <li key={s} className="flex flex-col items-center gap-1 text-center" aria-current={active ? 'step' : undefined}>
            <span
              className={`grid size-8 place-items-center rounded-full text-xs font-bold ring-2 ${
                done ? 'bg-brand-600 text-white ring-brand-600' : active ? 'bg-sun-400 text-ink ring-sun-400' : 'bg-white text-muted ring-line'
              }`}
            >
              {done ? <Check className="size-4" aria-hidden /> : i + 1}
            </span>
            <span className={`text-[11px] font-semibold leading-tight ${active || done ? 'text-ink' : 'text-muted'}`}>{STATUS_LABEL[s]}</span>
          </li>
        )
      })}
    </ol>
  )
}

function describe(e: GigEvent, names: Record<string, string>): string {
  const who = (e.actor_id && names[e.actor_id]) || 'Someone'
  switch (e.kind) {
    case 'posted': return `${who} posted the gig`
    case 'applied': return `${who} applied`
    case 'withdrawn': return `${who} withdrew an application`
    case 'matched': return `${who} chose ${e.detail ?? 'a worker'}`
    case 'booked': return e.detail ? `${who} booked ${e.detail}’s service` : `${who} booked a service`
    case 'booking_declined': return `${who} declined the booking`
    case 'payment_held': return 'Payment held by the payment provider (simulation)'
    case 'started': return `${who} started the work${e.detail === 'qr' ? ' (start QR scanned on site)' : ''}`
    case 'worker_done': return `${who} marked the job as done${e.detail === 'qr' ? ' (finish QR scanned on site)' : ''}`
    case 'completed': return `${who} confirmed the job is complete`
    case 'payment_released': return 'Payment released to the worker (simulation)'
    case 'portfolio_record': return `Verified record ${e.detail ?? ''} added to the worker’s portfolio`
    case 'reviewed': return `${who} left a ${e.detail ?? ''}★ review`
    case 'cancelled': return `${who} cancelled the gig`
    case 'payment_refunded': return 'Payment refunded to the customer (simulation)'
    case 'contact_revealed': return `Encrypted contact details opened by ${e.detail ?? who}`
    default: return e.kind
  }
}

export function Timeline({ events, names }: { events: GigEvent[]; names: Record<string, string> }) {
  if (!events.length) return null
  return (
    <ol className="relative space-y-3 border-l-2 border-line pl-5">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span aria-hidden className="absolute -left-[27px] top-1.5 size-3 rounded-full bg-brand-600 ring-4 ring-white" />
          <p className="text-sm">{describe(e, names)}</p>
          <p className="text-xs text-muted">{timeAgo(e.created_at)}</p>
        </li>
      ))}
    </ol>
  )
}
