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
      className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-line bg-surface p-5 transition-all duration-300 hover:-translate-y-1 hover:border-brand-200 hover:bg-surface-elevated hover:shadow-[0_12px_28px_rgba(0,0,0,0.4)]"
    >
      <div className="space-y-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-xl bg-canvas border border-line text-xl text-brand-500 transition-transform duration-300 group-hover:scale-105">
              <CategoryIcon category={service.category} />
            </span>
            <div className="min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-500">{categoryLabel(service.category)}</span>
              <h3 className="text-lg font-semibold leading-snug text-ink transition-colors group-hover:text-brand-400">{service.title}</h3>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xl font-semibold tabular-nums text-ink">{formatRand(service.price_cents)}</p>
            <p className="text-[11px] font-medium text-ink-soft">all-inclusive</p>
          </div>
        </div>
        <p className="line-clamp-2 text-sm leading-relaxed text-ink-soft">{service.description}</p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-4 text-xs text-ink-soft">
        {showProvider && (
          <span className="inline-flex min-w-0 items-center gap-2">
            <Avatar name={service.worker_name} id={service.worker_id} src={avatarUrl(service.worker_avatar_path)} size="sm" />
            <span className="truncate font-semibold text-ink">{service.worker_name}</span>
          </span>
        )}
        <span className="inline-flex items-center gap-1 text-ink-soft">
          <MapPin className="size-3.5 text-muted" aria-hidden />
          {service.area_name}
          {service.distance_km !== null && <span className="font-semibold text-muted">· {formatDistance(service.distance_km)}</span>}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-sun-50 px-2 py-0.5 font-semibold text-gold-600 border border-sun-300">
          <BadgeCheck className="size-3.5 fill-gold-500/20 text-gold-600" aria-hidden />
          {service.completed} verified
        </span>
        {service.avg_rating && (
          <span className="inline-flex items-center gap-1 font-semibold text-ink">
            <Star className="size-3.5 fill-gold-500 text-gold-600" aria-hidden />
            {service.avg_rating} <span className="text-muted">({service.review_count})</span>
          </span>
        )}
        {service.is_demo && <DemoBadge />}
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-500 border border-brand-200 transition-all group-hover:bg-brand-600 group-hover:text-brand-400">
          Book <ArrowUpRight className="size-3.5" aria-hidden />
        </span>
      </div>
    </Link>
  )
}
