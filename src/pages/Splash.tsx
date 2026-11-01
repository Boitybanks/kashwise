import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, LoaderCircle } from 'lucide-react'
import { DEMO_ACCOUNTS, useAuth } from '../lib/auth'
import { friendlyError } from '../lib/errors'
import type { Role } from '../lib/types'
import { Logo } from '../components/layout/Logo'
import { useToast } from '../components/ui/toast'

/** First screen for signed-out visitors: sign in or register. */
export default function Splash() {
  const { signInDemo } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [busy, setBusy] = useState<Role | null>(null)

  async function tryDemo(role: Role) {
    setBusy(role)
    try {
      await signInDemo(role)
      navigate(role === 'customer' ? '/my-gigs' : '/home')
    } catch (e) {
      toast.show(friendlyError(e), 'error')
      setBusy(null)
    }
  }

  return (
    <main id="main" className="grid min-h-dvh bg-canvas lg:grid-cols-[1.05fr_1fr]">
      <div className="relative order-2 min-h-[34dvh] overflow-hidden lg:order-1 lg:min-h-dvh">
        <img src="/images/photographer.webp" alt="Illustrative photographer preparing for a portrait session" width="1536" height="1024" fetchPriority="high" className="absolute inset-0 size-full object-cover object-[50%_40%]" />
        <div aria-hidden className="absolute inset-0 bg-linear-to-t from-deep/70 via-transparent to-transparent" />
        <p className="absolute bottom-5 left-6 right-6 font-serif text-2xl leading-tight text-white italic sm:text-3xl">Your thing. Someone’s next find.</p>
      </div>

      <div className="order-1 mx-auto flex w-full max-w-md flex-col justify-center px-6 py-8 lg:order-2 lg:py-12">
        <Logo to="/" />
        <p className="eyebrow mt-8">EARN IT. PROVE IT. GROW IT.</p>
        <h1 className="mt-3 text-[40px] font-medium leading-[1.05] tracking-[-.045em] sm:text-5xl">
          Good work deserves <em className="text-brand-400">a record.</em>
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
          Find local work by speaking, get paid through the app, and turn every confirmed job into a verified CV that opens doors.
        </p>

        <Link to="/signup" className="mt-7 flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 text-base font-semibold text-white transition hover:bg-brand-700">
          Get started <ArrowRight className="size-5" aria-hidden />
        </Link>
        <Link to="/login" className="mt-2 flex min-h-12 w-full items-center justify-center rounded-xl border border-line bg-surface text-[15px] font-medium text-ink hover:border-brand-200">
          I already have an account
        </Link>

        <div className="mt-6 border-t border-line pt-5">
          <p className="text-xs text-ink-soft">Just looking?</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(['customer', 'worker'] as Role[]).map((role) => (
              <button
                key={role}
                type="button"
                disabled={busy !== null}
                aria-busy={busy === role || undefined}
                onClick={() => tryDemo(role)}
                className="flex min-h-12 flex-col items-center justify-center rounded-xl border border-line bg-surface px-2 text-sm font-medium text-ink transition hover:border-brand-200 disabled:opacity-60"
              >
                {busy === role ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                <span>Try as {DEMO_ACCOUNTS[role].name}</span>
                <span className="text-xs font-normal text-muted">{role === 'customer' ? 'client' : 'worker'}</span>
              </button>
            ))}
          </div>
        </div>
        <p className="mt-5 text-sm">
          <Link to="/welcome" className="text-brand-500 underline underline-offset-4">See how KashWise works</Link>
        </p>
      </div>
    </main>
  )
}
