import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

const DISMISS_KEY = 'kw-install-dismissed'
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

function wasDismissed() {
  try { return sessionStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
}

/** Shows an "Install KashWise" banner each visit until the app is installed. */
export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null)
  const ios = isIos()
  const [show, setShow] = useState(() => ios && !isStandalone() && !wasDismissed())

  useEffect(() => {
    if (isStandalone() || wasDismissed()) return
    const onPrompt = (e: Event) => { e.preventDefault(); setEvent(e as InstallEvent); setShow(true) }
    const onInstalled = () => setShow(false)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled) }
  }, [ios])

  if (!show) return null

  const dismiss = () => {
    setShow(false)
    try { sessionStorage.setItem(DISMISS_KEY, '1') } catch { /* private mode */ }
  }
  const install = async () => {
    if (!event) return
    await event.prompt()
    await event.userChoice
    setEvent(null)
    setShow(false)
  }

  return (
    <div role="dialog" aria-label="Install KashWise" className="fixed inset-x-3 bottom-20 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-lg md:bottom-4">
      <img src="/icon-192.png" alt="" className="size-10 rounded-xl" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">Install KashWise</p>
        <p className="text-muted">{ios ? 'Tap Share, then “Add to Home Screen”.' : 'Open it from your home screen.'}</p>
      </div>
      {!ios && (
        <button type="button" onClick={install} className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-3 py-2 text-sm font-semibold text-white">
          <Download className="size-4" aria-hidden /> Install
        </button>
      )}
      <button type="button" onClick={dismiss} aria-label="Not now" className="rounded-full p-1 text-muted">
        <X className="size-4" aria-hidden />
      </button>
    </div>
  )
}
