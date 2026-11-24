// Builds the ProofScript CV as a real PDF file people can attach to a job application. Loaded on demand.
import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts, type RGB } from 'pdf-lib'
import { encode } from 'uqr'
import { categoryLabel } from './categories'
import { formatDate, formatMonthYear } from './format'
import type { WorkCredential } from './pq/credential'
import type { ProfileSkill } from './skills-profile'

export interface CvPdfInput {
  credential: WorkCredential
  summary: string
  skills: ProfileSkill[]
  facts: { label: string; value: string }[]
  headline: string | null
  bio: string | null
  url: string
  reference: string
}

const INK = rgb(0.067, 0.145, 0.165)
const SOFT = rgb(0.286, 0.353, 0.365)
const LINE = rgb(0.863, 0.894, 0.898)
const TEAL = rgb(0.051, 0.404, 0.443)
const GOLD = rgb(0.502, 0.376, 0.039)
const GOLD_BG = rgb(0.98, 0.949, 0.863)
const GOLD_LINE = rgb(0.831, 0.627, 0.09)
const WIDTH = 595.28
const HEIGHT = 841.89
const MARGIN = 48
const BOTTOM = 56

/** The built-in PDF fonts cover Western characters only, so anything else becomes its closest plain form. */
export function pdfSafe(text: string): string {
  return text
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/\s+/g, ' ')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim()
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of pdfSafe(text).split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(next, size) <= width || !line) line = next
    else { lines.push(line); line = word }
  }
  if (line) lines.push(line)
  return lines
}

export async function buildCvPdf(input: CvPdfInput): Promise<Uint8Array> {
  const { credential: c } = input
  const doc = await PDFDocument.create()
  doc.setTitle(pdfSafe(`${c.worker.name} - Verified CV`))
  doc.setAuthor('KashWise')
  doc.setCreator('KashWise ProofScript')
  const [sans, bold, serif, italic] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica), doc.embedFont(StandardFonts.HelveticaBold),
    doc.embedFont(StandardFonts.TimesRoman), doc.embedFont(StandardFonts.TimesRomanItalic),
  ])

  let page: PDFPage = doc.addPage([WIDTH, HEIGHT])
  let y = HEIGHT - MARGIN
  const room = (needed: number) => { if (y - needed < BOTTOM) { page = doc.addPage([WIDTH, HEIGHT]); y = HEIGHT - MARGIN } }
  const put = (text: string, x: number, at: number, font: PDFFont, size: number, color: RGB = INK) => page.drawText(pdfSafe(text), { x, y: at, font, size, color })
  const paragraph = (text: string, font: PDFFont, size: number, color: RGB = INK, x = MARGIN, width = WIDTH - MARGIN * 2) => {
    for (const line of wrap(text, font, size, width)) { room(size + 4); y -= size + 3.5; put(line, x, y, font, size, color) }
  }
  const rule = (thickness = 0.6, color: RGB = LINE) => page.drawLine({ start: { x: MARGIN, y }, end: { x: WIDTH - MARGIN, y }, thickness, color })
  const heading = (text: string) => {
    room(50); y -= 24; put(text, MARGIN, y, serif, 15); y -= 6; rule()
  }

  // Name and title, with a small "customer-verified" seal on the right
  const seal = 'Customer-verified'
  const sealWidth = bold.widthOfTextAtSize(seal, 8.5) + 20
  page.drawRectangle({ x: WIDTH - MARGIN - sealWidth, y: y - 16, width: sealWidth, height: 20, color: GOLD_BG, borderColor: GOLD_LINE, borderWidth: 0.7 })
  put(seal, WIDTH - MARGIN - sealWidth + 10, y - 9, bold, 8.5, GOLD)
  const textWidth = WIDTH - MARGIN * 2 - sealWidth - 16
  const nameSize = Math.min(32, 32 * textWidth / Math.max(serif.widthOfTextAtSize(pdfSafe(c.worker.name), 32), 1))
  y -= 26
  put(c.worker.name, MARGIN, y, serif, nameSize)
  y -= 6
  const proven = input.skills.slice(0, 3).map((s) => s.name).join('  |  ')
  if (proven) paragraph(proven, bold, 11, TEAL, MARGIN, textWidth)
  paragraph(`${c.worker.area}  |  Independent service provider since ${formatMonthYear(c.worker.member_since)}`, sans, 9, SOFT, MARGIN, textWidth)
  y -= 10
  rule(1.4, INK)

  // Facts
  rule()
  const column = (WIDTH - MARGIN * 2) / input.facts.length
  input.facts.forEach((f, i) => {
    put(f.value, MARGIN + i * column, y - 18, bold, 12)
    put(f.label, MARGIN + i * column, y - 31, sans, 7.5, SOFT)
  })
  y -= 40
  rule()

  heading('Profile')
  y -= 4
  paragraph(input.summary, sans, 10)

  if (input.skills.length) {
    heading('Key skills')
    y -= 4
    for (const s of input.skills) {
      room(32)
      y -= 14
      put(s.name, MARGIN, y, bold, 10)
      const count = `${s.jobs} ${s.jobs === 1 ? 'job' : 'jobs'}`
      put(count, WIDTH - MARGIN - sans.widthOfTextAtSize(count, 8.5), y, sans, 8.5, SOFT)
      if (s.examples.length) paragraph(s.examples.slice(0, 2).join(', '), sans, 8.5, SOFT)
      y -= 4
    }
  }

  if (c.records.length) {
    heading('Experience')
    for (const r of c.records) {
      const reviewLines = r.review ? wrap(`"${r.review}"`, italic, 11, WIDTH - MARGIN * 2 - 72) : []
      room(50 + reviewLines.length * 14)
      y -= 16
      put(formatMonthYear(r.completed_at), MARGIN, y, sans, 8.5, SOFT)
      put(r.title, MARGIN + 62, y, bold, 10.5)
      y -= 12
      put(`${categoryLabel(r.category)}  |  ${r.area}  |  Client: ${r.customer}`, MARGIN + 62, y, sans, 8.5, SOFT)
      if (reviewLines.length) {
        const top = y - 2
        for (const line of reviewLines) { y -= 13.5; put(line, MARGIN + 72, y, italic, 11) }
        page.drawLine({ start: { x: MARGIN + 64, y: top }, end: { x: MARGIN + 64, y: y - 2 }, thickness: 1.4, color: GOLD_LINE })
      }
      y -= 12
      put(`Confirmed by client ${formatDate(r.completed_at)}${r.rating != null ? `  |  ${r.rating}/5` : ''}`, MARGIN + 62, y, bold, 8, GOLD)
      y -= 6
      page.drawLine({ start: { x: MARGIN, y }, end: { x: WIDTH - MARGIN, y }, thickness: 0.4, color: LINE })
    }
  }

  if (input.headline || input.bio) {
    heading('Personal statement')
    y -= 2
    if (input.headline) paragraph(input.headline, bold, 9.5)
    if (input.bio) paragraph(input.bio, sans, 9.5)
  }

  // Verification footer: what "verified" means, a reference, and a QR code to the live copy
  const QR = 64
  room(QR + 40)
  y -= 18
  rule(1.4, INK)
  const footTop = y
  const footWidth = WIDTH - MARGIN * 2 - QR - 16
  y -= 4
  paragraph('Verified work history  |  KashWise ProofScript', bold, 8.5, INK, MARGIN, footWidth)
  paragraph('Each job above was confirmed by the client who paid for it. This is not an identity or qualification check.', sans, 8, SOFT, MARGIN, footWidth)
  paragraph(`Reference ${input.reference}  |  Issued ${formatDate(c.issued_at)}${c.demo_data ? '  |  Sample profile' : ''}`, sans, 8, SOFT, MARGIN, footWidth)
  paragraph(`Verify at ${input.url}`, sans, 8, SOFT, MARGIN, footWidth)
  const qr = encode(input.url, { ecc: 'M', border: 0 })
  const cell = QR / qr.size
  const qrTop = footTop - 8
  qr.data.forEach((row, r) => row.forEach((on, col) => {
    if (on) page.drawRectangle({ x: WIDTH - MARGIN - QR + col * cell, y: qrTop - (r + 1) * cell, width: cell + 0.1, height: cell + 0.1, color: INK })
  }))
  put('Scan to verify', WIDTH - MARGIN - QR + (QR - sans.widthOfTextAtSize('Scan to verify', 7)) / 2, qrTop - QR - 10, sans, 7, SOFT)

  return doc.save()
}

export function downloadPdf(bytes: Uint8Array, filename: string) {
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
