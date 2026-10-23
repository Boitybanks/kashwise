import { useState } from 'react'
import { KeyRound, MapPin, Phone, ShieldCheck } from 'lucide-react'
import { revealContact } from '../../lib/api'
import { friendlyError } from '../../lib/errors'
import type { RevealedContact } from '../../lib/types'
import { Button } from '../ui'

/** Decrypts the post-quantum envelopes server-side; the database only holds ciphertext. */
export function ContactReveal({ gigId, onRevealed }: { gigId: string; onRevealed?: () => void }) {
  const [data, setData] = useState<RevealedContact | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function reveal() {
    setBusy(true)
    setError('')
    try {
      setData(await revealContact(gigId))
      onRevealed?.()
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4">
      <p className="flex items-center gap-2 font-bold text-brand-800">
        <ShieldCheck className="size-5" aria-hidden /> Private contact details
      </p>
      <p className="mt-1 text-xs text-brand-800/80">
        Stored encrypted (ML-KEM-768 + X25519 → AES-256-GCM). Only you and your matched partner can open them. Opening is logged.
      </p>
      {!data ? (
        <Button variant="secondary" size="sm" className="mt-3" loading={busy} onClick={reveal}>
          <KeyRound className="size-4" aria-hidden /> Decrypt and show
        </Button>
      ) : (
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
            <div>
              <dt className="sr-only">Address</dt>
              <dd>{data.address ?? <span className="text-muted">No street address was added.</span>}</dd>
              {data.access_notes && <dd className="text-muted">{data.access_notes}</dd>}
            </div>
          </div>
          <div className="flex gap-2">
            <Phone className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
            <div>
              <dt className="sr-only">Phone</dt>
              <dd>
                {data.counterpart_phone ? (
                  <a className="font-semibold text-brand-700 underline" href={`tel:${data.counterpart_phone}`}>
                    {data.counterpart_phone}
                  </a>
                ) : (
                  <span className="text-muted">{data.counterpart_name ? `${data.counterpart_name} hasn’t` : 'They haven’t'} added a phone number yet.</span>
                )}
                {data.counterpart_name && data.counterpart_phone && <span className="text-muted"> · {data.counterpart_name}</span>}
              </dd>
            </div>
          </div>
        </dl>
      )}
      {error && <p role="alert" className="mt-2 text-sm font-medium text-clay-700">{error}</p>}
    </div>
  )
}
