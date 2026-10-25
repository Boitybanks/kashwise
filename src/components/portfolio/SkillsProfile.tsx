import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, Quote, RefreshCw, Share2, Sparkles, Trash2 } from 'lucide-react'
import { deleteSkillsProfile, fetchSkillsProfile, writeSkillsProfile } from '../../lib/api'
import { friendlyError } from '../../lib/errors'
import { formatDate } from '../../lib/format'
import { isOutOfDate } from '../../lib/skills-profile'
import { verifySigned } from '../../lib/pq/verify-client'
import { Badge, Button, Card, DemoBadge } from '../ui'
import { useToast } from '../ui/toast'

/**
 * A worker's skills profile, written only from customer-confirmed records and signed by KashWise.
 * Shown to everyone only when its signature verifies in the browser, so a hand-made profile never appears.
 */
export function SkillsProfile({ workerId, first, isOwner, codes }: { workerId: string; first: string; isOwner: boolean; codes: string[] }) {
  const qc = useQueryClient()
  const toast = useToast()
  const q = useQuery({ queryKey: ['skills-profile', workerId], queryFn: () => fetchSkillsProfile(workerId) })
  const signed = q.data?.signed
  const verified = useQuery({
    queryKey: ['skills-profile-verified', workerId, q.data?.created_at],
    queryFn: () => verifySigned(signed!),
    enabled: Boolean(signed),
    staleTime: Infinity,
  })
  const [useAi, setUseAi] = useState(true)
  const [busy, setBusy] = useState<'write' | 'remove' | null>(null)

  const p = signed?.credential
  const genuine = Boolean(p && verified.data === true && p.worker.id === workerId && p.type === 'SideGigsSkillsProfile')
  if (!isOwner && !genuine) return null
  if (isOwner && codes.length === 0 && !p) return null

  async function write() {
    setBusy('write')
    try {
      const res = await writeSkillsProfile(useAi)
      await qc.invalidateQueries({ queryKey: ['skills-profile', workerId] })
      toast.show(
        useAi && !res.aiAvailable
          ? 'AI writing isn’t switched on yet, so KashWise wrote a factual summary from your jobs instead.'
          : useAi && !res.aiUsed
            ? 'The AI couldn’t back its wording with your records, so KashWise wrote a factual summary instead.'
            : 'Your skills profile is ready.',
      )
    } catch (e) {
      toast.show(friendlyError(e), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function remove() {
    setBusy('remove')
    try {
      await deleteSkillsProfile()
      await qc.invalidateQueries({ queryKey: ['skills-profile', workerId] })
      toast.show('Your skills profile was removed.')
    } catch (e) {
      toast.show(friendlyError(e), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function share() {
    const url = `${window.location.origin}/w/${workerId}#skills-profile`
    try {
      if (navigator.share) await navigator.share({ title: `${first}’s skills on KashWise`, url })
      else {
        await navigator.clipboard.writeText(url)
        toast.show('Link copied. Share it like a business card.')
      }
    } catch {
      // the share sheet was closed
    }
  }

  const outOfDate = genuine && p ? isOutOfDate(p, codes) : false

  const ownerControls = isOwner && (
    <div className="mt-4 space-y-3 border-t border-line pt-4">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1 size-4 accent-brand-600" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
        <span>
          <strong>AI summary.</strong> Generates a professional summary from your completed jobs and reviews. No private contact details are shared.

        </span>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" loading={busy === 'write'} disabled={busy !== null || codes.length === 0} onClick={write}>
          {p ? <><RefreshCw className="size-4" aria-hidden /> Update my skills profile</> : <><Sparkles className="size-4" aria-hidden /> Write my skills profile</>}
        </Button>
        {genuine && <Button size="sm" variant="secondary" onClick={share}><Share2 className="size-4" aria-hidden /> Share</Button>}
        {p && (
          <Button size="sm" variant="ghost" loading={busy === 'remove'} disabled={busy !== null} onClick={remove}>
            <Trash2 className="size-4" aria-hidden /> Remove
          </Button>
        )}
      </div>
    </div>
  )

  if (!genuine || !p) {
    return (
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold"><Sparkles className="size-5 text-brand-600" aria-hidden /> Your skills profile</h2>
        <p className="mt-1 text-sm text-muted">
          {p
            ? 'Your saved profile could not be verified. Write it again to get a signed copy.'
            : 'A professional summary of your proven skills, verified directly from confirmed jobs. Share it with clients.'}
        </p>
        {ownerControls}
      </Card>
    )
  }

  return (
    <Card className="scroll-mt-24 p-5">
      <section id="skills-profile" aria-labelledby="skills-profile-h">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="skills-profile-h" className="text-lg font-bold">Skills profile</h2>
          <Badge tone={p.written_by === 'ai' ? 'sun' : 'brand'}>{p.written_by === 'ai' ? 'Written by KashWise AI' : 'Summarised by KashWise'}</Badge>
          {p.demo_data && <DemoBadge />}
        </div>
        <p className="mt-2 text-ink-soft">{p.summary}</p>

        <ul className="mt-4 space-y-2" aria-label="Proven skills">
          {p.skills.map((s) => (
            <li key={s.name} className="rounded-xl border border-line p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-bold">{s.name}</p>
                <p className="shrink-0 text-xs font-semibold text-brand-700">{s.jobs} confirmed {s.jobs === 1 ? 'job' : 'jobs'}</p>
              </div>
              <p className="mt-0.5 text-sm text-muted">
                {s.evidence.slice(0, 3).map((code, i) => (
                  <span key={code}>
                    {i > 0 && ' · '}
                    <a href={`#${code}`} className="underline decoration-line underline-offset-2 hover:text-brand-700">{s.examples[i] ?? code}</a>
                  </span>
                ))}
              </p>
            </li>
          ))}
        </ul>

        {p.habits.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-bold">What customers say</h3>
            <ul className="mt-2 space-y-2">
              {p.habits.map((h) => (
                <li key={h.label} className="flex gap-2 text-sm">
                  <Quote className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
                  <span><strong>{h.label}.</strong> “{h.quote}” <a href={`#${h.record}`} className="text-muted underline underline-offset-2">{h.customer}</a></span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-4 flex items-start gap-2 text-xs text-muted">
          <BadgeCheck className="size-4 shrink-0 text-brand-600" aria-hidden />
          <span>
            Built from {p.based_on.records} customer-confirmed {p.based_on.records === 1 ? 'job' : 'jobs'} · Signed {formatDate(p.issued_at)}.
            {p.written_by === 'ai' ? ' Phrased by AI from confirmed work and reviews.' : ''}
            {outOfDate ? ` ${isOwner ? 'You have' : `${first} has`} newer jobs than this profile.` : ''}
          </span>
        </p>
      </section>
      {ownerControls}
    </Card>
  )
}
