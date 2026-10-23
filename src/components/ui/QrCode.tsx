import { useMemo } from 'react'
import { encode } from 'uqr'

/** Crisp, dependency-light QR code rendered as a single SVG path. */
export function QrCode({ value, label, className = 'size-40' }: { value: string; label: string; className?: string }) {
  const { size, path } = useMemo(() => {
    const qr = encode(value, { ecc: 'M', border: 2 })
    let d = ''
    qr.data.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x} ${y}h1v1h-1z` }))
    return { size: qr.size, path: d }
  }, [value])
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges" className={className}>
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#111814" />
    </svg>
  )
}
