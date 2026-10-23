import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { requestPasswordReset } from '../lib/api'
import { DEMO_ACCOUNTS } from '../lib/auth'
import { friendlyError } from '../lib/errors'
import { emailSchema } from '../lib/validation'
import { Button, Card, Field } from '../components/ui'

export default function ForgotPassword() {
  const [params] = useSearchParams()
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [error, setError] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const parsed = emailSchema.safeParse(email)
    if (!parsed.success) return setError(parsed.error.issues[0].message)
    if (Object.values(DEMO_ACCOUNTS).some((a) => a.email === parsed.data)) {
      return setError('Demo account passwords can’t be changed. Use the demo buttons on the sign-in page instead.')
    }
    setError('')
    setBusy(true)
    try {
      await requestPasswordReset(parsed.data)
      setSentTo(parsed.data)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-3xl font-extrabold">Reset your password</h1>
      <p className="mt-1 text-muted">Enter the email you signed up with and we’ll send you a link to choose a new password.</p>
      <Card className="mt-6 p-5">
        {sentTo ? (
          <div role="status">
            <MailCheck className="size-8 text-brand-600" aria-hidden />
            <h2 className="mt-3 text-lg font-bold">Check your email</h2>
            <p className="mt-1 text-sm text-ink-soft">
              If there’s a KashWise account for <strong>{sentTo}</strong>, a reset link is on its way. It works once and expires soon — check your
              spam folder if you can’t see it.
            </p>
            <Button variant="secondary" size="sm" className="mt-4" onClick={() => setSentTo(null)}>Use a different email or resend</Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <Field label="Email" htmlFor="email" error={error}>
              <input id="email" type="email" autoComplete="email" inputMode="email" className="input" value={email}
                onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(error) || undefined} aria-describedby={error ? 'email-error' : undefined} />
            </Field>
            <Button type="submit" block size="lg" loading={busy}>Email me a reset link</Button>
          </form>
        )}
        <p className="mt-4 text-center text-sm text-muted">
          Remembered it? <Link to="/login" className="font-semibold text-brand-700 hover:underline">Back to sign in</Link>
        </p>
      </Card>
    </div>
  )
}
