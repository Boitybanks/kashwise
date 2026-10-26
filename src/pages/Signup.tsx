import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Briefcase, Hammer } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { friendlyError } from '../lib/errors'
import type { Role } from '../lib/types'
import { firstError, signupSchema } from '../lib/validation'
import { EMPTY_IDENTITY, identitySchema, identityWarnings, withoutError, type IdentityDraft } from '../lib/identity'
import { IdentityFields, MismatchPrompt } from '../components/identity/IdentityFields'
import { Button, Card, Field } from '../components/ui'
import { AreaSelect } from '../components/AreaSelect'
import { safeNext } from '../lib/navigation'

const roleOptions: { value: Role; title: string; body: string; icon: typeof Hammer }[] = [
  { value: 'worker', title: 'I want to find work', body: 'Get paid for your skills and build a verified portfolio. Always free.', icon: Hammer },
  { value: 'customer', title: 'I need help with a task', body: 'Post a gig and hire someone nearby you can trust.', icon: Briefcase },
]

export default function Signup() {
  const { signUp, userId, profile } = useAuth()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const navigate = useNavigate()
  const initialRole = params.get('role') === 'customer' ? 'customer' : params.get('role') === 'worker' ? 'worker' : ''
  const [form, setForm] = useState({ display_name: '', email: '', password: '', role: initialRole as Role | '', area_slug: '' })
  const [identity, setIdentity] = useState<IdentityDraft>(EMPTY_IDENTITY)
  const [warnings, setWarnings] = useState<string[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  if (userId && profile && !busy) return <Navigate to={next ?? (profile.role === 'customer' ? '/my-gigs' : '/discover')} replace />

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setWarnings([])
  }
  const changeIdentity = (next: IdentityDraft, field: keyof IdentityDraft) => {
    setIdentity(next)
    setErrors((e) => withoutError(e, field))
    setWarnings([])
  }

  async function submit(confirmed: boolean) {
    setFormError('')
    const parsed = signupSchema.extend(identitySchema.shape).safeParse({ ...form, ...identity })
    if (!parsed.success) {
      const fields = firstError(parsed.error)
      setErrors(fields)
      document.getElementById(Object.keys(fields)[0])?.focus()
      return
    }
    setErrors({})
    // Mismatches never block sign-up: the person fixes them or confirms the details are right.
    const found = identityWarnings({ displayName: parsed.data.display_name, legalName: parsed.data.legal_name, gender: parsed.data.gender, idNumber: parsed.data.id_number })
    if (found.length && !confirmed) {
      setWarnings(found)
      return
    }
    setBusy(true)
    try {
      await signUp(parsed.data)
      // Stay busy on success: clearing it here would let the "already signed in" redirect above win the race
      // and skip the welcome step.
      navigate(parsed.data.role === 'worker' ? `/profile?welcome=1${next ? `&next=${encodeURIComponent(next)}` : ''}` : next ?? '/gigs/new?welcome=1', { replace: true })
    } catch (err) {
      setFormError(friendlyError(err))
      setBusy(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void submit(false)
  }

  const err = (k: string) => (errors[k] ? { 'aria-invalid': true as const, 'aria-describedby': `${k}-error` } : {})

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-3xl font-extrabold">Join KashWise</h1>
      <p className="mt-1 text-muted">Your skills, your schedule. Start earning extra income or find the help you need.</p>
      {next && <p className="mt-4 rounded-xl bg-brand-50 p-3 text-sm text-brand-800">We’ll bring you back to your chosen task after you set up your account.</p>}
      <Card className="mt-6 p-5">
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">What do you want to do first?</legend>
            <div className="grid gap-2 sm:grid-cols-2" id="role" tabIndex={-1}>
              {roleOptions.map((r) => (
                <label
                  key={r.value}
                  className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition focus-within:ring-2 focus-within:ring-brand-600 ${
                    form.role === r.value ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-200' : 'border-line bg-surface hover:border-brand-500'
                  }`}
                >
                  <input type="radio" name="role" value={r.value} checked={form.role === r.value} onChange={() => set('role', r.value)} className="sr-only" />
                  <r.icon className="mt-0.5 size-5 shrink-0 text-brand-500" aria-hidden />
                  <span>
                    <span className="block font-bold">{r.title}</span>
                    <span className="block text-xs text-muted">{r.body}</span>
                  </span>
                </label>
              ))}
            </div>
            {errors.role && <p id="role-error" className="mt-1 text-sm font-medium text-clay-700">{errors.role}</p>}
            <p className="mt-2 text-xs text-muted">You can switch between finding work and hiring later.</p>
          </fieldset>

          <Field label="Your name" htmlFor="display_name" error={errors.display_name} hint="Shown on your profile. Use your name as it is on your ID, e.g. “Sipho Dlamini”.">
            <input id="display_name" autoComplete="name" className="input" value={form.display_name} onChange={(e) => set('display_name', e.target.value)} {...err('display_name')} />
          </Field>
          <Field label="Your area" htmlFor="area_slug" error={errors.area_slug} hint="Only your area is shown — never your address.">
            <AreaSelect id="area_slug" value={form.area_slug} onChange={(v) => set('area_slug', v)} invalid={Boolean(errors.area_slug)} />
          </Field>
          <Field label="Email" htmlFor="email" error={errors.email}>
            <input id="email" type="email" autoComplete="email" inputMode="email" className="input" value={form.email} onChange={(e) => set('email', e.target.value)} {...err('email')} />
          </Field>
          <Field label="Password" htmlFor="password" error={errors.password} hint="At least 8 characters.">
            <input id="password" type="password" autoComplete="new-password" className="input" value={form.password} onChange={(e) => set('password', e.target.value)} {...err('password')} />
          </Field>
          <IdentityFields value={identity} onChange={changeIdentity} errors={errors} />
          {warnings.length > 0 && (
            <MismatchPrompt warnings={warnings} busy={busy} confirmLabel="My details are correct, continue"
              onEdit={() => { setWarnings([]); document.getElementById('legal_name')?.focus() }} onConfirm={() => void submit(true)} />
          )}
          {formError && <p role="alert" className="rounded-lg bg-clay-50 px-3 py-2 text-sm font-medium text-clay-700">{formError}</p>}
          <Button type="submit" block size="lg" loading={busy && !warnings.length}>Create my free account</Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          Already have an account? <Link to={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-brand-700 hover:underline">Sign in</Link>
        </p>
      </Card>
    </div>
  )
}
