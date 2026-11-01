import { useCallback, useEffect, useRef, useState } from 'react'

// The browser's own speech recognition (Chrome and Edge send the audio to their speech service; Safari may use the device).
// No audio reaches KashWise. Browsers without it fall back to typing.
interface RecognitionResult { isFinal: boolean; 0: { transcript: string } }
interface RecognitionEvent { results: ArrayLike<RecognitionResult> }
interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type RecognitionCtor = new () => Recognition

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const SPEECH_LANGUAGES = [
  { code: 'en-ZA', label: 'English' },
  { code: 'zu-ZA', label: 'isiZulu' },
  { code: 'xh-ZA', label: 'isiXhosa' },
  { code: 'af-ZA', label: 'Afrikaans' },
  { code: 'st-ZA', label: 'Sesotho' },
  { code: 'tn-ZA', label: 'Setswana' },
] as const

const SPEECH_ERRORS: Record<string, string> = {
  'not-allowed': 'Your browser blocked the microphone. Allow it for this site, or type instead.',
  'service-not-allowed': 'Your browser blocked the microphone. Allow it for this site, or type instead.',
  'audio-capture': 'No microphone was found. You can type instead.',
  network: 'The speech service could not be reached. Check your connection, or type instead.',
  'language-not-supported': 'Your browser cannot listen in this language yet. Try English, or type instead.',
}

/** Live dictation. `transcript` holds everything said so far and stays editable by the caller through setTranscript. */
export function useDictation(language: string) {
  const supported = Boolean(recognitionCtor())
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState('')
  const recognition = useRef<Recognition | null>(null)
  const wantListening = useRef(false)
  const base = useRef('')
  const runRef = useRef<() => void>(() => {})

  useEffect(() => () => {
    wantListening.current = false
    recognition.current?.abort()
  }, [])

  const run = useCallback(() => {
    const Ctor = recognitionCtor()
    if (!Ctor) return
    const r = new Ctor()
    // Android Chrome repeats phrases in continuous mode, so there each phrase is its own session, restarted below.
    r.continuous = !/Android/i.test(navigator.userAgent)
    r.interimResults = true
    r.lang = language
    r.onresult = (e) => {
      const heard = Array.from(e.results).map((x) => x[0].transcript).join(' ').replace(/\s+/g, ' ').trim()
      setTranscript([base.current, heard].filter(Boolean).join(' '))
    }
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      wantListening.current = false
      setError(SPEECH_ERRORS[e.error] ?? 'Listening stopped. Please try again, or type instead.')
    }
    r.onend = () => {
      if (wantListening.current) {
        setTranscript((current) => { base.current = current; return current })
        runRef.current()
      } else setListening(false)
    }
    recognition.current = r
    r.start()
  }, [language])

  useEffect(() => {
    runRef.current = run
  }, [run])

  const start = useCallback(() => {
    setError('')
    setTranscript((current) => { base.current = current; return current })
    wantListening.current = true
    setListening(true)
    try {
      run()
    } catch {
      wantListening.current = false
      setListening(false)
      setError('Listening could not start. Please try again, or type instead.')
    }
  }, [run])

  const stop = useCallback(() => {
    wantListening.current = false
    recognition.current?.stop()
  }, [])

  return { supported, listening, transcript, setTranscript, error, start, stop }
}

/** Reads a draft aloud, so someone who does not read easily can check what was written for them before using it. */
export function useReadAloud() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const [speaking, setSpeaking] = useState(false)
  useEffect(() => () => { if (supported) window.speechSynthesis.cancel() }, [supported])
  const toggle = useCallback((text: string) => {
    if (!supported) return
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel()
      setSpeaking(false)
      return
    }
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'en-ZA'
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    setSpeaking(true)
    window.speechSynthesis.speak(utterance)
  }, [supported])
  return { supported, speaking, toggle }
}
