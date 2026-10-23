import { z } from 'zod'
import { normaliseSaId, validateSaId } from './sa-id'

export type Gender = 'male' | 'female'
export const GENDER_LABEL: Record<Gender, string> = { male: 'Male', female: 'Female' }
export const MINIMUM_AGE = 18

// Collected at sign-up. The ID number, legal name and address are encrypted in the browser before saving;
// the database re-checks the ID number (create_account / save_identity) and keeps a keyed hash for one-account-per-ID.
export const identitySchema = z.object({
  legal_name: z
    .string()
    .trim()
    .min(3, 'Enter your full name exactly as it appears on your ID.')
    .max(100, 'Please keep your name under 100 characters.'),
  id_number: z
    .string()
    .superRefine((value, ctx) => {
      const result = validateSaId(value)
      if (!result.ok) ctx.addIssue({ code: 'custom', message: result.error })
      else if (result.details.age < MINIMUM_AGE) ctx.addIssue({ code: 'custom', message: `You must be ${MINIMUM_AGE} or older to join KashWise.` })
    })
    .transform(normaliseSaId),
  gender: z.enum(['male', 'female'], { message: 'Choose male or female.' }),
  home_address: z
    .string()
    .trim()
    .min(10, 'Enter your full home address: street, suburb and city.')
    .max(200, 'Please keep your address under 200 characters.'),
  consent: z.literal(true, { message: 'Please confirm these details are yours.' }),
})
export type IdentityInput = z.infer<typeof identitySchema>

/** What the identity form holds before validation. */
export interface IdentityDraft {
  legal_name: string
  id_number: string
  gender: Gender | ''
  home_address: string
  consent: boolean
}
export const EMPTY_IDENTITY: IdentityDraft = { legal_name: '', id_number: '', gender: '', home_address: '', consent: false }

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
export function identityWarnings(input: { displayName: string; legalName: string; gender: Gender; idNumber: string }): string[] {
  const warnings: string[] = []
  const id = validateSaId(input.idNumber)
  if (id.ok && id.details.gender !== input.gender) {
    warnings.push(
      `Your ID number is registered as ${GENDER_LABEL[id.details.gender].toLowerCase()}, but you selected ${GENDER_LABEL[input.gender].toLowerCase()}.`,
    )
  }
  if (input.legalName.trim() && !nameMatchesLegalName(input.displayName, input.legalName)) {
    warnings.push(`Your profile name “${input.displayName.trim()}” doesn’t match the name on your ID, “${input.legalName.trim()}”.`)
  }
  return warnings
}
