import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Lock, PartyPopper } from 'lucide-react'
import { createGig } from '../lib/api'
import { useAuth } from '../lib/auth'
import { CATEGORIES } from '../lib/categories'
import { friendlyError } from '../lib/errors'
import { randsToCents } from '../lib/money'
import { addDays, firstError, gigSchema, todayInSA } from '../lib/validation'
import { Button, Card, Field, PageHeader, SimulationNote } from '../components/ui'
import { AreaSelect } from '../components/AreaSelect'
import { FeeBreakdown } from '../components/gig/FeeBreakdown'
import { useToast } from '../components/ui/toast'

const windows = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
  { value: 'flexible', label: 'Flexible' },
] as const

export default function PostGig() {
  const { profile } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const today = todayInSA()
  const [form, setForm] = useState({
    title: '',
    category: '',
    description: '',
    area_slug: profile?.area_slug ?? '',
    scheduled_date: addDays(today, 2),
    time_window: 'morning' as (typeof windows)[number]['value'],
    payout_rands: '',
    address: '',
    access_notes: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))
  const payoutCents = form.payout_rands === '' ? 0 : randsToCents(Number(form.payout_rands))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError('')
    const parsed = gigSchema(today).safeParse({
      ...form,
      payout_cents: form.payout_rands === '' || Number.isNaN(payoutCents) ? undefined : payoutCents,
    })
    if (!parsed.success) {
      const errs = firstError(parsed.error)
      setErrors(errs)
      document.getElementById(Object.keys(errs)[0] === 'payout_cents' ? 'payout' : Object.keys(errs)[0])?.focus()
      return
    }
    setErrors({})
    setBusy(true)
    try {
      const id = await createGig(parsed.data)
      await queryClient.invalidateQueries({ queryKey: ['posted'] })
      await queryClient.invalidateQueries({ queryKey: ['discover'] })
      toast.show('Your gig is live! Workers nearby can now apply.')
      navigate(`/gigs/${id}`)
    } catch (err) {
      setFormError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  const invalid = (k: string) => (errors[k] ? { 'aria-invalid': true as const, 'aria-describedby': `${k === 'payout_cents' ? 'payout' : k}-error` } : {})

  return (
    <div className="mx-auto max-w-2xl">
      {params.get('welcome') && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl bg-[#0D9488]/15 border border-[#0D9488]/30 p-4 text-[#F1F5F9]">
          <PartyPopper className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p className="text-sm"><strong>Welcome to KashWise!</strong> Tell people nearby what you need. You choose a worker after reviewing their applications.</p>
        </div>
      )}
      <PageHeader title="Good help starts here." subtitle="Post a gig for nearby workers. You’re in control of who you hire." />
      <ol aria-label="How hiring works" className="mb-6 grid grid-cols-3 gap-3 rounded-2xl border border-[#1E293B] bg-[#141A21] p-4 text-sm">
        {['Post your task', 'Choose a worker', 'Confirm a job well done'].map((step, index) => <li key={step}><span className="mb-2 grid size-6 place-items-center rounded-full bg-[#0D9488]/20 text-xs font-bold text-[#14B8A6]">{index + 1}</span><span className="font-semibold">{step}</span></li>)}
      </ol>
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <Card className="space-y-4 p-5">
          <h2 className="text-lg font-bold">1. Tell us about the task</h2>
          <Field label="What do you need done?" htmlFor="title" error={errors.title} hint="e.g. “Paint my front wall” or “Grade 10 maths tutoring”">
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
          <Field label="Describe the work" htmlFor="description" error={errors.description} hint={`${form.description.trim().length}/1000 · What should the worker bring? How big is the job?`}>
            <textarea id="description" rows={4} className="input" maxLength={1000} value={form.description} onChange={(e) => set('description', e.target.value)} {...invalid('description')} />
          </Field>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="text-lg font-bold">2. Where and when?</h2>
          <Field label="Area" htmlFor="area_slug" error={errors.area_slug} hint="Shown publicly so nearby workers find your gig.">
            <AreaSelect id="area_slug" value={form.area_slug} onChange={(v) => set('area_slug', v)} invalid={Boolean(errors.area_slug)} placeholder="Choose the area" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date" htmlFor="scheduled_date" error={errors.scheduled_date}>
              <input id="scheduled_date" type="date" className="input" min={today} max={addDays(today, 180)} value={form.scheduled_date} onChange={(e) => set('scheduled_date', e.target.value)} {...invalid('scheduled_date')} />
            </Field>
            <Field label="Time of day" htmlFor="time_window">
              <select id="time_window" className="input" value={form.time_window} onChange={(e) => set('time_window', e.target.value as typeof form.time_window)}>
                {windows.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
              </select>
            </Field>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="text-lg font-bold">3. Set a clear budget</h2>
          <Field label="What will you pay for this job?" htmlFor="payout" error={errors.payout_cents} hint="Between R50 and R50 000. Nothing is added on top. Service providers are shown what they’ll receive after KashWise’s 10% fee.">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 grid place-items-center font-bold text-muted">R</span>
              <input id="payout" type="number" inputMode="decimal" min={50} max={50000} step={0.01} className="input pl-8 text-lg font-bold"
                placeholder="500" value={form.payout_rands} onChange={(e) => set('payout_rands', e.target.value)} {...invalid('payout_cents')} />
            </div>
          </Field>
          <div className="flex flex-wrap gap-2">
            {[200, 350, 500, 800, 1200].map((r) => (
              <button key={r} type="button" className="chip" aria-pressed={form.payout_rands === String(r)} onClick={() => set('payout_rands', String(r))}>
                R{r}
              </button>
            ))}
          </div>
          <FeeBreakdown payoutCents={payoutCents > 0 ? payoutCents : 0} perspective="customer" counterpart />
          <SimulationNote>You won’t be charged. When you choose a worker, KashWise simulates a payment provider holding the job price until you confirm the job is done.</SimulationNote>
        </Card>

        <Card className="space-y-4 p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#0D9488]/20 text-[#14B8A6]"><Lock className="size-4" aria-hidden /></span>
            <div>
              <h2 className="text-lg font-bold">4. Add private details</h2>
              <p className="text-sm text-muted">
                Your exact address is kept off the public listing. These details are stored encrypted and can be revealed by the worker you choose.
              </p>
            </div>
          </div>
          <Field label="Street address" htmlFor="address" error={errors.address} optional>
            <input id="address" autoComplete="street-address" className="input" maxLength={200} value={form.address} onChange={(e) => set('address', e.target.value)} {...invalid('address')} />
          </Field>
          <Field label="Access notes" htmlFor="access_notes" error={errors.access_notes} optional hint="Gate code, parking, which house — anything the worker needs.">
            <input id="access_notes" className="input" maxLength={300} value={form.access_notes} onChange={(e) => set('access_notes', e.target.value)} {...invalid('access_notes')} />
          </Field>
        </Card>

        {formError && <p role="alert" className="rounded-lg bg-clay-50 px-3 py-2 text-sm font-medium text-clay-700">{formError}</p>}
        <p className="text-sm text-muted">After publishing, review applications on your gig page. Nothing is booked until you choose a worker. Keep phone numbers and street addresses out of the public task description.</p>
        <Button type="submit" size="lg" block loading={busy}>Post task</Button>
      </form>
    </div>
  )
}
