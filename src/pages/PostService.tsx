import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMyService, saveService } from '../lib/api'
import { useAuth } from '../lib/auth'
import { CATEGORIES } from '../lib/categories'
import { friendlyError } from '../lib/errors'
import { priceForTakeHome, randsToCents, MAX_TAKE_HOME_CENTS, MIN_TAKE_HOME_CENTS } from '../lib/money'
import type { Service } from '../lib/types'
import { firstError, serviceSchema } from '../lib/validation'
import { Button, Card, ErrorState, Field, PageHeader, Spinner } from '../components/ui'
import { AreaSelect } from '../components/AreaSelect'
import { FeeBreakdown } from '../components/gig/FeeBreakdown'
import { useToast } from '../components/ui/toast'
import NotFound from './NotFound'

/** /services/new and /services/:id/edit. The provider types what they take home; clients see the price that pays it. */
export default function PostService() {
  const { id } = useParams()
  const { userId } = useAuth()
  const q = useQuery({ queryKey: ['my-service', id, userId], queryFn: () => fetchMyService(id!, userId!), enabled: Boolean(id && userId) })
  if (!id) return <ServiceForm />
  if (q.isPending) return <Spinner label="Loading your service…" />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  if (!q.data) return <NotFound what="service" hint="You can only edit services you listed." />
  return <ServiceForm existing={q.data} />
}

function ServiceForm({ existing }: { existing?: Service }) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState({
    title: existing?.title ?? '',
    category: existing?.category ?? '',
    description: existing?.description ?? '',
    area_slug: existing?.area_slug ?? profile?.area_slug ?? '',
    take_home_rands: existing ? String(existing.take_home_cents / 100) : '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))
  const takeHomeCents = form.take_home_rands === '' ? 0 : randsToCents(Number(form.take_home_rands))
  const inRange = takeHomeCents >= MIN_TAKE_HOME_CENTS && takeHomeCents <= MAX_TAKE_HOME_CENTS
  const invalid = (k: string) => (errors[k] ? { 'aria-invalid': true as const, 'aria-describedby': `${k === 'take_home_cents' ? 'take-home' : k}-error` } : {})

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError('')
    const parsed = serviceSchema.safeParse({
      ...form,
      take_home_cents: form.take_home_rands === '' || Number.isNaN(takeHomeCents) ? undefined : takeHomeCents,
    })
    if (!parsed.success) {
      const errs = firstError(parsed.error)
      setErrors(errs)
      document.getElementById(Object.keys(errs)[0] === 'take_home_cents' ? 'take-home' : Object.keys(errs)[0])?.focus()
      return
    }
    setErrors({})
    setBusy(true)
    try {
      const serviceId = await saveService(existing?.id ?? null, parsed.data)
      await queryClient.invalidateQueries({ predicate: (qq) => ['my-services', 'my-service', 'service', 'services'].includes(String(qq.queryKey[0])) })
      toast.show(existing ? 'Service updated.' : 'Your service is live! Clients nearby can now book it.')
      navigate(`/services/${serviceId}`)
    } catch (err) {
      setFormError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={existing ? 'Edit your service' : 'Offer a service'}
        subtitle="Say what you do and what you want to receive for it. Clients see one clear price, and can book you straight away."
      />
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <Card className="space-y-4 p-5">
          <h2 className="text-lg font-bold">1. What do you offer?</h2>
          <Field label="Service title" htmlFor="title" error={errors.title} hint="e.g. “Paint one interior room” or “One-hour maths lesson”">
            <input id="title" className="input" maxLength={80} value={form.title} onChange={(e) => set('title', e.target.value)} {...invalid('title')} />
          </Field>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Category</legend>
            <div className="flex flex-wrap gap-2" id="category" tabIndex={-1}>
              {CATEGORIES.map((c) => (
                <button key={c.slug} type="button" className="chip" aria-pressed={form.category === c.slug} onClick={() => set('category', c.slug)}>
                  <span aria-hidden>{c.emoji}</span> {c.label}
                </button>
              ))}
            </div>
            {errors.category && <p id="category-error" className="mt-1 text-sm font-medium text-clay-700">{errors.category}</p>}
          </fieldset>
          <Field label="What’s included?" htmlFor="description" error={errors.description} hint={`${form.description.trim().length}/1000 · What do you bring? How long does it take? What costs extra?`}>
            <textarea id="description" rows={4} className="input" maxLength={1000} value={form.description} onChange={(e) => set('description', e.target.value)} {...invalid('description')} />
          </Field>
          <Field label="Area you work from" htmlFor="area_slug" error={errors.area_slug} hint="Clients nearby see your service first.">
            <AreaSelect id="area_slug" value={form.area_slug} onChange={(v) => set('area_slug', v)} invalid={Boolean(errors.area_slug)} placeholder="Choose your area" />
          </Field>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="text-lg font-bold">2. Set your price</h2>
          <Field label="What do you want to receive?" htmlFor="take-home" error={errors.take_home_cents} hint="Between R45 and R45 000 — the amount that reaches you. Clients are shown the price that pays you this after KashWise’s 10% fee. No VAT is taken.">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 grid place-items-center font-bold text-muted">R</span>
              <input id="take-home" type="number" inputMode="decimal" min={45} max={45000} step={0.01} className="input pl-8 text-lg font-bold"
                placeholder="450" value={form.take_home_rands} onChange={(e) => set('take_home_rands', e.target.value)} {...invalid('take_home_cents')} />
            </div>
          </Field>
          <div className="flex flex-wrap gap-2">
            {[150, 250, 400, 600, 1000].map((r) => (
              <button key={r} type="button" className="chip" aria-pressed={form.take_home_rands === String(r)} onClick={() => set('take_home_rands', String(r))}>
                R{r}
              </button>
            ))}
          </div>
          <FeeBreakdown payoutCents={inRange ? priceForTakeHome(takeHomeCents) : 0} perspective="worker" counterpart />
        </Card>

        {formError && <p role="alert" className="rounded-lg bg-clay-50 px-3 py-2 text-sm font-medium text-clay-700">{formError}</p>}
        <p className="text-sm text-muted">You set your own price and choose your work. When a client books, the job appears in My work with their date, and you can decline before you start. Keep phone numbers out of the description.</p>
        <Button type="submit" size="lg" block loading={busy}>{existing ? 'Save changes' : 'Publish service'}</Button>
      </form>
    </div>
  )
}
