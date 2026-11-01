import { useState } from 'react'
import Lightbox from 'yet-another-react-lightbox'
import 'yet-another-react-lightbox/styles.css'
import { evidenceUrl } from '../lib/supabase'

/** A row of job photos that open full screen. */
export function PhotoGallery({ paths, label, size = 'size-24' }: { paths: string[]; label: string; size?: string }) {
  const [index, setIndex] = useState(-1)
  if (paths.length === 0) return null
  return (
    <>
      <ul className="flex flex-wrap gap-2" aria-label={label}>
        {paths.map((path, i) => (
          <li key={path}>
            <button type="button" onClick={() => setIndex(i)} aria-label={`Open ${label.toLowerCase()} photo ${i + 1}`} className="block overflow-hidden rounded-lg">
              <img src={evidenceUrl(path)} alt="" loading="lazy" className={`${size} object-cover ring-1 ring-line transition-opacity hover:opacity-85`} />
            </button>
          </li>
        ))}
      </ul>
      <Lightbox open={index >= 0} index={index} close={() => setIndex(-1)} slides={paths.map((path) => ({ src: evidenceUrl(path), alt: label }))} />
    </>
  )
}
