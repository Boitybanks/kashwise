import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { friendlyError } from '../lib/errors'
import { firstError, loginSchema } from '../lib/validation'
import { Button, Card, Field } from '../components/ui'
import { DemoButtons } from '../components/DemoButtons'
import { safeNext } from '../lib/navigation'

export default function Login() {
  const { signIn, userId, profile } = useAuth()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  if (userId && profile && !busy) return <Navigate to={next ?? (profile.role === 'customer' ? '/my-gigs' : '/discover')} replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError('')
    const parsed = loginSchema.safeParse({ email, password })
    if (!parsed.success) {
      const fields = firstError(parsed.error)
      setErrors(fields)
      document.getElementById(Object.keys(fields)[0])?.focus()
      return
    }
    setErrors({})
    setBusy(true)
    try {
      await signIn(parsed.data.email, parsed.data.password)
      if (next) navigate(next, { replace: true })
    } catch (err) {
      setFormError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-3xl font-extrabold">Welcome back</h1>
      <p className="mt-1 text-muted">Sign in to find work or manage your gigs.</p>
      {params.get('reset') === 'done' && <p role="status" className="mt-4 rounded-xl bg-brand-50 p-3 text-sm text-brand-800"><strong>Password updated.</strong> Sign in with your new password.</p>}
      {next && <p className="mt-4 rounded-xl bg-brand-50 p-3 text-sm text-brand-800">Your next step is saved. Sign in to pick up where you left off.</p>}
      <Card className="mt-6 p-5">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <Field label="Email" htmlFor="email" error={errors.email}>
            <input id="email" type="email" autoComplete="email" inputMode="email" className="input" value={email}
              onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(errors.email) || undefined} aria-describedby={errors.email ? 'email-error' : undefined} />
          </Field>
          <Field label="Password" htmlFor="password" error={errors.password}>
            <input id="password" type="password" autoComplete="current-password" className="input" value={password}
              onChange={(e) => setPassword(e.target.value)} aria-invalid={Boolean(errors.password) || undefined} aria-describedby={errors.password ? 'password-error' : undefined} />
          </Field>
          <p className="-mt-2 text-right text-sm">
            <Link to={`/forgot-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''}`} className="font-semibold text-brand-700 hover:underline">Forgot password?</Link>
          </p>
          {formError && <p role="alert" className="rounded-lg bg-clay-50 px-3 py-2 text-sm font-medium text-clay-700">{formError}</p>}
          <Button type="submit" block size="lg" loading={busy}>Sign in</Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          New to KashWise? <Link to={`/signup${next ? `?next=${encodeURIComponent(next)}${next.startsWith('/gigs/new') ? '&role=customer' : ''}` : ''}`} className="font-semibold text-brand-700 hover:underline">Create a free account</Link>
        </p>
      </Card>
      <Card className="mt-4 p-5">
        <p className="text-sm font-bold">Just looking? Use a demo account</p>
        <p className="mb-3 text-xs text-muted">Sample data, clearly labelled. Switch between customer and worker any time.</p>
        <DemoButtons compact next={next} />
      </Card>
    </div>
  )
}
