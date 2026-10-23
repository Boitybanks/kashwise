import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueries } from '@tanstack/react-query'
import { BadgeCheck, MessageSquare, Star } from 'lucide-react'
import { fetchWorkerStats, type ApplicationWithWorker } from '../../lib/api'
import { categoryLabel } from '../../lib/categories'
import { distanceKm, formatDistance } from '../../lib/geo'
import { useAreaLookup } from '../../lib/hooks'
import { formatRand } from '../../lib/money'
import { Avatar, Button, DemoBadge, EmptyState } from '../ui'
import { avatarUrl } from '../../lib/supabase'

interface Props {
  applications: ApplicationWithWorker[]
  gigArea: string
  totalCents: number
  onSelect: (applicationId: string) => Promise<void>
}

export function Applicants({ applications, gigArea, totalCents, onSelect }: Props) {
  const areaOf = useAreaLookup()
  const pending = applications.filter((a) => a.status === 'pending' && a.worker)
  const stats = useQueries({
    queries: pending.map((a) => ({ queryKey: ['worker-stats', a.worker_id], queryFn: () => fetchWorkerStats(a.worker_id) })),
  })
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!pending.length) {
    return (
      <EmptyState icon={<MessageSquare className="size-5" aria-hidden />} title="No applications yet">
        Workers nearby have been able to see your gig since you posted it. You’ll see them here as they apply.
      </EmptyState>
    )
  }

  const gigA = areaOf(gigArea)
  return (
    <ul className="space-y-3">
      {pending.map((app, i) => {
        const w = app.worker!
        const s = stats[i]?.data
        const wa = areaOf(w.area_slug)
        const dist = gigA && wa ? distanceKm(gigA, wa) : null
        const first = w.display_name.split(' ')[0]
        return (
          <li key={app.id} className="card p-4">
            <div className="flex items-start gap-3">
              <Avatar name={w.display_name} id={w.id} src={avatarUrl(w.avatar_path)} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold">{w.display_name}</p>
                  {w.is_demo && <DemoBadge />}
                </div>
                {w.headline && <p className="text-sm text-muted">{w.headline}</p>}
                <p className="mt-1 text-xs text-muted">
                  {wa?.name}
                  {dist !== null && ` · ${formatDistance(dist)}`}
                </p>
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-canvas p-3 text-center">
              <div>
                <dt className="text-[11px] text-muted">Verified gigs</dt>
                <dd className="flex items-center justify-center gap-1 font-extrabold"><BadgeCheck className="size-4 text-brand-600" aria-hidden />{s ? s.completed : '…'}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted">Rating</dt>
                <dd className="flex items-center justify-center gap-1 font-extrabold"><Star className="size-4 fill-sun-400 text-sun-400" aria-hidden />{s ? (s.avg_rating ?? 'New') : '…'}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted">Repeat clients</dt>
                <dd className="font-extrabold">{s ? s.repeat_customers : '…'}</dd>
              </div>
            </dl>
            {w.skills.length > 0 && (
              <p className="mt-2 text-xs text-muted">Skills: {w.skills.map(categoryLabel).join(' · ')}</p>
            )}
            {app.message && <blockquote className="mt-3 rounded-xl border-l-4 border-sun-400 bg-sun-50 px-3 py-2 text-sm">“{app.message}”</blockquote>}
            {confirming === app.id ? (
              <div className="mt-3 rounded-xl bg-brand-50 p-3">
                <p className="text-sm">
                  Choose <strong>{first}</strong>? The payment provider will hold <strong>{formatRand(totalCents)}</strong> (simulated) until you confirm the job is done. Other applicants will be notified the gig is filled.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    loading={busy}
                    onClick={async () => {
                      setBusy(true)
                      try {
                        await onSelect(app.id)
                      } finally {
                        setBusy(false)
                        setConfirming(null)
                      }
                    }}
                  >
                    Yes, choose {first}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>Not yet</Button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setConfirming(app.id)}>Choose {first}</Button>
                <Link to={`/w/${w.id}`} className="inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50">
                  View portfolio
                </Link>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
