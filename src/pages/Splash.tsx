import { Link } from 'react-router-dom'
import { ArrowRight, PlayCircle } from 'lucide-react'
import { Logo } from '../components/layout/Logo'

/** First screen for signed-out visitors: sign in, register, or watch how KashWise works. */
export default function Splash() {
  return (
    <main id="main" className="grid min-h-dvh bg-canvas lg:grid-cols-[1.05fr_1fr]">
      <div className="relative order-2 min-h-[34dvh] overflow-hidden lg:order-1 lg:min-h-dvh">
        <img
          src="/images/photographer.webp"
          alt="Illustrative photographer preparing for a portrait session"
          width="1536"
          height="1024"
          fetchPriority="high"
          className="absolute inset-0 size-full object-cover object-[50%_40%]"
        />
        <div aria-hidden className="absolute inset-0 bg-linear-to-t from-deep/70 via-transparent to-transparent" />
        <p className="absolute bottom-5 left-6 right-6 font-serif text-2xl leading-tight text-white italic sm:text-3xl">
          Your thing. Someone’s next find.
        </p>
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

        <Link
          to="/signup"
          className="mt-7 flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 text-base font-semibold text-white transition hover:bg-brand-700"
        >
          Get started <ArrowRight className="size-5" aria-hidden />
        </Link>
        <Link
          to="/login"
          className="mt-2 flex min-h-12 w-full items-center justify-center rounded-xl border border-line bg-surface text-[15px] font-medium text-ink hover:border-brand-200"
        >
          I already have an account
        </Link>

        <div className="mt-6 border-t border-line pt-5">
          <Link
            to="/welcome#how-it-works"
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-brand-500/30 bg-brand-50/50 px-4 text-sm font-semibold text-brand-400 transition hover:bg-brand-50"
          >
            <PlayCircle className="size-4 text-brand-500" aria-hidden />
            Watch how KashWise works
          </Link>
        </div>
      </div>
    </main>
  )
}
