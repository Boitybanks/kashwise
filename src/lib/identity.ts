import { z } from 'zod'
import { isCountryCode } from './countries'
import { normaliseSaId, validateSaId } from './sa-id'
import { todayInSA } from './validation'

export type Gender = 'male' | 'female'
export const GENDER_LABEL: Record<Gender, string> = { male: 'Male', female: 'Female' }
export const MINIMUM_AGE = 18

// I am the list of documents someone can sign up with, wanting foreign nationals to join with what they actually hold.
// Nothing is checked with Home Affairs; the number is format-checked here and again in the database.
export const DOCUMENT_TYPES = ['sa_id', 'passport', 'permit'] as const
export type DocumentType = (typeof DOCUMENT_TYPES)[number]
export const DOCUMENT_LABEL: Record<DocumentType, string> = { sa_id: 'SA ID', passport: 'Passport', permit: 'Asylum / refugee permit' }

/** Same rules as private.check_identity_document: spaces go, letters become capitals, passports also drop dashes. */
export function normaliseDocumentNumber(type: DocumentType, value: string): string {
  if (type === 'sa_id') return normaliseSaId(value)
  const v = value.replace(/\s/g, '').toUpperCase()
  return type === 'passport' ? v.replace(/-/g, '') : v
}

/** Whole years between a YYYY-MM-DD birth date and today, in South Africa. */
export function ageOn(dob: string, today = todayInSA()): number {
  const [by, bm, bd] = dob.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0)
}

// Collected at sign-up. The document number, legal name and address are encrypted in the browser before saving;
// the database re-checks the number (create_account / save_identity) and keeps a keyed hash for one-account-per-document.
export const identitySchema = z
  .object({
    legal_name: z
      .string()
      .trim()
      .min(3, 'Enter your full name exactly as it appears on your document.')
      .max(100, 'Please keep your name under 100 characters.'),
    document_type: z.enum(DOCUMENT_TYPES, { message: 'Choose SA ID, passport or asylum / refugee permit.' }),
    id_number: z.string(),
    country: z.string(),
    date_of_birth: z.string(),
    gender: z.enum(['male', 'female'], { message: 'Choose male or female.' }),
    home_address: z
      .string()
      .trim()
      .min(10, 'Enter your full home address: street, suburb and city.')
      .max(200, 'Please keep your address under 200 characters.'),
    consent: z.literal(true, { message: 'Please confirm these details are yours.' }),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })
    if (v.document_type === 'sa_id') {
      const result = validateSaId(v.id_number)
      if (!result.ok) issue('id_number', result.error)
      else if (result.details.age < MINIMUM_AGE) issue('id_number', `You must be ${MINIMUM_AGE} or older to join KashWise.`)
      return
    }
    const number = normaliseDocumentNumber(v.document_type, v.id_number)
    if (v.document_type === 'passport' && !/^[A-Z0-9]{6,9}$/.test(number)) {
      issue('id_number', 'Enter your passport number: 6 to 9 letters and numbers.')
    }
    if (v.document_type === 'permit' && (!/^[A-Z0-9/-]{6,25}$/.test(number) || number.replace(/\D/g, '').length < 4)) {
      issue('id_number', 'Enter the number on your asylum-seeker or refugee permit.')
    }
    if (!isCountryCode(v.country)) issue('country', 'Choose your country.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date_of_birth) || v.date_of_birth > todayInSA()) issue('date_of_birth', 'Enter your date of birth.')
    else if (ageOn(v.date_of_birth) > 110) issue('date_of_birth', 'Check your date of birth.')
    else if (ageOn(v.date_of_birth) < MINIMUM_AGE) issue('date_of_birth', `You must be ${MINIMUM_AGE} or older to join KashWise.`)
  })
  .transform((v) => ({
    ...v,
    id_number: normaliseDocumentNumber(v.document_type, v.id_number),
    // An SA ID already holds the birth date, so country and date of birth are only sent for other documents.
    country: v.document_type === 'sa_id' ? null : v.country.toUpperCase(),
    date_of_birth: v.document_type === 'sa_id' ? null : v.date_of_birth,
  }))
export type IdentityInput = z.output<typeof identitySchema>

/** What the identity form holds before validation. */
export interface IdentityDraft {
  legal_name: string
  document_type: DocumentType
  id_number: string
  country: string
  date_of_birth: string
  gender: Gender | ''
  home_address: string
  consent: boolean
}
export const EMPTY_IDENTITY: IdentityDraft = {
  legal_name: '', document_type: 'sa_id', id_number: '', country: '', date_of_birth: '', gender: '', home_address: '', consent: false,
}

/** Drops one field's error, e.g. as soon as the person edits that field. */
export function withoutError(errors: Record<string, string>, field: string): Record<string, string> {
  if (!(field in errors)) return errors
  const next = { ...errors }
  delete next[field]
  return next
}

const words = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z']+/)
    .filter((w) => w.length > 1)

/** The profile name should come from the ID: its first and last words must appear in the legal name. */
export function nameMatchesLegalName(displayName: string, legalName: string): boolean {
  const shown = words(displayName)
  const legal = new Set(words(legalName))
  return shown.length > 0 && legal.has(shown[0]) && legal.has(shown[shown.length - 1])
}

/**
 * Differences the person is asked to check before continuing. They never block sign-up: the person can correct
 * the details or confirm they are right. (An ID number doesn't contain a name, so the name check compares the
 * profile name with the legal name the person typed, not with Home Affairs records.)
 */
export function identityWarnings(input: { displayName: string; legalName: string; gender: Gender; idNumber: string; documentType?: DocumentType }): string[] {
  const warnings: string[] = []
  // Only an SA ID number encodes gender; passports and permits are left alone.
  const id = (input.documentType ?? 'sa_id') === 'sa_id' ? validateSaId(input.idNumber) : null
  if (id?.ok && id.details.gender !== input.gender) {
    warnings.push(
      `Your ID number is registered as ${GENDER_LABEL[id.details.gender].toLowerCase()}, but you selected ${GENDER_LABEL[input.gender].toLowerCase()}.`,
    )
  }
  if (input.legalName.trim() && !nameMatchesLegalName(input.displayName, input.legalName)) {
    warnings.push(`Your profile name “${input.displayName.trim()}” doesn’t match the name on your ID, “${input.legalName.trim()}”.`)
  }
  return warnings
}
