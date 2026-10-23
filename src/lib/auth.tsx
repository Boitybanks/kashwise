import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { createAccount, fetchProfile } from './api'
import type { Profile, Role } from './types'
import type { SignupInput } from './validation'
import type { IdentityInput } from './identity'

// Public demo logins (seeded, badged "Demo" everywhere). See supabase/migrations/*_demo_seed.sql.
 
export const DEMO_PASSWORD = 'SideGigsDemo2026'
// eslint-disable-next-line react-refresh/only-export-components
export const DEMO_ACCOUNTS: Record<Role, { email: string; name: string; blurb: string }> = {
  customer: { email: 'demo.customer@sidegigs.app', name: 'Thandi', blurb: 'Post a gig and hire someone' },
  worker: { email: 'demo.worker@sidegigs.app', name: 'Sipho', blurb: 'Find work and build a portfolio' },
}

interface AuthValue {
  session: Session | null
  userId: string | null
  profile: Profile | null
  loading: boolean
  isDemo: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (input: SignupInput & IdentityInput) => Promise<void>
  signInDemo: (role: Role) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null)
      return
    }
    try {
      setProfile(await fetchProfile(s.user.id))
    } catch {
      setProfile(null)
    }
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      await loadProfile(data.session)
      if (active) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // Defer the query so we never call Supabase inside the auth callback.
        setTimeout(() => {
          void loadProfile(s)
        }, 0)
      }
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
      if (error) throw error
      queryClient.clear()
      setSession(data.session)
      await loadProfile(data.session)
    },
    [loadProfile, queryClient],
  )

  const signUp = useCallback(
    async (input: SignupInput & IdentityInput) => {
      await createAccount(input)
      await signIn(input.email, input.password)
    },
    [signIn],
  )

  const signInDemo = useCallback(
    async (role: Role) => {
      await supabase.auth.signOut({ scope: 'local' })
      await signIn(DEMO_ACCOUNTS[role].email, DEMO_PASSWORD)
    },
    [signIn],
  )

  const signOut = useCallback(async () => {
    // Local scope: signing out here must not end other sessions (demo accounts are shared).
    await supabase.auth.signOut({ scope: 'local' })
    queryClient.clear()
    setSession(null)
    setProfile(null)
  }, [queryClient])

  const refreshProfile = useCallback(async () => {
    await loadProfile(session)
  }, [loadProfile, session])

  const value = useMemo<AuthValue>(
    () => ({
      session,
      userId: session?.user.id ?? null,
      profile,
      loading,
      isDemo: Boolean(profile?.is_demo),
      signIn,
      signUp,
      signInDemo,
      signOut,
      refreshProfile,
    }),
    [session, profile, loading, signIn, signUp, signInDemo, signOut, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
