const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "Tue 29 Sep" for a YYYY-MM-DD date (timezone-free). */
export function formatDay(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`)
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

/** "12 Sep 2026" */
export function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function formatMonthYear(iso: string): string {
  const d = new Date(iso)
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min${m === 1 ? '' : 's'} ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`
  return formatDate(iso)
}

/** Formats a job creation timestamp into clear user-facing text, e.g. "posted 1 hour ago". */
export function formatPostedAt(iso: string, isDemo = false): string {
  if (isDemo) {
    const diffHours = Math.round((Date.now() - new Date(iso).getTime()) / (1000 * 3600))
    if (diffHours > 24) {
      const seed = iso.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
      const hours = (seed % 17) + 1
      return hours === 1 ? 'posted 1 hour ago' : `posted ${hours} hours ago`
    }
  }
  const str = timeAgo(iso)
  if (str === 'just now') return 'posted just now'
  return `posted ${str}`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export function percent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return `${Math.round(value * 100)}%`
}
