import { describe, expect, it } from 'vitest'
import { addDays, bookingSchema, gigSchema, phoneSchema, serviceSchema, signupSchema, validateEvidenceFile } from '../src/lib/validation'

const today = '2026-09-26'
const valid = {
  title: 'Paint my front wall',
  category: 'painting',
  description: 'About 12 square metres, paint is already bought.',
  area_slug: 'soweto',
  scheduled_date: addDays(today, 2),
  time_window: 'morning',
  payout_cents: 50_000,
}

describe('gig validation', () => {
  it('accepts a complete gig', () => {
    expect(gigSchema(today).safeParse(valid).success).toBe(true)
  })
  it('rejects past dates, tiny payouts, short descriptions and unknown categories', () => {
    expect(gigSchema(today).safeParse({ ...valid, scheduled_date: '2026-09-25' }).success).toBe(false)
    expect(gigSchema(today).safeParse({ ...valid, payout_cents: 4_999 }).success).toBe(false)
    expect(gigSchema(today).safeParse({ ...valid, description: 'too short' }).success).toBe(false)
    expect(gigSchema(today).safeParse({ ...valid, category: 'crypto-trading' }).success).toBe(false)
  })
})

describe('service and booking validation', () => {
  const service = { title: 'Paint one interior room', category: 'painting', description: 'Two coats, I bring rollers and drop sheets.', area_slug: 'soweto', take_home_cents: 45_000 }
  it('prices a service by what the provider receives: R45 to R45 000', () => {
    expect(serviceSchema.safeParse(service).success).toBe(true)
    expect(serviceSchema.safeParse({ ...service, take_home_cents: 4_499 }).success).toBe(false)
    expect(serviceSchema.safeParse({ ...service, take_home_cents: 4_500_001 }).success).toBe(false)
  })
  it('books a date, area and time without re-describing the job', () => {
    const booking = { area_slug: 'soweto', scheduled_date: addDays(today, 1), time_window: 'flexible' }
    expect(bookingSchema(today).safeParse(booking).success).toBe(true)
    expect(bookingSchema(today).safeParse({ ...booking, scheduled_date: '2026-09-25' }).success).toBe(false)
    expect(bookingSchema(today).safeParse({ ...booking, area_slug: '' }).success).toBe(false)
  })
})

describe('sign-up and contact validation', () => {
  it('requires a role, area and 8+ character password', () => {
    const ok = { display_name: 'Sipho', email: 'sipho@example.com', password: 'longenough', role: 'worker', area_slug: 'soweto' }
    expect(signupSchema.safeParse(ok).success).toBe(true)
    expect(signupSchema.safeParse({ ...ok, password: 'short' }).success).toBe(false)
    expect(signupSchema.safeParse({ ...ok, role: 'admin' }).success).toBe(false)
  })
  it('accepts South African phone numbers only', () => {
    expect(phoneSchema.parse('071 234 5678')).toBe('0712345678')
    expect(phoneSchema.safeParse('+27 82 123 4567').success).toBe(true)
    expect(phoneSchema.safeParse('12345').success).toBe(false)
  })
  it('restricts evidence uploads to small images', () => {
    expect(validateEvidenceFile({ type: 'image/jpeg', size: 200_000 })).toBeNull()
    expect(validateEvidenceFile({ type: 'application/pdf', size: 200 })).toMatch(/JPEG/)
    expect(validateEvidenceFile({ type: 'image/png', size: 6 * 1024 * 1024 })).toMatch(/5 MB/)
  })
})
