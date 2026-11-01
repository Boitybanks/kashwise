// Builds the ProofScript CV as a real PDF file people can attach to a job application. Loaded on demand.
import { LineCapStyle, PDFDocument, PDFFont, PDFPage, rgb, StandardFonts, type RGB } from 'pdf-lib'
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

  // Masthead
  page.drawRectangle({ x: MARGIN, y: y - 18, width: 22, height: 22, color: rgb(0.051, 0.58, 0.533) })
  page.drawSvgPath('M 5.2 11.3 L 8.9 15.1 L 14.8 7.6', { x: MARGIN, y: y + 4, borderColor: rgb(1, 1, 1), borderWidth: 2.6, borderLineCap: LineCapStyle.Round })
  page.drawCircle({ x: MARGIN + 16.8, y: y - 1.2, size: 2.6, color: rgb(0.949, 0.725, 0.173) })
  put('KashWise', MARGIN + 29, y - 12, bold, 11)
  put('ProofScript', MARGIN + 29 + bold.widthOfTextAtSize('KashWise ', 11), y - 12, italic, 12, TEAL)
  const seal = 'Verified by KashWise'
  const sealWidth = bold.widthOfTextAtSize(seal, 8.5) + 20
  page.drawRectangle({ x: WIDTH - MARGIN - sealWidth, y: y - 17, width: sealWidth, height: 20, color: GOLD_BG, borderColor: GOLD_LINE, borderWidth: 0.7 })
  put(seal, WIDTH - MARGIN - sealWidth + 10, y - 10, bold, 8.5, GOLD)
  y -= 26
  rule(1.4, INK)

  // Who, with the QR code beside them
  const qr = encode(input.url, { ecc: 'M', border: 0 })
  const cell = 74 / qr.size
  const qrTop = y - 14
  qr.data.forEach((row, r) => row.forEach((on, col) => {
    if (on) page.drawRectangle({ x: WIDTH - MARGIN - 74 + col * cell, y: qrTop - (r + 1) * cell, width: cell + 0.1, height: cell + 0.1, color: INK })
  }))
  put('Scan to check it live', WIDTH - MARGIN - 74 + (74 - sans.widthOfTextAtSize('Scan to check it live', 7)) / 2, qrTop - 84, sans, 7, SOFT)
  y -= 24
  put('VERIFIED WORK RECORD', MARGIN, y, bold, 7.5, TEAL)
  y -= 32
  const textWidth = WIDTH - MARGIN * 2 - 90
  const nameSize = Math.min(34, 34 * textWidth / Math.max(serif.widthOfTextAtSize(pdfSafe(c.worker.name), 34), 1))
  put(c.worker.name, MARGIN, y, serif, nameSize)
  y -= 4
  const proven = input.skills.slice(0, 3).map((s) => s.name).join('  |  ')
  if (proven) paragraph(proven, bold, 10.5, INK, MARGIN, textWidth)
  paragraph(`${c.worker.area}  |  On KashWise since ${formatMonthYear(c.worker.member_since)}`, sans, 9, SOFT, MARGIN, textWidth)
  y = Math.min(y, qrTop - 92) - 12

  // Facts
  rule()
  const column = (WIDTH - MARGIN * 2) / input.facts.length
  input.facts.forEach((f, i) => {
    put(f.value, MARGIN + i * column, y - 18, bold, 12)
    put(f.label, MARGIN + i * column, y - 31, sans, 7.5, SOFT)
  })
  y -= 40
  rule()

  heading('Professional summary')
  y -= 4
  paragraph(input.summary, sans, 10)

  if (input.skills.length) {
    heading('Proven skills')
    y -= 4
    paragraph('Every skill here comes from jobs customers confirmed.', sans, 8.5, SOFT)
    y -= 4
    for (const s of input.skills) {
      room(32)
      y -= 14
      put(s.name, MARGIN, y, bold, 10)
      const count = `${s.jobs} confirmed ${s.jobs === 1 ? 'job' : 'jobs'}`
      put(count, WIDTH - MARGIN - sans.widthOfTextAtSize(count, 8.5), y, sans, 8.5, SOFT)
      if (s.examples.length) paragraph(s.examples.slice(0, 3).join(', '), sans, 8.5, SOFT)
      y -= 4
    }
  }

  if (c.records.length) {
    heading('Work history')
    for (const r of c.records) {
      const reviewLines = r.review ? wrap(`"${r.review}"`, italic, 11, WIDTH - MARGIN * 2 - 72) : []
      room(50 + reviewLines.length * 14)
      y -= 16
      put(formatMonthYear(r.completed_at), MARGIN, y, sans, 8.5, SOFT)
      put(r.title, MARGIN + 62, y, bold, 10.5)
      y -= 12
      put(`${categoryLabel(r.category)}  |  ${r.area}  |  for ${r.customer}`, MARGIN + 62, y, sans, 8.5, SOFT)
      if (reviewLines.length) {
        const top = y - 2
        for (const line of reviewLines) { y -= 13.5; put(line, MARGIN + 72, y, italic, 11) }
        page.drawLine({ start: { x: MARGIN + 64, y: top }, end: { x: MARGIN + 64, y: y - 2 }, thickness: 1.4, color: GOLD_LINE })
      }
      y -= 12
      put(`Confirmed by customer ${formatDate(r.completed_at)}${r.rating != null ? `  |  ${r.rating}/5` : ''}`, MARGIN + 62, y, bold, 8, GOLD)
      y -= 6
      page.drawLine({ start: { x: MARGIN, y }, end: { x: WIDTH - MARGIN, y }, thickness: 0.4, color: LINE })
    }
  }

  if (input.headline || input.bio) {
    const first = c.worker.name.split(' ')[0]
    heading(`In ${first}'s own words`)
    y -= 2
    if (input.headline) paragraph(input.headline, bold, 9.5)
    if (input.bio) paragraph(input.bio, sans, 9.5)
    paragraph(`Written by ${first}.`, sans, 8, SOFT)
  }

  room(44)
  y -= 18
  rule(1.4, INK)
  y -= 4
  paragraph('"Verified" means the customer confirmed the job was done. It is not an identity or qualification check.', sans, 8, SOFT)
  paragraph(`Issued ${formatDate(c.issued_at)}. Check this record at ${input.url}`, sans, 8, SOFT)
  if (c.demo_data) paragraph('Sample profile.', sans, 8, SOFT)

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
