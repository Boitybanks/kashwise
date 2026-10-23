import { z } from 'zod'
import { CATEGORIES } from './categories'
import { MAX_PAYOUT_CENTS, MAX_TAKE_HOME_CENTS, MIN_PAYOUT_CENTS, MIN_TAKE_HOME_CENTS } from './money'

const categorySlugs = CATEGORIES.map((c) => c.slug) as [string, ...string[]]

export function todayInSA(now = new Date()): string {
  // YYYY-MM-DD in Africa/Johannesburg (UTC+2, no DST).
  return new Date(now.getTime() + 2 * 3600_000).toISOString().slice(0, 10)
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export const signupSchema = z.object({
  display_name: z.string().trim().min(2, 'Please enter your name.').max(60, 'Please keep your name under 60 characters.'),
  email: z.string().trim().toLowerCase().email('Please enter a valid email address.'),
  password: z.string().min(8, 'Use at least 8 characters.').max(72, 'Please use 72 characters or fewer.'),
  role: z.enum(['worker', 'customer'], { message: 'Choose what you want to do first.' }),
  area_slug: z.string().min(1, 'Choose your area.'),
})
export type SignupInput = z.infer<typeof signupSchema>

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please enter a valid email address.'),
  password: z.string().min(1, 'Please enter your password.'),
})

export const profileSchema = z.object({
  display_name: z.string().trim().min(2, 'Please enter your name.').max(60),
  role: z.enum(['worker', 'customer']),
  area_slug: z.string().min(1, 'Choose your area.'),
  headline: z.string().trim().max(80, 'Keep your headline under 80 characters.').optional().or(z.literal('')),
  bio: z.string().trim().max(500, 'Keep your bio under 500 characters.').optional().or(z.literal('')),
  skills: z.array(z.enum(categorySlugs)).max(12),
})

// South African mobile/landline numbers: 0XXXXXXXXX or +27XXXXXXXXX.
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ''))
  .refine((v) => /^(\+27|0)[1-8]\d{8}$/.test(v), 'Enter a South African number, e.g. 071 234 5678.')

// When and where a job happens, plus the encrypted private details. Shared by posting a gig and booking a service.
function scheduleFields(today: string) {
  return {
    area_slug: z.string().min(1, 'Choose the area where the work happens.'),
    scheduled_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date.')
      .refine((d) => d >= today, 'Choose today or a future date.')
      .refine((d) => d <= addDays(today, 180), 'Choose a date within the next 6 months.'),
    time_window: z.enum(['morning', 'afternoon', 'evening', 'flexible']),
    address: z.string().trim().max(200, 'Keep the address under 200 characters.').optional().or(z.literal('')),
    access_notes: z.string().trim().max(300, 'Keep notes under 300 characters.').optional().or(z.literal('')),
  }
}

export function gigSchema(today = todayInSA()) {
  return z.object({
    title: z.string().trim().min(5, 'Give your gig a short title (at least 5 characters).').max(80, 'Keep the title under 80 characters.'),
    category: z.enum(categorySlugs, { message: 'Choose a category.' }),
    description: z
      .string()
      .trim()
      .min(20, 'Describe the work in at least 20 characters so workers know what to expect.')
      .max(1000, 'Keep the description under 1000 characters.'),
    payout_cents: z
      .number({ message: 'Enter what you will pay for the job.' })
      .int()
      .min(MIN_PAYOUT_CENTS, 'The minimum price is R50.')
      .max(MAX_PAYOUT_CENTS, 'The maximum price is R50 000.'),
    ...scheduleFields(today),
  })
}
export type GigInput = z.infer<ReturnType<typeof gigSchema>>

/** A provider lists a service at the amount they want to receive; clients are shown the price that pays that after the fee. */
export const serviceSchema = z.object({
  title: z.string().trim().min(5, 'Give your service a short title (at least 5 characters).').max(80, 'Keep the title under 80 characters.'),
  category: z.enum(categorySlugs, { message: 'Choose a category.' }),
  description: z
    .string()
    .trim()
    .min(20, 'Describe the service in at least 20 characters so clients know what they get.')
    .max(1000, 'Keep the description under 1000 characters.'),
  area_slug: z.string().min(1, 'Choose the area you work in.'),
  take_home_cents: z
    .number({ message: 'Enter what you want to receive for this service.' })
    .int()
    .min(MIN_TAKE_HOME_CENTS, 'The minimum you can receive is R45.')
    .max(MAX_TAKE_HOME_CENTS, 'The maximum you can receive is R45 000.'),
})
export type ServiceInput = z.infer<typeof serviceSchema>

export function bookingSchema(today = todayInSA()) {
  return z.object(scheduleFields(today))
}
export type BookingInput = z.infer<ReturnType<typeof bookingSchema>>

export const reviewSchema = z.object({
  rating: z.number().int().min(1, 'Choose a star rating.').max(5),
  comment: z.string().trim().max(500, 'Keep your review under 500 characters.').optional().or(z.literal('')),
})

export const EVIDENCE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const EVIDENCE_MAX_BYTES = 5 * 1024 * 1024

export function validateEvidenceFile(file: { type: string; size: number }): string | null {
  if (!(EVIDENCE_TYPES as readonly string[]).includes(file.type)) return 'Please choose a JPEG, PNG or WebP photo.'
  if (file.size > EVIDENCE_MAX_BYTES) return 'Photos must be 5 MB or smaller.'
  if (file.size === 0) return 'That file is empty.'
  return null
}

export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024

/** Profile photos are re-encoded in the browser, so the input may be larger than what is stored. */
export function validatePhotoFile(file: { type: string; size: number }): string | null {
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) return 'Please choose a JPEG, PNG or WebP photo.'
  if (file.size === 0) return 'That file is empty.'
  if (file.size > PHOTO_MAX_BYTES) return 'Photos must be 10 MB or smaller.'
  return null
}

export const PDF_MAX_BYTES = 5 * 1024 * 1024

/** Type, size and the %PDF- signature, so a renamed file can't slip through. The bucket also only accepts application/pdf. */
export async function validatePdf(file: Blob & { name?: string }): Promise<string | null> {
  if (file.type !== 'application/pdf' && !file.name?.toLowerCase().endsWith('.pdf')) return 'Please choose a PDF file.'
  if (file.size === 0) return 'That file is empty.'
  if (file.size > PDF_MAX_BYTES) return 'PDFs must be 5 MB or smaller.'
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer())
  if (String.fromCharCode(...head) !== '%PDF-') return 'That file is not a valid PDF.'
  return null
}

export const emailSchema = z.string().trim().toLowerCase().email('Please enter a valid email address.')

export const newPasswordSchema = z
  .object({
    password: z.string().min(8, 'Use at least 8 characters.').max(72, 'Please use 72 characters or fewer.'),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: 'The passwords don’t match.', path: ['confirm'] })

export function firstError(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form')
    if (!out[key]) out[key] = issue.message
  }
  return out
}
