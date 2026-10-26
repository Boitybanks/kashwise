import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, CalendarDays, Check, Clock3, MapPin, RotateCcw, ShieldCheck, Sparkles, Target, Trash2 } from 'lucide-react'
import { fetchEarnGoal, forgetEarnGoalMemory, planEarnGoal } from '../lib/earn-goal-api'
import type { GoalInput, GoalMemory, GoalPlan, GoalResponse, GoalSuggestion, GoalWindow } from '../lib/earn-goal-types'
import { useAuth } from '../lib/auth'
import { CATEGORIES, categoryLabel } from '../lib/categories'
import { friendlyError } from '../lib/errors'
import { formatDate, formatDay } from '../lib/format'
import { formatDistance } from '../lib/geo'
import { TIME_WINDOW_LABEL } from '../lib/gig-rules'
import { useAreaLookup } from '../lib/hooks'
import { formatRand } from '../lib/money'
import { addDays, todayInSA } from '../lib/validation'
import type { Profile } from '../lib/types'
import { AreaSelect } from '../components/AreaSelect'
import { Badge, Button, ButtonLink, Card, DemoBadge, EmptyState, ErrorState, Field, PageHeader, SimulationNote, Spinner } from '../components/ui'

const DAYS = [{ n: 1, label: 'Mon' }, { n: 2, label: 'Tue' }, { n: 3, label: 'Wed' }, { n: 4, label: 'Thu' }, { n: 5, label: 'Fri' }, { n: 6, label: 'Sat' }, { n: 0, label: 'Sun' }]
const WINDOWS: { value: GoalWindow; label: string }[] = [{ value: 'morning', label: 'Morning' }, { value: 'afternoon', label: 'Afternoon' }, { value: 'evening', label: 'Evening' }]
type Draft = Omit<GoalInput, 'target_cents'> & { target_rands: string }

function draftFrom(input: GoalInput): Draft {
  return { target_rands: String(input.target_cents / 100), deadline: input.deadline, area_slug: input.area_slug,
    weekdays: [...input.weekdays], time_windows: [...input.time_windows], radius_km: input.radius_km,
    skills: [...input.skills], memory_opt_in: input.memory_opt_in }
}

function comparable(input: GoalInput) {
  return JSON.stringify({ ...input, weekdays: [...input.weekdays].sort(), time_windows: [...input.time_windows].sort(), skills: [...input.skills].sort() })
}

function toInput(draft: Draft): GoalInput {
  const { target_rands, ...rest } = draft
  return { ...rest, target_cents: Math.round(Number(target_rands) * 100) }
}

function Opportunity({ gig }: { gig: GoalSuggestion }) {
  const areaOf = useAreaLookup()
  return (
    <article className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted">{categoryLabel(gig.category)}</p>
          <h3 className="mt-1 text-lg font-bold leading-snug">{gig.title}</h3>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xl font-extrabold text-brand-500">{formatRand(gig.worker_net_cents)}</p>
          <p className="text-xs text-muted">after platform fee</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
        <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden />{areaOf(gig.area_slug)?.name ?? gig.area_slug} · {formatDistance(gig.distance_km)}</span>
        <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" aria-hidden />{formatDay(gig.scheduled_date)} · {TIME_WINDOW_LABEL[gig.time_window]}</span>
      </div>
      <ul className="mt-4 space-y-1.5 text-sm" aria-label={`Why ${gig.title} fits`}>
        {gig.reasons.map((reason) => <li className="flex items-start gap-2" key={reason}><Check className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden /><span>{reason}</span></li>)}
      </ul>
      <p className="mt-3 flex items-start gap-2 rounded-xl bg-canvas px-3 py-2 text-xs text-ink-soft"><Clock3 className="mt-0.5 size-3.5 shrink-0" aria-hidden /><span>{gig.schedule_note}</span></p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <div className="space-y-1 text-xs text-muted">
          <p>Client price {formatRand(gig.payout_cents)} · fee {formatRand(gig.fee_cents)}</p>
          <div className="flex flex-wrap gap-2">{gig.is_demo ? <DemoBadge /> : <Badge tone="brand"><ShieldCheck className="size-3" aria-hidden />Required identity details supplied</Badge>}{gig.application_status === 'pending' && <Badge tone="blue">Application pending</Badge>}</div>
        </div>
        <ButtonLink to={`/gigs/${gig.id}`} variant="secondary" size="sm">Review gig <ArrowUpRight className="size-4" aria-hidden /></ButtonLink>
      </div>
    </article>
  )
}

function Progress({ plan }: { plan: GoalPlan }) {
  const p = plan.progress
  const percent = Math.max(0, Math.min(100, p.settled_cents / plan.goal.target_cents * 100))
  return (
    <Card className="overflow-hidden p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-wider text-brand-700">Your earnings goal</p><h2 className="mt-1 text-2xl font-extrabold">{formatRand(plan.goal.target_cents)} by {formatDay(plan.goal.deadline)}</h2></div>
        <Badge tone={plan.simulation ? 'sun' : 'brand'}>{plan.simulation ? 'Simulation' : 'KashWise records'}</Badge>
      </div>
      <p className="mt-3 text-sm"><strong>{formatRand(p.settled_cents)}</strong> in settled net earnings since {formatDate(plan.goal.started_at)}.</p>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-brand-50" role="progressbar" aria-label="Settled earnings toward your goal" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${formatRand(p.settled_cents)} settled of ${formatRand(plan.goal.target_cents)} target`}><span className="block h-full rounded-full bg-brand-600 transition-all" style={{ width: `${percent}%` }} /></div>
      <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-brand-50 p-3"><dt className="text-xs font-semibold text-brand-800">Settled earnings</dt><dd className="mt-1 text-xl font-extrabold">{formatRand(p.settled_cents)}</dd><dd className="mt-1 text-xs text-muted">After fees and refunds; not necessarily paid out.</dd></div>
        <div className="rounded-xl bg-canvas p-3"><dt className="text-xs font-semibold text-muted">Booked work</dt><dd className="mt-1 text-xl font-extrabold">{formatRand(p.booked_cents)}</dd><dd className="mt-1 text-xs text-muted">Expected from booked work. Not earned yet.</dd></div>
        <div className="rounded-xl bg-canvas p-3"><dt className="text-xs font-semibold text-muted">Suggested opportunities</dt><dd className="mt-1 text-xl font-extrabold">{formatRand(p.planned_cents)}</dd><dd className="mt-1 text-xs text-muted">Potential only. You still need to be hired.</dd></div>
      </dl>
      <p className="mt-4 text-sm">{p.remaining_after_plan_cents > 0 ? <>Even with the booked and suggested work, you would still need <strong>{formatRand(p.remaining_after_plan_cents)}</strong> toward this goal.</> : p.remaining_cents === 0 ? 'Your settled earnings have reached this goal.' : 'Booked and suggested work could cover the remaining goal if completed and paid.'}</p>
      <p className="mt-2 text-xs text-muted">All figures are before your travel, materials and other work costs. Opportunities and payment are not guaranteed.</p>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-xs text-muted"><span>Paid out: <strong>{formatRand(p.paid_out_cents)}</strong></span><span>Payout pending: <strong>{formatRand(p.payout_pending_cents)}</strong></span><span>Dispute hold: <strong>{formatRand(p.disputed_hold_cents)}</strong></span></div>
      <p className="mt-2 text-xs text-muted">This goal period only · updated {formatDate(plan.as_of)}. Refresh your plan to check current availability.</p>
    </Card>
  )
}

function MemoryStatus({ memory, onRestore, onForget, forgetting, saving }: { memory: GoalMemory; onRestore: () => void; onForget: () => void; forgetting: boolean; saving: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-canvas p-3">
      <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-brand-700" aria-hidden />Your preferences, your choice</div>
      <p className="mt-1 text-xs text-muted" role="status">{memory.message}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {memory.status === 'ready' && memory.preferences && <Button variant="secondary" size="sm" disabled={saving || forgetting} onClick={onRestore}><RotateCcw className="size-3.5" aria-hidden />Use remembered preferences</Button>}
        <Button variant="ghost" size="sm" disabled={saving} loading={forgetting} onClick={onForget}><Trash2 className="size-3.5" aria-hidden />Forget my preferences</Button>
      </div>
    </div>
  )
}

function GoalWorkspace({ profile, data }: { profile: Profile; data: GoalResponse }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<Draft>(() => draftFrom(data.goal ?? {
    target_cents: 90_000, deadline: addDays(todayInSA(), 7), area_slug: profile.area_slug,
    weekdays: [0, 1, 2, 3, 4, 5, 6], time_windows: ['morning', 'afternoon', 'evening'],
    radius_km: 10, skills: profile.skills, memory_opt_in: false,
  }))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  const today = todayInSA()
  const queryKey = ['earn-goal', profile.id]
  const save = useMutation({
    mutationFn: planEarnGoal,
    onSuccess: (plan) => { qc.setQueryData<GoalResponse>(queryKey, { goal: plan.goal, plan, memory: plan.memory }); setNotice('Your plan is updated. Review a gig to decide whether to apply.') },
  })
  const forget = useMutation({
    mutationFn: forgetEarnGoalMemory,
    onSuccess: ({ memory }) => {
      qc.setQueryData<GoalResponse>(queryKey, (current) => current ? { ...current, goal: current.goal ? { ...current.goal, memory_opt_in: false } : null, memory, plan: current.plan ? { ...current.plan, goal: { ...current.plan.goal, memory_opt_in: false }, memory } : null } : current)
      setForm((f) => ({ ...f, memory_opt_in: false }))
      if (memory.status === 'off') { setNotice(memory.message) }
      else setNotice('Your preferences could not be confirmed deleted. Please try forgetting them again.')
    },
  })
  const input = toInput(form)
  const baseline = data.goal ? toInput(draftFrom(data.goal)) : null
  const changed = Boolean(baseline && comparable(input) !== comparable(baseline))
  const startsNewPeriod = Boolean(data.goal && (input.target_cents !== data.goal.target_cents || input.deadline !== data.goal.deadline))
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => { setForm((f) => ({ ...f, [key]: value })); setNotice('') }
  const toggle = <T,>(items: T[], value: T) => items.includes(value) ? items.filter((item) => item !== value) : [...items, value]
  const invalid = (id: string) => ({ 'aria-invalid': Boolean(errors[id]) || undefined, 'aria-describedby': errors[id] ? `${id}-error` : undefined })

  function submit(e: FormEvent) {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!/^\d+(\.\d{1,2})?$/.test(form.target_rands) || input.target_cents < 100 || input.target_cents > 10_000_000) next.target_rands = 'Enter a goal between R1 and R100 000, with at most two decimal places.'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.deadline) || form.deadline < today || form.deadline > addDays(today, 90)) next.deadline = 'Choose a date from today through the next 90 days.'
    if (!form.area_slug) next.area_slug = 'Choose the area you want to work near.'
    if (!form.skills.length) next.skills = 'Choose at least one kind of work you can do.'
    if (!form.weekdays.length) next.weekdays = 'Choose at least one available day.'
    if (!form.time_windows.length) next.time_windows = 'Choose at least one time of day.'
    setErrors(next)
    setNotice('')
    if (Object.keys(next).length) { document.getElementById(Object.keys(next)[0])?.focus(); return }
    save.mutate(input)
  }

  function restore() {
    if (!data.memory.preferences) return
    setForm(draftFrom({ ...data.memory.preferences, memory_opt_in: form.memory_opt_in }))
    setNotice('Remembered preferences loaded into the form. Check the amount, date and availability before updating your plan.')
  }

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <form onSubmit={submit} noValidate className="space-y-4">
        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-extrabold">Make room for your next goal.</h2>
          <p className="mt-1 text-sm text-muted">Tell iBanks what you want to earn and when you can work.</p>
          <fieldset disabled={save.isPending || forget.isPending} className="mt-5 space-y-5">
            <legend className="sr-only">Your goal and availability</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Earnings goal (rand)" htmlFor="target_rands" error={errors.target_rands} hint="After the platform fee, before your costs."><input id="target_rands" className="input" type="text" inputMode="decimal" maxLength={10} value={form.target_rands} onChange={(e) => set('target_rands', e.target.value)} {...invalid('target_rands')} /></Field>
              <Field label="By this date" htmlFor="deadline" error={errors.deadline}><input id="deadline" className="input" type="date" min={today} max={addDays(today, 90)} value={form.deadline} onChange={(e) => set('deadline', e.target.value)} {...invalid('deadline')} /></Field>
            </div>
            <fieldset><legend className="mb-2 text-sm font-semibold">What work can you do?</legend><div id="skills" tabIndex={-1} className="flex flex-wrap gap-2" {...invalid('skills')}>{CATEGORIES.map((category) => <button key={category.slug} type="button" className="chip" aria-pressed={form.skills.includes(category.slug)} onClick={() => set('skills', toggle(form.skills, category.slug))}>{category.label}</button>)}</div>{errors.skills && <p id="skills-error" className="mt-2 text-sm text-clay-700">{errors.skills}</p>}<p className="mt-2 text-xs text-muted">You can start without past KashWise jobs. Choose skills you can confidently offer.</p></fieldset>
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <Field label="Near this area" htmlFor="area_slug" error={errors.area_slug}><AreaSelect id="area_slug" value={form.area_slug} onChange={(area) => set('area_slug', area)} invalid={Boolean(errors.area_slug)} describedBy={errors.area_slug ? 'area_slug-error' : undefined} /></Field>
              <Field label="Within about" htmlFor="radius_km"><select id="radius_km" className="input" value={form.radius_km} onChange={(e) => set('radius_km', Number(e.target.value))}>{[5, 10, 25, 50, 100].map((radius) => <option key={radius} value={radius}>{radius} km</option>)}</select></Field>
            </div>
            <p className="-mt-3 text-xs text-muted">Distances use area centres. Allow for travel time and costs.</p>
            <fieldset><legend className="mb-2 text-sm font-semibold">Days I can work</legend><div id="weekdays" tabIndex={-1} className="flex flex-wrap gap-2" {...invalid('weekdays')}>{DAYS.map((day) => <button key={day.n} type="button" className="chip min-w-12 justify-center" aria-pressed={form.weekdays.includes(day.n)} onClick={() => set('weekdays', toggle(form.weekdays, day.n))}>{day.label}</button>)}</div>{errors.weekdays && <p id="weekdays-error" className="mt-2 text-sm text-clay-700">{errors.weekdays}</p>}</fieldset>
            <fieldset><legend className="mb-2 text-sm font-semibold">Time of day</legend><div id="time_windows" tabIndex={-1} className="flex flex-wrap gap-2" {...invalid('time_windows')}>{WINDOWS.map((window) => <button key={window.value} type="button" className="chip" aria-pressed={form.time_windows.includes(window.value)} onClick={() => set('time_windows', toggle(form.time_windows, window.value))}>{window.label}</button>)}</div>{errors.time_windows && <p id="time_windows-error" className="mt-2 text-sm text-clay-700">{errors.time_windows}</p>}<p className="mt-2 text-xs text-muted">Select all three for any time. Confirm exact start, finish and travel times with the client.</p></fieldset>
            <div className="border-t border-line pt-4"><label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={form.memory_opt_in} onChange={(e) => set('memory_opt_in', e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-brand-600" /><span><strong>Remember my preferences for next time</strong><span className="mt-1 block text-xs text-muted">Optional. Save your goal, skills, general area and availability to personal memory. No ID, contact details, exact address or payment records are sent to it. You can forget these preferences here.</span></span></label></div>
            {startsNewPeriod && <p className="rounded-xl bg-sun-50 p-3 text-xs text-sun-700">Changing the amount or deadline starts a new earnings period when you update. Changing skills, area or availability keeps your existing period.</p>}
            {save.error && <p role="alert" className="rounded-xl bg-clay-50 p-3 text-sm text-clay-700">{friendlyError(save.error)}</p>}
            <Button type="submit" block loading={save.isPending}><Sparkles className="size-4" aria-hidden />{save.isPending ? 'Finding opportunities…' : data.goal ? 'Update my plan' : 'Build my earnings plan'}</Button>
          </fieldset>
          <p className="mt-3 text-center text-xs text-muted">You choose where to apply. KashWise will never apply or accept work for you.</p>
        </Card>
        <MemoryStatus memory={data.memory} onRestore={restore} onForget={() => forget.mutate()} forgetting={forget.isPending} saving={save.isPending} />
        {forget.error && <p role="alert" className="text-sm text-clay-700">Could not delete remembered preferences: {friendlyError(forget.error)}</p>}
        {notice && <p role="status" className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800">{notice}</p>}
      </form>
      <section aria-label="Your earnings plan" aria-busy={save.isPending} className="space-y-4">
        {changed && data.plan && <p className="rounded-xl bg-sun-50 p-3 text-sm text-sun-700" role="status">Your choices have changed. Update your plan to see new matches. The results below still use your last saved choices.</p>}
        {data.plan ? <>
          <Progress plan={data.plan} />
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-extrabold">Your next opportunities</h2><Badge tone="brand">{data.plan.suggestions.length} suggested</Badge></div>
          {data.plan.suggestions.length > 0 ? <><p className="text-sm text-muted">A shortlist that fits your choices. These are potential earnings, not bookings.</p>{data.plan.suggestions.map((gig) => <Opportunity key={gig.id} gig={gig} />)}</> : <EmptyState icon={<Target className="size-5" aria-hidden />} title="No suitable opportunities right now" action={<ButtonLink to="/discover" variant="secondary" size="sm">Browse all work</ButtonLink>}>Try a wider area, another available day or another skill. Your goal stays here while new jobs are posted.</EmptyState>}
          {data.plan.notes.length > 0 && <Card className="p-4"><h3 className="text-sm font-bold">Keep in mind</h3><ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted">{data.plan.notes.map((note) => <li key={note}>{note}</li>)}</ul></Card>}
        </> : <Card className="flex min-h-96 flex-col items-center justify-center p-8 text-center"><span className="grid size-16 place-items-center rounded-2xl bg-brand-50 text-brand-700"><Target className="size-8" aria-hidden /></span><h2 className="mt-5 max-w-xs text-2xl font-extrabold">A little extra income. A practical next step.</h2><p className="mt-3 max-w-sm text-sm text-muted">Set a goal to find current opportunities that fit your skills, area and availability. Each suggestion explains why it fits and what you would receive after the fee.</p><ol className="mt-6 grid w-full grid-cols-3 gap-3 text-xs font-semibold text-brand-800"><li>1. Set your goal</li><li>2. Review matches</li><li>3. Choose to apply</li></ol></Card>}
      </section>
    </div>
  )
}

export default function EarnGoal() {
  const { profile, userId, loading } = useAuth()
  const worker = profile?.role === 'worker'
  const q = useQuery({ queryKey: ['earn-goal', userId], queryFn: fetchEarnGoal, enabled: Boolean(userId && worker), refetchOnWindowFocus: false })
  return (
    <div>
      <PageHeader title={<>Earn My Goal <span className="block text-sm font-semibold text-brand-700 sm:inline sm:pl-2">Powered by iBanks</span></>} subtitle="Turn your skills and spare time into a plan for extra income." action={<Link to="/money" className="text-sm font-semibold text-brand-700 hover:underline">My money <ArrowUpRight className="inline size-4" aria-hidden /></Link>} />
      {loading ? <Spinner /> : !worker || !userId ? <EmptyState title="Make a plan with your worker profile" action={<ButtonLink to={userId ? '/profile' : '/login'} variant="secondary" size="sm">{userId ? 'View my profile' : 'Sign in'}</ButtonLink>}>Earnings plans are available to workers. Customers can post a gig to find local help.</EmptyState> : <>
        {q.data?.plan?.simulation && <div className="mb-4"><SimulationNote /></div>}
        {q.isPending ? <Spinner label="Getting your earnings goal…" /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data && <GoalWorkspace key={userId} profile={profile} data={q.data} />}
      </>}
    </div>
  )
}
