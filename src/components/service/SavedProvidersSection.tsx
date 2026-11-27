import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, CalendarDays, MapPin, Plus, Search, Send, Trash2, UserPlus, Users, X } from 'lucide-react'
import {
  bookService,
  discoverServices,
  discoverWorkers,
  fetchHiredBefore,
  removeClientProvider,
  requestProviderService,
  saveClientProvider,
  searchWorkersByName,
  type WorkerHit,
} from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { CATEGORIES, categoryLabel } from '../../lib/categories'
import { baselineFloor } from '../../lib/dictation'
import { friendlyError } from '../../lib/errors'
import { resolveAreaFromAddress } from '../../lib/geo'
import { TIME_WINDOW_LABEL } from '../../lib/gig-rules'
import { areaLabel, useAreaLookup, useAreas } from '../../lib/hooks'
import { formatRand, randsToCents } from '../../lib/money'
import { avatarUrl } from '../../lib/supabase'
import type { SavedProvider, TimeWindow } from '../../lib/types'
import { addDays, bookingSchema, firstError, gigSchema, todayInSA } from '../../lib/validation'
import { AreaSelect } from '../AreaSelect'
import { CategoryIcon } from '../CategoryIcon'
import { FeeBreakdown } from '../gig/FeeBreakdown'
import { Avatar, Badge, Button, Card, DemoBadge, EmptyState, Field, Spinner } from '../ui'
import { useToast } from '../ui/toast'

export type RequestableWorker = {
  id: string
  display_name: string
  headline?: string | null
  area_slug: string
  skills: string[]
  avatar_path?: string | null
  is_demo?: boolean
}

/** Modal to directly request a service from a retained or chosen service provider via KashWise. */
export function RequestServiceModal({
  worker,
  onClose,
}: {
  worker: RequestableWorker
  onClose: () => void
}) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { data: areas } = useAreas()
  const areaOf = useAreaLookup()
  const today = todayInSA()
  const first = worker.display_name.split(' ')[0]

  const servicesQ = useQuery({
    queryKey: ['services', 'worker', worker.id],
    queryFn: () => discoverServices({ worker: worker.id, page: 0 }),
  })
  const listedServices = servicesQ.data ?? []

  const defaultCategory = worker.skills[0] || CATEGORIES[0].slug
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null)
  const activeServiceId = selectedServiceId ?? (listedServices[0]?.id ?? 'custom')
  const [showAreaPicker, setShowAreaPicker] = useState(false)
  const [form, setForm] = useState({
    title: '',
    category: defaultCategory,
    description: '',
    area_slug: profile?.area_slug || worker.area_slug || '',
    scheduled_date: addDays(today, 1),
    time_window: 'morning' as TimeWindow,
    payout_rands: String(baselineFloor(defaultCategory)),
    address: '',
    access_notes: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))

  function onAddressChange(address: string) {
    const resolved = resolveAreaFromAddress(address, profile?.area_slug || form.area_slug, areas ?? [])
    setForm((f) => ({ ...f, address, area_slug: resolved || f.area_slug }))
  }

  const chosenService = listedServices.find((s) => s.id === activeServiceId) ?? null
  const floor = form.category ? baselineFloor(form.category) : 50
  const payoutCents = chosenService
    ? chosenService.price_cents
    : form.payout_rands === ''
      ? 0
      : randsToCents(Number(form.payout_rands))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError('')

    if (form.address.trim().length < 5) {
      setErrors({ address: 'Enter the street address where the job will take place. Only your area is shown publicly.' })
      return
    }

    if (chosenService) {
      const parsed = bookingSchema(today).safeParse({
        area_slug: form.area_slug,
        scheduled_date: form.scheduled_date,
        time_window: form.time_window,
        address: form.address,
        access_notes: form.access_notes,
      })
      if (!parsed.success) {
        setErrors(firstError(parsed.error))
        return
      }
      setErrors({})
      setBusy(true)
      try {
        const gigId = await bookService(chosenService.id, parsed.data)
        await queryClient.invalidateQueries({ queryKey: ['posted'] })
        toast.show(`Service requested! ${first} has been matched to your job.`)
        onClose()
        navigate(`/gigs/${gigId}`)
      } catch (err) {
        setFormError(friendlyError(err))
      } finally {
        setBusy(false)
      }
      return
    }

    const parsed = gigSchema(today).safeParse({
      ...form,
      payout_cents: form.payout_rands === '' || Number.isNaN(payoutCents) ? undefined : payoutCents,
    })
    if (!parsed.success) {
      setErrors(firstError(parsed.error))
      return
    }
    if (parsed.data.payout_cents < floor * 100) {
      setErrors({ payout_cents: `The market rate for this work starts at R${floor}.` })
      return
    }
    setErrors({})
    setBusy(true)
    try {
      const gigId = await requestProviderService(worker.id, parsed.data)
      await queryClient.invalidateQueries({ queryKey: ['posted'] })
      await queryClient.invalidateQueries({ queryKey: ['discover'] })
      toast.show(`Service requested from ${first}!`)
      onClose()
      navigate(`/gigs/${gigId}`)
    } catch (err) {
      setFormError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  const publicArea = areaOf(form.area_slug)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="req-service-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
    >
      <Card className="max-h-[90dvh] w-full max-w-xl overflow-y-auto p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar name={worker.display_name} id={worker.id} src={avatarUrl(worker.avatar_path ?? null)} />
            <div>
              <h2 id="req-service-title" className="text-lg font-semibold">
                Request service from {first}
              </h2>
              <p className="text-xs text-muted">
                {worker.headline || worker.skills.map(categoryLabel).join(' · ') || 'Independent service provider'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-lg text-muted hover:bg-canvas hover:text-ink"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
          {listedServices.length > 0 && (
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Choose a service or describe a custom task</legend>
              <div className="space-y-2">
                {listedServices.map((s) => (
                  <label
                    key={s.id}
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 text-sm transition ${
                      activeServiceId === s.id ? 'border-brand-500 bg-brand-50/40' : 'border-line bg-canvas'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="radio"
                        name="service_choice"
                        checked={activeServiceId === s.id}
                        onChange={() => setSelectedServiceId(s.id)}
                        className="accent-brand-600"
                      />
                      <span className="truncate font-medium">{s.title}</span>
                    </span>
                    <span className="shrink-0 font-semibold text-brand-400">{formatRand(s.price_cents)}</span>
                  </label>
                ))}
                <label
                  className={`flex cursor-pointer items-center gap-2.5 rounded-xl border p-3 text-sm transition ${
                    activeServiceId === 'custom' ? 'border-brand-500 bg-brand-50/40' : 'border-line bg-canvas'
                  }`}
                >
                  <input
                    type="radio"
                    name="service_choice"
                    checked={activeServiceId === 'custom'}
                    onChange={() => setSelectedServiceId('custom')}
                    className="accent-brand-600"
                  />
                  <span className="font-medium">Custom task / service request</span>
                </label>
              </div>
            </fieldset>
          )}

          {!chosenService && (
            <>
              <Field label={`What do you need ${first} to do?`} htmlFor="req-title" error={errors.title}>
                <input
                  id="req-title"
                  className="input"
                  maxLength={80}
                  placeholder={`e.g. ${categoryLabel(form.category)} at my home`}
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                />
              </Field>

              <fieldset>
                <legend className="mb-1.5 text-sm font-semibold">Category</legend>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.slug}
                      type="button"
                      className="chip text-xs"
                      aria-pressed={form.category === c.slug}
                      onClick={() => {
                        set('category', c.slug)
                        set('payout_rands', String(baselineFloor(c.slug)))
                      }}
                    >
                      <CategoryIcon category={c.slug} className="size-3.5" /> {c.label}
                    </button>
                  ))}
                </div>
                {errors.category && <p className="mt-1 text-sm font-medium text-clay-700">{errors.category}</p>}
              </fieldset>

              <Field label="Describe the work" htmlFor="req-desc" error={errors.description}>
                <textarea
                  id="req-desc"
                  rows={3}
                  maxLength={1000}
                  className="input"
                  placeholder="Describe what needs to be done, any tools or materials provided, and timing."
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                />
              </Field>

              <Field
                label="Labour cost"
                htmlFor="req-payout"
                error={errors.payout_cents}
                hint={`Market rate from R${floor}. ${first} receives 90% after the 10% platform fee.`}
              >
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3.5 grid place-items-center font-semibold text-muted">
                    R
                  </span>
                  <input
                    id="req-payout"
                    type="number"
                    inputMode="decimal"
                    min={floor}
                    max={50000}
                    step={10}
                    className="input pl-8 font-semibold"
                    value={form.payout_rands}
                    onChange={(e) => set('payout_rands', e.target.value)}
                  />
                </div>
              </Field>
            </>
          )}

          <div className="rounded-xl border border-line bg-canvas p-3.5 space-y-3">
            <Field
              label="Street address where the job takes place"
              htmlFor="req-address"
              error={errors.address}
              hint="Encrypted. Only the area is shown on the job listing."
            >
              <input
                id="req-address"
                autoComplete="street-address"
                className="input"
                maxLength={200}
                placeholder="e.g. 14 Vilakazi Street, Orlando West"
                value={form.address}
                onChange={(e) => onAddressChange(e.target.value)}
              />
            </Field>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-brand-50/60 px-3 py-2 text-xs">
              <span className="flex items-center gap-1.5 text-ink-soft">
                <MapPin className="size-3.5 text-brand-500" aria-hidden />
                Public area shown:{' '}
                <strong className="text-ink">
                  {publicArea ? `${publicArea.name}, ${publicArea.city}` : form.area_slug || 'Choose area'}
                </strong>
                <span className="text-muted">(actual address is hidden)</span>
              </span>
              <button
                type="button"
                onClick={() => setShowAreaPicker((v) => !v)}
                className="font-semibold text-brand-500 hover:underline"
              >
                {showAreaPicker ? 'Done' : 'Change area'}
              </button>
            </div>

            {(showAreaPicker || !form.area_slug) && (
              <Field label="Area shown publicly" htmlFor="req-area" error={errors.area_slug}>
                <AreaSelect
                  id="req-area"
                  value={form.area_slug}
                  onChange={(v) => set('area_slug', v)}
                  invalid={Boolean(errors.area_slug)}
                />
              </Field>
            )}

            <Field label="Access notes" htmlFor="req-notes" optional>
              <input
                id="req-notes"
                className="input"
                maxLength={300}
                placeholder={`Gate code, parking, or notes for ${first}`}
                value={form.access_notes}
                onChange={(e) => set('access_notes', e.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date" htmlFor="req-date" error={errors.scheduled_date}>
              <input
                id="req-date"
                type="date"
                className="input"
                min={today}
                max={addDays(today, 180)}
                value={form.scheduled_date}
                onChange={(e) => set('scheduled_date', e.target.value)}
              />
            </Field>
            <Field label="Time of day" htmlFor="req-window">
              <select
                id="req-window"
                className="input"
                value={form.time_window}
                onChange={(e) => set('time_window', e.target.value as TimeWindow)}
              >
                {(Object.keys(TIME_WINDOW_LABEL) as TimeWindow[]).map((w) => (
                  <option key={w} value={w}>
                    {TIME_WINDOW_LABEL[w]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <FeeBreakdown payoutCents={payoutCents > 0 ? payoutCents : 0} perspective="customer" counterpart />

          {formError && (
            <p role="alert" className="rounded-lg bg-clay-50 px-3 py-2 text-sm font-medium text-clay-700">
              {formError}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              <Send className="size-4" aria-hidden /> Request service ({formatRand(payoutCents > 0 ? payoutCents : 0)})
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

/** Modal to search and add a service provider to the client's saved roster. */
function AddProviderModal({
  clientId,
  savedIds,
  onAdded,
  onClose,
}: {
  clientId: string
  savedIds: Set<string>
  onAdded: () => void
  onClose: () => void
}) {
  const { profile } = useAuth()
  const toast = useToast()
  const areaOf = useAreaLookup()
  const [query, setQuery] = useState('')
  const [term, setTerm] = useState('')
  const [labelByWorker, setLabelByWorker] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => setTerm(query.trim()), 250)
    return () => window.clearTimeout(t)
  }, [query])

  const hiredQ = useQuery({
    queryKey: ['hired-before', clientId],
    queryFn: () => fetchHiredBefore(clientId),
  })
  const searchQ = useQuery({
    queryKey: ['worker-search', term],
    queryFn: () => searchWorkersByName(term),
    enabled: term.length >= 2,
  })
  const nearbyQ = useQuery({
    queryKey: ['workers', profile?.area_slug ?? '', null],
    queryFn: () => discoverWorkers({ area: profile?.area_slug || null, skill: null, page: 0 }),
  })

  async function addWorker(w: WorkerHit) {
    setBusyId(w.id)
    try {
      await saveClientProvider(clientId, w.id, labelByWorker[w.id] ?? null)
      toast.show(`${w.display_name} added to your service providers.`)
      onAdded()
    } catch (err) {
      toast.show(friendlyError(err), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const candidates: WorkerHit[] =
    term.length >= 2
      ? searchQ.data ?? []
      : [
          ...(hiredQ.data ?? []),
          ...(nearbyQ.data ?? [])
            .filter((n) => !(hiredQ.data ?? []).some((h) => h.id === n.id))
            .map((n) => ({
              id: n.id,
              display_name: n.display_name,
              headline: n.headline,
              area_slug: n.area_slug,
              skills: n.skills,
              avatar_path: n.avatar_path,
              is_demo: n.is_demo,
            })),
        ]

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-provider-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
    >
      <Card className="max-h-[88dvh] w-full max-w-lg overflow-y-auto p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="add-provider-title" className="text-lg font-semibold">
              Add a service provider
            </h2>
            <p className="text-xs text-muted">
              Keep your regular service providers on your roster so you can request their services anytime.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-lg text-muted hover:bg-canvas hover:text-ink"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            className="input pl-10"
            placeholder="Search service providers by name…"
            aria-label="Search service providers by name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="mt-4 space-y-2.5">
          {term.length >= 2 && searchQ.isPending ? (
            <Spinner label="Searching providers…" />
          ) : candidates.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              {term.length >= 2 ? `No service provider matching “${term}”.` : 'No service providers found yet.'}
            </p>
          ) : (
            <ul className="space-y-2.5">
              {candidates.slice(0, 12).map((w) => {
                const alreadySaved = savedIds.has(w.id)
                const area = areaOf(w.area_slug)
                return (
                  <li key={w.id} className="rounded-xl border border-line bg-canvas p-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={w.display_name} id={w.id} src={avatarUrl(w.avatar_path)} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link to={`/w/${w.id}`} className="truncate font-semibold hover:text-brand-400">
                            {w.display_name}
                          </Link>
                          {w.is_demo && <DemoBadge />}
                        </div>
                        <p className="truncate text-xs text-muted">
                          {areaLabel(area, w.area_slug)}
                          {w.skills.length > 0 ? ` · ${w.skills.slice(0, 3).map(categoryLabel).join(', ')}` : ''}
                        </p>
                      </div>
                      {alreadySaved ? (
                        <Badge tone="brand">
                          <BadgeCheck className="size-3.5" aria-hidden /> Added
                        </Badge>
                      ) : (
                        <Button size="sm" loading={busyId === w.id} onClick={() => addWorker(w)}>
                          <Plus className="size-4" aria-hidden /> Add
                        </Button>
                      )}
                    </div>
                    {!alreadySaved && (
                      <div className="mt-2">
                        <input
                          type="text"
                          maxLength={60}
                          className="input h-8 text-xs"
                          placeholder="Optional role / note (e.g. Our regular plumber, Gardener)"
                          aria-label={`Role or note for ${w.display_name}`}
                          value={labelByWorker[w.id] ?? ''}
                          onChange={(e) => setLabelByWorker((prev) => ({ ...prev, [w.id]: e.target.value }))}
                        />
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </Card>
    </div>
  )
}

/** Client's retained service providers roster ("My service providers / Add employees & contractors"). */
export function SavedProvidersSection({
  clientId,
  providers,
  isLoading,
  onChanged,
}: {
  clientId: string
  providers: SavedProvider[]
  isLoading?: boolean
  onChanged: () => void
}) {
  const toast = useToast()
  const areaOf = useAreaLookup()
  const [adding, setAdding] = useState(false)
  const [requestingWorker, setRequestingWorker] = useState<RequestableWorker | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const savedIds = new Set(providers.map((p) => p.worker_id))

  async function handleRemove(workerId: string, name: string) {
    setRemovingId(workerId)
    try {
      await removeClientProvider(clientId, workerId)
      toast.show(`${name} removed from your service providers.`)
      onChanged()
    } catch (err) {
      toast.show(friendlyError(err), 'error')
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <section aria-labelledby="saved-providers-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="saved-providers-heading" className="text-lg font-semibold text-ink">
            My service providers
          </h2>
          <p className="text-xs text-muted">
            Retain your trusted people and request a service directly via KashWise whenever you need them.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
          <UserPlus className="size-4" aria-hidden /> Add service provider
        </Button>
      </div>

      {isLoading ? (
        <Spinner label="Loading your service providers…" />
      ) : providers.length === 0 ? (
        <EmptyState
          icon={<Users className="size-5" aria-hidden />}
          title="No saved service providers yet"
          action={
            <Button variant="secondary" onClick={() => setAdding(true)}>
              <UserPlus className="size-4" aria-hidden /> Add service provider
            </Button>
          }
        >
          Add the service providers you trust so you can retain them and request a service in seconds.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {providers.map((item) => {
            const w = item.worker
            if (!w) return null
            const area = areaOf(w.area_slug)
            return (
              <li
                key={item.worker_id}
                className="flex flex-col justify-between gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <Avatar name={w.display_name} id={w.id} src={avatarUrl(w.avatar_path)} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/w/${w.id}`} className="truncate font-semibold text-ink hover:text-brand-400">
                        {w.display_name}
                      </Link>
                      {item.label && <Badge tone="brand">{item.label}</Badge>}
                      {w.is_demo && <DemoBadge />}
                    </div>
                    {w.headline && <p className="mt-0.5 truncate text-xs text-ink-soft">{w.headline}</p>}
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                      <MapPin className="size-3.5" aria-hidden />
                      {areaLabel(area, w.area_slug)}
                    </p>
                    {w.skills.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {w.skills.slice(0, 4).map((s) => (
                          <span
                            key={s}
                            className="rounded-md border border-line bg-canvas px-2 py-0.5 text-[11px] font-medium text-ink-soft"
                          >
                            {categoryLabel(s)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                  <Button
                    size="sm"
                    onClick={() =>
                      setRequestingWorker({
                        id: w.id,
                        display_name: w.display_name,
                        headline: w.headline,
                        area_slug: w.area_slug,
                        skills: w.skills,
                        avatar_path: w.avatar_path,
                        is_demo: w.is_demo,
                      })
                    }
                  >
                    <CalendarDays className="size-4" aria-hidden /> Request service
                  </Button>
                  <div className="flex items-center gap-1">
                    <Link
                      to={`/w/${w.id}`}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-soft hover:bg-canvas hover:text-ink"
                    >
                      ProofScript
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={removingId === w.id}
                      aria-label={`Remove ${w.display_name}`}
                      onClick={() => handleRemove(w.id, w.display_name)}
                    >
                      <Trash2 className="size-4 text-muted" aria-hidden />
                    </Button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {adding && (
        <AddProviderModal
          clientId={clientId}
          savedIds={savedIds}
          onAdded={onChanged}
          onClose={() => setAdding(false)}
        />
      )}

      {requestingWorker && (
        <RequestServiceModal worker={requestingWorker} onClose={() => setRequestingWorker(null)} />
      )}
    </section>
  )
}
