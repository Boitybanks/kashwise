// Browser-side check of any KashWise-signed document against the published ML-DSA-65 public key.
// Crypto is loaded on demand to keep first load light.
import type { SignedDocument } from './credential'

export async function verifySigned<T>(signed: SignedDocument<T>): Promise<boolean> {
  const [{ verifyDocument }, { fromBase64 }, keys] = await Promise.all([
    import('./credential'),
    import('./bytes'),
    import('../pq-public-keys'),
  ])
  if (signed?.kid !== keys.SIGN_KID) return false
  return verifyDocument(signed, fromBase64(keys.SIGN_PUBLIC_KEY_B64))
}

/** Saves a signed document as a .json file anyone can check at /verify. */
export function downloadSigned(signed: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(signed, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
