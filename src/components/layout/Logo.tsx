import { Link } from 'react-router-dom'

/** Mark: a check for confirmed work, reaching up to a gold coin. */
export function LogoMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#0d9488" />
      <path d="M7.5 16.5 13 22l8.5-11" fill="none" stroke="#fff" strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24.5" cy="7.5" r="3.7" fill="#f2b92c" />
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
