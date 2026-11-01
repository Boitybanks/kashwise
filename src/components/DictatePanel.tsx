import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Sparkles, Undo2, Volume2, VolumeX, WandSparkles } from 'lucide-react'
import { requestDictation } from '../lib/api'
import type { DictationDraft, DictationKind, DictationResult } from '../lib/dictation'
import { friendlyError } from '../lib/errors'
import { SPEECH_LANGUAGES, useDictation, useReadAloud } from '../lib/speech'
import { Button } from './ui'

interface DictatePanelProps<K extends DictationKind> {
  kind: K
  title: string
  subtitle: string
  placeholder: string
  action: string
  /** Puts the draft into the form and returns how to put the form back. */
  onDraft: (draft: DictationDraft[K]) => () => void
  /** What to read back aloud so the person can check it. */
  readBack: (draft: DictationDraft[K]) => string
  /** One-line summary of what still needs doing after the draft arrives. */
  afterDraft?: (draft: DictationDraft[K]) => string | null
}

/** Say it, in your own words and language. KashWise writes it, you check it. Nothing is saved until you press save. */
export function DictatePanel<K extends DictationKind>({ kind, title, subtitle, placeholder, action, onDraft, readBack, afterDraft }: DictatePanelProps<K>) {
  const [language, setLanguage] = useState('en-ZA')
  const speech = useDictation(language)
  const voice = useReadAloud()
  const [useAi, setUseAi] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<DictationResult<K> | null>(null)
  const undo = useRef<(() => void) | null>(null)
  const seconds = useElapsed(speech.listening)

  async function write() {
    if (speech.listening) speech.stop()
    setBusy(true)
    setError('')
    try {
      const next = await requestDictation(kind, speech.transcript, useAi)
      undo.current = onDraft(next.draft)
      setResult(next)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  function restore() {
    undo.current?.()
    undo.current = null
    setResult(null)
  }

  const note = result && afterDraft?.(result.draft)

  return (
    <section aria-labelledby={`dictate-${kind}-h`} className="dictate-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="eyebrow">SPEAK IT. KASHWISE WRITES IT.</p>
          <h2 id={`dictate-${kind}-h`} className="mt-1 text-xl font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>
        </div>
        {speech.supported && (
          <div>
            <label htmlFor={`dictate-${kind}-language`} className="sr-only">Language you will speak</label>
            <select id={`dictate-${kind}-language`} className="input w-auto py-2 text-sm" value={language} disabled={speech.listening} onChange={(e) => setLanguage(e.target.value)}>
              {SPEECH_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-start gap-3">
        {speech.supported && (
          <button
            type="button"
            onClick={speech.listening ? speech.stop : speech.start}
            aria-pressed={speech.listening}
            aria-label={speech.listening ? 'Stop listening' : 'Start speaking'}
            className={`dictate-mic ${speech.listening ? 'is-listening' : ''}`}
          >
            {speech.listening ? <Square className="size-5 fill-current" aria-hidden /> : <Mic className="size-6" aria-hidden />}
          </button>
        )}
        <div className="min-w-0 flex-1">
          <label htmlFor={`dictate-${kind}-text`} className="sr-only">What you said</label>
          <textarea
            id={`dictate-${kind}-text`}
            rows={3}
            maxLength={2000}
            className="input"
            placeholder={speech.supported ? placeholder : `Type it in your own words. ${placeholder}`}
            value={speech.transcript}
            onChange={(e) => speech.setTranscript(e.target.value)}
          />
          <p aria-live="polite" className="mt-1.5 min-h-5 text-xs text-muted">
            {speech.listening ? `Listening… ${seconds}s. Tap the square when you are done.` : speech.supported ? 'Tap the microphone and talk, or type. You can fix any words here first.' : 'Voice is not available in this browser, so type instead.'}
          </p>
        </div>
      </div>

      {(speech.error || error) && <p role="alert" className="mt-2 rounded-md bg-clay-50 px-3 py-2 text-sm text-clay-700">{speech.error || error}</p>}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex max-w-md items-start gap-2 text-xs text-muted">
          <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
          <span>Let AI write it. What you say goes to Anthropic to be written up, and voice goes through your browser’s speech service. Don’t say private details.</span>
        </label>
        <Button size="sm" loading={busy} disabled={speech.transcript.trim().length < 3} onClick={write}>
          <WandSparkles className="size-4" aria-hidden /> {action}
        </Button>
      </div>

      {result && (
        <div role="status" className="dictate-result">
          <p className="flex items-start gap-2 text-sm">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-gold-600" aria-hidden />
            <span>
              <strong>{result.written_by === 'ai' ? 'Written by KashWise AI.' : 'Tidied up by KashWise.'}</strong>{' '}
              {result.written_by === 'ai' ? 'It only used what you said. Check it says what you meant.' : `${useAi && !result.ai_available ? 'AI writing isn’t switched on yet, so we ' : 'We '}kept to your own words. Check it says what you meant.`}
              {note ? ` ${note}` : ''}
            </span>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {voice.supported && (
              <Button size="sm" variant="secondary" onClick={() => voice.toggle(readBack(result.draft))}>
                {voice.speaking ? <VolumeX className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />} {voice.speaking ? 'Stop' : 'Read it to me'}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={restore}><Undo2 className="size-4" aria-hidden /> Undo</Button>
          </div>
        </div>
      )}
    </section>
  )
}

function useElapsed(running: boolean): number {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!running) return
    const started = Date.now()
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => {
      window.clearInterval(timer)
      setSeconds(0)
    }
  }, [running])
  return seconds
}
