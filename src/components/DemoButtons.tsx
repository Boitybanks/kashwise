import { Link } from 'react-router-dom'
import { PlayCircle } from 'lucide-react'

export function DemoButtons() {
  return (
    <Link
      to="/welcome#how-it-works"
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-brand-400 transition hover:border-brand-200"
    >
      <PlayCircle className="size-4 text-brand-500" aria-hidden />
      Watch how KashWise works
    </Link>
  )
}
