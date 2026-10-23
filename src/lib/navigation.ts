/** Keep authentication return paths on this app and avoid authentication loops. */
export function safeNext(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\s]/.test(value)) return null
  try {
    const url = new URL(value, 'https://sidegigs.invalid')
    if (url.origin !== 'https://sidegigs.invalid' || /^\/(login|signup)(\/|$)/.test(url.pathname)) return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}
