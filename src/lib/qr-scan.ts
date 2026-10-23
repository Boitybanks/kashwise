export type HandshakeStep = 'start' | 'finish'

const CODE = /^[A-HJ-NP-Z2-9]{6}$/

/** The QR holds a link, so a phone's own camera app opens the right gig; the in-app scanner reads the code from it. */
export function handshakeUrl(origin: string, gigId: string, step: HandshakeStep, code: string): string {
  return `${origin}/gigs/${gigId}?step=${step}&code=${code}`
}

/** "K7Q4MX" → "K7Q-4MX", easier to read out and type. */
export function formatHandshakeCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`
}

/** Accepts a scanned link or a typed code (any case, with or without the dash). */
export function parseHandshake(text: string): { code: string; step?: HandshakeStep; gigId?: string } | null {
  const raw = text.trim()
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw)
      const code = (url.searchParams.get('code') ?? '').toUpperCase()
      const step = url.searchParams.get('step')
      if (!CODE.test(code)) return null
      return {
        code,
        step: step === 'start' || step === 'finish' ? step : undefined,
        gigId: url.pathname.match(/\/gigs\/([0-9a-f-]{36})/i)?.[1],
      }
    } catch {
      return null
    }
  }
  const code = raw.replace(/[\s-]/g, '').toUpperCase()
  return CODE.test(code) ? { code } : null
}

interface DetectedBarcode {
  rawValue: string
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>
}
interface BarcodeDetectorClass {
  new (options: { formats: string[] }): BarcodeDetectorLike
  getSupportedFormats?: () => Promise<string[]>
}

/** Uses the browser's built-in BarcodeDetector where it exists (Chrome, Android), else jsQR, loaded only when needed. */
export async function createQrReader(): Promise<(video: HTMLVideoElement) => Promise<string | null>> {
  const Detector = (globalThis as { BarcodeDetector?: BarcodeDetectorClass }).BarcodeDetector
  if (Detector) {
    try {
      const formats = (await Detector.getSupportedFormats?.()) ?? ['qr_code']
      if (formats.includes('qr_code')) {
        const detector = new Detector({ formats: ['qr_code'] })
        return async (video) => (await detector.detect(video))[0]?.rawValue ?? null
      }
    } catch {
      // fall back to jsQR
    }
  }
  const { default: jsQR } = await import('jsqr')
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  return async (video) => {
    if (!ctx || !video.videoWidth) return null
    const scale = Math.min(1, 640 / video.videoWidth)
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    return jsQR(data, width, height, { inversionAttempts: 'dontInvert' })?.data ?? null
  }
}
