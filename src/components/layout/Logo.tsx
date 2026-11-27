import { Link } from 'react-router-dom'

/** Mark: bold K monogram with a verified gold checkmark and coin (Earn it. Prove it. Grow it.). */
export function LogoMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="kw-logo-bg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#14b8a6" />
          <stop offset="55%" stopColor="#0d9488" />
          <stop offset="100%" stopColor="#064e3b" />
        </linearGradient>
        <linearGradient id="kw-logo-gold" x1="17" y1="6" x2="27" y2="23" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8.5" fill="url(#kw-logo-bg)" />
      <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="7.75" fill="none" stroke="#ffffff" strokeOpacity="0.18" strokeWidth="1.5" />
      <path d="M7.5 7.5v17M7.5 16.5 15.2 8.2M11 13l5.5 11.5" fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17.5 18.8 20.4 21.8 26.2 14.2" fill="none" stroke="url(#kw-logo-gold)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="23.8" cy="8.2" r="2.7" fill="url(#kw-logo-gold)" />
    </svg>
  )
}

export function Logo({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2 rounded-lg" aria-label="KashWise home">
      <LogoMark />
      <span className="text-[23px] font-semibold tracking-[-.06em] text-ink">
        Kash<span className="text-brand-500">Wise</span>
      </span>
    </Link>
  )
}
