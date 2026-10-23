import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CircleCheck, ChevronDown, QrCode as QrIcon } from 'lucide-react'
import { fetchHandshakes } from '../../lib/api'
import { formatHandshakeCode, handshakeUrl, type HandshakeStep } from '../../lib/qr-scan'
import type { Gig } from '../../lib/types'
import { Button } from '../ui'
import { QrCode } from '../ui/QrCode'

const LABEL: Record<HandshakeStep, string> = { start: 'Start-job QR code', finish: 'Finish-job QR code' }

/**
 * Customer side of the on-site handshake: a menu with the one-time start and finish codes.
 * The worker scans them on site, which shows they were really there.
 */
export function JobQrMenu({ gig, workerName }: { gig: Pick<Gig, 'id' | 'status' | 'worker_done_at'>; workerName: string }) {
  const menuId = useId()
  const q = useQuery({ queryKey: ['handshakes', gig.id, gig.status, gig.worker_done_at], queryFn: () => fetchHandshakes(gig.id) })
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState<HandshakeStep | null>(null)

  const byStep = (s: HandshakeStep) => q.data?.find((h) => h.step === s)
  const ready: Record<HandshakeStep, boolean> = {
    start: gig.status === 'matched' && Boolean(byStep('start')) && !byStep('start')?.used_at,
    finish: gig.status === 'in_progress' && !gig.worker_done_at && Boolean(byStep('finish')) && !byStep('finish')?.used_at,
  }
  const status = (s: HandshakeStep) =>
    byStep(s)?.used_at ? 'Scanned' : ready[s] ? 'Ready to show' : s === 'finish' ? 'After the job starts' : 'Not needed now'
  // A code disappears as soon as it has been used (the gig refreshes while it is under way).
  const visible = shown && ready[shown] ? byStep(shown) : undefined

  return (
    <div className="rounded-xl border border-line p-4">
      <p className="flex items-center gap-2 font-bold"><QrIcon className="size-5 text-brand-600" aria-hidden /> Job QR codes</p>
      <p className="mt-1 text-xs text-muted">{workerName} scans these on site to start and to finish the job, so you know they were really there.</p>
      <div className="relative mt-3">
        <Button variant="secondary" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((o) => !o)}>
          Show a QR code <ChevronDown className={`size-4 transition ${open ? 'rotate-180' : ''}`} aria-hidden />
        </Button>
        {open && (
          <ul id={menuId} className="absolute left-0 z-20 mt-2 w-72 rounded-xl border border-line bg-white p-1 shadow-lg">
            {(['start', 'finish'] as HandshakeStep[]).map((s) => (
              <li key={s}>
                <button type="button" disabled={!ready[s]} onClick={() => { setShown(s); setOpen(false) }}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent">
                  {LABEL[s]}{' '}
                  <span className={`inline-flex items-center gap-1 text-xs font-medium ${byStep(s)?.used_at ? 'text-brand-700' : 'text-muted'}`}>
                    {byStep(s)?.used_at && <CircleCheck className="size-3.5" aria-hidden />}{status(s)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {shown && visible && (
        <div className="mt-4 text-center">
          <QrCode value={handshakeUrl(window.location.origin, gig.id, shown, visible.code)} label={`${LABEL[shown]} for ${workerName} to scan`}
            className="mx-auto size-56 rounded-xl ring-1 ring-line" />
          <p className="mt-3 font-mono text-3xl font-extrabold tracking-[0.2em]" aria-label={`Code ${visible.code.split('').join(' ')}`}>{formatHandshakeCode(visible.code)}</p>
          <p className="mt-1 text-sm text-muted">
            Show this to {workerName} {shown === 'start' ? 'when they arrive' : 'once the work is done'}. They scan it, or type the code.
          </p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShown(null)}>Hide code</Button>
        </div>
      )}
    </div>
  )
}
