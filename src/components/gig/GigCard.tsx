import { Link } from 'react-router-dom'
import { ArrowUpRight, CalendarDays, MapPin, Users } from 'lucide-react'
import { categoryLabel } from '../../lib/categories'
import { CategoryIcon } from '../CategoryIcon'
import { formatDay, timeAgo } from '../../lib/format'
import { formatDistance } from '../../lib/geo'
import { TIME_WINDOW_LABEL } from '../../lib/gig-rules'
import { formatRand, workerNetCents } from '../../lib/money'
import type { DiscoverGig } from '../../lib/types'
import { DemoBadge } from '../ui'

export function GigCard({ gig, matchesSkills }: { gig: DiscoverGig; matchesSkills?: boolean }) {
  return (
    <Link
      to={`/gigs/${gig.id}`}
      className="card group flex flex-col gap-4 p-5 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-canvas text-xl">
            <CategoryIcon category={gig.category} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-muted">{categoryLabel(gig.category)}</p>
            <h3 className="font-bold leading-snug text-ink group-hover:text-brand-700">{gig.title}</h3>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-extrabold text-brand-700">{formatRand(workerNetCents(gig.payout_cents))}</p>
          <p className="text-[11px] font-medium text-muted">you receive</p>
        </div>
      </div>
      <p className="line-clamp-2 text-sm text-ink-soft">{gig.description}</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <MapPin className="size-3.5" aria-hidden />
          {gig.area_name}
          {gig.distance_km !== null && <span className="font-semibold text-ink-soft">· {formatDistance(gig.distance_km)}</span>}
        </span>
        <span className="inline-flex items-center gap-1">
          <CalendarDays className="size-3.5" aria-hidden />
          {formatDay(gig.scheduled_date)} · {TIME_WINDOW_LABEL[gig.time_window]}
        </span>
        <span className="inline-flex items-center gap-1">
          <Users className="size-3.5" aria-hidden />
          {gig.applicant_count === 0 ? 'Be the first to apply' : `${gig.applicant_count} applied`}
        </span>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-4 text-xs text-muted">
        <span>
          Posted by <span className="font-semibold text-ink-soft">{gig.customer_name}</span> · {timeAgo(gig.created_at)}
        </span>
        {matchesSkills && <span className="rounded-full bg-brand-50 px-2 py-0.5 font-semibold text-brand-800">Matches your skills</span>}
        {gig.is_demo && <DemoBadge />}
        <span className="ml-auto inline-flex items-center gap-1 font-semibold text-brand-700">View gig <ArrowUpRight size={15} aria-hidden /></span>
      </div>
    </Link>
  )
}
