import { useQuery } from '@tanstack/react-query'
import { Copy, Fingerprint, MessageSquare } from 'lucide-react'
import { fetchWorkId } from '../../lib/api'
import { Button } from '../ui'
import { useToast } from '../ui/toast'

/**
 * The Work ID exists only once the customer has accepted a worker, and only those two can read it (RLS).
 * Quoting it when they call or message each other proves they are really talking to their KashWise match.
 */
export function WorkIdCard({ gigId, gigTitle, myName, partnerName, perspective }: {
  gigId: string
  gigTitle: string
  myName: string
  partnerName: string
  perspective: 'customer' | 'worker'
}) {
  const toast = useToast()
  const q = useQuery({ queryKey: ['work-id', gigId], queryFn: () => fetchWorkId(gigId), staleTime: Infinity })
  const workId = q.data
  if (!workId) return null

  const intro =
    perspective === 'customer'
      ? `Hi ${partnerName}, it’s ${myName} — I accepted you for “${gigTitle}” on KashWise. Our Work ID is ${workId}.`
      : `Hi ${partnerName}, it’s ${myName}, the worker you accepted for “${gigTitle}” on KashWise. Our Work ID is ${workId}.`

  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.show(done)
    } catch {
      toast.show('Copying isn’t available here — press and hold the Work ID to select it.', 'error')
    }
  }

  return (
    <div className="rounded-xl border border-line p-4">
      <p className="flex items-center gap-2 font-bold"><Fingerprint className="size-5 text-brand-600" aria-hidden /> Work ID</p>
      <p className="mt-2 select-all font-mono text-2xl font-extrabold tracking-wider" aria-label={`Work ID ${workId.split('').join(' ')}`}>{workId}</p>
      <p className="mt-1 text-xs text-muted">
        Only you and {partnerName} can see this. Quote it whenever you message or call each other. If someone contacting you about this job
        can’t give it, don’t share your address or send money.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => copy(workId, 'Work ID copied.')}><Copy className="size-4" aria-hidden /> Copy Work ID</Button>
        <Button size="sm" variant="ghost" onClick={() => copy(intro, 'Intro message copied — paste it into WhatsApp or SMS.')}>
          <MessageSquare className="size-4" aria-hidden /> Copy intro message
        </Button>
      </div>
    </div>
  )
}
