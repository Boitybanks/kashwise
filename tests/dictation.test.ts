import { describe, expect, it } from 'vitest'
import {
  digitsFromWords,
  draftByRules,
  finalizeBio,
  finalizeGoal,
  finalizeJob,
  priceFor,
  priceGuides,
  rulesBio,
  rulesGoal,
  rulesJob,
  saysOnlyWhatWasSaid,
  spokenAmount,
  spokenDate,
  spokenSkills,
  withoutContactDetails,
  type GoalDraft,
  type PriceGuide,
} from '../src/lib/dictation'

// Sunday 1 November 2026
const TODAY = '2026-11-01'
const WED = '2026-11-04'

describe('reading speech', () => {
  it('turns spoken numbers into digits', () => {
    expect(digitsFromWords('two thousand five hundred')).toBe('2500')
    expect(digitsFromWords('nine hundred rand for six years')).toBe('900 rand for 6 years')
    expect(digitsFromWords('one hundred and twenty')).toBe('120')
  })

  it.each([
    ['I want to make R900 this week', 900],
    ['I need R 1 500', 1500],
    ['nine hundred rand', 900],
    ['make 2k by Friday', 2000],
    ['I want to earn two thousand five hundred', 2500],
    ['I can pay about 400', 400],
    ['Grade 10 maths lessons', null],
    ['I have six years experience', null],
  ])('finds the amount in %s', (text, amount) => {
    expect(spokenAmount(text)).toBe(amount)
  })

  it('reads dates relative to today in South Africa', () => {
    expect(spokenDate('today please', WED)).toBe(WED)
    expect(spokenDate('tomorrow morning', WED)).toBe('2026-11-05')
    expect(spokenDate('by Friday', WED)).toBe('2026-11-06')
    expect(spokenDate('this week', WED)).toBe('2026-11-08')
    expect(spokenDate('this week', TODAY)).toBe('2026-11-08')
    expect(spokenDate('this weekend', TODAY)).toBe(TODAY)
    expect(spokenDate('next week', WED)).toBe('2026-11-15')
    expect(spokenDate('this month', WED)).toBe('2026-11-30')
    expect(spokenDate('in five days', WED)).toBe('2026-11-09')
    expect(spokenDate('no time mentioned', WED)).toBeNull()
  })

  it('finds kinds of work', () => {
    expect(spokenSkills('my roof is leaking')).toEqual(['repairs'])
    expect(spokenSkills('I paint houses and clean offices')).toEqual(expect.arrayContaining(['painting', 'cleaning']))
    expect(spokenSkills('I braid hair')).toEqual(['hair-beauty'])
    expect(spokenSkills('good morning to you')).toEqual([])
  })
})

describe('a draft may only say what the person said', () => {
  it('accepts a formal rewrite with the same facts, however the number was spoken', () => {
    expect(saysOnlyWhatWasSaid('I have 6 years of experience painting homes.', 'I paint houses, six years now')).toBe(true)
  })

  it('rejects an invented number', () => {
    expect(saysOnlyWhatWasSaid('I have 10 years of experience.', 'I paint houses')).toBe(false)
    expect(saysOnlyWhatWasSaid('I have 6 years of experience.', 'I did it for 16 years')).toBe(false)
  })

  it('rejects an invented credential or boast', () => {
    expect(saysOnlyWhatWasSaid('I am a certified painter.', 'I paint houses')).toBe(false)
    expect(saysOnlyWhatWasSaid('A verified, expert plumber.', 'I do plumbing')).toBe(false)
    expect(saysOnlyWhatWasSaid('I am a certified painter.', 'I am certified by the college')).toBe(true)
  })

  it('takes contact details out of public text', () => {
    expect(withoutContactDetails('Call me on 071 234 5678 or +27 82 123 4567.')).not.toMatch(/\d{3}/)
    expect(withoutContactDetails('Email me at sipho@example.com today')).toBe('Email me at today')
    expect(withoutContactDetails('I live at 12 Vilakazi Street in Orlando')).not.toContain('Vilakazi')
  })

  it('drops a bio that invents a qualification, and keeps one that does not', () => {
    const said = 'I paint houses in Soweto for six years'
    expect(finalizeBio({ headline: 'Certified painter', bio: 'I am a painter.', skills: ['painting'] }, said)).toBeNull()
    const bio = finalizeBio({ headline: 'House painter in Soweto', bio: 'I am a house painter with 6 years of experience in Soweto.', skills: ['painting', 'nonsense'] }, said)
    expect(bio).toEqual({ headline: 'House painter in Soweto', bio: 'I am a house painter with 6 years of experience in Soweto.', skills: ['painting'] })
  })

  it('keeps drafts inside the form limits', () => {
    const said = 'word '.repeat(300)
    const bio = finalizeBio({ headline: 'word '.repeat(40), bio: 'word '.repeat(200), skills: [] }, said)!
    expect(bio.headline.length).toBeLessThanOrEqual(80)
    expect(bio.bio.length).toBeLessThanOrEqual(500)
  })
})

describe('job posts', () => {
  const guides: PriceGuide[] = [{ category: 'repairs', samples: 5, low_rands: 300, median_rands: 650, high_rands: 1200 }]
  const said = 'Today I want someone who can help me with the leaking roof in the morning'

  it('writes a post without AI from what was said', () => {
    const job = rulesJob(said, guides, TODAY)
    expect(job.category).toBe('repairs')
    expect(job.title).toMatch(/leaking roof/i)
    expect(job.description.length).toBeGreaterThanOrEqual(20)
    expect(job.scheduled_date).toBe(TODAY)
    expect(job.time_window).toBe('morning')
    expect(job.price_rands).toBe(650)
    expect(job.market_floor_rands).toBe(650)
    expect(job.price_basis).toBe('market')
  })

  it('falls back to the baseline rate as the floor', () => {
    const job = rulesJob(said, [], TODAY)
    expect(job.price_rands).toBe(400)
    expect(job.market_floor_rands).toBe(400)
  })

  it('cleans filler and stammering out of a spoken request', () => {
    const job = rulesJob("hey I need help with someone who's going to mount my TV and also um assemble my desk um on on on my door so yeah", [], TODAY)
    expect(job.title).toBe('Mount the TV')
    expect(job.description).not.toMatch(/\bum\b|on on|so yeah/i)
  })

  it('never goes below the market rate, whatever was said or estimated', () => {
    expect(priceFor('I can pay R500', 'repairs', guides[0], 900)).toMatchObject({ price_rands: 900, market_floor_rands: 650, price_basis: 'estimate' })
    expect(priceFor('I can pay R100', 'repairs', guides[0], null)).toMatchObject({ price_rands: 650, price_basis: 'market' })
    expect(priceFor('I can pay R800', 'repairs', guides[0], null)).toMatchObject({ price_rands: 800, price_basis: 'said' })
    expect(priceFor('fix it', 'repairs', { ...guides[0], samples: 2 }, null).market_floor_rands).toBe(400)
    expect(priceFor('fix it', 'repairs', undefined, 900_000).price_rands).toBe(50_000)
  })

  it('checks an AI post the same way', () => {
    const ai = { title: 'Repair a leaking roof', category: 'repairs', description: 'I require a person to repair a leaking roof at my home this morning.', time_window: null, scheduled_date: null, estimated_price_rands: 800 }
    const job = finalizeJob(ai, said, guides, TODAY)!
    expect(job).toMatchObject({ title: 'Repair a leaking roof', time_window: 'morning', scheduled_date: TODAY, price_rands: 800, price_basis: 'estimate', market_floor_rands: 650 })
    expect(finalizeJob({ ...ai, description: 'A 3 hour job for a licensed roofer at my home this morning.' }, said, guides, TODAY)).toBeNull()
    expect(finalizeJob({ ...ai, title: 'Roof' }, said, guides, TODAY)).toBeNull()
    expect(finalizeJob({ ...ai, scheduled_date: '2020-01-01' }, 'fix my roof, it leaks badly', guides, TODAY)?.scheduled_date).toBeNull()
  })

  it('builds price guides from real rows', () => {
    const rows = [100, 500, 300].map((r) => ({ category: 'cleaning', payout_cents: r * 100 }))
    expect(priceGuides(rows)).toEqual([{ category: 'cleaning', samples: 3, low_rands: 100, median_rands: 300, high_rands: 500 }])
  })
})

describe('earnings goals', () => {
  it('reads a spoken goal', () => {
    const goal = rulesGoal('I want to make R900 this week. I do painting and small repairs, in the mornings on weekdays, within 10 km.', TODAY)
    expect(goal).toEqual({ target_rands: 900, deadline: '2026-11-08', skills: expect.arrayContaining(['painting', 'repairs']), weekdays: [1, 2, 3, 4, 5], time_windows: ['morning'], radius_km: 10 })
  })

  it('does not take a deadline as an available day', () => {
    const goal = rulesGoal('I need 2000 rand by Friday', WED)
    expect(goal.deadline).toBe('2026-11-06')
    expect(goal.weekdays).toEqual([])
  })

  it('understands days off', () => {
    expect(rulesGoal('I want R500 this week but not on Sunday', WED).weekdays).toEqual([1, 2, 3, 4, 5, 6])
    expect(rulesGoal('R500, weekends only', WED).weekdays).toEqual([0, 6])
  })

  it('leaves out what was not said, so the form keeps its values', () => {
    expect(rulesGoal('hello there', TODAY)).toEqual({ target_rands: null, deadline: null, skills: [], weekdays: [], time_windows: [], radius_km: null })
  })

  it('money and dates said in plain words beat the model, and bad values are dropped', () => {
    const ai = { target_rands: 9000, deadline: '2026-11-20', skills: ['painting', 'nonsense'], weekdays: [1, 9, 1], time_windows: ['morning' as const], radius_km: 1000 }
    const goal = finalizeGoal(ai, 'I want to make R900 this week', WED)
    expect(goal).toMatchObject({ target_rands: 900, deadline: '2026-11-08', skills: ['painting'], weekdays: [1], radius_km: null })
    expect(finalizeGoal({ ...ai, target_rands: 5_000_000, deadline: '2030-01-01' }, 'ngifuna imali', WED)).toMatchObject({ target_rands: null, deadline: null })
  })
})

describe('without AI', () => {
  it('tidies speech without changing what it says', () => {
    const bio = rulesBio('um i paint houses in soweto. you know i have six years experience')
    expect(bio.bio).toBe('I paint houses in soweto. I have six years experience.')
    expect(bio.skills).toEqual(['painting'])
  })

  it('routes every kind', () => {
    expect(draftByRules('bio', 'I clean homes', [], TODAY)).toHaveProperty('bio')
    expect(draftByRules('job', 'I need my garden cleaned up', [], TODAY)).toHaveProperty('title')
    expect((draftByRules('goal', 'make R100 today', [], TODAY) as GoalDraft).target_rands).toBe(100)
  })
})
