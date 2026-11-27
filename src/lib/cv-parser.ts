// Client-side CV reader & profile updater.
// Extracts text from an uploaded PDF or text CV right in the browser, maps work experience & skills to KashWise
// categories, strips private contact details (phone, email, street address, SA ID) from public fields, and merges
// skills with existing and completed-job skills.
import { CATEGORIES, categoryLabel, isCategory } from './categories'
import { spokenSkills, withoutContactDetails } from './dictation'

export interface CvProfileDraft {
  display_name: string | null
  area_slug: string | null
  headline: string
  bio: string
  skills: string[]
  added_skills: string[]
}

const CV_SKILL_PATTERNS: Record<string, RegExp> = {
  cleaning: /\b(clean(?:er|ing)?|domestic|housekeep(?:er|ing)|laundry|ironing|janitor(?:ial)?|hygiene|sanit[iz]\w*|char\b|deep[- ]clean)/i,
  gardening: /\b(garden(?:er|ing)?|landscap(?:e|er|ing)|lawn|grass|hedge|weed(?:ing)?|prun(?:e|ing)|tree felling|horticult\w*|groundsman|irrigation|planting)/i,
  tutoring: /\b(tutor(?:ing)?|teach(?:er|ing)?|educator|lectur(?:er|ing)|maths?|mathematics|physical science|science|accounting|homework|grade \d+|extra lessons)/i,
  'hair-beauty': /\b(hair(?:dresser|stylist)?|braid(?:s|ing)?|knotless|nails?|manicur\w*|pedicur\w*|make-?up|beauty|beautician|barber|salon|cosmetolog\w*|wig| dreadlock)/i,
  repairs: /\b(repair(?:s|ing)?|handyman|plumb(?:er|ing)|tap|geyser|pipe|leak|roof(?:ing)?|electric(?:al|ian)?|wiring|carpentr\w*|carpenter|weld(?:er|ing)|til(?:e|er|ing)|maintenance|mount(?:ing)?|install(?:er|ation)?|drywall|cupboard|gate|door)/i,
  painting: /\b(paint(?:er|ing)?|repaint\w*|waterproof(?:ing)?|plaster(?:er|ing)?|skim(?:ming)?|coat(?:ing)?|varnish)/i,
  catering: /\b(cater(?:er|ing)?|cook(?:ing)?|chef|kitchen|bak(?:e|er|ing)|pastry|food prep\w*|meal(?:s)?|hospitality|waiter|waitress|banquet)/i,
  photography: /\b(photograph(?:er|y)?|camera|videograph\w*|portrait(?:s)?|photo edit\w*|shoot(?:s)?|lighting)/i,
  moving: /\b(mov(?:er|ing)|move house|bakkie|deliver(?:y|ies)|driver|code 10|code 14|pdp\b|furniture|removal(?:s)?|courier|logistics|loader|warehouse| rubble)/i,
  'tech-support': /\b(tech[- ]?support|it support|computer|laptop|wi-?fi|network(?:ing)?|printer|software|hardware|help[- ]?desk|pc repair|cellphone repair|troubleshoot\w*)/i,
  automotive: /\b(automotiv\w*|mechanic|motor|vehicle|car service|panel[- ]?beat\w*|auto electric\w*|tyre|brake(?:s)?|engine|diesel|diagnostics)/i,
}

const SA_ID_PATTERN = /\b\d{13}\b/g
const HEADING_NOISE = /^(?:curriculum vitae|cv|resume|r[eé]sum[eé]|personal (?:details|information|profile|statement)|contact (?:details|information)|work experience|employment history|education|qualifications|skills|references|page \d+(?: of \d+)?)$/i

function cleanPublicText(text: string): string {
  return withoutContactDetails(text.replace(SA_ID_PATTERN, ''))
    .replace(/\b(?:id(?:\s*number|\s*no)?|cell|tel|phone|mobile|whatsapp|email|e-mail|address|residing at)\s*[:.-]?\s*(?=[,.;\n]|$)/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Detect all KashWise skill categories mentioned in a CV text. */
export function extractSkillsFromCvText(text: string): string[] {
  const found = new Set<string>(spokenSkills(text))
  for (const [slug, re] of Object.entries(CV_SKILL_PATTERNS)) {
    if (re.test(text)) found.add(slug)
  }
  return CATEGORIES.map((c) => c.slug).filter((slug) => found.has(slug))
}

/** Merge current profile skills with newly discovered skills (from a CV or from completed jobs), up to 12. */
export function mergeProfileSkills(existing: readonly string[], incoming: readonly string[]): string[] {
  const out: string[] = []
  for (const s of [...existing, ...incoming]) {
    if (isCategory(s) && !out.includes(s) && out.length < 12) {
      out.push(s)
    }
  }
  return out
}

/** Alias used when jobs are completed: appends completed job categories to the worker's profile skills. */
export function mergeCompletedJobSkills(currentSkills: readonly string[], completedCategories: readonly string[]): string[] {
  return mergeProfileSkills(currentSkills, completedCategories)
}

function clipText(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const sentence = cut.lastIndexOf('. ')
  if (sentence > max * 0.55) return cut.slice(0, sentence + 1)
  const space = cut.lastIndexOf(' ')
  return (space > 0 ? cut.slice(0, space) : cut).replace(/[,;:-]+$/, '').trim()
}

function stripControlChars(input: string): string {
  let out = ''
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i)
    out += code < 32 && code !== 10 && code !== 9 ? ' ' : input[i]
  }
  return out
}

/** Parse raw text extracted from a CV into a profile update draft. */
export function parseCvText(
  rawText: string,
  existingSkills: readonly string[] = [],
  areas: readonly { slug: string; name: string; city: string }[] = [],
): CvProfileDraft {
  const normalized = stripControlChars(rawText.replace(/\r\n?/g, '\n'))
  const cvSkills = extractSkillsFromCvText(normalized)
  const mergedSkills = mergeProfileSkills(existingSkills, cvSkills)
  const addedSkills = mergedSkills.filter((s) => !existingSkills.includes(s))

  // Detect area if mentioned in the CV
  let detectedArea: string | null = null
  const lower = normalized.toLowerCase()
  for (const a of areas) {
    const nameRe = new RegExp(`\\b${a.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    if (nameRe.test(lower)) {
      detectedArea = a.slug
      break
    }
  }
  if (!detectedArea && /\b(orlando|diepkloof|meadowlands|dobsonville|pimville|protea glen|jabulani|zola)\b/i.test(lower)) {
    if (areas.some((a) => a.slug === 'soweto') || areas.length === 0) detectedArea = 'soweto'
  }

  // Split into meaningful lines
  const lines = normalized
    .split(/\n+/)
    .map((l) => l.replace(/^[\s•\-*·▪►]+/, '').trim())
    .filter((l) => l.length >= 2 && !HEADING_NOISE.test(l))

  // Detect candidate display name from the first short Title-Case line if it looks like a person's name
  let detectedName: string | null = null
  for (const line of lines.slice(0, 4)) {
    const cleaned = withoutContactDetails(line).trim()
    if (
      /^[A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){1,3}$/.test(cleaned) &&
      cleaned.length >= 4 &&
      cleaned.length <= 50 &&
      !HEADING_NOISE.test(cleaned) &&
      extractSkillsFromCvText(cleaned).length === 0
    ) {
      detectedName = cleaned
      break
    }
  }

  // Filter lines for bio/summary content
  const contentLines: string[] = []
  for (const line of lines) {
    if (detectedName && line === detectedName) continue
    if (/^(?:id|cell|tel|phone|email|address|date of birth|dob|gender|nationality|marital status|languages?|references?)\b/i.test(line)) continue
    const scrubbed = cleanPublicText(line)
    if (scrubbed.length < 12) continue
    contentLines.push(scrubbed)
    if (contentLines.join(' ').length >= 520) break
  }

  // Extract years of experience if explicitly stated in CV
  const yearsMatch = normalized.match(/\b(\d{1,2})\+?\s+years?(?:\s+of)?\s+(?:experience|work)/i)
  const yearsNote = yearsMatch ? `${yearsMatch[1]} years of experience` : null

  const skillLabels = (cvSkills.length ? cvSkills : mergedSkills).slice(0, 3).map(categoryLabel)
  let headline = ''
  if (skillLabels.length > 0) {
    headline = clipText(
      yearsNote ? `${skillLabels.join(' · ')} — ${yearsNote}` : skillLabels.join(' · '),
      80,
    )
  } else if (contentLines[0]) {
    headline = clipText(contentLines[0].replace(/[.!?]+$/, ''), 80)
  }

  let bio = ''
  if (contentLines.length > 0) {
    const joined = contentLines
      .map((s) => {
        const c = s.charAt(0).toUpperCase() + s.slice(1)
        return /[.!?]$/.test(c) ? c : `${c}.`
      })
      .join(' ')
    bio = clipText(joined, 500)
  } else if (skillLabels.length > 0) {
    bio = clipText(
      `Experienced in ${skillLabels.join(', ').toLowerCase()}${yearsNote ? ` with ${yearsNote}` : ''}. Profile updated from uploaded CV.`,
      500,
    )
  }

  return {
    display_name: detectedName,
    area_slug: detectedArea,
    headline,
    bio,
    skills: mergedSkills,
    added_skills: addedSkills,
  }
}

// ── Client-side PDF text extraction ────────────────────────────────────────

function decodePdfLiteralString(raw: string): string {
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (ch !== '\\') {
      out += ch
      continue
    }
    const next = raw[++i]
    if (next === undefined) break
    if (next === 'n') out += '\n'
    else if (next === 'r') out += '\n'
    else if (next === 't') out += ' '
    else if (next === 'b' || next === 'f') out += ' '
    else if (/[0-7]/.test(next)) {
      let oct = next
      if (i + 1 < raw.length && /[0-7]/.test(raw[i + 1])) oct += raw[++i]
      if (i + 1 < raw.length && /[0-7]/.test(raw[i + 1])) oct += raw[++i]
      const code = parseInt(oct, 8)
      if (code >= 32 && code <= 126) out += String.fromCharCode(code)
    } else {
      out += next
    }
  }
  return out
}

function decodePdfHexString(hex: string): string {
  const clean = hex.replace(/\s+/g, '')
  if (clean.length < 2) return ''
  const bytes: number[] = []
  for (let i = 0; i < clean.length; i += 2) {
    const b = parseInt(clean.slice(i, i + 2).padEnd(2, '0'), 16)
    if (!Number.isNaN(b)) bytes.push(b)
  }
  // UTF-16BE BOM
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = ''
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      const code = (bytes[i] << 8) | bytes[i + 1]
      if (code >= 32) out += String.fromCharCode(code)
    }
    return out
  }
  return bytes
    .filter((b) => (b >= 32 && b <= 126) || b === 10 || b === 13)
    .map((b) => String.fromCharCode(b))
    .join('')
}

function extractTextOperatorsFromStream(streamText: string): string[] {
  const chunks: string[] = []
  // Extract text from (...) and [...] TJ / Tj operators
  const tokenRe = /\((?:\\.|[^\\()])*\)|<([0-9A-Fa-f\s]{2,})>|(Td|TD|T\*|ET)\b/g
  let match: RegExpExecArray | null
  let lineBuffer: string[] = []
  while ((match = tokenRe.exec(streamText)) !== null) {
    const token = match[0]
    if (token.startsWith('(') && token.endsWith(')')) {
      const decoded = decodePdfLiteralString(token.slice(1, -1)).trim()
      if (decoded) lineBuffer.push(decoded)
    } else if (match[1]) {
      const decoded = decodePdfHexString(match[1]).trim()
      if (decoded) lineBuffer.push(decoded)
    } else if (match[2]) {
      if (lineBuffer.length > 0) {
        chunks.push(lineBuffer.join(' '))
        lineBuffer = []
      }
    }
  }
  if (lineBuffer.length > 0) chunks.push(lineBuffer.join(' '))
  return chunks
}

async function tryInflate(bytes: Uint8Array): Promise<string | null> {
  if (typeof DecompressionStream === 'undefined') return null
  for (const format of ['deflate', 'deflate-raw'] as const) {
    try {
      const ds = new DecompressionStream(format)
      const writer = ds.writable.getWriter()
      writer.write(bytes as unknown as BufferSource).catch(() => {})
      writer.close().catch(() => {})
      const reader = ds.readable.getReader()
      const parts: Uint8Array[] = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) parts.push(value)
      }
      const total = parts.reduce((acc, p) => acc + p.length, 0)
      const out = new Uint8Array(total)
      let offset = 0
      for (const p of parts) {
        out.set(p, offset)
        offset += p.length
      }
      return new TextDecoder('latin1').decode(out)
    } catch {
      // Try next format
    }
  }
  return null
}

/** Extracts human-readable text from a PDF or plain-text CV file in the browser. */
export async function extractTextFromCvFile(file: Blob & { name?: string; type?: string }): Promise<string> {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  const latin1 = new TextDecoder('latin1').decode(bytes)

  if (!latin1.startsWith('%PDF-')) {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes).trim()
  }

  const lines: string[] = []
  // 1. Scan all stream ... endstream blocks (both uncompressed and FlateDecode compressed)
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g
  let m: RegExpExecArray | null
  while ((m = streamRe.exec(latin1)) !== null) {
    const rawStream = m[1]
    if (/\b(?:Tj|TJ|BT)\b/.test(rawStream)) {
      lines.push(...extractTextOperatorsFromStream(rawStream))
      continue
    }
    const streamBytes = new Uint8Array(rawStream.length)
    for (let i = 0; i < rawStream.length; i++) streamBytes[i] = rawStream.charCodeAt(i) & 0xff
    const inflated = await tryInflate(streamBytes)
    if (inflated && /\b(?:Tj|TJ|BT)\b/.test(inflated)) {
      lines.push(...extractTextOperatorsFromStream(inflated))
    }
  }

  // 2. Also check any top-level literal strings / PDF metadata / text outside stream blocks
  if (lines.join(' ').trim().length < 20) {
    lines.push(...extractTextOperatorsFromStream(latin1))
  }

  const cleaned = lines
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length >= 2 && /[a-zA-Z]{2,}/.test(l))
    .join('\n')

  return cleaned
}
