import { Compass } from 'lucide-react'
import { ButtonLink, EmptyState } from '../components/ui'

export default function NotFound({ what = 'page', hint }: { what?: string; hint?: string }) {
  return (
    <div className="mx-auto max-w-md py-8">
      <EmptyState
        icon={<Compass className="size-5" aria-hidden />}
        title={`We couldn’t find that ${what}`}
        action={<ButtonLink to="/">Go to KashWise home</ButtonLink>}
      >
        {hint ?? 'The link may be broken or the page may have moved.'}
      </EmptyState>
    </div>
  )
}
