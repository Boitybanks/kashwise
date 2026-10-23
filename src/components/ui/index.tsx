import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { AlertTriangle, Loader2, Star } from 'lucide-react'
import { friendlyError } from '../../lib/errors'
import { initials } from '../../lib/format'
import { STATUS_LABEL } from '../../lib/gig-rules'
import type { GigStatus } from '../../lib/types'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'sun'
type Size = 'sm' | 'md' | 'lg'

const variantClass: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm',
  secondary: 'bg-white text-ink border border-line hover:border-brand-200 hover:bg-brand-50',
  ghost: 'text-brand-700 hover:bg-brand-50',
  danger: 'bg-white text-clay-700 border border-clay-100 hover:bg-clay-50',
  sun: 'bg-sun-400 text-ink hover:bg-sun-300 shadow-sm',
}
const sizeClass: Record<Size, string> = {
  sm: 'min-h-9 px-3 text-sm rounded-lg',
  md: 'min-h-11 px-4 text-[15px] rounded-xl',
  lg: 'min-h-13 px-5 text-base rounded-xl',
}

// eslint-disable-next-line react-refresh/only-export-components
export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra = '') {
  return `inline-flex items-center justify-center gap-2 font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${variantClass[variant]} ${sizeClass[size]} ${extra}`
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  block?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, block, className = '', children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass(variant, size, `${block ? 'w-full' : ''} ${className}`)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
})

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  block,
  className = '',
  ...rest
}: LinkProps & { variant?: Variant; size?: Size; block?: boolean }) {
  return <Link className={buttonClass(variant, size, `${block ? 'w-full' : ''} ${className}`)} {...rest} />
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`card ${className}`}>{children}</div>
}

type Tone = 'brand' | 'sun' | 'clay' | 'blue' | 'gray'
const toneClass: Record<Tone, string> = {
  brand: 'bg-brand-50 text-brand-800 ring-brand-100',
  sun: 'bg-sun-50 text-sun-700 ring-sun-100',
  clay: 'bg-clay-50 text-clay-700 ring-clay-100',
  blue: 'bg-sky-50 text-sky-800 ring-sky-100',
  gray: 'bg-stone-100 text-stone-700 ring-stone-200',
}

export function Badge({ tone = 'gray', children, className = '' }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${toneClass[tone]} ${className}`}>
      {children}
    </span>
  )
}

export function DemoBadge() {
  return (
    <Badge tone="sun" className="uppercase tracking-wide">
      <span title="Seeded demonstration data — not a real person or transaction">Demo</span>
    </Badge>
  )
}

const statusTone: Record<GigStatus, Tone> = {
  open: 'brand',
  matched: 'blue',
  in_progress: 'sun',
  completed: 'brand',
  cancelled: 'gray',
}

export function StatusPill({ status }: { status: GigStatus }) {
  return (
    <Badge tone={statusTone[status]}>
      <span aria-hidden className={`size-1.5 rounded-full ${status === 'cancelled' ? 'bg-stone-400' : status === 'matched' ? 'bg-sky-600' : status === 'in_progress' ? 'bg-sun-600' : 'bg-brand-600'}`} />
      {STATUS_LABEL[status]}
    </Badge>
  )
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-12 text-muted">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-xl bg-line/60 ${className}`} />
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      {icon && <div className="mb-3 grid size-12 place-items-center rounded-full bg-brand-50 text-brand-700">{icon}</div>}
      <h3 className="text-lg font-bold">{title}</h3>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="card flex flex-col items-center border-clay-100 px-6 py-8 text-center">
      <AlertTriangle className="mb-2 size-6 text-clay-600" aria-hidden />
      <p className="font-semibold">We couldn’t load this.</p>
      <p className="mt-1 text-sm text-muted">{friendlyError(error)}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  optional,
}: {
  label: string
  htmlFor: string
  hint?: ReactNode
  error?: string
  children: ReactNode
  optional?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink">
        {label} {optional && <span className="font-normal text-muted">(optional)</span>}
      </label>
      {children}
      {hint && !error && <p id={`${htmlFor}-hint`} className="text-xs text-muted">{hint}</p>}
      {error && (
        <p id={`${htmlFor}-error`} className="text-sm font-medium text-clay-700">
          {error}
        </p>
      )}
    </div>
  )
}

const avatarColors = ['bg-brand-600', 'bg-clay-500', 'bg-sky-700', 'bg-sun-600', 'bg-brand-800', 'bg-clay-700']

export function Avatar({ name, id, size = 'md', src }: { name: string; id?: string; size?: 'sm' | 'md' | 'lg' | 'xl'; src?: string | null }) {
  const seed = (id ?? name).split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const dims = { sm: 'size-8 text-xs', md: 'size-11 text-sm', lg: 'size-14 text-lg', xl: 'size-20 text-2xl' }[size]
  if (src) return <img src={src} alt="" aria-hidden className={`shrink-0 rounded-full bg-line object-cover ${dims}`} />
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-full font-bold text-white ${avatarColors[seed % avatarColors.length]} ${dims}`}>
      {initials(name)}
    </span>
  )
}

export function Stars({ value, size = 'sm', label }: { value: number | null; size?: 'sm' | 'md'; label?: string }) {
  const v = value ?? 0
  const dim = size === 'sm' ? 'size-4' : 'size-5'
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={label ?? `${v.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} aria-hidden className={`${dim} ${i <= Math.round(v) ? 'fill-sun-400 text-sun-400' : 'fill-transparent text-line'}`} />
      ))}
    </span>
  )
}

export function PageHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function SimulationNote({ children }: { children?: ReactNode }) {
  return (
    <p className="rounded-lg bg-sun-50 px-3 py-2 text-xs font-medium text-sun-700 ring-1 ring-inset ring-sun-100">
      <strong>Payment simulation.</strong> {children ?? 'No real money moves in this hackathon version — it shows how KashWise protection will work.'}
    </p>
  )
}
