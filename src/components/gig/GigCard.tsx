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
      className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-[#1E293B] bg-[#141A21] p-5 transition-all duration-300 hover:-translate-y-1 hover:border-[#0D9488]/50 hover:bg-[#18232d] hover:shadow-[0_12px_28px_rgba(0,0,0,0.4)]"
    >
      <div className="space-y-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#0B0F14] border border-[#24525b]/60 text-xl text-[#14B8A6] transition-transform duration-300 group-hover:scale-105">
              <CategoryIcon category={gig.category} />
            </span>
            <div className="min-w-0">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#14B8A6]">{categoryLabel(gig.category)}</span>
              <h3 className="text-lg font-bold leading-snug text-[#F1F5F9] transition-colors group-hover:text-white">{gig.title}</h3>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xl font-extrabold tabular-nums text-[#14B8A6]">{formatRand(workerNetCents(gig.payout_cents))}</p>
            <p className="text-[11px] font-medium text-[#94A3B8]">you receive</p>
          </div>
        </div>
        <p className="line-clamp-2 text-sm leading-relaxed text-[#94A3B8]">{gig.description}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#94A3B8]">
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5 text-[#64748B]" aria-hidden />
            {gig.area_name}
            {gig.distance_km !== null && <span className="font-semibold text-[#64748B]">· {formatDistance(gig.distance_km)}</span>}
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3.5 text-[#64748B]" aria-hidden />
            {formatDay(gig.scheduled_date)} · {TIME_WINDOW_LABEL[gig.time_window]}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5 text-[#64748B]" aria-hidden />
            {gig.applicant_count === 0 ? 'Be first to apply' : `${gig.applicant_count} applied`}
          </span>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[#1E293B] pt-4 text-xs text-[#94A3B8]">
        <span>
          Posted by <span className="font-semibold text-[#F1F5F9]">{gig.customer_name}</span> · {timeAgo(gig.created_at)}
        </span>
        {matchesSkills && (
          <span className="rounded-full bg-[#0D9488]/15 px-2.5 py-0.5 text-xs font-semibold text-[#14B8A6] border border-[#0D9488]/30">
            Matches your skills
          </span>
        )}
        {gig.is_demo && <DemoBadge />}
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[#0D9488]/15 px-3 py-1.5 text-xs font-semibold text-[#14B8A6] border border-[#0D9488]/30 transition-all group-hover:bg-[#0D9488] group-hover:text-white">
          View gig <ArrowUpRight className="size-3.5" aria-hidden />
        </span>
      </div>
    </Link>
  )
}
