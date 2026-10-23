import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { CameraOff, LoaderCircle, X } from 'lucide-react'
import { friendlyError } from '../../lib/errors'
import { createQrReader, parseHandshake, type HandshakeStep } from '../../lib/qr-scan'
import { Button } from '../ui'

function cameraError(err: unknown): string {
  const name = (err as { name?: string } | null)?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera access was blocked. Allow the camera, or type the code below.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found. Type the code below instead.'
  return 'The camera couldn’t start. Type the code below instead.'
}

/**
 * Worker side of the on-site handshake: scan the customer's start / finish QR code with the back camera,
 * or type the 6-character code printed under it.
 */
export function ScanCodeDialog({ step, gigId, initialCode = '', onSubmit, onClose }: {
  step: HandshakeStep
  gigId: string
  initialCode?: string
  onSubmit: (code: string) => Promise<void>
  onClose: () => void
}) {
  const titleId = useId()
  const inputId = useId()
  const videoRef = useRef<HTMLVideoElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const supported = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
  const [camera, setCamera] = useState<'starting' | 'live' | 'error'>(supported ? 'starting' : 'error')
  const [cameraMessage, setCameraMessage] = useState(supported ? '' : 'This browser can’t open the camera. Type the code below instead.')
  const [code, setCode] = useState(initialCode)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const lastScanned = useRef('')

  const submit = useCallback(async (value: string) => {
    if (busyRef.current) return
    const parsed = parseHandshake(value)
    if (!parsed) return setError('That isn’t a KashWise job code. It has 6 letters and numbers, like K7Q-4MX.')
    if (parsed.gigId && parsed.gigId !== gigId) return setError('That QR code belongs to a different job.')
    if (parsed.step && parsed.step !== step) {
      return setError(step === 'start' ? 'That’s the finish-job code. Ask for the start-job QR code.' : 'That’s the start-job code. Ask for the finish-job QR code.')
    }
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      await onSubmit(parsed.code)
    } catch (e) {
      setError(friendlyError(e))
      busyRef.current = false
      setBusy(false)
    }
  }, [gigId, step, onSubmit])

  // The camera loop must not restart when the parent re-renders, so it calls the latest submit through a ref.
  const submitRef = useRef(submit)
  useEffect(() => {
    submitRef.current = submit
  }, [submit])

  useEffect(() => {
    dialogRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!supported) return
    let stream: MediaStream | null = null
    let timer = 0
    let stopped = false
    const run = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        const video = videoRef.current
        if (stopped || !video) return
        video.srcObject = stream
        await video.play().catch(() => {})
        setCamera('live')
        const read = await createQrReader()
        const tick = async () => {
          if (stopped) return
          try {
            const text = await read(video)
            // Don't hammer the server with a code it has already rejected.
            if (text && text !== lastScanned.current && !busyRef.current) {
              lastScanned.current = text
              await submitRef.current(text)
            }
          } catch {
            // keep scanning
          }
          if (!stopped) timer = window.setTimeout(tick, 250)
        }
        void tick()
      } catch (err) {
        if (!stopped) {
          setCamera('error')
          setCameraMessage(cameraError(err))
        }
      }
    }
    void run()
    return () => {
      stopped = true
      window.clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [supported])

  const title = step === 'start' ? 'Scan the start-job QR code' : 'Scan the finish-job QR code'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-night/70 sm:items-center sm:p-4" role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}
        // pb-24 on phones keeps the submit button clear of the host's floating corner badge.
        className="max-h-[100dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 pb-24 focus:outline-none sm:rounded-3xl sm:pb-5">
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full hover:bg-canvas"><X className="size-5" aria-hidden /></button>
        </div>
        <p className="mt-1 text-sm text-muted">
          {step === 'start'
            ? 'Ask the customer to open “Job QR codes” and show you the start-job code.'
            : 'When the work is finished, ask the customer to show you the finish-job code.'}
        </p>

        <div className="relative mt-4 aspect-square overflow-hidden rounded-2xl bg-night">
          {camera !== 'error' && <video ref={videoRef} muted playsInline aria-label="Camera preview for scanning" className="size-full object-cover" />}
          {camera === 'live' && <div aria-hidden className="pointer-events-none absolute inset-[16%] rounded-2xl border-4 border-zest/80" />}
          {camera === 'starting' && (
            <div className="absolute inset-0 grid place-items-center text-sm text-white/80">
              <span className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" aria-hidden /> Starting camera…</span>
            </div>
          )}
          {camera === 'error' && (
            <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
              <CameraOff className="size-8 text-white/70" aria-hidden />
              <p className="text-sm">{cameraMessage}</p>
            </div>
          )}
        </div>

        <form className="mt-4" noValidate onSubmit={(e: FormEvent) => { e.preventDefault(); void submit(code) }}>
          <label htmlFor={inputId} className="text-sm font-semibold">Or type the 6-character code</label>
          <input id={inputId} className="input mt-1.5 font-mono uppercase tracking-[0.25em]" value={code} maxLength={7} autoComplete="off" spellCheck={false}
            placeholder="K7Q-4MX" onChange={(e) => { setCode(e.target.value); setError('') }} aria-invalid={error ? true : undefined} />
          <Button type="submit" block size="lg" loading={busy} className="mt-3">{step === 'start' ? 'Start job' : 'Mark as done'}</Button>
        </form>
        {error && <p role="alert" className="mt-3 rounded-lg bg-clay-50 px-3 py-2 text-sm font-medium text-clay-700">{error}</p>}
      </div>
    </div>
  )
}
