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
      className="card group flex flex-col gap-4 p-5 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-canvas text-xl">
            <CategoryIcon category={service.category} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-muted">{categoryLabel(service.category)}</p>
            <h3 className="font-bold leading-snug text-ink group-hover:text-brand-700">{service.title}</h3>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-extrabold text-brand-700">{formatRand(service.price_cents)}</p>
          <p className="text-[11px] font-medium text-muted">you pay</p>
        </div>
      </div>
      <p className="line-clamp-2 text-sm text-ink-soft">{service.description}</p>
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-4 text-xs text-muted">
        {showProvider && (
          <span className="inline-flex min-w-0 items-center gap-2">
            <Avatar name={service.worker_name} id={service.worker_id} src={avatarUrl(service.worker_avatar_path)} size="sm" />
            <span className="truncate font-semibold text-ink-soft">{service.worker_name}</span>
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <MapPin className="size-3.5" aria-hidden />
          {service.area_name}
          {service.distance_km !== null && <span className="font-semibold text-ink-soft">· {formatDistance(service.distance_km)}</span>}
        </span>
        <span className="inline-flex items-center gap-1"><BadgeCheck className="size-3.5 text-brand-600" aria-hidden />{service.completed} verified</span>
        {service.avg_rating && (
          <span className="inline-flex items-center gap-1"><Star className="size-3.5 fill-sun-400 text-sun-400" aria-hidden />{service.avg_rating} ({service.review_count})</span>
        )}
        {service.is_demo && <DemoBadge />}
        <span className="ml-auto inline-flex items-center gap-1 font-semibold text-brand-700">Book <ArrowUpRight size={15} aria-hidden /></span>
      </div>
    </Link>
  )
}
