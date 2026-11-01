import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { addGigPhoto, createGig } from '../lib/api'
import { useAuth } from '../lib/auth'
import { CATEGORIES } from '../lib/categories'
import { baselineFloor } from '../lib/dictation'
import { friendlyError } from '../lib/errors'
import { randsToCents } from '../lib/money'
import { addDays, firstError, gigSchema, todayInSA } from '../lib/validation'
import { Button, Card, Field, PageHeader } from '../components/ui'
import { AreaSelect } from '../components/AreaSelect'
import { CategoryIcon } from '../components/CategoryIcon'
import { DictatePanel } from '../components/DictatePanel'
import { FeeBreakdown } from '../components/gig/FeeBreakdown'
import { JobPhotoPicker } from '../components/gig/JobPhotoPicker'
import { useToast } from '../components/ui/toast'

const windows = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
  { value: 'flexible', label: 'Flexible' },
] as const

export default function PostGig() {
  const { profile, userId } = useAuth()
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
  const [draftFloor, setDraftFloor] = useState<number | null>(null)
  const [drafted, setDrafted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [photos, setPhotos] = useState<File[]>([])
  const preview = useRef<HTMLDivElement>(null)
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))
  const payoutCents = form.payout_rands === '' ? 0 : randsToCents(Number(form.payout_rands))
  // Clients may offer more than the market rate for the work, not less.
  const floor = draftFloor ?? (form.category ? baselineFloor(form.category) : 0)

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
    if (parsed.data.payout_cents < floor * 100) {
      setErrors({ payout_cents: `The market rate for this work starts at R${floor}.` })
      document.getElementById('payout')?.focus()
      return
    }
    setErrors({})
    setBusy(true)
    try {
      const id = await createGig(parsed.data)
      const uploads = await Promise.allSettled(photos.map((file) => addGigPhoto(id, userId!, file)))
      if (uploads.some((u) => u.status === 'rejected')) toast.show('Your gig is live, but a photo did not upload.', 'error')
      await queryClient.invalidateQueries({ queryKey: ['posted'] })
      await queryClient.invalidateQueries({ queryKey: ['discover'] })
      toast.show('Your gig is live.')
      navigate(`/gigs/${id}`)
    } catch (err) {
      setFormError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  const invalid = (k: string) => (errors[k] ? { 'aria-invalid': true as const, 'aria-describedby': `${k === 'payout_cents' ? 'payout' : k}-error` } : {})

  const taskFields = (
    <>
      <Field label="What do you need done?" htmlFor="title" error={errors.title}>
        <input id="title" className="input" maxLength={80} value={form.title} onChange={(e) => set('title', e.target.value)} {...invalid('title')} />
      </Field>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Category</legend>
        <div className="flex flex-wrap gap-2" id="category" tabIndex={-1}>
          {CATEGORIES.map((c) => (
            <button key={c.slug} type="button" className="chip" aria-pressed={form.category === c.slug} onClick={() => { set('category', c.slug); setDraftFloor(null) }}>
              <CategoryIcon category={c.slug} className="size-4" /> {c.label}
            </button>
          ))}
        </div>
        {errors.category && <p id="category-error" className="mt-1 text-sm font-medium text-clay-700">{errors.category}</p>}
      </fieldset>
      <Field label="Describe the work" htmlFor="description" error={errors.description}>
        <textarea id="description" rows={4} className="input" maxLength={1000} value={form.description} onChange={(e) => set('description', e.target.value)} {...invalid('description')} />
      </Field>
      <JobPhotoPicker files={photos} onChange={setPhotos} />
    </>
  )

  const budgetFields = (
    <>
      <Field label="Labour cost" htmlFor="payout" error={errors.payout_cents} hint={floor ? `Market rate from R${floor}. You can offer more, not less.` : undefined}>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3.5 grid place-items-center font-semibold text-muted">R</span>
          <input id="payout" type="number" inputMode="decimal" min={floor || 50} max={50000} step={0.01} className="input pl-8 text-lg font-semibold"
            placeholder={floor ? String(floor) : '500'} value={form.payout_rands} onChange={(e) => set('payout_rands', e.target.value)} {...invalid('payout_cents')} />
        </div>
      </Field>
      <FeeBreakdown payoutCents={payoutCents > 0 ? payoutCents : 0} perspective="customer" counterpart />
    </>
  )

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Post a gig" />
      <div className="mb-5">
        <DictatePanel
          kind="job"
          title="Say what you need"
          placeholder="Today I need someone to fix my leaking roof, in the morning if possible."
          action="Write my job post"
          onDraft={(draft) => {
            const before = form
            setForm((f) => ({
              ...f,
              title: draft.title,
              category: draft.category,
              description: draft.description,
              time_window: draft.time_window ?? f.time_window,
              scheduled_date: draft.scheduled_date ?? f.scheduled_date,
              payout_rands: draft.price_rands != null ? String(draft.price_rands) : f.payout_rands,
            }))
            setDraftFloor(draft.market_floor_rands)
            setDrafted(true)
            setErrors({})
            setTimeout(() => preview.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
            return () => { setForm(before); setDraftFloor(null) }
          }}
          onUndo={() => setDrafted(false)}
          readBack={(draft) => `${draft.title}. ${draft.description}${draft.price_rands != null ? ` Labour cost: ${draft.price_rands} rand.` : ''}`}
        />
      </div>
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {drafted ? (
          <div ref={preview} className="scroll-mt-24">
            <Card className="space-y-4 border-brand-200 p-5">
              <h2 className="text-lg font-semibold">Your job post</h2>
              {taskFields}
              {budgetFields}
            </Card>
          </div>
        ) : (
          <>
            <Card className="space-y-4 p-5">
              <h2 className="text-lg font-semibold">The task</h2>
              {taskFields}
            </Card>
          </>
        )}

        <Card className="space-y-4 p-5">
          <h2 className="text-lg font-semibold">Where and when</h2>
          <Field label="Area" htmlFor="area_slug" error={errors.area_slug}>
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

        {!drafted && (
          <Card className="space-y-4 p-5">
            <h2 className="text-lg font-semibold">Budget</h2>
            {budgetFields}
          </Card>
        )}

        <Card className="space-y-4 p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-500"><Lock className="size-4" aria-hidden /></span>
            <div>
              <h2 className="text-lg font-semibold">Private details</h2>
              <p className="text-sm text-muted">Only the worker you choose can see these.</p>
            </div>
          </div>
          <Field label="Street address" htmlFor="address" error={errors.address} optional>
            <input id="address" autoComplete="street-address" className="input" maxLength={200} value={form.address} onChange={(e) => set('address', e.target.value)} {...invalid('address')} />
          </Field>
          <Field label="Access notes" htmlFor="access_notes" error={errors.access_notes} optional>
            <input id="access_notes" className="input" maxLength={300} value={form.access_notes} onChange={(e) => set('access_notes', e.target.value)} {...invalid('access_notes')} />
          </Field>
        </Card>

        {formError && <p role="alert" className="rounded-lg bg-clay-50 px-3 py-2 text-sm font-medium text-clay-700">{formError}</p>}
        <Button type="submit" size="lg" block loading={busy}>Post gig</Button>
      </form>
    </div>
  )
}
