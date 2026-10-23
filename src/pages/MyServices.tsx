import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Plus, Store } from 'lucide-react'
import { fetchMyServices, setServiceActive } from '../lib/api'
import { useAuth } from '../lib/auth'
import { friendlyError } from '../lib/errors'
import { formatRand } from '../lib/money'
import type { Service } from '../lib/types'
import { Badge, Button, ButtonLink, DemoBadge, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui'
import { CategoryIcon } from '../components/CategoryIcon'
import { useToast } from '../components/ui/toast'

/** The provider's own listings. They see what they take home; the client price is shown only as "clients see". */
function ServiceRow({ service }: { service: Service }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  async function toggle() {
    setBusy(true)
    try {
      await setServiceActive(service.id, !service.is_active)
      toast.show(service.is_active ? 'Service paused. Clients can’t book it until you resume it.' : 'Service live again.')
    } catch (e) {
      toast.show(friendlyError(e), 'error')
    } finally {
      await queryClient.invalidateQueries({ predicate: (q) => ['my-services', 'services', 'service'].includes(String(q.queryKey[0])) })
      setBusy(false)
    }
  }

  return (
    <div className="card flex flex-wrap items-center gap-3 p-4">
      <Link to={`/services/${service.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-canvas text-xl"><CategoryIcon category={service.category} /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{service.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            {service.is_active ? <Badge tone="brand">Live</Badge> : <Badge tone="gray">Paused</Badge>}
            <span className="font-semibold text-brand-700">you receive {formatRand(service.take_home_cents)}</span>
            <span>· clients see {formatRand(service.price_cents)}</span>
            {service.is_demo && <DemoBadge />}
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
      </Link>
      <Button variant="secondary" size="sm" loading={busy} onClick={toggle}>{service.is_active ? 'Pause' : 'Resume'}</Button>
    </div>
  )
}

export default function MyServices() {
  const { userId } = useAuth()
  const q = useQuery({ queryKey: ['my-services', userId], queryFn: () => fetchMyServices(userId!), enabled: Boolean(userId) })
  const services = q.data ?? []

  return (
    <div>
      <PageHeader
        title="Your services"
        subtitle="You set the amount you want to receive. Clients see one price that covers KashWise’s 10% fee, and can book you directly. No VAT is taken from your pay."
        action={<ButtonLink to="/services/new"><Plus className="size-4" aria-hidden /> Offer a service</ButtonLink>}
      />
      {q.isPending ? (
        <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : services.length === 0 ? (
        <EmptyState icon={<Store className="size-5" aria-hidden />} title="No services listed yet" action={<ButtonLink to="/services/new">List your first service</ButtonLink>}>
          List something you do often — a haircut, a garden clean-up, a maths lesson — and clients nearby can book it without posting a gig.
        </EmptyState>
      ) : (
        <ul className="space-y-3">{services.map((s) => <li key={s.id}><ServiceRow service={s} /></li>)}</ul>
      )}
      <p className="mt-6 text-sm text-muted">Bookings show up in <Link to="/my-work" className="font-semibold text-brand-700 underline">My work</Link> alongside the gigs you applied for.</p>
    </div>
  )
}
