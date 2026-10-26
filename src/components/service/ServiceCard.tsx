import { Link } from 'react-router-dom'
import { ArrowUpRight, BadgeCheck, MapPin, Star } from 'lucide-react'
import { categoryLabel } from '../../lib/categories'
import { formatDistance } from '../../lib/geo'
import { formatRand } from '../../lib/money'
import { avatarUrl } from '../../lib/supabase'
import type { DiscoverService } from '../../lib/types'
import { CategoryIcon } from '../CategoryIcon'
import { Avatar, DemoBadge } from '../ui'

/** Client-facing: the headline number is what the client pays, with nothing added on top. */
export function ServiceCard({ service, showProvider = true }: { service: DiscoverService; showProvider?: boolean }) {
  return (
    <Link
      to={`/services/${service.id}`}
      className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-[#1E293B] bg-[#141A21] p-5 transition-all duration-300 hover:-translate-y-1 hover:border-[#0D9488]/50 hover:bg-[#18232d] hover:shadow-[0_12px_28px_rgba(0,0,0,0.4)]"
    >
      <div className="space-y-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#0B0F14] border border-[#24525b]/60 text-xl text-[#14B8A6] transition-transform duration-300 group-hover:scale-105">
              <CategoryIcon category={service.category} />
            </span>
            <div className="min-w-0">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#14B8A6]">{categoryLabel(service.category)}</span>
              <h3 className="text-lg font-bold leading-snug text-[#F1F5F9] transition-colors group-hover:text-white">{service.title}</h3>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xl font-extrabold tabular-nums text-[#F1F5F9]">{formatRand(service.price_cents)}</p>
            <p className="text-[11px] font-medium text-[#94A3B8]">all-inclusive</p>
          </div>
        </div>
        <p className="line-clamp-2 text-sm leading-relaxed text-[#94A3B8]">{service.description}</p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[#1E293B] pt-4 text-xs text-[#94A3B8]">
        {showProvider && (
          <span className="inline-flex min-w-0 items-center gap-2">
            <Avatar name={service.worker_name} id={service.worker_id} src={avatarUrl(service.worker_avatar_path)} size="sm" />
            <span className="truncate font-semibold text-[#F1F5F9]">{service.worker_name}</span>
          </span>
        )}
        <span className="inline-flex items-center gap-1 text-[#94A3B8]">
          <MapPin className="size-3.5 text-[#64748B]" aria-hidden />
          {service.area_name}
          {service.distance_km !== null && <span className="font-semibold text-[#64748B]">· {formatDistance(service.distance_km)}</span>}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-[#D4A017]/10 px-2 py-0.5 font-semibold text-[#D4A017] border border-[#D4A017]/25">
          <BadgeCheck className="size-3.5 fill-[#D4A017]/20 text-[#D4A017]" aria-hidden />
          {service.completed} verified
        </span>
        {service.avg_rating && (
          <span className="inline-flex items-center gap-1 font-semibold text-[#F1F5F9]">
            <Star className="size-3.5 fill-[#D4A017] text-[#D4A017]" aria-hidden />
            {service.avg_rating} <span className="text-[#64748B]">({service.review_count})</span>
          </span>
        )}
        {service.is_demo && <DemoBadge />}
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[#0D9488]/15 px-3 py-1.5 text-xs font-semibold text-[#14B8A6] border border-[#0D9488]/30 transition-all group-hover:bg-[#0D9488] group-hover:text-white">
          Book <ArrowUpRight className="size-3.5" aria-hidden />
        </span>
      </div>
    </Link>
  )
}
