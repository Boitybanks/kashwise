import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Repeat } from 'lucide-react'
import { DEMO_ACCOUNTS, useAuth } from '../lib/auth'
import { friendlyError } from '../lib/errors'
import { useToast } from './ui/toast'

/**
 * Shown only while signed in to a demo account: one tap swaps between the demo customer (Thandi)
 * and demo worker (Sipho) so a judge can play both sides of a gig in one browser.
 */
export function DemoSwitcher() {
  const { isDemo, profile, signInDemo } = useAuth()
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const toast = useToast()
  if (!isDemo || !profile) return null
  const other = profile.role === 'customer' ? 'worker' : 'customer'

  async function swap() {
    setBusy(true)
    try {
      await signInDemo(other)
      toast.show(`You are now ${DEMO_ACCOUNTS[other].name} (demo ${other}).`)
      navigate(other === 'customer' ? '/my-gigs' : '/discover')
    } catch (e) {
      toast.show(friendlyError(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-b border-sun-100 bg-sun-50 print:hidden">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 text-sm">
        <p className="text-sun-700">
          <strong>Demo mode:</strong> you are {profile.display_name.split(' ')[0]} ({profile.role}).
        </p>
        <button
          type="button"
          onClick={swap}
          disabled={busy}
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 font-semibold text-ink ring-1 ring-sun-300 hover:bg-sun-100 disabled:opacity-60"
        >
          <Repeat className={`size-4 ${busy ? 'animate-spin' : ''}`} aria-hidden />
          Switch to {DEMO_ACCOUNTS[other].name}
        </button>
      </div>
    </div>
  )
}
