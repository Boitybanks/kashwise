import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, ShieldCheck } from 'lucide-react'
import { fetchClientActivity } from '../../lib/api'
import { avatarUrl } from '../../lib/supabase'
import { Avatar } from '../ui'

/** What a provider sees about the client before applying: their track record, and the one rule that stops most scams. */
export function ClientTrack({ client }: { client: { id: string; display_name: string; avatar_path: string | null } }) {
  const q = useQuery({ queryKey: ['client-activity', client.id], queryFn: () => fetchClientActivity(client.id) })
  const reviews = q.data?.reviews ?? []
  const avg = reviews.length ? (reviews.reduce((a, r) => a + r.rating, 0) / reviews.length).toFixed(1) : null
  const record = q.isPending ? '…' : reviews.length ? `Hired and reviewed ${reviews.length} provider${reviews.length === 1 ? '' : 's'} · gives ${avg}★ on average` : 'New client'
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface">
      <Link to={`/w/${client.id}`} className="group flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-surface-elevated">
        <Avatar name={client.display_name} id={client.id} src={avatarUrl(client.avatar_path)} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold group-hover:text-brand-400">{client.display_name}</span>
          <span className="block text-xs text-muted">{record}</span>
        </span>
        <ChevronRight className="size-4 text-muted" aria-hidden />
      </Link>
      <p className="flex items-center gap-2 border-t border-line bg-canvas px-4 py-2.5 text-xs text-ink-soft">
        <ShieldCheck className="size-4 shrink-0 text-brand-500" aria-hidden />
        Payment is held once you’re chosen. Never pay anyone to get a job.
      </p>
    </div>
  )
}
