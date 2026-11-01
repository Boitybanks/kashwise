import { Link } from 'react-router-dom'
import { categoryLabel } from '../../lib/categories'
import { CategoryIcon } from '../CategoryIcon'
import { formatDay } from '../../lib/format'
import { TIME_WINDOW_LABEL } from '../../lib/gig-rules'
import { formatRand, workerNetCents } from '../../lib/money'
import { evidenceUrl } from '../../lib/supabase'
import type { DiscoverGig } from '../../lib/types'

export function GigCard({ gig }: { gig: DiscoverGig; matchesSkills?: boolean }) {
  const photo = gig.photo_paths?.[0]
  return (
    <Link to={`/gigs/${gig.id}`} className="group flex flex-col overflow-hidden rounded-xl border border-line bg-surface transition-colors hover:border-brand-200">
      {photo && <img src={evidenceUrl(photo)} alt="" loading="lazy" className="aspect-[16/10] w-full object-cover" />}
      <div className="flex flex-1 flex-col p-4">
        <p className="flex items-center gap-1.5 text-xs text-muted"><CategoryIcon category={gig.category} className="size-3.5" /> {categoryLabel(gig.category)}</p>
        <h3 className="mt-1.5 line-clamp-2 text-[17px] font-semibold leading-snug">{gig.title}</h3>
        <p className="mt-auto pt-4 text-lg font-semibold tabular-nums text-brand-400">
          {formatRand(workerNetCents(gig.payout_cents))} <span className="text-xs font-normal text-muted">you receive</span>
        </p>
        <p className="mt-1 text-xs text-ink-soft">{gig.area_name} · {formatDay(gig.scheduled_date)} · {TIME_WINDOW_LABEL[gig.time_window]}</p>
      </div>
    </Link>
  )
}
