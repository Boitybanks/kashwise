import { useEffect, useMemo } from 'react'
import { ImagePlus, X } from 'lucide-react'

export const MAX_JOB_PHOTOS = 6

/** Choose or take photos of the job while posting. They upload once the gig exists. */
export function JobPhotoPicker({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const previews = useMemo(() => files.map((file) => ({ file, url: URL.createObjectURL(file) })), [files])
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews])

  return (
    <div>
      <p className="mb-2 text-sm font-semibold">Photos of the job <span className="font-normal text-muted">(optional)</span></p>
      <ul className="flex flex-wrap gap-2">
        {previews.map((p) => (
          <li key={p.url} className="relative">
            <img src={p.url} alt="" className="size-24 rounded-lg object-cover ring-1 ring-line" />
            <button type="button" aria-label={`Remove ${p.file.name}`} onClick={() => onChange(files.filter((f) => f !== p.file))}
              className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full bg-surface-elevated text-ink ring-1 ring-line">
              <X className="size-3.5" aria-hidden />
            </button>
          </li>
        ))}
        {files.length < MAX_JOB_PHOTOS && (
          <li>
            <label className="grid size-24 cursor-pointer place-items-center rounded-lg border border-dashed border-line text-center text-xs text-ink-soft transition-colors hover:border-brand-200 hover:text-ink">
              <span><ImagePlus className="mx-auto mb-1 size-5" aria-hidden />Add photo</span>
              <input type="file" accept="image/*" multiple className="sr-only"
                onChange={(e) => { onChange([...files, ...Array.from(e.target.files ?? [])].slice(0, MAX_JOB_PHOTOS)); e.target.value = '' }} />
            </label>
          </li>
        )}
      </ul>
      <p className="mt-2 text-xs text-muted">Workers can see these. Keep your address and people out of them.</p>
    </div>
  )
}
