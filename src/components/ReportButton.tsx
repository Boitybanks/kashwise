import { useState, type FormEvent } from 'react'
import { Flag } from 'lucide-react'
import { reportContent } from '../lib/api'
import { useAuth } from '../lib/auth'
import { friendlyError } from '../lib/errors'
import { Button } from './ui'
import { useToast } from './ui/toast'

const reasons = [
  { value: 'safety', label: 'I feel unsafe' },
  { value: 'scam', label: 'Scam or fraud' },
  { value: 'harassment', label: 'Harassment or abuse' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'no_show', label: 'Did not show up' },
  { value: 'other', label: 'Something else' },
]

export function ReportButton({ gigId, userId, label = 'Report' }: { gigId?: string; userId?: string; label?: string }) {
  const { userId: me } = useAuth()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('safety')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  if (!me || me === userId) return null

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await reportContent({ gigId, userId, reason, details })
      toast.show('Thank you. Our team will review your report.')
      setOpen(false)
      setDetails('')
    } catch (err) {
      toast.show(friendlyError(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-muted hover:text-clay-700">
        <Flag className="size-4" aria-hidden /> {label}
      </button>
    )
  }
  return (
    <form onSubmit={submit} className="card mt-2 space-y-3 p-4" aria-label="Report">
      <p className="font-bold">What’s wrong?</p>
      <label htmlFor="report-reason" className="sr-only">Reason</label>
      <select id="report-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
        {reasons.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
      <label htmlFor="report-details" className="sr-only">Details</label>
      <textarea id="report-details" className="input" rows={3} maxLength={500} placeholder="Tell us what happened (optional)" value={details} onChange={(e) => setDetails(e.target.value)} />
      <p className="text-xs text-muted">If you are in danger, call 10111 (SAPS) or 112 from a cellphone.</p>
      <div className="flex gap-2">
        <Button type="submit" variant="danger" size="sm" loading={busy}>Send report</Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  )
}
