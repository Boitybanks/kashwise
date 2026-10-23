import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { finishPasswordReset, startPasswordRecovery } from '../lib/api'
import { friendlyError } from '../lib/errors'
import { parseRecoveryLink } from '../lib/recovery'
import { firstError, newPasswordSchema } from '../lib/validation'
import { Button, ButtonLink, Card, Field, Spinner } from '../components/ui'

type Phase = 'checking' | 'ready' | 'invalid'

export default function ResetPassword() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [link] = useState(() => parseRecoveryLink(window.location.hash, window.location.search))
  const [phase, setPhase] = useState<Phase>(link.kind === 'tokens' || link.kind === 'token_hash' ? 'checking' : 'invalid')
  const [problem, setProblem] = useState(link.kind === 'error' ? link.message : 'Open the reset link from your email to choose a new password.')
  const [form, setForm] = useState({ password: '', confirm: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (started.current || (link.kind !== 'tokens' && link.kind !== 'token_hash')) return
    started.current = true
    // Keep the one-time tokens out of browser history and screenshots.
    window.history.replaceState(null, '', window.location.pathname)
    startPasswordRecovery(link).then(
      () => setPhase('ready'),
      () => {
        setProblem('This reset link has expired or was already used.')
        setPhase('invalid')
      },
    )
  }, [link])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError('')
    const parsed = newPasswordSchema.safeParse(form)
    if (!parsed.success) {
      const fields = firstError(parsed.error)
      setErrors(fields)
      document.getElementById(Object.keys(fields)[0])?.focus()
      return
    }
    setErrors({})
    setBusy(true)
    try {
      await finishPasswordReset(parsed.data.password)
      queryClient.clear()
      navigate('/login?reset=done', { replace: true })
    } catch (err) {
      setFormError(friendlyError(err))
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-3xl font-extrabold">Choose a new password</h1>
      <Card className="mt-6 p-5">
        {phase === 'checking' && <Spinner label="Checking your reset link…" />}
        {phase === 'invalid' && (
          <div role="alert">
            <p className="font-semibold">{problem}</p>
            <p className="mt-1 text-sm text-muted">Reset links work once and expire after a while. Request a fresh one and use the newest email.</p>
            <ButtonLink to="/forgot-password" className="mt-4">Request a new link</ButtonLink>
          </div>
        )}
        {phase === 'ready' && (
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <Field label="New password" htmlFor="password" error={errors.password} hint="At least 8 characters.">
              <input id="password" type="password" autoComplete="new-password" className="input" value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} aria-invalid={Boolean(errors.password) || undefined}
                aria-describedby={errors.password ? 'password-error' : 'password-hint'} />
            </Field>
            <Field label="Confirm new password" htmlFor="confirm" error={errors.confirm}>
              <input id="confirm" type="password" autoComplete="new-password" className="input" value={form.confirm}
                onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))} aria-invalid={Boolean(errors.confirm) || undefined}
                aria-describedby={errors.confirm ? 'confirm-error' : undefined} />
            </Field>
            {formError && <p role="alert" className="rounded-lg bg-clay-50 px-3 py-2 text-sm font-medium text-clay-700">{formError}</p>}
            <Button type="submit" block size="lg" loading={busy}>Save new password</Button>
            <p className="text-xs text-muted">You’ll be signed out on every device, then sign in again with your new password.</p>
          </form>
        )}
      </Card>
    </div>
  )
}
