import { describe, expect, it } from 'vitest'
import { isRecoveryUrl, parseRecoveryLink } from '../src/lib/recovery'
import { emailSchema, newPasswordSchema, validatePdf, validatePhotoFile } from '../src/lib/validation'

const pdf = (body: string, name = 'cert.pdf', type = 'application/pdf') => new File([body], name, { type })

describe('password reset links', () => {
  it('reads tokens from the default Supabase email link', () => {
    expect(parseRecoveryLink('#access_token=a.b.c&refresh_token=r1&expires_in=3600&type=recovery', '')).toEqual({
      kind: 'tokens',
      accessToken: 'a.b.c',
      refreshToken: 'r1',
    })
  })
  it('reads a token hash from a custom email template', () => {
    expect(parseRecoveryLink('', '?token_hash=abc123&type=recovery')).toEqual({ kind: 'token_hash', tokenHash: 'abc123' })
  })
  it('explains expired or invalid links', () => {
    expect(parseRecoveryLink('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid', '')).toMatchObject({
      kind: 'error',
      message: expect.stringMatching(/expired/),
    })
    expect(parseRecoveryLink('', '?error=server_error')).toMatchObject({ kind: 'error' })
  })
  it('ignores sign-in tokens that are not for recovery, and plain visits', () => {
    expect(parseRecoveryLink('#access_token=a&refresh_token=r&type=signup', '')).toEqual({ kind: 'none' })
    expect(parseRecoveryLink('', '')).toEqual({ kind: 'none' })
  })
  it('spots a recovery link on any page', () => {
    expect(isRecoveryUrl('', '#access_token=a&type=recovery')).toBe(true)
    expect(isRecoveryUrl('?token_hash=x&type=recovery', '')).toBe(true)
    expect(isRecoveryUrl('?type=recoveryX', '#type=signup')).toBe(false)
  })
  it('validates the new password and email', () => {
    expect(newPasswordSchema.safeParse({ password: 'longenough', confirm: 'longenough' }).success).toBe(true)
    expect(newPasswordSchema.safeParse({ password: 'short', confirm: 'short' }).success).toBe(false)
    const mismatch = newPasswordSchema.safeParse({ password: 'longenough', confirm: 'longenougH' })
    expect(mismatch.success).toBe(false)
    expect(mismatch.error?.issues[0].path).toEqual(['confirm'])
    expect(emailSchema.parse('  Sipho@Example.com ')).toBe('sipho@example.com')
  })
})

describe('document and photo uploads', () => {
  it('accepts real PDFs only', async () => {
    expect(await validatePdf(pdf('%PDF-1.7\n...'))).toBeNull()
    expect(await validatePdf(pdf('%PDF-1.4', 'CERT.PDF', ''))).toBeNull() // some Windows browsers leave the type blank
    expect(await validatePdf(pdf('%PDF-1.7', 'photo.jpg', 'image/jpeg'))).toMatch(/choose a PDF/)
    expect(await validatePdf(pdf('MZ\x90 not a pdf'))).toMatch(/not a valid PDF/)
    expect(await validatePdf(pdf(''))).toMatch(/empty/)
    expect(await validatePdf(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.pdf', { type: 'application/pdf' }))).toMatch(/5 MB/)
  })
  it('accepts common photo types up to 10 MB', () => {
    expect(validatePhotoFile({ type: 'image/png', size: 2_000_000 })).toBeNull()
    expect(validatePhotoFile({ type: 'image/gif', size: 2_000 })).toMatch(/JPEG, PNG or WebP/)
    expect(validatePhotoFile({ type: 'image/jpeg', size: 11 * 1024 * 1024 })).toMatch(/10 MB/)
  })
})
