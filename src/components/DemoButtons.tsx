import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, UserCheck } from 'lucide-react'
import { DEMO_ACCOUNTS, TESTER_ACCOUNT, useAuth } from '../lib/auth'
import { friendlyError } from '../lib/errors'
import type { Role } from '../lib/types'
import { Button } from './ui'
import { useToast } from './ui/toast'

export function DemoButtons({ compact = false, next }: { compact?: boolean; next?: string | null }) {
  const { signInDemo, signInTester } = useAuth()
  const [busy, setBusy] = useState<Role | 'tester' | null>(null)
  const navigate = useNavigate()
  const toast = useToast()

  async function go(role: Role) {
    setBusy(role)
    try {
      await signInDemo(role)
      navigate(next ?? (role === 'customer' ? '/my-gigs' : '/home'))
    } catch (e) {
      toast.show(friendlyError(e), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function goTester() {
    setBusy('tester')
    try {
      await signInTester()
      navigate(next ?? '/my-gigs')
    } catch (e) {
      toast.show(friendlyError(e), 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={`grid gap-2 ${compact ? '' : 'sm:grid-cols-2'}`}>
      {(['customer', 'worker'] as Role[]).map((role) => (
        <Button key={role} variant="secondary" loading={busy === role} disabled={busy !== null} onClick={() => go(role)} className="justify-start text-left">
          <Sparkles className="size-4 text-sun-600" aria-hidden />
          <span>
            Try as {DEMO_ACCOUNTS[role].name} <span className="font-normal text-muted">· demo {role}</span>
          </span>
        </Button>
      ))}
      <Button
        variant="secondary"
        loading={busy === 'tester'}
        disabled={busy !== null}
        onClick={goTester}
        className="justify-start text-left border-[#0D9488]/40 bg-[#0D9488]/10 hover:bg-[#0D9488]/20 sm:col-span-2"
      >
        <UserCheck className="size-4 text-[#14B8A6]" aria-hidden />
        <span>
          Sign in as {TESTER_ACCOUNT.name} <span className="font-normal text-[#14B8A6]">· real customer account</span>
        </span>
      </Button>
    </div>
  )
}
