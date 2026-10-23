import { describe, expect, it } from 'vitest'
import { identitySchema, identityWarnings, nameMatchesLegalName } from '../src/lib/identity'

const valid = {
  legal_name: 'Sipho Themba Dlamini',
  id_number: '800101 5009 087',
  gender: 'male',
  home_address: '12 Vilakazi Street, Orlando West, Soweto, 1804',
  consent: true,
}

describe('sign-up identity details', () => {
  it('accepts a complete, valid set and normalises the ID number', () => {
    const r = identitySchema.safeParse(valid)
    expect(r.success).toBe(true)
    expect(r.data?.id_number).toBe('8001015009087')
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
