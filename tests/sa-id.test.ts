import { describe, expect, it } from 'vitest'
import { luhnValid, maskSaId, validateSaId } from '../src/lib/sa-id'

const today = '2026-09-26'

// Home Affairs' published check-digit method — computed independently of the Luhn loop under test.
function homeAffairsCheckDigit(first12: string): number {
  const d = first12.split('').map(Number)
  const odd = d[0] + d[2] + d[4] + d[6] + d[8] + d[10]
  const evenDoubled = String(Number(`${d[1]}${d[3]}${d[5]}${d[7]}${d[9]}${d[11]}`) * 2)
  const sum = odd + evenDoubled.split('').reduce((a, c) => a + Number(c), 0)
  return (10 - (sum % 10)) % 10
}

function details(id: string, on = today) {
  const r = validateSaId(id, on)
  if (!r.ok) throw new Error(r.error)
  return r.details
}

function error(id: string, on = today) {
  const r = validateSaId(id, on)
  return r.ok ? null : r.error
}

describe('Luhn checksum', () => {
  it('agrees with the Home Affairs check-digit method', () => {
    for (let n = 0; n < 500; n++) {
      const base = String(Math.floor(Math.random() * 1e12)).padStart(12, '0')
      const z = homeAffairsCheckDigit(base)
      expect(luhnValid(`${base}${z}`)).toBe(true)
      expect(luhnValid(`${base}${(z + 1 + (n % 9)) % 10}`)).toBe(false)
    }
  })
})

describe('SA ID validation', () => {
  it('extracts date of birth, age, gender and citizenship', () => {
    expect(details('8001015009087')).toEqual({
      idNumber: '8001015009087',
      dateOfBirth: '1980-01-01',
      age: 46,
      gender: 'male',
      citizenship: 'citizen',
    })
    expect(details('9202204720083')).toMatchObject({ dateOfBirth: '1992-02-20', gender: 'female', citizenship: 'citizen' })
    expect(details('0002295123182')).toMatchObject({ dateOfBirth: '2000-02-29', gender: 'male', citizenship: 'permanent_resident' })
    const refugee = `800101500928`
    expect(details(`${refugee}${homeAffairsCheckDigit(refugee)}`).citizenship).toBe('refugee')
  })

  it('splits gender at sequence 5000', () => {
    expect(details('2601014009081').gender).toBe('female')
    const at5000 = '260101500008'
    expect(details(`${at5000}${homeAffairsCheckDigit(at5000)}`).gender).toBe('male')
  })

  it('resolves the century so the birth date is never in the future', () => {
    expect(details('0512310001080').dateOfBirth).toBe('2005-12-31')
    expect(details('2601014009081')).toMatchObject({ dateOfBirth: '2026-01-01', age: 0 })
    expect(details('2612315009084')).toMatchObject({ dateOfBirth: '1926-12-31', age: 99 })
  })

  it('computes age from the birthday, not the birth year', () => {
    expect(details('8001015009087', '2025-12-31').age).toBe(45)
    expect(details('8001015009087', '2026-01-01').age).toBe(46)
  })

  it('accepts spaces and dashes between digit groups', () => {
    expect(details('800101 5009 087').idNumber).toBe('8001015009087')
    expect(details('800101-5009-08-7').idNumber).toBe('8001015009087')
  })

  it('explains what is wrong with an invalid number', () => {
    expect(error('')).toMatch(/enter your 13-digit/i)
    expect(error('80010150090A7')).toMatch(/digits only/)
    expect(error('800101500908')).toMatch(/13 digits — you entered 12/)
    expect(error('80010150090877')).toMatch(/you entered 14/)
    expect(error('8013015009087')).toMatch(/real date of birth/)
    expect(error('0102295009082')).toMatch(/real date of birth/) // 29 Feb 2001 and 1901 don't exist, checksum is fine
    expect(error('8001015009384')).toMatch(/11th digit/) // checksum is fine, citizenship digit 3 is not
    expect(error('8001015009088')).toMatch(/checksum/)
  })

  it('masks all but the last four digits', () => {
    expect(maskSaId('8001015009087')).toBe('•••••••••9087')
  })
})


