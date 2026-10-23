import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { discoverServices } from '../../lib/api'
import { ButtonLink } from '../ui'
import { ServiceCard } from './ServiceCard'

/** Work Passport section. Visitors see bookable services at the price they pay; the owner gets a link to manage them. */
export function WorkerServices({ workerId, first, isOwner }: { workerId: string; first: string; isOwner: boolean }) {
  const q = useQuery({ queryKey: ['services', 'worker', workerId], queryFn: () => discoverServices({ worker: workerId, page: 0 }) })
  const services = q.data ?? []
  if (!q.isSuccess || (!services.length && !isOwner)) return null

  if (isOwner) {
    return (
      <p className="card flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
        <span>
          {services.length
            ? `You have ${services.length} live service${services.length === 1 ? '' : 's'} clients can book from this page.`
            : 'List a service so clients can book you from this page without posting a gig.'}
        </span>
        <ButtonLink to="/my-services" variant="secondary" size="sm">{services.length ? 'Manage services' : 'Offer a service'}</ButtonLink>
      </p>
    )
  }

  return (
    <section aria-labelledby="services-h">
      <h2 id="services-h" className="text-lg font-bold">Book {first} directly</h2>
      <p className="mb-3 text-sm text-muted">The price you see is the price you pay. <Link to="/services" className="font-semibold text-brand-700 underline">More services nearby</Link></p>
      <div className="grid gap-3 md:grid-cols-2">
        {services.map((s) => <ServiceCard key={s.id} service={s} showProvider={false} />)}
      </div>
    </section>
  )
}
