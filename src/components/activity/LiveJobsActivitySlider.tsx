import { useRef, useState } from 'react'
import { BadgeCheck, CalendarCheck, ChevronLeft, ChevronRight, MapPin, Pause, Play, Sparkles, Star } from 'lucide-react'
import { CategoryIcon } from '../CategoryIcon'

export interface CommunityActivityItem {
  id: string
  type: 'completed' | 'booked'
  title: string
  category: string
  customerName: string
  workerName: string
  areaName: string
  timeAgo: string
  rating?: number
  comment?: string
  amount?: string
}

const DEFAULT_ACTIVITY: CommunityActivityItem[] = [
  {
    id: 'act-1',
    type: 'completed',
    title: 'Fix sagging kitchen cupboard doors',
    category: 'repairs',
    customerName: 'Thandi M.',
    workerName: 'Sipho D.',
    areaName: 'Soweto',
    timeAgo: '18 mins ago',
    rating: 5,
    comment: 'Done in under an hour. Hinges replaced and everything closes properly. Kitchen looks great!',
  },
  {
    id: 'act-2',
    type: 'booked',
    title: 'Braids for café staff relaunch',
    category: 'hair-beauty',
    customerName: 'Kasi Coffee Co.',
    workerName: 'Lerato K.',
    areaName: 'Alexandra',
    timeAgo: '35 mins ago',
    comment: 'Booked and scheduled for tomorrow morning. Handover PIN generated.',
  },
  {
    id: 'act-3',
    type: 'completed',
    title: 'Paint spaza shop interior',
    category: 'painting',
    customerName: 'Dudu N.',
    workerName: 'Sipho D.',
    areaName: 'Soweto',
    timeAgo: '1 hour ago',
    rating: 5,
    comment: 'Sipho arrived early, covered all stock, and the finish is beautiful. Customers keep complimenting!',
  },
  {
    id: 'act-4',
    type: 'completed',
    title: 'Grade 10 maths tutoring (algebra)',
    category: 'tutoring',
    customerName: 'Fatima P.',
    workerName: 'Ayanda N.',
    areaName: 'Rosebank',
    timeAgo: '2 hours ago',
    rating: 5,
    comment: 'My daughter got an A on her exponents test! Ayanda is patient and makes complex topics simple.',
  },
  {
    id: 'act-5',
    type: 'booked',
    title: 'Assemble flat-pack wardrobe & bed',
    category: 'repairs',
    customerName: 'Bongani S.',
    workerName: 'Kagiso M.',
    areaName: 'Midrand',
    timeAgo: '2 hours ago',
    comment: 'Worker confirmed timing. Payout held securely in escrow until handover PIN is verified.',
  },
  {
    id: 'act-6',
    type: 'completed',
    title: 'Cook for 40-person family gathering',
    category: 'catering',
    customerName: 'Lindiwe M.',
    workerName: 'Nomsa Z.',
    areaName: 'Umlazi',
    timeAgo: '3 hours ago',
    rating: 5,
    comment: 'The food was finished in an hour — everyone asked who cooked! Nomsa never disappoints.',
  },
  {
    id: 'act-7',
    type: 'completed',
    title: 'Garden clean-up & rubble removal',
    category: 'gardening',
    customerName: 'Grace Church',
    workerName: 'Themba M.',
    areaName: 'Tembisa',
    timeAgo: '4 hours ago',
    rating: 5,
    comment: 'Turned our overgrown yard into a peaceful garden. Hard worker, left the place neat.',
  },
  {
    id: 'act-8',
    type: 'completed',
    title: 'Help move furniture into flat',
    category: 'moving',
    customerName: 'Jason P.',
    workerName: 'Sipho D.',
    areaName: 'Observatory',
    timeAgo: '5 hours ago',
    rating: 5,
    comment: 'Careful with everything, nothing scratched. Verified job added to ProofScript.',
  },
]

export function LiveJobsActivitySlider({
  title = 'Live Activity Nearby',
  subtitle = 'Recent jobs booked & completed with verified customer feedback',
  items = DEFAULT_ACTIVITY,
  className = '',
}: {
  title?: string
  subtitle?: string
  items?: CommunityActivityItem[]
  className?: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [paused, setPaused] = useState(false)

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return
    const offset = direction === 'left' ? -340 : 340
    scrollRef.current.scrollBy({ left: offset, behavior: 'smooth' })
  }

  // Duplicate items for seamless continuous scrolling
  const streamItems = [...items, ...items]

  return (
    <section aria-label={title} className={`relative my-6 ${className}`}>
      {/* ── Top Header Row with Live Pulse Indicator ── */}
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2 px-1">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex size-2.5" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#14B8A6] opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-[#14B8A6]" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-[#F1F5F9]">{title}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#0D9488]/15 px-2 py-0.5 text-[10px] font-semibold text-[#14B8A6] border border-[#0D9488]/30">
              <Sparkles className="size-3" aria-hidden /> Community pulse
            </span>
          </div>
          <p className="mt-1 text-xs text-[#94A3B8]">{subtitle}</p>
        </div>

        {/* ── Manual Slide & Pause Controls ── */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPaused(!paused)}
            className="grid size-8 place-items-center rounded-lg border border-[#1E293B] bg-[#141A21] text-[#94A3B8] transition-colors hover:border-[#0D9488]/50 hover:text-white"
            aria-label={paused ? 'Resume sliding' : 'Pause sliding'}
            title={paused ? 'Resume sliding' : 'Pause sliding'}
          >
            {paused ? <Play className="size-3.5 fill-current" /> : <Pause className="size-3.5 fill-current" />}
          </button>
          <button
            type="button"
            onClick={() => scroll('left')}
            className="grid size-8 place-items-center rounded-lg border border-[#1E293B] bg-[#141A21] text-[#94A3B8] transition-colors hover:border-[#0D9488]/50 hover:text-white"
            aria-label="Previous comments"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => scroll('right')}
            className="grid size-8 place-items-center rounded-lg border border-[#1E293B] bg-[#141A21] text-[#94A3B8] transition-colors hover:border-[#0D9488]/50 hover:text-white"
            aria-label="Next comments"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {/* ── Sliding Track with Edge Gradients ── */}
      <div className="relative overflow-hidden rounded-2xl border border-[#1E293B] bg-[#0E141B] py-3.5">
        {/* Soft edge blur gradients */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-[#0E141B] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-[#0E141B] to-transparent" />

        {/* Scrolling container */}
        <div
          ref={scrollRef}
          className="overflow-x-auto no-scrollbar scroll-smooth"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div className={`flex gap-3 px-4 ${paused ? '' : 'animate-marquee-slow'}`}>
            {streamItems.map((item, idx) => {
              const isCompleted = item.type === 'completed'
              return (
                <div
                  key={`${item.id}-${idx}`}
                  className="flex w-[290px] shrink-0 flex-col justify-between rounded-xl border border-[#1E293B] bg-[#141A21] p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#0D9488]/50 hover:bg-[#18232d]"
                >
                  <div>
                    {/* Top Status & Timestamp */}
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                          isCompleted
                            ? 'bg-[#D4A017]/10 text-[#D4A017] border-[#D4A017]/30'
                            : 'bg-[#0D9488]/15 text-[#14B8A6] border-[#0D9488]/30'
                        }`}
                      >
                        {isCompleted ? (
                          <>
                            <BadgeCheck className="size-3 fill-[#D4A017]/20 text-[#D4A017]" aria-hidden />
                            Verified Complete
                          </>
                        ) : (
                          <>
                            <CalendarCheck className="size-3 text-[#14B8A6]" aria-hidden />
                            Job Booked
                          </>
                        )}
                      </span>
                      <span className="text-[10px] text-[#64748B] tabular-nums">{item.timeAgo}</span>
                    </div>

                    {/* Job Title & Category icon */}
                    <div className="mt-2.5 flex items-start gap-2.5">
                      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#0B0F14] border border-[#24525b]/50 text-sm text-[#14B8A6]">
                        <CategoryIcon category={item.category} className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-[#F1F5F9]">{item.title}</p>
                        <p className="flex items-center gap-1 text-[11px] text-[#94A3B8]">
                          <MapPin className="size-3 text-[#64748B]" aria-hidden />
                          {item.areaName}
                        </p>
                      </div>
                    </div>

                    {/* Customer Comment Quote */}
                    {item.comment && (
                      <p className="mt-2.5 rounded-lg bg-[#0B0F14]/70 border border-[#1E293B]/70 p-2.5 text-xs italic leading-relaxed text-[#CBD5E1] line-clamp-3">
                        “{item.comment}”
                      </p>
                    )}
                  </div>

                  {/* Worker & Customer Attribution */}
                  <div className="mt-3 flex items-center justify-between border-t border-[#1E293B] pt-2.5 text-[11px] text-[#94A3B8]">
                    <span className="truncate">
                      <span className="text-[#F1F5F9] font-medium">{item.customerName}</span> →{' '}
                      <span className="text-[#14B8A6] font-semibold">{item.workerName}</span>
                    </span>
                    {item.rating && (
                      <span className="inline-flex items-center gap-0.5 shrink-0 text-[#D4A017] font-bold">
                        <Star className="size-3 fill-[#D4A017]" aria-hidden />
                        {item.rating}.0
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

