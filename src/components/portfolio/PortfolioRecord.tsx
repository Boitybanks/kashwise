import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, Camera, MapPin, Trash2 } from 'lucide-react'
import { removeEvidence, uploadEvidence } from '../../lib/api'
import { categoryLabel } from '../../lib/categories'
import { friendlyError } from '../../lib/errors'
import { formatDate } from '../../lib/format'
import { useAreaLookup } from '../../lib/hooks'
import { evidenceUrl } from '../../lib/supabase'
import type { PortfolioItem } from '../../lib/types'
import { PhotoGallery } from '../PhotoGallery'
import { Stars } from '../ui'
import { useToast } from '../ui/toast'
import { CategoryIcon } from '../CategoryIcon'

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
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-canvas text-xl"><CategoryIcon category={item.category} className="size-5 text-brand-500" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-snug">{item.title}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
            <span>{categoryLabel(item.category)}</span>
            <span className="inline-flex items-center gap-0.5"><MapPin className="size-3" aria-hidden />{area?.name ?? item.area_slug}</span>
            <span>{formatDate(item.completed_at)}</span>
          </p>
        </div>
        {item.rating && <Stars value={item.rating} />}
      </div>

      {item.review && (
        <blockquote className="mt-3 rounded-xl bg-canvas border border-line px-3.5 py-2.5 text-sm text-ink">
          “{item.review}” <span className="font-semibold text-muted">— {item.customer_label}</span>
        </blockquote>
      )}
      {!item.review && item.rating && <p className="mt-2 text-xs text-muted">Rated by {item.customer_label}</p>}
      {!item.rating && <p className="mt-2 text-xs text-muted">Completed for {item.customer_label} · review pending</p>}

      {((item.before_paths?.length ?? 0) > 0 || item.evidence_paths.length > 0 || isOwner) && (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {(item.before_paths?.length ?? 0) > 0 && (
            <div>
              <h4 className="mb-1.5 text-xs font-semibold text-muted">Before</h4>
              <PhotoGallery paths={item.before_paths!} label="Before" />
            </div>
          )}
          {(item.evidence_paths.length > 0 || isOwner) && (
            <div>
              <h4 className="mb-1.5 text-xs font-semibold text-muted">After</h4>
              <div className="flex flex-wrap items-start gap-2">
                {isOwner ? item.evidence_paths.map((p) => (
                  <div key={p} className="relative">
                    <img src={evidenceUrl(p)} alt={`After photo for ${item.title}`} loading="lazy" className="size-24 rounded-lg object-cover ring-1 ring-line" />
                    <button type="button" onClick={() => onRemove(p)} aria-label="Remove photo" className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full bg-surface-elevated text-clay-700 shadow ring-1 ring-line">
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </div>
                )) : <PhotoGallery paths={item.evidence_paths} label="After" />}
                {isOwner && item.evidence_paths.length < 6 && (
                  <>
                    <input ref={fileRef} type="file" accept="image/*" className="sr-only" id={`ev-${item.id}`} onChange={(e) => onFile(e.target.files?.[0])} />
                    <label htmlFor={`ev-${item.id}`} className={`grid size-24 cursor-pointer place-items-center rounded-lg border border-dashed border-line text-center text-xs text-muted hover:border-brand-200 hover:text-ink ${busy ? 'animate-pulse' : ''}`}>
                      <span><Camera className="mx-auto mb-1 size-5" aria-hidden />{busy ? 'Uploading…' : 'Add photo'}</span>
                    </label>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs">
        <span className="inline-flex items-center gap-1.5 font-semibold text-gold-600">
          <BadgeCheck className="size-4 fill-gold-500/20 text-gold-600" aria-hidden /> Confirmed by customer
        </span>
        {item.proof_level === 'payment_confirmed' && (
          <span className="inline-flex items-center gap-1.5 font-semibold text-brand-500">
            <BadgeCheck className="size-4 text-brand-500" aria-hidden /> Payment confirmed
          </span>
        )}
      </div>
    </article>
  )
}
