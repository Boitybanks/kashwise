import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Lock, MapPin, PauseCircle, Pencil } from 'lucide-react'
import { bookService, fetchService } from '../lib/api'
import { useAuth } from '../lib/auth'
import { categoryLabel } from '../lib/categories'
import { friendlyError } from '../lib/errors'
import { TIME_WINDOW_LABEL } from '../lib/gig-rules'
import { areaLabel, useAreaLookup } from '../lib/hooks'
import { formatRand } from '../lib/money'
import { avatarUrl } from '../lib/supabase'
import { addDays, bookingSchema, firstError, todayInSA } from '../lib/validation'
import { Avatar, Button, ButtonLink, Card, DemoBadge, ErrorState, Field, SimulationNote, Spinner } from '../components/ui'
import { AreaSelect } from '../components/AreaSelect'
import { CategoryIcon } from '../components/CategoryIcon'
import { FeeBreakdown } from '../components/gig/FeeBreakdown'
import { useToast } from '../components/ui/toast'
import NotFound from './NotFound'

type TimeWindow = keyof typeof TIME_WINDOW_LABEL

export default function ServiceDetail() {
  const { id = '' } = useParams()
  const { userId, profile } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const areaOf = useAreaLookup()
  const today = todayInSA()
  const [form, setForm] = useState({
    area_slug: profile?.area_slug ?? '',
    scheduled_date: addDays(today, 2),
    time_window: 'morning' as TimeWindow,
    address: '',
    access_notes: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))

  const q = useQuery({ queryKey: ['service', id], queryFn: () => fetchService(id) })
  if (q.isPending) return <Spinner label="Loading service…" />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const service = q.data
  if (!service) return <NotFound what="service" hint="It may have been paused by the person who offers it." />

  const isOwner = userId === service.worker_id
  const first = service.worker?.display_name.split(' ')[0] ?? 'the provider'
  const invalid = (k: string) => (errors[k] ? { 'aria-invalid': true as const, 'aria-describedby': `${k}-error` } : {})

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError('')
    const parsed = bookingSchema(today).safeParse(form)
    if (!parsed.success) {
      const errs = firstError(parsed.error)
      setErrors(errs)
      document.getElementById(Object.keys(errs)[0])?.focus()
      return
    }
    setErrors({})
    setBusy(true)
    try {
      const gigId = await bookService(service!.id, parsed.data)
      await queryClient.invalidateQueries({ queryKey: ['posted'] })
      toast.show(`Booked! ${first} has been notified and the payment provider is holding the payment (simulation).`)
      navigate(`/gigs/${gigId}`)
    } catch (err) {
      setFormError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link to={isOwner ? '/my-services' : '/services'} className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Back
      </Link>

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-xl bg-canvas text-2xl"><CategoryIcon category={service.category} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted">{categoryLabel(service.category)}</span>
              {service.is_demo && <DemoBadge />}
            </div>
            <h1 className="mt-1 text-2xl font-extrabold leading-tight">{service.title}</h1>
          </div>
        </div>
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-soft"><MapPin className="size-4 text-muted" aria-hidden />Based in {areaLabel(areaOf(service.area_slug), service.area_slug)}</p>
        <p className="mt-4 whitespace-pre-line">{service.description}</p>

        {service.worker && (
          <Link to={`/w/${service.worker.id}`} className="mt-5 flex items-center gap-3 rounded-xl border border-line p-3 hover:border-brand-200">
            <Avatar name={service.worker.display_name} id={service.worker.id} src={avatarUrl(service.worker.avatar_path)} />
            <span className="min-w-0 flex-1">
              <span className="block font-bold">{isOwner ? 'You' : service.worker.display_name} {service.worker.is_demo && <DemoBadge />}</span>
              {service.worker.headline && <span className="block truncate text-xs text-muted">{service.worker.headline}</span>}
            </span>
            <span className="text-sm font-semibold text-brand-700">Work Passport</span>
          </Link>
        )}

        <div className="mt-5">
          {/* Each side sees its own number: the provider what they receive, everyone else what they pay. */}
          {isOwner ? <FeeBreakdown payoutCents={service.price_cents} perspective="worker" counterpart /> : <FeeBreakdown payoutCents={service.price_cents} perspective="customer" />}
        </div>
      </Card>

      {isOwner ? (
        <Card className="mt-4 space-y-3 p-5">
          {!service.is_active && (
            <p className="flex items-center gap-2 rounded-xl bg-sun-50 px-4 py-3 text-sm font-semibold text-sun-700"><PauseCircle className="size-5" aria-hidden /> Paused — clients can’t find or book this service.</p>
          )}
          <p className="text-sm text-muted">This is how clients see your service. When someone books it, the job appears in My work.</p>
          <div className="flex flex-wrap gap-2">
            <ButtonLink to={`/services/${service.id}/edit`}><Pencil className="size-4" aria-hidden /> Edit service</ButtonLink>
            <ButtonLink to="/my-services" variant="secondary">All my services</ButtonLink>
          </div>
        </Card>
      ) : !userId ? (
        <Card className="mt-4 space-y-3 p-5">
          <h2 className="text-lg font-bold">Book {first}</h2>
          <p className="text-sm text-muted">Create a free account to book. You choose the date, and your address stays encrypted until {first} needs it.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <ButtonLink to={`/signup?role=customer&next=${encodeURIComponent(`/services/${service.id}`)}`} size="lg">Join free to book</ButtonLink>
            <ButtonLink to={`/login?next=${encodeURIComponent(`/services/${service.id}`)}`} variant="secondary" size="lg">I have an account</ButtonLink>
          </div>
        </Card>
      ) : (
        <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
          <Card className="space-y-4 p-5">
            <h2 className="text-lg font-bold">Book {first}</h2>
            <Field label="Where is the job?" htmlFor="area_slug" error={errors.area_slug}>
              <AreaSelect id="area_slug" value={form.area_slug} onChange={(v) => set('area_slug', v)} invalid={Boolean(errors.area_slug)} placeholder="Choose the area" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date" htmlFor="scheduled_date" error={errors.scheduled_date}>
                <input id="scheduled_date" type="date" className="input" min={today} max={addDays(today, 180)} value={form.scheduled_date} onChange={(e) => set('scheduled_date', e.target.value)} {...invalid('scheduled_date')} />
              </Field>
              <Field label="Time of day" htmlFor="time_window">
                <select id="time_window" className="input" value={form.time_window} onChange={(e) => set('time_window', e.target.value as TimeWindow)}>
                  {(Object.keys(TIME_WINDOW_LABEL) as TimeWindow[]).map((w) => <option key={w} value={w}>{TIME_WINDOW_LABEL[w]}</option>)}
                </select>
              </Field>
            </div>
          </Card>

          <Card className="space-y-4 p-5">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><Lock className="size-4" aria-hidden /></span>
              <div>
                <h2 className="text-lg font-bold">Private details</h2>
                <p className="text-sm text-muted">Stored encrypted. Only you and {first} can reveal them once the booking is made.</p>
              </div>
            </div>
            <Field label="Street address" htmlFor="address" error={errors.address} optional>
              <input id="address" autoComplete="street-address" className="input" maxLength={200} value={form.address} onChange={(e) => set('address', e.target.value)} {...invalid('address')} />
            </Field>
            <Field label="Access notes" htmlFor="access_notes" error={errors.access_notes} optional hint={`Gate code, parking, what ${first} should know.`}>
              <input id="access_notes" className="input" maxLength={300} value={form.access_notes} onChange={(e) => set('access_notes', e.target.value)} {...invalid('access_notes')} />
            </Field>
          </Card>

          <SimulationNote>You won’t be charged. Booking simulates the payment provider holding the price until you confirm the job is done.</SimulationNote>
          {formError && <p role="alert" className="rounded-lg bg-clay-50 px-3 py-2 text-sm font-medium text-clay-700">{formError}</p>}
          <Button type="submit" size="lg" block loading={busy}>Book for {formatRand(service.price_cents)}</Button>
          <p className="text-sm text-muted">{first} can decline if the date doesn’t work, and you can cancel before the job starts. Either way the held payment is refunded.</p>
        </form>
      )}
    </div>
  )
}
