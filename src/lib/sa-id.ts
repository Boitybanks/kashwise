import { todayInSA } from './validation'

// South African ID number: YYMMDD SSSS C A Z
//   YYMMDD  date of birth
//   SSSS    sequence — 0000–4999 female, 5000–9999 male
//   C       0 = SA citizen, 1 = permanent resident, 2 = refugee
//   A       historically race, now fixed (usually 8) — not validated
//   Z       Luhn check digit over the first 12 digits
// Passing these checks proves the number is well-formed, not that it was issued or belongs to the person typing it.

export type SaIdGender = 'female' | 'male'
export type SaIdCitizenship = 'citizen' | 'permanent_resident' | 'refugee'

export interface SaIdDetails {
  idNumber: string
  /** YYYY-MM-DD */
  dateOfBirth: string
  age: number
  gender: SaIdGender
  citizenship: SaIdCitizenship
}

export type SaIdResult = { ok: true; details: SaIdDetails } | { ok: false; error: string }

export const CITIZENSHIP_LABEL: Record<SaIdCitizenship, string> = {
  citizen: 'SA citizen',
  permanent_resident: 'Permanent resident',
  refugee: 'Refugee',
}

const CITIZENSHIP_DIGIT: Record<string, SaIdCitizenship> = { '0': 'citizen', '1': 'permanent_resident', '2': 'refugee' }

/** Strips the spaces and dashes people type or paste between digit groups. */
export function normaliseSaId(input: string): string {
  return input.replace(/[\s-]/g, '')
}

/** Luhn checksum: double every second digit from the right, subtract 9 when over 9, total must end in 0. */
export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = digits.charCodeAt(digits.length - 1 - i) - 48
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

function isRealDate(year: number, month: number, day: number): boolean {
  const d = new Date(Date.UTC(year, month - 1, day))
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

function ageOn(dob: string, today: string): number {
  const [by, bm, bd] = dob.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0)
}

/**
 * Validates a 13-digit SA ID number and extracts date of birth, gender and citizenship.
 * The two-digit year resolves to the most recent century that doesn't put the birth date after `today` (YYYY-MM-DD).
 */
export function validateSaId(input: string, today = todayInSA()): SaIdResult {
  const id = normaliseSaId(input)
  if (!id) return { ok: false, error: 'Enter your 13-digit SA ID number.' }
  if (!/^\d+$/.test(id)) return { ok: false, error: 'An SA ID number contains digits only.' }
  if (id.length !== 13) {
    return { ok: false, error: `An SA ID number has 13 digits — you entered ${id.length}.` }
  }

  const yy = Number(id.slice(0, 2))
  const month = Number(id.slice(2, 4))
  const day = Number(id.slice(4, 6))
  const currentYear = Number(today.slice(0, 4))
  let year = Math.floor(currentYear / 100) * 100 + yy
  if (!isRealDate(year, month, day) && !isRealDate(year - 100, month, day)) {
    return { ok: false, error: 'The first 6 digits must be a real date of birth (YYMMDD).' }
  }
  if (!isRealDate(year, month, day) || iso(year, month, day) > today) year -= 100
  // e.g. 29 Feb in a year that is a leap year in one century but not the other
  if (!isRealDate(year, month, day)) {
    return { ok: false, error: 'The first 6 digits must be a real date of birth (YYMMDD).' }
  }

  const citizenship = CITIZENSHIP_DIGIT[id[10]]
  if (!citizenship) {
    return { ok: false, error: 'The 11th digit must be 0 (SA citizen), 1 (permanent resident) or 2 (refugee).' }
  }
  if (!luhnValid(id)) {
    return { ok: false, error: 'This ID number fails the checksum — check for a mistyped digit.' }
  }

  const dateOfBirth = iso(year, month, day)
  return {
    ok: true,
    details: {
      idNumber: id,
      dateOfBirth,
      age: ageOn(dateOfBirth, today),
      gender: Number(id.slice(6, 10)) < 5000 ? 'female' : 'male',
      citizenship,
    },
  }
}

/** Shows only the last 4 digits, e.g. "•••••••••9087". */
export function maskSaId(id: string): string {
  return '•'.repeat(Math.max(0, id.length - 4)) + id.slice(-4)
}


