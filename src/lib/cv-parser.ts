// Client-side CV reader & profile updater.
// Extracts text from an uploaded PDF or text CV right in the browser, maps work experience & skills to KashWise
// categories, strips private contact details (phone, email, street address, SA ID) from public fields, merges
// skills with existing and completed-job skills, and recommends specific jobs & services the worker can do.
import { CATEGORIES, categoryLabel, isCategory } from './categories'
import { baselineFloor, spokenSkills, withoutContactDetails } from './dictation'
import { workerNetCents } from './money'

export interface CvSuggestedJob {
  category: string
  category_label: string
  title: string
  description: string
  matched_terms: string[]
  typical_payout_cents: number
  typical_net_cents: number
}

export interface CvProfileDraft {
  display_name: string | null
  area_slug: string | null
  headline: string
  bio: string
  skills: string[]
  added_skills: string[]
  suggested_jobs: CvSuggestedJob[]
}

const CV_SKILL_PATTERNS: Record<string, RegExp> = {
  cleaning: /\b(clean(?:er|ing)?|domestic|housekeep(?:er|ing)|laundry|ironing|janitor(?:ial)?|hygiene|sanit[iz]\w*|char\b|deep[- ]clean)/i,
  gardening: /\b(garden(?:er|ing)?|landscap(?:e|er|ing)|lawn|grass|hedge|weed(?:ing)?|prun(?:e|ing)|tree felling|horticult\w*|groundsman|irrigation|planting)/i,
  tutoring: /\b(tutor(?:ing)?|teach(?:er|ing)?|educator|lectur(?:er|ing)|maths?|mathematics|physical science|science|accounting|homework|grade \d+|extra lessons)/i,
  'hair-beauty': /\b(hair(?:dresser|stylist)?|braid(?:s|ing)?|knotless|nails?|manicur\w*|pedicur\w*|make-?up|beauty|beautician|barber|salon|cosmetolog\w*|wig|dreadlock)/i,
  repairs: /\b(repair(?:s|ing)?|handyman|plumb(?:er|ing)|tap|geyser|pipe|leak|roof(?:ing)?|electric(?:al|ian)?|wiring|carpentr\w*|carpenter|weld(?:er|ing)|til(?:e|er|ing)|maintenance|mount(?:ing)?|install(?:er|ation)?|drywall|cupboard|gate|door)/i,
  painting: /\b(paint(?:er|ing)?|repaint\w*|waterproof(?:ing)?|plaster(?:er|ing)?|skim(?:ming)?|coat(?:ing)?|varnish)/i,
  catering: /\b(cater(?:er|ing)?|cook(?:ing)?|chef|kitchen|bak(?:e|er|ing)|pastry|food prep\w*|meal(?:s)?|hospitality|waiter|waitress|banquet|braai)/i,
  photography: /\b(photograph(?:er|y)?|camera|videograph\w*|portrait(?:s)?|photo edit\w*|shoot(?:s)?|lighting)/i,
  moving: /\b(mov(?:er|ing)|move house|bakkie|deliver(?:y|ies)|driver|code 10|code 14|pdp\b|prdp\b|furniture|removal(?:s)?|courier|logistics|loader|warehouse|rubble)/i,
  'tech-support': /\b(tech[- ]?support|it support|computer|laptop|wi-?fi|network(?:ing)?|printer|software|hardware|help[- ]?desk|pc repair|cellphone repair|troubleshoot\w*|developer|programming|web|digital|data|system(?:s)?)/i,
  automotive: /\b(automotiv\w*|mechanic|motor|vehicle|car service|panel[- ]?beat\w*|auto electric\w*|tyre|brake(?:s)?|engine|diesel|diagnostics)/i,
}

interface JobTemplate {
  defaultTitle: string
  defaultDescription: string
  specialties: { re: RegExp; label: string; jobTitle: string }[]
}

const JOB_TEMPLATES: Record<string, JobTemplate> = {
  cleaning: {
    defaultTitle: 'Home, patio & deep cleaning',
    defaultDescription: 'Full house cleaning, move-in/move-out scrub, laundry, ironing and post-event tidy-ups.',
    specialties: [
      { re: /\bdeep[- ]?clean/i, label: 'deep cleaning', jobTitle: 'Deep house & move-out cleaning' },
      { re: /\b(laundry|ironing)\b/i, label: 'laundry & ironing', jobTitle: 'Domestic cleaning, laundry & ironing' },
      { re: /\b(housekeep\w*|domestic)\b/i, label: 'housekeeping', jobTitle: 'Regular housekeeping & home care' },
      { re: /\b(janitor\w*|hygiene|sanit\w*)\b/i, label: 'commercial hygiene', jobTitle: 'Office & home hygiene cleaning' },
    ],
  },
  gardening: {
    defaultTitle: 'Garden maintenance, lawn & pruning',
    defaultDescription: 'Lawn mowing, hedge trimming, weeding, repotting plants and seasonal yard clean-ups.',
    specialties: [
      { re: /\blandscap\w*/i, label: 'landscaping', jobTitle: 'Garden landscaping & bed layout' },
      { re: /\b(tree felling|prun\w*|hedge)\b/i, label: 'pruning & tree care', jobTitle: 'Tree pruning, hedge trimming & clearing' },
      { re: /\b(lawn|grass|groundsman)\b/i, label: 'lawn care', jobTitle: 'Lawn mowing, edging & yard tidy-up' },
      { re: /\b(planting|irrigation|horticult\w*)\b/i, label: 'planting & irrigation', jobTitle: 'Planting, repotting & garden care' },
    ],
  },
  tutoring: {
    defaultTitle: 'Private tutoring & exam prep',
    defaultDescription: 'One-on-one or small-group lessons, homework coaching, language practice and exam preparation.',
    specialties: [
      { re: /\b(maths?|mathematics|accounting)\b/i, label: 'Maths & Accounting', jobTitle: 'Maths & Accounting tutoring lessons' },
      { re: /\b(physical science|science)\b/i, label: 'Science tutoring', jobTitle: 'Physical Science & school subject coaching' },
      { re: /\b(teach\w*|educator|lectur\w*)\b/i, label: 'teaching & coaching', jobTitle: 'Structured lessons & homework support' },
    ],
  },
  'hair-beauty': {
    defaultTitle: 'Mobile hair styling, braiding & grooming',
    defaultDescription: 'Knotless braids, wig installations, barber fades, manicures and bridal or event styling.',
    specialties: [
      { re: /\b(braid\w*|knotless|dreadlock)\b/i, label: 'braiding', jobTitle: 'Knotless braiding & protective styling' },
      { re: /\b(wig|hair(?:dresser|stylist)?|salon)\b/i, label: 'hair styling', jobTitle: 'Wig install & mobile hair styling' },
      { re: /\b(barber)\b/i, label: 'barbering', jobTitle: 'Mobile barber cuts & beard line-ups' },
      { re: /\b(nails?|manicur\w*|pedicur\w*|make-?up|beaut\w*)\b/i, label: 'nails & beauty', jobTitle: 'Manicures, makeup & beauty appointments' },
    ],
  },
  repairs: {
    defaultTitle: 'Handyman repairs, mounting & maintenance',
    defaultDescription: 'Plumbing fixes, TV & shelf mounting, electrical troubleshooting, tiling, carpentry and gate repairs.',
    specialties: [
      { re: /\b(plumb\w*|tap|geyser|pipe|leak)\b/i, label: 'plumbing repairs', jobTitle: 'Plumbing, leaking taps & pipe repairs' },
      { re: /\b(electric\w*|wiring)\b/i, label: 'electrical work', jobTitle: 'Electrical repairs, plugs & lighting fixes' },
      { re: /\b(mount\w*|install\w*|cupboard|door|drywall)\b/i, label: 'mounting & installations', jobTitle: 'TV mounting, curtain rails & cupboard fixes' },
      { re: /\b(til(?:e|er|ing)|carpentr\w*|carpenter|weld\w*|gate|roof\w*)\b/i, label: 'structural & trade repairs', jobTitle: 'Tiling, carpentry, gate & roof repairs' },
    ],
  },
  painting: {
    defaultTitle: 'Interior & exterior painting',
    defaultDescription: 'Wall preparation, crack filling, skimming, waterproofing and neat interior or exterior coats.',
    specialties: [
      { re: /\bwaterproof\w*/i, label: 'waterproofing', jobTitle: 'Roof & wall waterproofing and painting' },
      { re: /\b(plaster\w*|skim\w*)\b/i, label: 'plastering & skimming', jobTitle: 'Wall skimming, prep & house painting' },
      { re: /\b(paint\w*|repaint\w*|varnish|coat\w*)\b/i, label: 'house painting', jobTitle: 'Room, boundary wall & exterior painting' },
    ],
  },
  catering: {
    defaultTitle: 'Event catering, braai & home cooking',
    defaultDescription: 'Private chef meals, weekend braai master bookings, baking, platters and family event catering.',
    specialties: [
      { re: /\b(braai|chef|cook\w*)\b/i, label: 'cooking & braai', jobTitle: 'Braai master & private event cooking' },
      { re: /\b(bak(?:e|er|ing)|pastry)\b/i, label: 'baking & pastry', jobTitle: 'Custom baking, platters & event treats' },
      { re: /\b(cater\w*|banquet|hospitality|waiter|waitress)\b/i, label: 'event catering', jobTitle: 'Party catering, food prep & serving' },
    ],
  },
  photography: {
    defaultTitle: 'Event, portrait & product photography',
    defaultDescription: 'Golden-hour shoots, birthday and family portraits, product drops and clean photo/video editing.',
    specialties: [
      { re: /\b(videograph\w*|shoot\w*)\b/i, label: 'photo & video shoots', jobTitle: 'Event & brand photo/video shoots' },
      { re: /\b(portrait\w*|photo edit\w*|lighting)\b/i, label: 'portraits & editing', jobTitle: 'Portrait sessions & retouched photo sets' },
    ],
  },
  moving: {
    defaultTitle: 'Furniture moving, deliveries & loading',
    defaultDescription: 'Apartment moves, bakkie furniture collection, heavy lifting, warehouse loading and rubble clearing.',
    specialties: [
      { re: /\b(bakkie|driver|code 10|code 14|pdp|prdp|deliver\w*|courier)\b/i, label: 'driving & deliveries', jobTitle: 'Bakkie deliveries & furniture transport' },
      { re: /\b(mov(?:er|ing)|furniture|removal\w*|loader)\b/i, label: 'furniture removals', jobTitle: 'Home & apartment moving assistance' },
    ],
  },
  'tech-support': {
    defaultTitle: 'Phone, laptop & Wi-Fi tech support',
    defaultDescription: 'Laptop speed-ups, WhatsApp & phone storage cleanup, Wi-Fi setup, printers and digital troubleshooting.',
    specialties: [
      { re: /\b(laptop|computer|pc repair|hardware|software)\b/i, label: 'PC & laptop support', jobTitle: 'Laptop setup, cleanup & software fixes' },
      { re: /\b(wi-?fi|network\w*|printer)\b/i, label: 'Wi-Fi & printer setup', jobTitle: 'Home Wi-Fi, router & printer installation' },
      { re: /\b(cellphone|troubleshoot\w*|help[- ]?desk|it support|tech)\b/i, label: 'device troubleshooting', jobTitle: 'Phone backup, storage rescue & IT help' },
    ],
  },
  automotive: {
    defaultTitle: 'Pre-purchase car checks & diagnostics',
    defaultDescription: 'Pre-purchase vehicle inspections, OBD fault diagnostics, battery/electrical checks and basic servicing.',
    specialties: [
      { re: /\b(diagnostics|auto electric\w*)\b/i, label: 'diagnostics & electrical', jobTitle: 'OBD vehicle diagnostics & electrical check' },
      { re: /\b(mechanic|car service|engine|brake\w*|diesel)\b/i, label: 'mechanical inspection', jobTitle: 'Pre-purchase mechanic inspection & service' },
    ],
  },
  other: {
    defaultTitle: 'Errands, queue assistance & local tasks',
    defaultDescription: 'Early-morning queue holding, event setup, stock counting and practical day-to-day local assistance.',
    specialties: [],
  },
}

const SA_ID_PATTERN = /\b\d{13}\b/g

const SECTION_SUMMARY_RE = /^(?:about\s+me|personal\s+(?:profile|statement|summary)|professional\s+(?:profile|summary|statement|overview)|profile(?:\s+summary)?|career\s+(?:summary|objective|profile)|executive\s+summary|objective|summary|bio|biography|overview|introduction|who\s+i\s+am)\s*[:.\-–—]?$/i
const SECTION_EXPERIENCE_RE = /^(?:work\s+(?:experience|history)|employment(?:\s+history|\s+record)?|experience|career\s+history|professional\s+experience|duties(?:\s+and\s+responsibilities)?|key\s+responsibilities|responsibilities|job\s+history)\s*[:.\-–—]?$/i
const SECTION_SKILLS_RE = /^(?:skills?(?:\s+(?:and|&)\s+(?:competencies|abilities|attributes))?|core\s+(?:competencies|skills)|key\s+skills|technical\s+skills|competencies|areas\s+of\s+expertise|what\s+i\s+do|services)\s*[:.\-–—]?$/i
const SECTION_EDUCATION_RE = /^(?:education(?:al\s+background|\s+&\s+qualifications|\s+and\s+training)?|qualifications?|academic\s+(?:record|background|history|qualifications?)|training(?:\s+(?:and|&)\s+certifications?)?|certifications?|certificates?|schooling|tertiary\s+education|high\s+school|courses?)\s*[:.\-–—]?$/i
const SECTION_PERSONAL_RE = /^(?:curriculum\s+vitae(?:\s+of\b.*)?|cv(?:\s+of\b.*)?|resume|r[eé]sum[eé]|personal\s+(?:details|information|particulars|data)|contact\s+(?:details|information|me)|biographical\s+(?:details|info|information))\s*[:.\-–—]?$/i
const SECTION_REFERENCES_RE = /^(?:references?|referees?|character\s+references?|declaration|availab(?:le|ility)\s+on\s+request)\s*[:.\-–—]?$/i

const HEADING_NOISE = /^(?:curriculum\s+vitae(?:\s+of\b.*)?|cv(?:\s+of\b.*)?|resume|r[eé]sum[eé]|personal\s+(?:details|information|profile|statement|summary|particulars)|professional\s+(?:profile|summary|statement)|about\s+me|profile(?:\s+summary)?|career\s+(?:summary|objective)|objective|summary|contact\s+(?:details|information)|work\s+(?:experience|history)|employment\s+history|experience|education(?:al\s+background)?|qualifications?|skills?(?:\s+(?:and|&)\s+competencies)?|core\s+competencies|references?|referees?|declaration|page\s+\d+(?:\s+of\s+\d+)?)$/i

// Form fields and non-bio metadata lines that commonly appear in South African CVs
const FORM_FIELD_LINE_RE = /^(?:id(?:\s*number|\s*no\.?)?|identity\s*number|passport(?:\s*no\.?|\s*number)?|surname|last\s*name|first\s*names?|full\s*names?|name\s*(?:and|&)\s*surname|known\s*as|nick\s*name|cell(?:\s*phone|\s*number|\s*no\.?)?|tel(?:ephone)?|phone(?:\s*number|\s*no\.?)?|mobile|whatsapp|email|e-mail|address|residential\s*address|physical\s*address|postal\s*address|street\s*address|home\s*address|suburb|city|town|province|postal\s*code|country|date\s*of\s*birth|d\.?o\.?b\.?|birth\s*date|age|gender|sex|nationality|citizenship|marital\s*status|dependants?|children|languages?|home\s*language|other\s*languages?|spoken\s*languages?|driver'?s?\s*licen[cs]e|driving\s*licen[cs]e|licence\s*code|criminal\s*record|health(?:\s*status)?|disability|religion|tax\s*(?:number|no\.?)|sars|next\s*of\s*kin|emergency\s*contact|availability|notice\s*period|salary\s*expectation|expected\s*salary|references?|referees?|relationship|contact\s*person|institution|school(?:\s*attended)?|high\s*school|highest\s*(?:grade|standard|qualification)(?:\s*passed)?|year\s*(?:obtained|passed|completed|graduated)|subjects?(?:\s*passed)?|grade\s*1[012]|matric(?:\s*certificate)?|national\s*senior\s*certificate|declaration)\b/i

// PDF structural keywords and metadata that must never appear in a human bio
const PDF_ARTIFACT_RE = /\b(?:endstream|endobj|startxref|xref|FlateDecode|DCTDecode|DeviceRGB|DeviceCMYK|DeviceGray|FontDescriptor|BaseFont|ToUnicode|CIDSystemInfo|CIDInit|CMapName|begincmap|endcmap|beginbfchar|endbfchar|beginbfrange|endbfrange|MediaBox|CropBox|Resources|ProcSet|ExtGState|Subtype|StructTreeRoot|MarkInfo|Catalog|Outlines|Parent|Count|Kids|Skia\/PDF|Canva|Producer|Creator|CreationDate|ModDate)\b/gi

// Connectors that should never have a sentence-ending period immediately after them
const MID_SENTENCE_PERIOD_RE = /\b(in|of|and|or|to|for|with|the|a|an|at|by|from|on|into|across|around|including|such|as|who|that|which|is|are|was|were|have|has|had|can|will|my|our|their|his|her|its|over|under|between|through|during|while|where|when)\.\s+([A-Z][a-z]+)/g

const PROPER_NOUNS = /^(?:Soweto|Orlando|Diepkloof|Meadowlands|Dobsonville|Pimville|Protea|Jabulani|Zola|Sandton|Rosebank|Randburg|Midrand|Roodepoort|Alexandra|Tembisa|Braamfontein|Johannesburg|Joburg|Maboneng|Pretoria|Tshwane|Centurion|Mamelodi|Atteridgeville|Soshanguve|Mabopane|Durban|Umlazi|Kwamashu|Pinetown|Umhlanga|Cape|Khayelitsha|Gugulethu|Mitchells|Bellville|Bloemfontein|Mangaung|Port|Gqeberha|East|Polokwane|Nelspruit|Mbombela|Kimberley|Rustenburg|Gauteng|KwaZulu|Western|Eastern|Limpopo|Mpumalanga|Free|North|Northern|South|Africa|African|English|isiZulu|Zulu|isiXhosa|Xhosa|Sesotho|Sotho|Setswana|Tswana|Sepedi|Afrikaans|Venda|Tsonga|Ndebele|Swati|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|I)$/

function collapseSpacedLetters(line: string): string {
  // Collapse sequences like "P E R S O N A L   P R O F I L E" or "H a r d w o r k i n g"
  return line.replace(/\b([A-Za-z])(?:[ \t]+([A-Za-z])){3,}\b/g, (match) => {
    const tokens = match.trim().split(/[ \t]+/)
    if (tokens.every((t) => t.length === 1)) {
      return tokens.join('')
    }
    return match
  })
}

function isHumanReadableLine(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed.length < 2) return false
  if (PDF_ARTIFACT_RE.test(trimmed)) {
    PDF_ARTIFACT_RE.lastIndex = 0
    return false
  }
  PDF_ARTIFACT_RE.lastIndex = 0
  // Count letters, digits, spaces, and common punctuation vs weird symbols
  let letters = 0
  let vowels = 0
  let weird = 0
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]
    if (/[a-zA-Z]/.test(ch)) {
      letters++
      if (/[aeiouyAEIOUY]/.test(ch)) vowels++
    } else if (!/[0-9\s.,;:'"!?()\-–—/&+%@#•·*]/.test(ch)) {
      weird++
    }
  }
  if (letters < 2) return false
  if (weird / trimmed.length > 0.08) return false
  if (letters / trimmed.length < 0.45 && trimmed.length > 12) return false
  // Real words have vowels (at least ~15% of letters in any real sentence)
  if (letters >= 8 && vowels / letters < 0.14) return false
  return true
}

function cleanPublicText(text: string): string {
  return withoutContactDetails(
    collapseSpacedLetters(text)
      .replace(SA_ID_PATTERN, '')
      .replace(PDF_ARTIFACT_RE, ' '),
  )
    .replace(/\b(?:id(?:\s*number|\s*no\.?)?|cell|tel|phone|mobile|whatsapp|email|e-mail|address|residing at)\s*[:.-]?\s*(?=[,.;\n]|$)/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function healBrokenSentences(text: string): string {
  let out = collapseSpacedLetters(text)
    .replace(PDF_ARTIFACT_RE, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\.{2,}/g, '.')
    .replace(/\s+/g, ' ')
    .trim()

  // Fix periods inserted in the middle of wrapped PDF lines (e.g. "experience in. House painting" -> "experience in house painting")
  for (let pass = 0; pass < 2; pass++) {
    out = out.replace(MID_SENTENCE_PERIOD_RE, (_full, connector: string, nextWord: string) => {
      const replacementNext = PROPER_NOUNS.test(nextWord)
        ? nextWord
        : nextWord.charAt(0).toLowerCase() + nextWord.slice(1)
      return `${connector} ${replacementNext}`
    })
  }
  return out
}

/** Stitch wrapped PDF/text lines from a paragraph into natural sentences without putting periods at visual line wraps. */
function stitchParagraphLines(lines: readonly string[]): string {
  const cleanedLines = lines
    .map((l) => cleanPublicText(l))
    .filter((l) => l.length >= 3 && isHumanReadableLine(l))
  if (cleanedLines.length === 0) return ''

  let acc = ''
  for (const line of cleanedLines) {
    if (!acc) {
      acc = line
      continue
    }
    const endsWithPunct = /[.!?]$/.test(acc)
    const startsWithLowerOrConnector =
      /^[a-z]/.test(line) ||
      /^(?:and|or|with|in|around|across|for|to|from|including|as|who|which|that|where)\b/i.test(line)
    if (endsWithPunct) {
      acc += ` ${line.charAt(0).toUpperCase()}${line.slice(1)}`
    } else if (startsWithLowerOrConnector || !/[.!?:;]$/.test(acc)) {
      // If the previous line looks like a complete independent sentence and the next starts with "I " or a subject pronoun
      if (/\b(?:I|My|We|Experienced|Skilled|Hardworking|Reliable|Dedicated|Passionate)\b/.test(line.split(/\s+/)[0]) && acc.length > 45 && !/\b(?:in|of|and|or|to|for|with|the|a|an|at|by|from|on|around|across)$/i.test(acc)) {
        acc += `. ${line}`
      } else {
        const nextPiece =
          /^[A-Z][a-z]+/.test(line) &&
          !PROPER_NOUNS.test(line.split(/[\s,.;:!?]+/)[0]) &&
          /\b(?:in|of|and|or|to|for|with|the|a|an|at|by|from|on|around|across|over|as)$/i.test(acc)
            ? line.charAt(0).toLowerCase() + line.slice(1)
            : line
        acc += ` ${nextPiece}`
      }
    } else {
      acc += ` ${line}`
    }
  }

  const healed = healBrokenSentences(acc)
  const sentences = healed
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4)
    .map((s) => {
      const cap = s.charAt(0).toUpperCase() + s.slice(1)
      return /[.!?]$/.test(cap) ? cap : `${cap}.`
    })

  return sentences.join(' ')
}

/**
 * Cleans and polishes an "About you" bio string — whether freshly extracted from a CV or loaded from an older
 * mangled profile bio — so it always reads like a natural, professional summary.
 */
export function formatCleanBio(
  rawBio: string | null | undefined,
  fallback?: { skills?: readonly string[]; headline?: string | null; areaName?: string | null },
): string {
  const raw = (rawBio ?? '').replace(PDF_ARTIFACT_RE, ' ').trim()
  if (!raw && (!fallback?.skills || fallback.skills.length === 0)) return ''

  // Split into lines and filter out PDF artifacts, form fields, and headings
  const rawLines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s•\-*·▪►]+/, '').trim())
    .filter((l) => l.length >= 2 && !HEADING_NOISE.test(l) && !FORM_FIELD_LINE_RE.test(l) && isHumanReadableLine(l))

  let cleaned = stitchParagraphLines(rawLines)

  // Also strip inline form-field clusters that may have been concatenated onto a single line
  cleaned = cleaned
    .replace(/\b(?:Curriculum Vitae|Personal Details|Personal Information|Work Experience|Employment History|Educational Background|References Available On Request)\b[:.\s-]*/gi, '')
    .replace(/\b(?:Surname|First Names?|Identity Number|ID No|Date of Birth|Marital Status|Nationality|Home Language|Criminal Record|Driver'?s? Licen[cs]e|Health Status)\s*[:.-]\s*[^.;]+[.]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  cleaned = healBrokenSentences(cleaned)

  // Check if what remains is genuine readable prose
  const words = cleaned.split(/\s+/).filter(Boolean)
  const readableWords = words.filter((w) => /^[A-Za-z'-]{2,}[.,;!?]?$/.test(w))
  const isHealthy = cleaned.length >= 20 && readableWords.length >= Math.max(3, Math.floor(words.length * 0.6))

  if (isHealthy) {
    return clipText(cleaned, 500)
  }

  // Fallback: synthesize a crisp, professional bio from their skills, headline and area
  const skillLabels = (fallback?.skills ?? []).filter(isCategory).slice(0, 4).map((s) => categoryLabel(s).toLowerCase())
  const yearsMatch = `${raw} ${fallback?.headline ?? ''}`.match(/\b(\d{1,2})\+?\s+years?(?:\s+of)?\s+(?:experience|work)/i)
  const yearsText = yearsMatch ? ` with ${yearsMatch[1]} years of experience` : ''
  const areaText = fallback?.areaName ? ` around ${fallback.areaName}` : ''

  if (skillLabels.length > 0) {
    const listText =
      skillLabels.length === 1
        ? skillLabels[0]
        : `${skillLabels.slice(0, -1).join(', ')} and ${skillLabels[skillLabels.length - 1]}`
    return clipText(
      `Reliable service provider experienced in ${listText}${yearsText}${areaText}. Focused on quality workmanship, clear communication and leaving every job neat and complete.`,
      500,
    )
  }

  return isHumanReadableLine(cleaned) ? clipText(cleaned, 500) : ''
}

/** Detect all KashWise skill categories mentioned in a CV text. */
export function extractSkillsFromCvText(text: string): string[] {
  const normalized = collapseSpacedLetters(text)
  const found = new Set<string>(spokenSkills(normalized))
  for (const [slug, re] of Object.entries(CV_SKILL_PATTERNS)) {
    if (re.test(normalized)) found.add(slug)
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

/**
 * Suggest specific jobs & service types a worker can do on KashWise based on their uploaded CV text and skills.
 * Every suggestion maps to a canonical KashWise category and shows the typical worker net take-home pay.
 */
export function suggestJobsFromCv(rawText: string, existingSkills: readonly string[] = []): CvSuggestedJob[] {
  const normalized = collapseSpacedLetters(rawText || '')
  const detectedSkills = extractSkillsFromCvText(normalized)
  const activeSkills = mergeProfileSkills(detectedSkills, existingSkills)
  const skillsToSuggest = activeSkills.length > 0 ? activeSkills : []

  return skillsToSuggest.map((category) => {
    const template = JOB_TEMPLATES[category] ?? JOB_TEMPLATES.other
    const matchedSpecialties = template.specialties.filter((sp) => sp.re.test(normalized))
    const matchedTerms = matchedSpecialties.map((sp) => sp.label)
    const primaryJobTitle = matchedSpecialties[0]?.jobTitle ?? template.defaultTitle
    const payoutCents = baselineFloor(category) * 100
    const netCents = workerNetCents(payoutCents)

    return {
      category,
      category_label: categoryLabel(category),
      title: primaryJobTitle,
      description: template.defaultDescription,
      matched_terms: matchedTerms.length > 0 ? matchedTerms : [categoryLabel(category).toLowerCase()],
      typical_payout_cents: payoutCents,
      typical_net_cents: netCents,
    }
  })
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

type CvSection = 'preamble' | 'personal' | 'summary' | 'experience' | 'skills' | 'education' | 'references'

function detectSectionHeading(line: string): { section: CvSection; remainder: string } | null {
  const trimmed = line.trim()
  if (SECTION_SUMMARY_RE.test(trimmed)) return { section: 'summary', remainder: '' }
  if (SECTION_EXPERIENCE_RE.test(trimmed)) return { section: 'experience', remainder: '' }
  if (SECTION_SKILLS_RE.test(trimmed)) return { section: 'skills', remainder: '' }
  if (SECTION_EDUCATION_RE.test(trimmed)) return { section: 'education', remainder: '' }
  if (SECTION_PERSONAL_RE.test(trimmed)) return { section: 'personal', remainder: '' }
  if (SECTION_REFERENCES_RE.test(trimmed)) return { section: 'references', remainder: '' }

  // Also check inline heading prefix like "Personal Profile: Hardworking painter..." or "About Me - ..."
  const inlineSummary = trimmed.match(/^(?:about\s+me|personal\s+(?:profile|statement|summary)|professional\s+(?:profile|summary|statement)|profile\s+summary|career\s+(?:summary|objective)|objective|summary|bio)\s*[:\-–—]\s+(.+)$/i)
  if (inlineSummary) return { section: 'summary', remainder: inlineSummary[1].trim() }

  return null
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
  let detectedAreaName: string | null = null
  const lower = collapseSpacedLetters(normalized).toLowerCase()
  for (const a of areas) {
    const nameRe = new RegExp(`\\b${a.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    if (nameRe.test(lower)) {
      detectedArea = a.slug
      detectedAreaName = a.name
      break
    }
  }
  if (!detectedArea && /\b(orlando|diepkloof|meadowlands|dobsonville|pimville|protea glen|jabulani|zola|soweto)\b/i.test(lower)) {
    if (areas.some((a) => a.slug === 'soweto') || areas.length === 0) {
      detectedArea = 'soweto'
      detectedAreaName = 'Soweto'
    }
  }

  // Split into raw lines and segment by CV section
  const rawLines = normalized
    .split(/\n+/)
    .map((l) => collapseSpacedLetters(l.replace(/^[\s•\-*·▪►]+/, '').trim()))
    .filter((l) => l.length >= 2)

  // Detect candidate display name from the first few lines
  let detectedName: string | null = null
  for (const line of rawLines.slice(0, 8)) {
    // Also check "Curriculum Vitae of Thabo Mokoena" or "Name: Thabo Mokoena"
    const cvOfMatch = line.match(/^(?:curriculum\s+vitae\s+of|cv\s+of|full\s+names?\s*[:.-]|name\s*(?:and\s*surname)?\s*[:.-])\s*([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){1,3})$/i)
    if (cvOfMatch) {
      detectedName = cvOfMatch[1].trim()
      break
    }
    if (HEADING_NOISE.test(line) || FORM_FIELD_LINE_RE.test(line)) continue
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

  let currentSection: CvSection = 'preamble'
  const sectionBuckets: Record<CvSection, string[]> = {
    preamble: [],
    personal: [],
    summary: [],
    experience: [],
    skills: [],
    education: [],
    references: [],
  }

  for (const line of rawLines) {
    if (detectedName && line === detectedName) continue
    const heading = detectSectionHeading(line)
    if (heading) {
      currentSection = heading.section
      if (heading.remainder && isHumanReadableLine(heading.remainder)) {
        sectionBuckets[currentSection].push(heading.remainder)
      }
      continue
    }
    if (HEADING_NOISE.test(line) || FORM_FIELD_LINE_RE.test(line)) continue
    // Skip standalone date range lines like "2019 - 2023" or "Jan 2020 – Present"
    if (/^(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+)?\d{4}\s*[-–—to]+\s*(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+)?(?:\d{4}|present|current|date)$/i.test(line)) {
      continue
    }
    if (!isHumanReadableLine(line)) continue
    const scrubbed = cleanPublicText(line)
    if (scrubbed.length < 8) continue
    sectionBuckets[currentSection].push(scrubbed)
  }

  // Extract years of experience if explicitly stated in CV
  const yearsMatch = normalized.match(/\b(\d{1,2})\+?\s+years?(?:\s+of)?\s+(?:experience|work)/i)
  const yearsNote = yearsMatch ? `${yearsMatch[1]} years of experience` : null

  const skillLabels = (cvSkills.length ? cvSkills : mergedSkills).slice(0, 3).map(categoryLabel)
  const primaryCandidateLines =
    sectionBuckets.summary.length > 0
      ? sectionBuckets.summary
      : sectionBuckets.preamble.length > 0
        ? sectionBuckets.preamble
        : sectionBuckets.experience

  let headline = ''
  if (skillLabels.length > 0) {
    headline = clipText(
      yearsNote ? `${skillLabels.join(' · ')} — ${yearsNote}` : skillLabels.join(' · '),
      80,
    )
  } else if (primaryCandidateLines[0]) {
    headline = clipText(primaryCandidateLines[0].replace(/[.!?]+$/, ''), 80)
  }

  // Build a clean, coherent bio:
  // 1. Prefer the explicit Summary / Profile / About Me section (stitched across wrapped lines without mid-sentence periods)
  // 2. Otherwise use preamble descriptive lines + top experience lines
  let bioLines: string[] = []
  if (sectionBuckets.summary.length > 0) {
    bioLines = sectionBuckets.summary.slice(0, 10)
  } else if (sectionBuckets.preamble.length > 0) {
    bioLines = [...sectionBuckets.preamble.slice(0, 6), ...sectionBuckets.experience.slice(0, 4)]
  } else if (sectionBuckets.experience.length > 0) {
    bioLines = sectionBuckets.experience.slice(0, 6)
  }

  const stitchedBio = stitchParagraphLines(bioLines)
  const bio = formatCleanBio(stitchedBio, {
    skills: cvSkills.length ? cvSkills : mergedSkills,
    headline,
    areaName: detectedAreaName,
  })

  const suggestedJobs = suggestJobsFromCv(normalized, mergedSkills)

  return {
    display_name: detectedName,
    area_slug: detectedArea,
    headline,
    bio,
    skills: mergedSkills,
    added_skills: addedSkills,
    suggested_jobs: suggestedJobs,
  }
}

// ── Persisting extracted CV insights for Home & Earn My Goal ───────────────

const CV_STORAGE_KEY = (userId: string) => `kashwise_cv_draft_${userId}`

export interface StoredCvInsight extends CvProfileDraft {
  file_name: string | null
  updated_at: string
}

export function saveStoredCvDraft(userId: string, draft: CvProfileDraft, fileName: string | null = null): void {
  if (typeof window === 'undefined' || !window.localStorage || !userId) return
  try {
    const payload: StoredCvInsight = {
      ...draft,
      file_name: fileName,
      updated_at: new Date().toISOString(),
    }
    window.localStorage.setItem(CV_STORAGE_KEY(userId), JSON.stringify(payload))
  } catch {
    // Ignore storage quota errors
  }
}

export function loadStoredCvDraft(userId: string | null | undefined): StoredCvInsight | null {
  if (typeof window === 'undefined' || !window.localStorage || !userId) return null
  try {
    const raw = window.localStorage.getItem(CV_STORAGE_KEY(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredCvInsight
    if (!parsed || !Array.isArray(parsed.skills)) return null
    return {
      ...parsed,
      suggested_jobs: Array.isArray(parsed.suggested_jobs) && parsed.suggested_jobs.length > 0
        ? parsed.suggested_jobs
        : suggestJobsFromCv(`${parsed.headline ?? ''} ${parsed.bio ?? ''}`, parsed.skills),
    }
  } catch {
    return null
  }
}

// ── Client-side PDF text extraction ────────────────────────────────────────

type CMapTable = Map<number, string>

function parseCMapFromStream(streamText: string): CMapTable {
  const table: CMapTable = new Map()
  // 1. beginbfchar ... endbfchar
  const charBlockRe = /beginbfchar([\s\S]*?)endbfchar/g
  let block: RegExpExecArray | null
  while ((block = charBlockRe.exec(streamText)) !== null) {
    const pairRe = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g
    let pair: RegExpExecArray | null
    while ((pair = pairRe.exec(block[1])) !== null) {
      const src = parseInt(pair[1], 16)
      const dst = decodeHexToUnicode(pair[2])
      if (!Number.isNaN(src) && dst) table.set(src, dst)
    }
  }
  // 2. beginbfrange ... endbfrange
  const rangeBlockRe = /beginbfrange([\s\S]*?)endbfrange/g
  while ((block = rangeBlockRe.exec(streamText)) !== null) {
    const lineRe = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]+)>|\[([^\]]*)\])/g
    let m: RegExpExecArray | null
    while ((m = lineRe.exec(block[1])) !== null) {
      const start = parseInt(m[1], 16)
      const end = parseInt(m[2], 16)
      if (Number.isNaN(start) || Number.isNaN(end) || end < start || end - start > 1024) continue
      if (m[3]) {
        const base = parseInt(m[3], 16)
        if (Number.isNaN(base)) continue
        for (let code = start; code <= end; code++) {
          const cp = base + (code - start)
          if (cp >= 32 && cp <= 0x10ffff) table.set(code, String.fromCodePoint(cp))
        }
      } else if (m[4]) {
        const targets = [...m[4].matchAll(/<([0-9A-Fa-f]+)>/g)].map((x) => decodeHexToUnicode(x[1]))
        for (let i = 0; i < targets.length && start + i <= end; i++) {
          if (targets[i]) table.set(start + i, targets[i])
        }
      }
    }
  }
  return table
}

function decodeHexToUnicode(hex: string): string {
  const clean = hex.replace(/\s+/g, '')
  if (!clean) return ''
  if (clean.length <= 2) {
    const code = parseInt(clean, 16)
    return code >= 32 ? String.fromCharCode(code) : ''
  }
  let out = ''
  for (let i = 0; i + 3 < clean.length; i += 4) {
    const code = parseInt(clean.slice(i, i + 4), 16)
    if (code >= 32) out += String.fromCharCode(code)
  }
  return out
}

function decodePdfLiteralString(raw: string, cmap?: CMapTable): string {
  const bytes: number[] = []
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (ch !== '\\') {
      bytes.push(raw.charCodeAt(i) & 0xff)
      continue
    }
    const next = raw[++i]
    if (next === undefined) break
    if (next === 'n' || next === 'r') bytes.push(10)
    else if (next === 't' || next === 'b' || next === 'f') bytes.push(32)
    else if (/[0-7]/.test(next)) {
      let oct = next
      if (i + 1 < raw.length && /[0-7]/.test(raw[i + 1])) oct += raw[++i]
      if (i + 1 < raw.length && /[0-7]/.test(raw[i + 1])) oct += raw[++i]
      bytes.push(parseInt(oct, 8) & 0xff)
    } else {
      bytes.push(next.charCodeAt(0) & 0xff)
    }
  }

  // If 2-byte big-endian CID string with high control bytes, try CMap or UTF-16BE
  const hasNullOrControl = bytes.some((b) => b < 32 && b !== 10 && b !== 13 && b !== 9)
  if (hasNullOrControl && bytes.length % 2 === 0 && cmap && cmap.size > 0) {
    let mapped = ''
    let hits = 0
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      const code = (bytes[i] << 8) | bytes[i + 1]
      const ch = cmap.get(code)
      if (ch) {
        mapped += ch
        hits++
      }
    }
    if (hits > 0) return mapped
  }

  let out = ''
  for (const b of bytes) {
    if (b === 10 || b === 13) out += '\n'
    else if (b === 9) out += ' '
    else if (b >= 32 && b <= 126) out += String.fromCharCode(b)
    else if (b === 0x92 || b === 0x91) out += "'"
    else if (b === 0x93 || b === 0x94) out += '"'
    else if (b === 0x95 || b === 0xb7) out += '•'
    else if (b === 0x96 || b === 0x97) out += '-'
    else if (b >= 0xa0 && b <= 0xff) out += String.fromCharCode(b)
  }
  return out
}

function decodePdfHexString(hex: string, cmap?: CMapTable): string {
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

  // Check if 2-byte glyph IDs (or UTF-16BE without BOM where high byte is 0x00)
  if (bytes.length % 2 === 0 && bytes.some((b, idx) => idx % 2 === 0 && b < 32)) {
    if (cmap && cmap.size > 0) {
      let mapped = ''
      let hits = 0
      for (let i = 0; i + 1 < bytes.length; i += 2) {
        const code = (bytes[i] << 8) | bytes[i + 1]
        const ch = cmap.get(code)
        if (ch) {
          mapped += ch
          hits++
        } else if (bytes[i] === 0 && bytes[i + 1] >= 32 && bytes[i + 1] <= 126) {
          mapped += String.fromCharCode(bytes[i + 1])
          hits++
        }
      }
      if (hits > 0) return mapped
    }
    // Plain UTF-16BE without BOM
    let utf16 = ''
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      const code = (bytes[i] << 8) | bytes[i + 1]
      if (code >= 32 && code <= 0x2026) utf16 += String.fromCharCode(code)
    }
    if (utf16.trim().length > 0) return utf16
  }

  // Standard 1-byte hex string (e.g. pdf-lib StandardFonts.Helvetica)
  return bytes
    .filter((b) => (b >= 32 && b <= 126) || b === 10 || b === 13)
    .map((b) => String.fromCharCode(b))
    .join('')
}

function decodeTjArrayContent(inner: string, cmap?: CMapTable): string {
  // Inside [...] TJ, tokens are (...), <hex>, or kerning displacement numbers
  const partRe = /\((?:\\.|[^\\()])*\)|<([0-9A-Fa-f\s]+)>|(-?\d+(?:\.\d+)?)/g
  let m: RegExpExecArray | null
  let out = ''
  while ((m = partRe.exec(inner)) !== null) {
    const tok = m[0]
    if (tok.startsWith('(') && tok.endsWith(')')) {
      out += decodePdfLiteralString(tok.slice(1, -1), cmap)
    } else if (m[1]) {
      out += decodePdfHexString(m[1], cmap)
    } else if (m[2]) {
      const displacement = parseFloat(m[2])
      // In PDF text space, large negative displacement (<= -160) represents a space between words
      if (displacement <= -160 && !out.endsWith(' ')) {
        out += ' '
      }
    }
  }
  return out.replace(/\s+/g, ' ').trim()
}

function extractTextOperatorsFromStream(streamText: string, cmap?: CMapTable): string[] {
  // Never extract from CMap definitions
  if (/\b(?:begincmap|beginbfchar|beginbfrange)\b/.test(streamText)) return []

  const chunks: string[] = []
  // Match [...] TJ arrays, (...) Tj, <hex> Tj, or line-positioning operators
  const tokenRe =
    /\[((?:\\.|[^[\]])*)\]\s*TJ|\((?:\\.|[^\\()])*\)\s*(?:Tj|'|")?|<([0-9A-Fa-f\s]{2,})>\s*(?:Tj|'|")?|(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(Td|TD)\b|(T\*|ET)\b/g
  let match: RegExpExecArray | null
  let lineBuffer: string[] = []

  const flushLine = () => {
    if (lineBuffer.length > 0) {
      const joined = lineBuffer.join(' ').replace(/\s+/g, ' ').trim()
      if (joined) chunks.push(joined)
      lineBuffer = []
    }
  }

  while ((match = tokenRe.exec(streamText)) !== null) {
    const token = match[0]
    if (match[1] !== undefined) {
      // [...] TJ array
      const decoded = decodeTjArrayContent(match[1], cmap)
      if (decoded) lineBuffer.push(decoded)
    } else if (token.startsWith('(')) {
      const closeIdx = token.lastIndexOf(')')
      const inner = closeIdx > 0 ? token.slice(1, closeIdx) : token.slice(1)
      const decoded = decodePdfLiteralString(inner, cmap).trim()
      if (decoded) lineBuffer.push(decoded)
    } else if (match[2]) {
      const decoded = decodePdfHexString(match[2], cmap).trim()
      if (decoded) lineBuffer.push(decoded)
    } else if (match[5]) {
      // Td or TD: only break line if vertical offset ty (match[4]) is non-zero
      const ty = parseFloat(match[4])
      if (Math.abs(ty) > 0.5) {
        flushLine()
      }
    } else if (match[6]) {
      // T* or ET
      flushLine()
    }
  }
  flushLine()
  return chunks
}

async function tryInflateOnce(bytes: Uint8Array, format: 'deflate' | 'deflate-raw'): Promise<string | null> {
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
    if (total === 0) return null
    const out = new Uint8Array(total)
    let offset = 0
    for (const p of parts) {
      out.set(p, offset)
      offset += p.length
    }
    return new TextDecoder('latin1').decode(out)
  } catch {
    return null
  }
}

async function tryInflate(bytes: Uint8Array): Promise<string | null> {
  if (typeof DecompressionStream === 'undefined' || bytes.length === 0) return null
  const candidates = [bytes]
  // Some PDFs include a trailing CR or LF before endstream
  if (bytes.length > 2 && (bytes[bytes.length - 1] === 10 || bytes[bytes.length - 1] === 13)) {
    candidates.push(bytes.subarray(0, bytes.length - 1))
  }
  for (const candidate of candidates) {
    for (const format of ['deflate', 'deflate-raw'] as const) {
      const res = await tryInflateOnce(candidate, format)
      if (res) return res
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

  const decodedStreams: string[] = []
  const combinedCMap: CMapTable = new Map()

  const streamRe = /stream(?:\r\n|\n|\r)([\s\S]*?)(?:\r\n|\n|\r)?endstream/g
  let m: RegExpExecArray | null
  while ((m = streamRe.exec(latin1)) !== null) {
    const header = latin1.slice(Math.max(0, m.index - 450), m.index)
    // Skip embedded images, raw font binaries, and XML metadata streams
    if (/\/Subtype\s*\/(?:Image|Type1C|CIDFontType0C|OpenType)\b|\/Type\s*\/Metadata\b|\/Length1\b/.test(header)) {
      continue
    }

    const rawStream = m[1]
    const isFlate = /\/FlateDecode\b/.test(header)
    let content: string | null = null

    if (isFlate) {
      const streamBytes = new Uint8Array(rawStream.length)
      for (let i = 0; i < rawStream.length; i++) streamBytes[i] = rawStream.charCodeAt(i) & 0xff
      content = await tryInflate(streamBytes)
    } else {
      // Uncompressed stream, or try inflating first if it doesn't look like plain text operators
      if (/\bBT\b[\s\S]*?\b(?:Tj|TJ)\b[\s\S]*?\bET\b/.test(rawStream) || /\b(?:beginbfchar|beginbfrange)\b/.test(rawStream)) {
        content = rawStream
      } else {
        const streamBytes = new Uint8Array(rawStream.length)
        for (let i = 0; i < rawStream.length; i++) streamBytes[i] = rawStream.charCodeAt(i) & 0xff
        content = (await tryInflate(streamBytes)) ?? rawStream
      }
    }

    if (!content) continue
    if (/\b(?:beginbfchar|beginbfrange)\b/.test(content)) {
      const cmap = parseCMapFromStream(content)
      for (const [k, v] of cmap.entries()) combinedCMap.set(k, v)
      continue
    }
    if (/\b(?:Tj|TJ|BT)\b/.test(content)) {
      decodedStreams.push(content)
    }
  }

  const lines: string[] = []
  for (const streamContent of decodedStreams) {
    lines.push(...extractTextOperatorsFromStream(streamContent, combinedCMap))
  }

  const cleaned = lines
    .map((l) => collapseSpacedLetters(l).replace(/\s+/g, ' ').trim())
    .filter((l) => isHumanReadableLine(l))
    .join('\n')

  return cleaned
}
