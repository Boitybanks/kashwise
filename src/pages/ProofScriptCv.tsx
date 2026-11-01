import { useEffect, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, BadgeCheck, Download, Printer, ShieldCheck, Star } from 'lucide-react'
import { fetchProfile, fetchSkillsProfile, fetchWorkCredential } from '../lib/api'
import { categoryLabel } from '../lib/categories'
import { formatDate, formatMonthYear } from '../lib/format'
import { cvFacts, cvReference, cvSkills, cvSummary } from '../lib/proofscript-cv'
import { downloadSigned, verifySigned } from '../lib/pq/verify-client'
import { LogoMark } from '../components/layout/Logo'
import { Button, DemoBadge, ErrorState, Skeleton } from '../components/ui'
import { QrCode } from '../components/ui/QrCode'
import NotFound from './NotFound'

/**
 * The ProofScript CV: a formal, printable record of someone's work. Everything in it except the labelled "own words"
 * panel comes from the signed work history, and it only appears once that signature verifies in this browser.
 */
export default function ProofScriptCv() {
  const { id = '' } = useParams()
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
    // Browsers name the saved PDF after the page title.
    document.title = `${credential.worker.name} - ProofScript verified work record`
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
        <p className="mt-1 text-sm text-ink-soft">KashWise only shows a ProofScript document when its signature checks out. Please try again, or contact the person who shared it.</p>
      </div>
    )
  }

  const p = profileQ.data
  const w = credential.worker
  const first = w.name.split(' ')[0]
  const reference = cvReference(signed!.signature, w.id)
  const url = `${window.location.origin}/w/${w.id}/cv`

  return (
    <div className="mx-auto max-w-[210mm]">
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Link to={`/w/${w.id}`} className="mr-auto inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-brand-700"><ArrowLeft className="size-4" aria-hidden /> {first}’s ProofScript</Link>
        <Button variant="secondary" size="sm" onClick={() => downloadSigned(signed, `kashwise-proofscript-${reference}.json`)}><Download className="size-4" aria-hidden /> Signed copy</Button>
        <Button size="sm" onClick={() => window.print()}><Printer className="size-4" aria-hidden /> Save as PDF</Button>
      </div>

      <article aria-labelledby="cv-name" className="cv-sheet">
        {credential.demo_data && <div role="note" className="cv-demo">Demonstration data. This person and these jobs are fictional, for showing how KashWise works.</div>}

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
            <h1 id="cv-name" className="cv-name">{w.name}{credential.demo_data && <span className="ml-3 align-middle print:hidden"><DemoBadge /></span>}</h1>
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
          <p className="cv-source">{skillsProfile?.written_by === 'ai' ? 'Phrased by AI from the confirmed jobs below, then signed by KashWise.' : 'Assembled by KashWise from the confirmed jobs below.'}</p>
        </section>

        <section className="cv-section" aria-labelledby="cv-skills-h">
          <h2 id="cv-skills-h">Proven skills</h2>
          <p className="cv-source">Not self-declared. A skill appears here only when a paying customer confirmed a job that used it.</p>
          <table className="cv-table">
            <thead><tr><th scope="col">Skill</th><th scope="col" className="text-right">Confirmed jobs</th><th scope="col">Evidence</th></tr></thead>
            <tbody>
              {content.skills.map((s) => (
                <tr key={s.name}>
                  <th scope="row">{s.name}</th>
                  <td className="text-right tabular-nums">{s.jobs}</td>
                  <td><span className="cv-codes">{s.evidence.slice(0, 3).join(' · ')}{s.evidence.length > 3 ? ` +${s.evidence.length - 3}` : ''}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="cv-section" aria-labelledby="cv-history-h">
          <h2 id="cv-history-h">Work history</h2>
          {credential.records.length === 0 ? <p className="cv-source">No customer-confirmed jobs on record yet.</p> : (
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
                      <span className="cv-codes"> · {r.code}</span>
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
            <p className="cv-source">Written by {first}. Not checked by KashWise. Rely on the confirmed jobs above.</p>
          </section>
        )}

        <footer className="cv-footer">
          <h2>How to rely on this record</h2>
          <p><strong>What “verified” means.</strong> The customer who hired {first} confirmed each job was done, in the app, after a code exchanged on site. It does not mean an identity, background or trade-qualification check, and {first} is an independent provider, not a KashWise employee.</p>
          <p><strong>How to check it.</strong> Scan the code above to see this record live, or upload the signed copy at {window.location.host}/verify. Any change to the record breaks the signature.</p>
          <p className="cv-signature">Reference {reference} · Issued {formatDate(credential.issued_at)} · Signed with ML-DSA-65 (NIST FIPS 204), key {signed!.kid}</p>
          <p className="cv-signature">Payments in this version of KashWise are simulated, so this record shows confirmed work, not proof of income. Contact {first} through KashWise.</p>
        </footer>
      </article>
    </div>
  )
}
