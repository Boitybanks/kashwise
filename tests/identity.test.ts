import { describe, expect, it } from 'vitest'
import { identitySchema, identityWarnings, nameMatchesLegalName } from '../src/lib/identity'

const valid = {
  legal_name: 'Sipho Themba Dlamini',
  document_type: 'sa_id',
  id_number: '800101 5009 087',
  country: '',
  date_of_birth: '',
  gender: 'male',
  home_address: '12 Vilakazi Street, Orlando West, Soweto, 1804',
  consent: true,
}

describe('sign-up identity details', () => {
  it('accepts a complete, valid set and normalises the ID number', () => {
    const r = identitySchema.safeParse(valid)
    expect(r.success).toBe(true)
    expect(r.data?.id_number).toBe('8001015009087')
    expect(r.data?.country).toBeNull()
    expect(r.data?.date_of_birth).toBeNull()
  })

  it('rejects a bad ID number, under-18s, a missing gender, a short address and no consent', () => {
    expect(identitySchema.safeParse({ ...valid, id_number: '8001015009088' }).error?.issues[0].message).toMatch(/checksum/)
    expect(identitySchema.safeParse({ ...valid, id_number: '1506015009082' }).error?.issues[0].message).toMatch(/18 or older/)
    expect(identitySchema.safeParse({ ...valid, gender: '' }).success).toBe(false)
    expect(identitySchema.safeParse({ ...valid, gender: 'other' }).success).toBe(false)
    expect(identitySchema.safeParse({ ...valid, home_address: 'Soweto' }).success).toBe(false)
    expect(identitySchema.safeParse({ ...valid, consent: false }).success).toBe(false)
  })
})

describe('passport and asylum / refugee permit sign-ups', () => {
  const passport = { ...valid, legal_name: 'Tendai Moyo', document_type: 'passport', id_number: 'fn 123-456', country: 'zw', date_of_birth: '1990-04-12' }
  const issue = (input: object) => identitySchema.safeParse(input).error?.issues[0]

  it('accepts a passport and normalises its number and country', () => {
    const r = identitySchema.safeParse(passport)
    expect(r.success).toBe(true)
    expect(r.data).toMatchObject({ document_type: 'passport', id_number: 'FN123456', country: 'ZW', date_of_birth: '1990-04-12' })
  })

  it('accepts an asylum-seeker or refugee permit number', () => {
    const r = identitySchema.safeParse({ ...passport, document_type: 'permit', id_number: 'jhb/004512/2023', country: 'CD' })
    expect(r.data).toMatchObject({ document_type: 'permit', id_number: 'JHB/004512/2023', country: 'CD' })
  })

  it('asks for the right field when something is missing or wrong', () => {
    expect(issue({ ...passport, country: '' })).toMatchObject({ path: ['country'] })
    expect(issue({ ...passport, country: 'ZA' })).toMatchObject({ path: ['country'] })
    expect(issue({ ...passport, date_of_birth: '' })).toMatchObject({ path: ['date_of_birth'] })
    expect(issue({ ...passport, date_of_birth: '2015-06-01' })?.message).toMatch(/18 or older/)
    expect(issue({ ...passport, id_number: 'A1' })).toMatchObject({ path: ['id_number'], message: expect.stringMatching(/passport number/) })
    expect(issue({ ...passport, document_type: 'permit', id_number: 'ABCDEFG' })?.message).toMatch(/permit/)
  })

  it('does not run the SA ID gender check on a passport', () => {
    expect(identityWarnings({ displayName: 'Tendai Moyo', legalName: 'Tendai Moyo', idNumber: '8001015009087', gender: 'female', documentType: 'passport' })).toEqual([])
  })
})

describe('profile name vs name on ID', () => {
  it('matches when the first and last profile names appear on the ID', () => {
    expect(nameMatchesLegalName('Sipho Dlamini', 'Sipho Themba Dlamini')).toBe(true)
    expect(nameMatchesLegalName('sipho  DLAMINI', 'SIPHO THEMBA DLAMINI')).toBe(true)
    expect(nameMatchesLegalName('Zoë Mokoena', 'Zoe Lerato Mokoena')).toBe(true)
    expect(nameMatchesLegalName('Sipho', 'Sipho Themba Dlamini')).toBe(true)
  })
  it('flags a different name', () => {
    expect(nameMatchesLegalName('Kasi Coffee Co.', 'Sipho Themba Dlamini')).toBe(false)
    expect(nameMatchesLegalName('Thabo Dlamini', 'Sipho Themba Dlamini')).toBe(false)
  })
})

describe('mismatch prompts', () => {
  const base = { displayName: 'Sipho Dlamini', legalName: 'Sipho Themba Dlamini', idNumber: '8001015009087' }
  it('raises nothing when the details line up', () => {
    expect(identityWarnings({ ...base, gender: 'male' })).toEqual([])
  })
  it('tells the person when their gender differs from the ID number', () => {
    expect(identityWarnings({ ...base, gender: 'female' })).toEqual([
      'Your ID number is registered as male, but you selected female.',
    ])
    // 9202204720083 is registered as female
    expect(identityWarnings({ displayName: 'Lerato Mokoena', legalName: 'Lerato Mokoena', idNumber: '9202204720083', gender: 'male' })[0]).toMatch(/registered as female/)
  })
  it('tells the person when their profile name differs from their ID name', () => {
    const w = identityWarnings({ ...base, displayName: 'Kasi Coffee Co.', gender: 'male' })
    expect(w).toHaveLength(1)
    expect(w[0]).toMatch(/doesn’t match the name on your ID/)
  })
})
