import { Link } from 'react-router-dom'
import { ArrowUpRight, CalendarDays, Clock, MapPin, Users } from 'lucide-react'
import { categoryLabel } from '../../lib/categories'
import { CategoryIcon } from '../CategoryIcon'
import { formatDay, formatPostedAt } from '../../lib/format'
import { formatDistance } from '../../lib/geo'
import { TIME_WINDOW_LABEL } from '../../lib/gig-rules'
import { formatRand, workerNetCents } from '../../lib/money'
import type { DiscoverGig } from '../../lib/types'
import { DemoBadge } from '../ui'

export function GigCard({ gig, matchesSkills }: { gig: DiscoverGig; matchesSkills?: boolean }) {
  return (
    <Link
      to={`/gigs/${gig.id}`}
      className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-line bg-surface p-5 transition-all duration-300 hover:-translate-y-1 hover:border-brand-200 hover:bg-surface-elevated hover:shadow-[0_12px_28px_rgba(0,0,0,0.4)]"
    >
      <div className="space-y-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-xl bg-canvas border border-line text-xl text-brand-500 transition-transform duration-300 group-hover:scale-105">
              <CategoryIcon category={gig.category} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-500">{categoryLabel(gig.category)}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-800 border border-line">
                  <Clock className="size-2.5 text-brand-500" aria-hidden />
                  {formatPostedAt(gig.created_at, gig.is_demo)}
                </span>
              </div>
              <h3 className="mt-0.5 text-lg font-semibold leading-snug text-ink transition-colors group-hover:text-brand-700">{gig.title}</h3>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xl font-semibold tabular-nums text-brand-500">{formatRand(workerNetCents(gig.payout_cents))}</p>
            <p className="text-[11px] font-medium text-ink-soft">you receive</p>
          </div>
        </div>
        <p className="line-clamp-2 text-sm leading-relaxed text-ink-soft">{gig.description}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5 text-muted" aria-hidden />
            {gig.area_name}
            {gig.distance_km !== null && <span className="font-semibold text-muted">· {formatDistance(gig.distance_km)}</span>}
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3.5 text-muted" aria-hidden />
            {formatDay(gig.scheduled_date)} · {TIME_WINDOW_LABEL[gig.time_window]}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5 text-muted" aria-hidden />
            {gig.applicant_count === 0 ? 'Be first to apply' : `${gig.applicant_count} applied`}
          </span>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4 text-xs text-ink-soft">
        <span>
          Posted by <span className="font-semibold text-ink">{gig.customer_name}</span> · <span className="font-medium text-brand-500">{formatPostedAt(gig.created_at, gig.is_demo)}</span>
        </span>
        {matchesSkills && (
          <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-500 border border-brand-200">
            Matches your skills
          </span>
        )}
        {gig.is_demo && <DemoBadge />}
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-500 border border-brand-200 transition-all group-hover:bg-brand-600 group-hover:text-brand-700">
          View gig <ArrowUpRight className="size-3.5" aria-hidden />
        </span>
      </div>
    </Link>
  )
}
