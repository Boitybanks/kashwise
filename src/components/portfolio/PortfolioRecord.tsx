import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, Camera, MapPin, Trash2 } from 'lucide-react'
import { removeEvidence, uploadEvidence } from '../../lib/api'
import { categoryEmoji, categoryLabel } from '../../lib/categories'
import { friendlyError } from '../../lib/errors'
import { formatDate } from '../../lib/format'
import { useAreaLookup } from '../../lib/hooks'
import { evidenceUrl } from '../../lib/supabase'
import type { PortfolioItem } from '../../lib/types'
import { DemoBadge, Stars } from '../ui'
import { useToast } from '../ui/toast'

export function PortfolioRecord({ item, isOwner, highlighted }: { item: PortfolioItem; isOwner: boolean; highlighted?: boolean }) {
  const areaOf = useAreaLookup()
  const queryClient = useQueryClient()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const area = areaOf(item.area_slug)

  async function onFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      await uploadEvidence(item.id, item.worker_id, file)
      toast.show('Photo added to this record.')
      await queryClient.invalidateQueries({ queryKey: ['portfolio', item.worker_id] })
    } catch (e) {
      toast.show(friendlyError(e), 'error')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function onRemove(path: string) {
    try {
      await removeEvidence(item.id, path)
      await queryClient.invalidateQueries({ queryKey: ['portfolio', item.worker_id] })
    } catch (e) {
      toast.show(friendlyError(e), 'error')
    }
  }

  return (
    <article id={item.record_code} className={`card scroll-mt-24 p-4 ${highlighted ? 'ring-4 ring-sun-300' : ''}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-canvas text-xl">{categoryEmoji(item.category)}</span>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold leading-snug">{item.title}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
            <span>{categoryLabel(item.category)}</span>
            <span className="inline-flex items-center gap-0.5"><MapPin className="size-3" aria-hidden />{area?.name ?? item.area_slug}</span>
            <span>{formatDate(item.completed_at)}</span>
          </p>
        </div>
        {item.rating && <Stars value={item.rating} />}
      </div>

      {item.review && (
        <blockquote className="mt-3 rounded-xl bg-canvas px-3 py-2 text-sm">
          “{item.review}” <span className="font-semibold text-muted">— {item.customer_label}</span>
        </blockquote>
      )}
      {!item.review && item.rating && <p className="mt-2 text-xs text-muted">Rated by {item.customer_label}</p>}
      {!item.rating && <p className="mt-2 text-xs text-muted">Completed for {item.customer_label} · review pending</p>}

      {(item.evidence_paths.length > 0 || isOwner) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.evidence_paths.map((p) => (
            <div key={p} className="relative">
              <a href={evidenceUrl(p)} target="_blank" rel="noreferrer">
                <img src={evidenceUrl(p)} alt={`Work photo for ${item.title}`} loading="lazy" className="size-20 rounded-lg object-cover ring-1 ring-line" />
              </a>
              {isOwner && (
                <button type="button" onClick={() => onRemove(p)} aria-label="Remove photo" className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full bg-white text-clay-700 shadow ring-1 ring-line">
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              )}
            </div>
          ))}
          {isOwner && item.evidence_paths.length < 6 && (
            <>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id={`ev-${item.id}`} onChange={(e) => onFile(e.target.files?.[0])} />
              <label htmlFor={`ev-${item.id}`} className={`grid size-20 cursor-pointer place-items-center rounded-lg border-2 border-dashed border-line text-center text-[11px] font-semibold text-muted hover:border-brand-200 hover:text-brand-700 ${busy ? 'animate-pulse' : ''}`}>
                <span><Camera className="mx-auto mb-1 size-5" aria-hidden />{busy ? 'Uploading…' : 'Add photo'}</span>
              </label>
            </>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs">
        <span className="inline-flex items-center gap-1 font-semibold text-brand-700">
          <BadgeCheck className="size-4 text-amber-500 fill-amber-100" aria-hidden /> Client confirmed & verified
        </span>
        {item.proof_level === 'payment_confirmed' && (
          <span className="inline-flex items-center gap-1 font-semibold text-brand-700" title="The payment provider confirmed the client's payment for this job. Payments are simulated in this version.">
            <BadgeCheck className="size-4" aria-hidden /> Payment confirmed <span className="font-normal text-muted">(simulated provider)</span>
          </span>
        )}
        <code className="rounded bg-canvas px-1.5 py-0.5 text-[11px] text-ink-soft">{item.record_code}</code>
        {item.is_demo && <DemoBadge />}
      </div>
    </article>
  )
}
