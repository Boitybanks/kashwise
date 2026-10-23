// Byte helpers shared by the browser and Netlify Functions (no Node-only APIs).

/** Copy into a fresh ArrayBuffer-backed Uint8Array (what WebCrypto's BufferSource expects). */
export function bytes(input: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(input.length)
  out.set(input)
  return out
}

export function utf8(text: string): Uint8Array<ArrayBuffer> {
  return bytes(new TextEncoder().encode(text))
}

export function toBase64(data: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i])
  return btoa(binary)
}

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes(data)))
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
}
