import { Suspense } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Briefcase, Compass, PlusCircle, Store, User, Users, Home, LogIn, Wallet, BadgeCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { Logo } from './Logo'
import { DemoSwitcher } from '../DemoSwitcher'
import { buttonClass, Spinner } from '../ui'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

function useNavItems(): NavItem[] {
  const { userId, profile } = useAuth()
  if (!userId) {
    return [
      { to: '/welcome', label: 'Home', icon: Home, end: true },
      { to: '/discover', label: 'Find work', icon: Compass },
      { to: '/services', label: 'Services', icon: Store },
      { to: '/workers', label: 'Workers', icon: Users },
      { to: '/login', label: 'Sign in', icon: LogIn },
    ]
  }
  if (profile?.role === 'customer') {
    return [
      { to: '/my-gigs', label: 'My gigs', icon: Briefcase },
      { to: '/gigs/new', label: 'Post a gig', icon: PlusCircle },
      { to: '/services', label: 'Services', icon: Store },
      { to: '/workers', label: 'Workers', icon: Users },
      { to: '/profile', label: 'Profile', icon: User },
    ]
  }
  return [
    { to: '/discover', label: 'Find work', icon: Compass },
    { to: '/my-work', label: 'My work', icon: Briefcase },
    { to: '/proofscript', label: 'ProofScript', icon: BadgeCheck },
    { to: '/money', label: 'Money', icon: Wallet },
    { to: '/profile', label: 'Profile', icon: User },
  ]
}

export function AppShell() {
  const items = useNavItems()
  const { userId, profile } = useAuth()
  const { pathname } = useLocation()
  const isLanding = pathname === '/' || pathname === '/welcome'

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line/80 bg-canvas/95 backdrop-blur">
        <div className="page-width flex h-[76px] items-center justify-between gap-4">
          <Logo to={userId ? (profile?.role === 'customer' ? '/my-gigs' : '/discover') : '/welcome'} />
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-xs font-semibold transition ${isActive ? 'bg-brand-50 text-brand-800' : 'text-ink-soft hover:bg-white'}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          {!userId && (
            <NavLink to="/signup" className={buttonClass('primary', 'sm')}>
              Get started <span aria-hidden>↗</span>
            </NavLink>
          )}
        </div>
      </header>

      <DemoSwitcher />

      <main id="main" className={`flex-1 ${isLanding ? '' : 'mx-auto w-full max-w-6xl px-4 py-6 sm:py-10'} pb-24 md:pb-0`}>
        <Suspense fallback={<Spinner />}>
          <Outlet />
        </Suspense>
      </main>

      <footer className="border-t border-line bg-white/60 pb-20 md:pb-0">
        <div className="page-width flex flex-wrap items-center justify-between gap-5 py-8 text-xs text-muted">
          <p>
            <strong className="text-ink">KashWise</strong> — Earn it. Prove it. Grow it. Built on SideGigs by team CodeCraft.
          </p>
          <nav aria-label="Footer" className="flex gap-4">
            <NavLink to="/trust" className="hover:text-ink">Trust &amp; safety</NavLink>
            <NavLink to="/verify" className="hover:text-ink">Verify a record</NavLink>
            <NavLink to="/impact" className="hover:text-ink">Impact</NavLink>
          </nav>
        </div>
      </footer>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {items.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition ${
                    isActive ? 'text-brand-700' : 'text-muted'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={`grid h-7 w-12 place-items-center rounded-full ${isActive ? 'bg-brand-50' : ''}`}>
                      <item.icon className="size-5" aria-hidden />
                    </span>
                    {item.label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
