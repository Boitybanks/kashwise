import { describe, expect, it } from 'vitest'
import type { CredentialRecord } from '../src/lib/pq/credential'
import { aiPrompt, bindToEvidence, isOutOfDate, summaryProfile, type SkillsProfile } from '../src/lib/skills-profile'

const records: CredentialRecord[] = [
  { code: 'SG-A1', title: 'Paint spaza shop interior', category: 'painting', area: 'Soweto, Johannesburg', completed_at: '2026-07-26T10:00:00Z', rating: 5,
    review: 'Sipho arrived early, covered all the stock and the finish is beautiful. Customers keep complimenting the shop.', customer: 'Dudu N.' },
  { code: 'SG-B2', title: 'Fix sagging kitchen cupboard doors', category: 'repairs', area: 'Soweto, Johannesburg', completed_at: '2026-08-27T10:00:00Z', rating: 4,
    review: 'Good work and a fair price. Took a bit longer than planned but he explained why.', customer: 'Thandi M.' },
  { code: 'SG-C3', title: 'Paint church hall ceiling', category: 'painting', area: 'Tembisa, Ekurhuleni', completed_at: '2026-06-28T10:00:00Z', rating: 5,
    review: null, customer: 'Grace C.' },
]

describe('bindToEvidence', () => {
  it('keeps skills backed by real record codes and recomputes their counts', () => {
    const out = bindToEvidence({
      summary: 'Sipho paints shops and homes in Soweto and Tembisa.',
      skills: [
        { name: 'Interior painting', evidence: ['SG-A1', 'SG-C3', 'SG-A1'] },
        { name: 'Roofing', evidence: ['SG-ZZ'] },
      ],
      habits: [],
    }, records)
    expect(out?.skills).toEqual([
      { name: 'Interior painting', jobs: 2, evidence: ['SG-A1', 'SG-C3'], examples: ['Paint spaza shop interior', 'Paint church hall ceiling'] },
    ])
  })

  it('drops habits whose quote is not the customer’s own words', () => {
    const out = bindToEvidence({
      summary: 'Summary.',
      skills: [{ name: 'Repairs', evidence: ['SG-B2'] }],
      habits: [
        { label: 'Explains delays', quote: '“he explained why”', record: 'SG-B2' },
        { label: 'Always early', quote: 'always the first to arrive', record: 'SG-A1' },
        { label: 'Fair prices', quote: 'Good work and a fair price', record: 'SG-C3' },
      ],
    }, records)
    expect(out?.habits).toEqual([{ label: 'Explains delays', quote: 'he explained why', customer: 'Thandi M.', record: 'SG-B2' }])
  })

  it('returns null when nothing can be proven', () => {
    expect(bindToEvidence({ summary: 'x', skills: [{ name: 'Plumbing', evidence: ['nope'] }], habits: [] }, records)).toBeNull()
  })
})

describe('summaryProfile (no AI)', () => {
  it('groups skills by category with counts and finds habits in reviews', () => {
    const out = summaryProfile('Sipho Dlamini', records, 4.7)!
    expect(out.skills.map((s) => [s.name, s.jobs])).toEqual([['Painting', 2], ['Repairs & handyman', 1]])
    expect(out.habits.map((h) => h.label)).toEqual(['Arrives early', 'Careful with your things', 'Explains clearly', 'Fair prices'])
    expect(out.habits[0].quote).toBe('Sipho arrived early, covered all the stock and the finish is beautiful.')
    expect(out.summary).toBe('Sipho has 3 customer-confirmed jobs on KashWise: painting (2) and repairs & handyman (1), in Soweto and Tembisa. Customers rate the work 4.7 out of 5.')
  })

  it('writes nothing without records', () => {
    expect(summaryProfile('Sipho', [], null)).toBeNull()
  })
})

describe('aiPrompt', () => {
  it('sends job facts and reviews, but never the customers’ names', () => {
    const { user } = aiPrompt('Sipho Dlamini', records)
    expect(user).toContain('SG-A1')
    expect(user).toContain('fair price')
    expect(user).toContain("Worker's first name: Sipho")
    expect(user).not.toContain('Dudu N.')
    expect(user).not.toContain('Dlamini')
  })
})

describe('isOutOfDate', () => {
  it('spots confirmed jobs the profile does not cover', () => {
    const profile = { based_on: { records: 2, codes: ['SG-A1', 'SG-B2'], average_rating: null } } as SkillsProfile
    expect(isOutOfDate(profile, ['SG-A1', 'SG-B2'])).toBe(false)
    expect(isOutOfDate(profile, ['SG-A1', 'SG-B2', 'SG-C3'])).toBe(true)
  })
})
