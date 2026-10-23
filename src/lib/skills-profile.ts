// A worker's skills profile: written only from customer-confirmed records, signed by KashWise like the work history.
// The AI may phrase it, but every skill must cite the records that prove it and every habit must quote a customer's
// review word for word. Anything it cannot back with evidence is dropped here, before signing.
import { z } from 'zod'
import { categoryLabel } from './categories'
import type { CredentialRecord } from './pq/credential'

export interface ProfileSkill {
  name: string
  jobs: number
  evidence: string[]
  examples: string[]
}

export interface ProfileHabit {
  label: string
  quote: string
  customer: string
  record: string
}

export interface SkillsProfile {
  type: 'SideGigsSkillsProfile'
  version: 1
  issuer: 'SideGigs'
  issued_at: string
  /** 'ai' = phrased by Claude from the records; 'summary' = assembled by KashWise without AI. */
  written_by: 'ai' | 'summary'
  model: string | null
  demo_data: boolean
  worker: { id: string; name: string; area: string }
  based_on: { records: number; codes: string[]; average_rating: number | null }
  summary: string
  skills: ProfileSkill[]
  habits: ProfileHabit[]
  profile_url: string
}

export type ProfileContent = Pick<SkillsProfile, 'summary' | 'skills' | 'habits'>

/** What the model returns. Job counts and examples are recomputed from the cited records, never taken from the model. */
export const aiProfileSchema = z.object({
  summary: z.string(),
  skills: z.array(z.object({ name: z.string(), evidence: z.array(z.string()) })),
  habits: z.array(z.object({ label: z.string(), quote: z.string(), record: z.string() })),
})
export type AiProfile = z.infer<typeof aiProfileSchema>

export const MAX_SKILLS = 6
export const MAX_HABITS = 5
export const REFRESH_MINUTES = 10

const clean = (s: string, max: number) => s.replace(/\s+/g, ' ').trim().slice(0, max)
const normalize = (s: string) =>
  s.toLowerCase().replace(/[‘’`]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim()
const stripQuotes = (s: string) => s.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim()

/** Keep only what the records prove; returns null when nothing usable is left. */
export function bindToEvidence(ai: AiProfile, records: CredentialRecord[]): ProfileContent | null {
  const byCode = new Map(records.map((r) => [r.code, r]))
  const skills: ProfileSkill[] = []
  for (const s of ai.skills) {
    const name = clean(s.name, 40)
    const evidence = [...new Set(s.evidence.map((c) => c.trim()).filter((c) => byCode.has(c)))]
    if (!name || evidence.length === 0 || skills.some((x) => normalize(x.name) === normalize(name))) continue
    skills.push({ name, jobs: evidence.length, evidence, examples: evidence.slice(0, 3).map((c) => byCode.get(c)!.title) })
    if (skills.length === MAX_SKILLS) break
  }
  const habits: ProfileHabit[] = []
  for (const h of ai.habits) {
    const record = byCode.get(h.record.trim())
    const quote = clean(stripQuotes(h.quote), 160)
    const label = clean(h.label, 40)
    if (!record?.review || !label || quote.length < 3 || !normalize(record.review).includes(normalize(quote))) continue
    habits.push({ label, quote, customer: record.customer, record: record.code })
    if (habits.length === MAX_HABITS) break
  }
  const summary = clean(ai.summary, 400)
  if (!summary || skills.length === 0) return null
  return { summary, skills, habits }
}

// Plain-language habits customers mention, found in their own words (no AI).
const HABIT_RULES: [string, RegExp][] = [
  ['Arrives early', /\b(arriv\w* early|on time|punctual)\b/i],
  ['Leaves it tidy', /\b(tid(y|ied)|clean(ed|s)? up)\b/i],
  ['Careful with your things', /\b(careful|nothing (was )?scratched|covered)\b/i],
  ['Explains clearly', /\bexplain(ed|s)?\b/i],
  ['Fair prices', /\bfair price\b/i],
  ['Customers come back', /\b(again|second job|reliable)\b/i],
]

function sentenceWith(review: string, re: RegExp): string {
  const sentence = review.split(/(?<=[.!?])\s+/).find((s) => re.test(s)) ?? review
  return clean(stripQuotes(sentence), 160)
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name

function list(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

/** A factual profile assembled from the records alone, used without AI consent or when the AI is unavailable. */
export function summaryProfile(name: string, records: CredentialRecord[], averageRating: number | null): ProfileContent | null {
  if (records.length === 0) return null
  const groups = new Map<string, CredentialRecord[]>()
  for (const r of records) groups.set(r.category, [...(groups.get(r.category) ?? []), r])
  const skills: ProfileSkill[] = [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, MAX_SKILLS)
    .map(([category, rs]) => ({
      name: categoryLabel(category),
      jobs: rs.length,
      evidence: rs.map((r) => r.code),
      examples: rs.slice(0, 3).map((r) => r.title),
    }))
  const habits: ProfileHabit[] = []
  for (const [label, re] of HABIT_RULES) {
    const r = records.find((x) => x.review && re.test(x.review))
    if (r?.review) habits.push({ label, quote: sentenceWith(r.review, re), customer: r.customer, record: r.code })
    if (habits.length === MAX_HABITS) break
  }
  const areas = [...new Set(records.map((r) => r.area.split(',')[0].trim()))].slice(0, 4)
  const n = records.length
  const rating = averageRating != null ? ` Customers rate the work ${averageRating} out of 5.` : ''
  const summary = clean(
    `${firstName(name)} has ${n} customer-confirmed ${n === 1 ? 'job' : 'jobs'} on KashWise: ` +
      `${list(skills.map((s) => `${s.name.toLowerCase()} (${s.jobs})`))}, in ${list(areas)}.${rating}`,
    400,
  )
  return { summary, skills, habits }
}

/** The instructions and the evidence the model sees. Only job facts and customers' own words; no contact details. */
export function aiPrompt(name: string, records: CredentialRecord[]): { system: string; user: string } {
  const system = [
    'You write short, factual skills profiles for workers in South Africa’s informal economy, so employers and lenders can see what they can do.',
    'Use only the job records provided. Every record was confirmed by the customer who paid for it.',
    'Rules:',
    '- summary: two or three plain sentences, at most 60 words, in South African English. Describe the work and how customers describe it. No self-praise, no superlatives or claims the records do not support, no numbers except counts of jobs.',
    '- skills: one to six specific, practical skills (e.g. "Interior painting", "Cupboard and door repairs"). For each, list the record codes that prove it in evidence. Never cite a code that is not in the records.',
    '- habits: up to five working habits customers mention. quote must be copied word for word from that record’s review, and record must be that record’s code. Skip habits no review supports.',
  ].join('\n')
  const lines = records.map((r) =>
    JSON.stringify({
      code: r.code,
      title: r.title,
      category: categoryLabel(r.category),
      area: r.area,
      month: r.completed_at.slice(0, 7),
      rating: r.rating,
      review: r.review,
    }),
  )
  const user = `Worker's first name: ${firstName(name)}\nCustomer-confirmed job records (one JSON object per line):\n${lines.join('\n')}`
  return { system, user }
}

/** True when the worker has confirmed records the profile does not cover yet. */
export function isOutOfDate(profile: SkillsProfile, currentCodes: string[]): boolean {
  const covered = new Set(profile.based_on.codes)
  return currentCodes.some((c) => !covered.has(c))
}
