import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, LoaderCircle } from 'lucide-react'
import { DEMO_ACCOUNTS, useAuth } from '../lib/auth'
import { friendlyError } from '../lib/errors'
import type { Role } from '../lib/types'
import { LogoMark } from '../components/layout/Logo'
import { useToast } from '../components/ui/toast'

// [x, top, width] — a Johannesburg-style skyline: Ponte City, the Hillbrow Tower and the Carlton Centre near the centre
// so they stay in view on a phone (the SVG is cropped from the middle).
const BACK: [number, number, number][] = [
  [0, 200, 60], [55, 170, 40], [90, 190, 70], [150, 150, 45], [190, 180, 60], [245, 140, 35], [275, 175, 55], [325, 160, 40],
  [360, 120, 50], [405, 165, 45], [445, 135, 38], [530, 150, 42], [570, 110, 36], [602, 170, 30], [700, 60, 32], [740, 100, 44],
  [780, 150, 50], [825, 125, 40], [860, 170, 60], [915, 140, 42], [952, 180, 55], [1000, 150, 45], [1040, 175, 60], [1095, 160, 50], [1140, 190, 60],
]
const FRONT: [number, number, number][] = [
  [0, 240, 80], [70, 220, 50], [115, 250, 60], [170, 210, 55], [220, 235, 70], [285, 200, 48], [330, 230, 60], [385, 215, 45],
  [425, 195, 40], [548, 225, 50], [595, 240, 34], [680, 215, 16], [722, 190, 40], [758, 225, 55], [808, 205, 48], [852, 235, 60],
  [905, 215, 45], [945, 240, 70], [1010, 210, 50], [1055, 235, 60], [1110, 220, 50], [1155, 245, 45],
]

function Skyline({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1200 300" preserveAspectRatio="xMidYMax slice" className={className} aria-hidden>
      <defs>
        <linearGradient id="splash-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1e3a2f" stopOpacity="0.55" />
          <stop offset="1" stopColor="#1e3a2f" />
        </linearGradient>
      </defs>
      <g fill="#16261f">{BACK.map(([x, y, w]) => <rect key={`b${x}`} x={x} y={y} width={w} height={300 - y} />)}</g>
      {/* Ponte City */}
      <rect x="482" y="118" width="44" height="182" rx="6" fill="#1a2f26" />
      <rect x="482" y="126" width="44" height="7" fill="#b8f34a" opacity="0.25" />
      {/* Hillbrow Tower */}
      <rect x="639" y="12" width="2" height="30" fill="#2a4a3c" />
      <rect x="630" y="50" width="20" height="10" rx="3" fill="#2a4a3c" />
      <rect x="624" y="66" width="32" height="24" rx="5" fill="#2a4a3c" />
      <rect x="635" y="40" width="10" height="260" fill="#2a4a3c" />
      <circle cx="640" cy="12" r="3" fill="#b8f34a" className="motion-safe:animate-pulse" />
      <g fill="url(#splash-fade)">{FRONT.map(([x, y, w]) => <rect key={`f${x}`} x={x} y={y} width={w} height={300 - y} />)}</g>
      <g fill="#b8f34a" opacity="0.35">
        {FRONT.filter((_, i) => i % 2 === 0).map(([x, y, w]) => (
          <g key={`w${x}`}>
            <rect x={x + 8} y={y + 14} width="3" height="4" />
            <rect x={x + w - 14} y={y + 26} width="3" height="4" />
          </g>
        ))}
      </g>
    </svg>
  )
}

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
    <main id="main" className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-night text-white">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(120%_65%_at_50%_0%,#1e3a2f_0%,#111814_62%)]" />
      <Skyline className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[42dvh] w-full" />

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center px-6 pt-14 text-center">
        <LogoMark className="size-20 drop-shadow-[0_8px_30px_rgba(184,243,74,0.25)]" />
        <h1 className="mt-6 text-5xl font-extrabold tracking-[-.06em] text-white">
          Kash<span className="text-zest">Wise</span>
        </h1>
        <p className="mt-4 text-lg leading-snug text-white/80">
          Earn it.<br />Prove it.<br />Grow it.
        </p>
      </div>

      <div className="mx-auto w-full max-w-sm px-6 pb-8">
        <Link to="/signup" className="flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-zest text-base font-bold text-night shadow-[0_10px_30px_rgba(184,243,74,0.25)] transition hover:brightness-105 active:brightness-95">
          Get started <ArrowRight className="size-5" aria-hidden />
        </Link>
        <Link to="/login" className="mt-2 flex min-h-12 w-full items-center justify-center rounded-xl text-[15px] font-semibold text-white hover:bg-white/10">
          I already have an account
        </Link>

        <div className="mt-6 rounded-2xl bg-night/70 p-3 ring-1 ring-inset ring-white/10 backdrop-blur-sm">
          <p className="text-center text-xs text-white/70">Just looking? Explore with a labelled demo account.</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(['customer', 'worker'] as Role[]).map((role) => (
              <button
                key={role}
                type="button"
                disabled={busy !== null}
                aria-busy={busy === role || undefined}
                onClick={() => tryDemo(role)}
                className="flex min-h-12 flex-col items-center justify-center rounded-xl bg-white/10 px-2 text-sm font-semibold text-white ring-1 ring-inset ring-white/15 transition hover:bg-white/15 disabled:opacity-60"
              >
                {busy === role ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                <span>Try as {DEMO_ACCOUNTS[role].name}</span>
                <span className="text-xs font-normal text-white/60">demo {role}</span>
              </button>
            ))}
          </div>
        </div>
        <p className="mt-4 text-center text-sm">
          <Link to="/welcome" className="text-white/75 underline underline-offset-4 hover:text-white">See how KashWise works</Link>
        </p>
      </div>
    </main>
  )
}
