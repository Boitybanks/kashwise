import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Undo2, Volume2, VolumeX, WandSparkles } from 'lucide-react'
import { requestDictation } from '../lib/api'
import type { DictationDraft, DictationKind, DictationResult } from '../lib/dictation'
import { friendlyError } from '../lib/errors'
import { SPEECH_LANGUAGES, useDictation, useReadAloud } from '../lib/speech'
import { Button } from './ui'

interface DictatePanelProps<K extends DictationKind> {
  kind: K
  title: string
  placeholder: string
  action: string
  /** Puts the draft into the form and returns how to put the form back. */
  onDraft: (draft: DictationDraft[K]) => () => void
  /** What to read back aloud so the person can check it. */
  readBack: (draft: DictationDraft[K]) => string
  /** Called when the person undoes a draft. */
  onUndo?: () => void
}

/** Say it in your own words and language. KashWise writes it, you edit it. Nothing is saved until you press save. */
export function DictatePanel<K extends DictationKind>({ kind, title, placeholder, action, onDraft, readBack, onUndo }: DictatePanelProps<K>) {
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
    onUndo?.()
  }

  return (
    <section aria-labelledby={`dictate-${kind}-h`} className="dictate-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`dictate-${kind}-h`} className="text-xl font-semibold">{title}</h2>
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
            placeholder={placeholder}
            value={speech.transcript}
            onChange={(e) => speech.setTranscript(e.target.value)}
          />
          {speech.listening && <p aria-live="polite" className="mt-1.5 text-xs text-muted">Listening… {seconds}s</p>}
        </div>
      </div>

      {(speech.error || error) && <p role="alert" className="mt-2 rounded-md bg-clay-50 px-3 py-2 text-sm text-clay-700">{speech.error || error}</p>}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-start gap-2 text-xs text-muted">
          <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
          <span>Write it with AI. Your words go to our AI and speech providers.</span>
        </label>
        <Button size="sm" loading={busy} disabled={speech.transcript.trim().length < 3} onClick={write}>
          <WandSparkles className="size-4" aria-hidden /> {action}
        </Button>
      </div>

      {result && (
        <div role="status" className="dictate-result">
          {useAi && result.written_by === 'rules' && <p className="mb-2 text-sm text-sun-700">AI is unavailable right now, so this is a basic draft.</p>}
          <div className="flex flex-wrap gap-2">
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
