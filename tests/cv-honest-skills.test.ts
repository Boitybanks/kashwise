import { describe, expect, it } from 'vitest'
import { extractSkillsFromCvText, formatCleanBio, parseCvText } from '../src/lib/cv-parser'

// I am the guard that stops an office CV from being turned into a handyman profile.
describe('CV skill detection stays honest', () => {
  it('ignores office words that only look like trades', () => {
    const office = 'Software installation, system maintenance, CI/CD pipelines, payment gateway, Health insurance, Engineering, door-to-door sales, fixed bugs, data'
    expect(extractSkillsFromCvText(office)).not.toContain('repairs')
    expect(extractSkillsFromCvText(office)).not.toContain('automotive')
  })

  it('still finds real trades', () => {
    expect(extractSkillsFromCvText('Handyman: plumbing, geysers and tiling')).toContain('repairs')
    expect(extractSkillsFromCvText('Qualified motor mechanic')).toContain('automotive')
    expect(extractSkillsFromCvText('Peer tutor for first-years')).toContain('tutoring')
  })

  it('never writes a bio sentence the CV does not contain', () => {
    const draft = parseCvText('0821234567 | name@example.com', [], [])
    expect(draft.bio).not.toMatch(/experienced|workmanship/i)
  })

  it('the polish fallback makes no experience claims', () => {
    const bio = formatCleanBio('', { skills: ['tutoring'], areaName: 'Soweto' })
    expect(bio).toBe('Offers tutoring around Soweto.')
  })
})
