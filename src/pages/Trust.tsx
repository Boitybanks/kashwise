import { BadgeCheck, EyeOff, FileText, Fingerprint, Flag, IdCard, KeyRound, Lock, ScanLine, ShieldCheck, Wallet } from 'lucide-react'
import { ButtonLink, Card, PageHeader } from '../components/ui'

const sections = [
  {
    icon: EyeOff,
    title: 'Only your area is public',
    body: 'Profiles and gigs show an area (like “Soweto”), never a street address. Distances are between area centres.',
  },
  {
    icon: Lock,
    title: 'Experimental post-quantum protection for private details',
    body: 'Street addresses, access notes and phone numbers are encrypted on your device before they are saved, using the X-Wing hybrid construction (ML-KEM-768 + X25519) and AES-256-GCM. The database stores ciphertext for those fields, reducing what a database-only leak exposes. This is defence-in-depth, not a claim that the database or the whole app is “quantum encrypted”.',
  },
  {
    icon: KeyRound,
    title: 'Revealed only to your match — and logged',
    body: 'Decryption happens in a KashWise server function that checks, with your own login, that you are the customer or the chosen worker for that gig. Every reveal is written to the gig timeline.',
  },
  {
    icon: BadgeCheck,
    title: 'Reviews you can trust',
    body: 'Only the customer of a completed, confirmed gig can leave a review — one per gig. Portfolio records are created by KashWise at confirmation, never typed in by the worker.',
  },
  {
    icon: ShieldCheck,
    title: 'Quantum-resistant proof of work',
    body: 'Workers can download their history signed with ML-DSA-65 (NIST FIPS 204). Anyone can check it on the Verify page.',
  },
  {
    icon: Wallet,
    title: 'Payments are simulated in this version',
    body: 'The hackathon build shows how KashWise protection will work (held → released or refunded) but moves no real money. It is not a regulated escrow service.',
  },
  {
    icon: ScanLine,
    title: 'Jobs start and finish in person',
    body: 'The customer shows a one-time QR code when the worker arrives and another when the work is done. The worker scans each one to start and to finish the job, so both sides know the work really happened on site.',
  },
  {
    icon: IdCard,
    title: 'Your ID number and home address stay private',
    body: 'Everyone gives an SA ID number, the name on their ID, their gender and their home address when they sign up. The ID number, name and address are encrypted on your device before they are saved and are never shown on a profile. KashWise checks that an ID number is correctly formed; it does not check it with Home Affairs.',
  },
  {
    icon: Fingerprint,
    title: 'A private Work ID for every accepted job',
    body: 'When a customer accepts a worker, KashWise issues a Work ID (like SG-7KQ4-M2XP) that only those two people can see. Quote it when you call or message each other — if someone contacting you about a job can’t give it, don’t share your address or send money.',
  },
  {
    icon: FileText,
    title: 'Documents are shown as uploaded',
    body: 'Workers and customers can upload qualifications and other PDFs. KashWise does not check them. ID documents are always private to the person who uploaded them; other documents appear on a profile only if its owner chooses.',
  },
  {
    icon: Flag,
    title: 'Report anything',
    body: 'Every gig and profile has a report button. In an emergency call 10111 (SAPS) or 112 from a cellphone.',
  },
]

export default function Trust() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Trust & safety" subtitle="How KashWise protects workers and customers." />
      <div className="space-y-3">
        {sections.map((s) => (
          <Card key={s.title} className="flex gap-4 p-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><s.icon className="size-5" aria-hidden /></span>
            <div>
              <h2 className="font-bold">{s.title}</h2>
              <p className="mt-1 text-sm text-ink-soft">{s.body}</p>
            </div>
          </Card>
        ))}
      </div>
      <Card className="mt-6 p-5">
        <h2 className="font-semibold">Optional ID format & selfie demo</h2>
        <p className="mt-2 text-sm text-muted">This demonstration checks an ID number’s structure and checksum locally and optionally captures a temporary selfie. It does not check official records, identify anyone, match a face or detect liveness. No ID, birth date or photo is uploaded or saved, and no public badge is awarded. Use the sample details; completing this demo is never required to work or hire.</p>
        <ButtonLink to="/identity-demo" variant="secondary" className="mt-4">Try the identity demo</ButtonLink>
      </Card>
      <p className="mt-6 text-sm text-muted">
        What we don’t do yet: identity or background checks. No profile on KashWise is “ID verified” — “verified” always means a record of a
        customer-confirmed gig. Core security still depends on HTTPS, secure authentication, database row-level access rules, protected server
        secrets and audit logging; the post-quantum feature is an isolated experimental layer.
      </p>
    </div>
  )
}
