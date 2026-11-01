// What the ProofScript CV prints. All of it is derived from the signed work history (and a signed skills profile if the
// person has one), so nothing here can show a skill or a number the signed records do not contain.
import type { WorkCredential } from './pq/credential'
import { formatMonthYear } from './format'
import { summaryProfile, type ProfileSkill, type SkillsProfile } from './skills-profile'

export function cvSkills(credential: WorkCredential, signedProfile: SkillsProfile | null): ProfileSkill[] {
  const codes = new Set(credential.records.map((r) => r.code))
  // A profile written before newer jobs still only cites records in this history.
  const fromProfile = signedProfile?.skills
    .map((s) => ({ ...s, evidence: s.evidence.filter((c) => codes.has(c)) }))
    .filter((s) => s.evidence.length > 0)
    .map((s) => ({ ...s, jobs: s.evidence.length }))
  if (fromProfile?.length) return fromProfile
  return summaryProfile(credential.worker.name, credential.records, credential.summary.average_rating)?.skills ?? []
}

export function cvSummary(credential: WorkCredential, signedProfile: SkillsProfile | null): string {
  if (signedProfile?.summary) return signedProfile.summary
  const built = summaryProfile(credential.worker.name, credential.records, credential.summary.average_rating)
  return built?.summary ?? `${credential.worker.name.split(' ')[0]} has no customer-confirmed jobs on KashWise yet.`
}

export function cvFacts(credential: WorkCredential): { label: string; value: string }[] {
  const { records, summary } = credential
  const dates = records.map((r) => r.completed_at).sort()
  const span = dates.length ? (formatMonthYear(dates[0]) === formatMonthYear(dates[dates.length - 1]) ? formatMonthYear(dates[0]) : `${formatMonthYear(dates[0])} – ${formatMonthYear(dates[dates.length - 1])}`) : '—'
  return [
    { label: 'Customer-confirmed jobs', value: String(summary.completed_gigs) },
    { label: 'Average rating', value: summary.average_rating != null ? `${summary.average_rating} / 5` : '—' },
    { label: 'Repeat customers', value: String(summary.repeat_customers) },
    { label: 'Period of work', value: span },
  ]
}

/** A short reference for quoting over the phone. The signature itself is what proves the document. */
export function cvReference(signature: string, workerId: string): string {
  const tail = signature.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase()
  return `PS-${workerId.slice(0, 4).toUpperCase()}-${tail}`
}
