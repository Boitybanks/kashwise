import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Camera, CircleCheck, RefreshCw } from 'lucide-react'
import { validateSaId } from '../lib/sa-id'
import { todayInSA } from '../lib/validation'
import { Button, Field } from './ui'

export interface IdentityDemoResult {
  status: 'demo_completed'
  simulated: true
  idFormatChecked: true
  selfieCaptured: boolean
}

/** Optional device-only demonstration. Never creates an identity credential. */
export function IdentityVerification({ onComplete, minimumAge = 18 }: {
  onComplete: (result: IdentityDemoResult) => void
  minimumAge?: number
}) {
  const [step, setStep] = useState<'id' | 'camera' | 'processing' | 'success'>('id')
  const [id, setId] = useState('')
  const [dob, setDob] = useState('')
  const [error, setError] = useState('')
  const [camera, setCamera] = useState<'off' | 'starting' | 'live' | 'error'>('off')
  const [photo, setPhoto] = useState<string | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const requestId = useRef(0)
  const heading = useRef<HTMLHeadingElement>(null)
  const stop = useCallback(() => {
    requestId.current++
    stream.current?.getTracks().forEach(track => track.stop())
    stream.current = null
    if (video.current) video.current.srcObject = null
  }, [])
  useEffect(() => stop, [stop])
  useEffect(() => {
    const hidden = () => { if (document.hidden) { stop(); setCamera('off') } }
    document.addEventListener('visibilitychange', hidden)
    return () => document.removeEventListener('visibilitychange', hidden)
  }, [stop])
  useEffect(() => { heading.current?.focus() }, [step])
  useEffect(() => {
    if (step !== 'processing') return
    const timer = window.setTimeout(() => setStep('success'), 3000)
    return () => window.clearTimeout(timer)
  }, [step])
  useEffect(() => {
    if (camera === 'live' && video.current) video.current.srcObject = stream.current
  }, [camera])

  function checkId(event: FormEvent) {
    event.preventDefault()
    const result = validateSaId(id)
    if (!result.ok) return setError(result.error)
    // A two-digit year cannot establish a century. Require a complete, self-declared DOB.
    const today = todayInSA()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || dob > today || dob < '1900-01-01') return setError('Enter your full date of birth, between 1900 and today.')
    const parsed = new Date(`${dob}T12:00:00Z`)
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dob) return setError('Enter a real date of birth.')
    if (dob.slice(2).replaceAll('-', '') !== result.details.idNumber.slice(0, 6)) return setError('The date of birth must match the first six ID digits.')
    const age = Number(today.slice(0, 4)) - Number(dob.slice(0, 4)) - (today.slice(5) < dob.slice(5) ? 1 : 0)
    if (age < minimumAge) return setError(`This demo is for people aged ${minimumAge} or older. Your age is self-declared, not verified.`)
    setId(''); setDob(''); setError(''); setStep('camera')
  }
  async function openCamera() {
    stop(); setPhoto(null); setError(''); setCamera('starting')
    const request = requestId.current
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unavailable')
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'user' } }, audio: false })
      if (request !== requestId.current) { media.getTracks().forEach(track => track.stop()); return }
      stream.current = media; setCamera('live')
    } catch {
      if (request !== requestId.current) return
      setCamera('error'); setError('Camera unavailable or permission declined. You can try again or continue without a selfie.')
    }
  }
  function snap() {
    const frame = video.current
    if (!frame?.videoWidth || !frame.videoHeight) return setError('The camera is not ready. Wait for the preview, then try again.')
    try {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 480
      const context = canvas.getContext('2d')
      if (!context) throw new Error('capture unavailable')
      const side = Math.min(frame.videoWidth, frame.videoHeight)
      context.translate(480, 0); context.scale(-1, 1)
      context.drawImage(frame, (frame.videoWidth - side) / 2, (frame.videoHeight - side) / 2, side, side, 0, 0, 480, 480)
      setPhoto(canvas.toDataURL('image/jpeg', .85)); stop(); setCamera('off'); setError('')
    } catch { stop(); setCamera('error'); setError('The photo could not be captured. Try again or skip the selfie.') }
  }
  function proceed() { stop(); setError(''); setStep('processing') }

  return <section className="card mx-auto max-w-lg overflow-hidden" aria-label="ID format and selfie demo">
    <div className="border-b border-line bg-sun-50 p-4 text-sm text-ink">
      <strong>Demo only — not identity verification.</strong> No Home Affairs lookup, liveness detection or face matching runs. This does not add a badge to your profile.
    </div>
    <div className="p-5 sm:p-7">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted">{step === 'id' ? '01 / ID format' : step === 'camera' ? '02 / Optional selfie' : step === 'processing' ? '03 / Demo processing' : '04 / Complete'}</p>
      {step === 'id' && <form onSubmit={checkId} noValidate className="space-y-4">
        <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold">Check an ID number’s format</h2>
        <p className="text-sm text-muted">Try the sample below instead of entering your own details. A valid format does not prove an ID was issued or belongs to you.</p>
        <Button type="button" variant="secondary" onClick={() => { setId('8001015009087'); setDob('1980-01-01'); setError('') }}>Use sample details</Button>
        <Field label="SA ID number" htmlFor="demo-id" hint="13 digits; spaces and hyphens are accepted.">
          <input id="demo-id" className="input" inputMode="numeric" autoComplete="off" value={id} onChange={e => setId(e.target.value)} aria-describedby={error ? 'identity-error' : undefined} aria-invalid={Boolean(error)} />
        </Field>
        <Field label="Full date of birth" htmlFor="demo-dob" hint="Needed because an ID’s two-digit year does not tell us the century.">
          <input id="demo-dob" className="input" type="date" min="1900-01-01" max={todayInSA()} value={dob} onChange={e => setDob(e.target.value)} aria-describedby={error ? 'identity-error' : undefined} aria-invalid={Boolean(error)} />
        </Field>
        <Button type="submit" block>Check ID format</Button>
      </form>}
      {step === 'camera' && <div className="space-y-4">
        <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold">Try a selfie, if you like</h2>
        <p className="text-sm text-muted">ID format checked. The ID and birth-date inputs have been cleared. Your browser will ask permission only when you open the camera. A captured photo stays in this page’s memory and is discarded when you leave.</p>
        {photo ? <img src={photo} alt="Your temporary selfie preview" className="aspect-square w-full rounded-lg object-cover" /> : camera === 'live' ? <video ref={video} autoPlay playsInline muted aria-label="Live camera preview" className="aspect-square w-full -scale-x-100 rounded-lg bg-ink object-cover" /> : <div className="grid min-h-44 place-items-center rounded-lg bg-brand-50 p-5 text-center text-brand-800"><Camera size={40} aria-hidden /><p>{camera === 'starting' ? 'Waiting for camera permission…' : 'Camera is off. No photo has been captured.'}</p></div>}
        {camera === 'live' ? <Button block onClick={snap}>Snap selfie</Button> : <Button block disabled={camera === 'starting'} onClick={() => void openCamera()}>{photo ? <><RefreshCw size={16} /> Retake selfie</> : camera === 'error' ? 'Try camera again' : 'Open camera'}</Button>}
        {photo && <Button block onClick={proceed}>Use this photo for the demo</Button>}
        <Button block variant="ghost" onClick={() => { setPhoto(null); proceed() }}>Skip selfie — continue demo</Button>
        <Button block variant="ghost" onClick={() => { stop(); setPhoto(null); setCamera('off'); setError(''); setStep('id') }}>Back to ID format</Button>
      </div>}
      {step === 'processing' && <div className="space-y-4 py-10 text-center">
        <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold">Showing the demo sequence</h2>
        <p role="status">Simulated processing — no biometric analysis is taking place.</p>
        <div className="h-2 overflow-hidden rounded bg-line"><div className="h-full animate-progress-fill bg-brand-600" /></div>
      </div>}
      {step === 'success' && <div className="space-y-4">
        <CircleCheck size={36} className="text-brand-700" aria-hidden />
        <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold">Demo completed</h2>
        <p className="font-medium">ID format checked · {photo ? 'selfie captured locally' : 'selfie skipped'}</p>
        <p className="text-sm text-muted">Your identity has not been verified. No public badge, account permission or saved verification record has been created.</p>
        <Button block onClick={() => { const captured = Boolean(photo); setPhoto(null); onComplete({ status: 'demo_completed', simulated: true, idFormatChecked: true, selfieCaptured: captured }) }}>Continue to job board</Button>
      </div>}
      {error && <p id="identity-error" role="alert" className="mt-4 text-sm font-medium text-clay-700">{error}</p>}
    </div>
    <p className="border-t border-line p-4 text-xs text-muted">Optional device-only demo. No ID number, birth date or selfie is uploaded or saved. Leaving this page clears the demo. You can use KashWise without completing it.</p>
  </section>
}
