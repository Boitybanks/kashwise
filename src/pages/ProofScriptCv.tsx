import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, BadgeCheck, Download, ShieldCheck, Star } from 'lucide-react'
import { fetchProfile, fetchSkillsProfile, fetchWorkCredential } from '../lib/api'
import { categoryLabel } from '../lib/categories'
import { friendlyError } from '../lib/errors'
import { formatDate, formatMonthYear } from '../lib/format'
import { cvFacts, cvSkills, cvSummary } from '../lib/proofscript-cv'
import { verifySigned } from '../lib/pq/verify-client'
import { LogoMark } from '../components/layout/Logo'
import { Button, ErrorState, Skeleton } from '../components/ui'
import { QrCode } from '../components/ui/QrCode'
import { useToast } from '../components/ui/toast'
import NotFound from './NotFound'

/**
 * The ProofScript CV. Everything in it except the "own words" panel comes from the signed work history, and it only
 * appears once that signature verifies in this browser.
 */
export default function ProofScriptCv() {
  const { id = '' } = useParams()
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const profileQ = useQuery({ queryKey: ['profile', id], queryFn: () => fetchProfile(id) })
  const credentialQ = useQuery({ queryKey: ['work-credential', id], queryFn: () => fetchWorkCredential(id), staleTime: 300_000 })
  const signedProfileQ = useQuery({ queryKey: ['skills-profile', id], queryFn: () => fetchSkillsProfile(id) })
  const signed = credentialQ.data
  const verifiedQ = useQuery({ queryKey: ['cv-verified', id, signed?.signature], queryFn: () => verifySigned(signed!), enabled: Boolean(signed), staleTime: Infinity })
  const skillsDoc = signedProfileQ.data?.signed
  const skillsVerifiedQ = useQuery({ queryKey: ['skills-profile-verified', id, signedProfileQ.data?.created_at], queryFn: () => verifySigned(skillsDoc!), enabled: Boolean(skillsDoc), staleTime: Infinity })

  const credential = signed?.credential
  const genuine = Boolean(credential && verifiedQ.data === true && credential.worker.id === id && credential.type === 'SideGigsWorkHistory')
  // A signed skills profile is used only if it verifies and belongs to this person.
  const skillsProfile = skillsVerifiedQ.data === true && skillsDoc?.credential.worker.id === id ? skillsDoc.credential : null

  useEffect(() => {
    if (!credential) return
    const previous = document.title
    document.title = `${credential.worker.name} - Verified CV`
    return () => { document.title = previous }
  }, [credential])

  const content = useMemo(() => (credential ? { summary: cvSummary(credential, skillsProfile), skills: cvSkills(credential, skillsProfile), facts: cvFacts(credential) } : null), [credential, skillsProfile])

  if (profileQ.isPending || credentialQ.isPending || (signed && verifiedQ.isPending)) {
    return <div className="mx-auto max-w-[210mm]"><Skeleton className="h-[80vh]" /></div>
  }
  if (credentialQ.isError) return <ErrorState error={credentialQ.error} onRetry={() => credentialQ.refetch()} />
  if (!profileQ.data || !credential) return <NotFound what="profile" />
  if (!genuine || !content) {
    return (
      <div role="alert" className="card mx-auto max-w-xl p-6 text-center">
        <ShieldCheck className="mx-auto size-7 text-clay-600" aria-hidden />
        <h1 className="mt-2 text-xl font-semibold">This record could not be verified</h1>
      </div>
    )
  }

  const p = profileQ.data
  const w = credential.worker
  const first = w.name.split(' ')[0]
  const url = `${window.location.origin}/w/${w.id}/cv`

  async function savePdf() {
    setSaving(true)
    try {
      const { buildCvPdf, downloadPdf } = await import('../lib/cv-pdf')
      const bytes = await buildCvPdf({ credential: credential!, summary: content!.summary, skills: content!.skills, facts: content!.facts, headline: p.headline, bio: p.bio, url })
      downloadPdf(bytes, `${w.name.replace(/[^a-zA-Z0-9]+/g, '-')}-Verified-CV.pdf`)
    } catch (e) {
      toast.show(friendlyError(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-[210mm]">
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Link to={`/w/${w.id}`} className="mr-auto inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-brand-500"><ArrowLeft className="size-4" aria-hidden /> {first}’s ProofScript</Link>
        <Button size="sm" loading={saving} onClick={savePdf}><Download className="size-4" aria-hidden /> Download CV (PDF)</Button>
      </div>

      <article aria-labelledby="cv-name" className="cv-sheet">
        <header className="cv-masthead">
          <div className="flex items-center gap-2.5">
            <LogoMark className="size-8" />
            <p className="cv-brand">KashWise <span>ProofScript</span></p>
          </div>
          <div className="cv-seal"><BadgeCheck className="size-4" aria-hidden /> Verified by KashWise</div>
        </header>

        <section className="cv-identity" aria-label="Who this record belongs to">
          <div className="min-w-0">
            <p className="cv-kicker">Verified work record</p>
            <h1 id="cv-name" className="cv-name">{w.name}</h1>
            {content.skills.length > 0 && <p className="cv-headline">{content.skills.slice(0, 3).map((s) => s.name).join(' · ')}</p>}
            <p className="cv-meta">{w.area} · On KashWise since {formatMonthYear(w.member_since)}</p>
          </div>
          <div className="cv-qr">
            <QrCode value={url} label={`QR code that opens the live, verified copy of ${first}’s record`} className="size-24" />
            <p>Scan to check it live</p>
          </div>
        </section>

        <dl className="cv-facts" aria-label="Record at a glance">
          {content.facts.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}
        </dl>

        <section className="cv-section" aria-labelledby="cv-summary-h">
          <h2 id="cv-summary-h">Professional summary</h2>
          <p className="cv-lede">{content.summary}</p>
        </section>

        <section className="cv-section" aria-labelledby="cv-skills-h">
          <h2 id="cv-skills-h">Proven skills</h2>
          <p className="cv-source">Every skill here comes from jobs customers confirmed.</p>
          <table className="cv-table">
            <thead><tr><th scope="col">Skill</th><th scope="col" className="text-right">Confirmed jobs</th><th scope="col">Recent work</th></tr></thead>
            <tbody>
              {content.skills.map((s) => (
                <tr key={s.name}>
                  <th scope="row">{s.name}</th>
                  <td className="text-right tabular-nums">{s.jobs}</td>
                  <td className="cv-examples">{s.examples.slice(0, 2).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="cv-section" aria-labelledby="cv-history-h">
          <h2 id="cv-history-h">Work history</h2>
          {credential.records.length === 0 ? <p className="cv-source">No confirmed jobs yet.</p> : (
            <ol className="cv-history">
              {credential.records.map((r) => (
                <li key={r.code}>
                  <p className="cv-history-date">{formatMonthYear(r.completed_at)}</p>
                  <div className="min-w-0">
                    <h3>{r.title}</h3>
                    <p className="cv-history-meta">{categoryLabel(r.category)} · {r.area} · for {r.customer}</p>
                    {r.review && <blockquote>“{r.review}”</blockquote>}
                    <p className="cv-history-proof">
                      <BadgeCheck className="size-3.5" aria-hidden /> Confirmed by customer {formatDate(r.completed_at)}
                      {r.rating != null && <span className="inline-flex items-center gap-0.5"> · <Star className="size-3 fill-gold-500 text-gold-500" aria-hidden />{r.rating}/5</span>}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        {(p.bio || p.headline) && (
          <section className="cv-section cv-own-words" aria-labelledby="cv-words-h">
            <h2 id="cv-words-h">In {first}’s own words</h2>
            {p.headline && <p className="font-semibold">{p.headline}</p>}
            {p.bio && <p>{p.bio}</p>}
            <p className="cv-source">Written by {first}.</p>
          </section>
        )}

        <footer className="cv-footer">
          <p>“Verified” means the customer confirmed the job was done. It is not an identity or qualification check.</p>
          <p>Issued {formatDate(credential.issued_at)}.{credential.demo_data ? ' Sample profile.' : ''}</p>
        </footer>
      </article>
    </div>
  )
}
