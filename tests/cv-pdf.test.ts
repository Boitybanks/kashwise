import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildCvPdf, pdfSafe } from '../src/lib/cv-pdf'
import type { WorkCredential } from '../src/lib/pq/credential'

const record = (i: number) => ({ code: `SG-${i}`, title: `Paint room ${i}`, category: 'painting', area: 'Orlando, Johannesburg', completed_at: '2026-09-10T10:00:00Z', rating: 5, review: 'He arrived early and left it tidy. 👍', customer: 'Thandi M.' })
const credential = (n: number): WorkCredential => ({
  type: 'SideGigsWorkHistory', version: 1, issuer: 'SideGigs', issued_at: '2026-10-30T10:00:00Z', demo_data: false,
  worker: { id: 'w', name: 'Nomsa Žulu', area: 'Orlando', member_since: '2026-08-01T10:00:00Z', skills: [] },
  summary: { completed_gigs: n, average_rating: 4.5, reviews: n, repeat_customers: 1 }, records: Array.from({ length: n }, (_, i) => record(i)), profile_url: 'x',
})
const input = (n: number) => ({ credential: credential(n), summary: 'A careful painter — reliable.', skills: [{ name: 'Painting', jobs: n, evidence: [], examples: ['Paint room 1'] }], facts: [{ label: 'Jobs', value: String(n) }], headline: 'Painter', bio: 'I paint.', url: 'https://kashwise.netlify.app/w/w/cv' })

describe('CV PDF', () => {
  it('makes a real PDF, whatever characters people use', async () => {
    const bytes = await buildCvPdf(input(2))
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
    expect(doc.getTitle()).toBe('Nomsa Zulu - Verified CV')
  })

  it('flows long work histories onto more pages', async () => {
    expect((await PDFDocument.load(await buildCvPdf(input(40)))).getPageCount()).toBeGreaterThan(1)
  })

  it('keeps text printable in the built-in fonts', () => {
    expect(pdfSafe('“Good” — work… 👍 Žulu')).toBe('"Good" - work... Zulu')
  })
})
