import { Link } from 'react-router-dom'
import { Compass, MapPin } from 'lucide-react'

export function ProofScriptEmptyState({ isOwner, firstName }: { isOwner: boolean; firstName: string }) {
  if (!isOwner) {
    return (
      <div className="rounded-3xl border border-deep-soft bg-deep p-8 text-center text-deep-ink shadow-xl">
        <div className="relative mx-auto mb-5 flex h-28 w-24 flex-col items-center justify-center rounded-2xl border border-deep-soft bg-deep-soft p-3 shadow-lg">
          <div className="mb-2 flex size-8 items-center justify-center rounded-full border border-deep-soft bg-deep-soft text-brand-500">
            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="mb-1 h-1 w-10 rounded bg-deep-soft" />
          <div className="h-1 w-7 rounded bg-deep-soft" />
        </div>
        <h3 className="font-serif text-2xl font-medium tracking-tight text-white">ProofScript in progress</h3>
        <div className="mx-auto my-3 h-0.5 w-10 rounded-full bg-deep-soft" />
        <p className="mx-auto max-w-sm text-sm leading-relaxed text-deep-ink">
          Every client-confirmed job becomes professional evidence. {firstName} is establishing their verified record on KashWise.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-3xl border border-deep-soft bg-deep p-8 text-center text-deep-ink shadow-xl">
      {/* Embossed Document Graphic matching exact screenshot */}
      <div className="relative mx-auto mb-6 flex h-36 w-28 flex-col items-center justify-center rounded-2xl border border-deep-soft bg-deep-soft p-3 shadow-2xl">
        {/* Folded Dog-Ear Corner */}
        <div className="absolute right-0 top-0 size-6 rounded-bl-lg border-b border-l border-deep-soft bg-deep" />

        {/* Embedded Checkmark Badge */}
        <div className="mb-2.5 flex size-9 items-center justify-center rounded-full border border-deep-soft bg-deep-soft text-brand-500 shadow-inner">
          <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        {/* Mock Document Text Lines */}
        <div className="mb-1 h-1 w-12 rounded bg-deep-soft" />
        <div className="mb-3 h-1 w-8 rounded bg-deep-soft" />

        {/* Mini 4-Bar Ascending Growth Histogram */}
        <div className="flex h-6 items-end gap-1">
          <div className="h-2.5 w-2 rounded-t-sm bg-deep-soft" />
          <div className="h-3.5 w-2 rounded-t-sm bg-deep-soft" />
          <div className="h-5 w-2 rounded-t-sm bg-deep-soft" />
          <div className="h-6 w-2 rounded-t-sm bg-deep-ink" />
        </div>
      </div>

      {/* Headline in Dignified Serif */}
      <h2 className="font-serif text-2xl font-medium tracking-tight text-white sm:text-3xl">
        Start building your ProofScript
      </h2>

      {/* Subtle Teal Accent Line */}
      <div className="mx-auto my-3.5 h-0.5 w-10 rounded-full bg-deep-soft" />

      {/* Dignified Body Copy */}
      <p className="mx-auto mb-6 max-w-sm text-sm leading-relaxed text-deep-ink">
        Every client-confirmed job becomes professional evidence. Real work. Verified results. Yours to build on.
      </p>

      {/* Primary CTA: Find work near you */}
      <div>
        <Link
          to="/discover"
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-teal-950/50 transition hover:from-[#115C53] hover:to-[#177368] active:scale-98"
        >
          <MapPin className="size-4 text-deep-ink" aria-hidden />
          <span>Find work near you</span>
        </Link>
      </div>

      {/* Secondary Action: How ProofScript works */}
      <div className="mt-4">
        <Link
          to="/trust"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-500 transition hover:underline"
        >
          <div className="flex size-5 items-center justify-center rounded-full border border-deep-soft">
            <Compass className="size-3" aria-hidden />
          </div>
          <span>How ProofScript works</span>
        </Link>
      </div>
    </div>
  )
}

