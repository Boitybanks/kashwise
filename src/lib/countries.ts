// I am the country picker's data, wanting passport and permit holders to find their country fast.
// ISO 3166-1 alpha-2 codes; South Africa is left out because South Africans sign up with their SA ID.
// Names come from the browser (Intl.DisplayNames), so there is no long list of names to maintain.

const ALL = (
  'AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD CF ' +
  'CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG ' +
  'GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW ' +
  'KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE ' +
  'NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ ' +
  'SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU ' +
  'WF WS YE YT ZM ZW'
).split(' ')

/** Where most foreign nationals working in South Africa come from: shown first so the common choice is one tap away. */
export const COMMON_COUNTRIES = ['ZW', 'MZ', 'MW', 'LS', 'SZ', 'CD', 'NG', 'ET', 'SO', 'ZM', 'BW', 'NA', 'AO', 'BI', 'RW', 'GH', 'KE', 'PK', 'BD', 'CN', 'IN', 'GB'] as const

const VALID = new Set(ALL)
export const isCountryCode = (code: string) => VALID.has(code.toUpperCase())

let names: Intl.DisplayNames | null = null
export function countryName(code: string): string {
  try {
    names ??= new Intl.DisplayNames(['en'], { type: 'region' })
    return names.of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

/** The rest, A–Z by name. */
export function otherCountries(): { code: string; name: string }[] {
  const common = new Set<string>(COMMON_COUNTRIES)
  return ALL.filter((c) => !common.has(c))
    .map((code) => ({ code, name: countryName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
