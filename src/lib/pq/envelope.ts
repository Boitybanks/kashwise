// Post-quantum hybrid envelope encryption (docs/architecture.md §7).
// KEM: X-Wing = ML-KEM-768 (NIST FIPS 203) + X25519. KDF: HKDF-SHA-256. AEAD: AES-256-GCM.
// The associated data binds each envelope to one record (e.g. "gig:<id>"), so ciphertexts
// cannot be swapped between records.
import { ml_kem768_x25519 } from '@noble/post-quantum/hybrid.js'
import { bytes, fromBase64, toBase64, utf8 } from './bytes'

export const ENVELOPE_ALG = 'X-Wing(ML-KEM-768+X25519)/HKDF-SHA256/AES-256-GCM'

export interface Envelope {
  v: 1
  kid: string
  alg: typeof ENVELOPE_ALG
  kem: string
  iv: string
  ct: string
}

async function deriveAesKey(sharedSecret: Uint8Array, aad: string, usage: KeyUsage): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', bytes(sharedSecret), 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: utf8(`sidegigs/envelope/v1/${aad}`) },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  )
}

export async function encryptEnvelope(
  plaintext: unknown,
  aad: string,
  recipient: { publicKey: Uint8Array; kid: string },
): Promise<Envelope> {
  const { cipherText, sharedSecret } = ml_kem768_x25519.encapsulate(recipient.publicKey)
  const key = await deriveAesKey(sharedSecret, aad, 'encrypt')
  const iv = bytes(crypto.getRandomValues(new Uint8Array(12)))
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: utf8(aad) },
    key,
    utf8(JSON.stringify(plaintext)),
  )
  sharedSecret.fill(0)
  return {
    v: 1,
    kid: recipient.kid,
    alg: ENVELOPE_ALG,
    kem: toBase64(cipherText),
    iv: toBase64(iv),
    ct: toBase64(new Uint8Array(ct)),
  }
}

export async function decryptEnvelope<T = unknown>(envelope: Envelope, aad: string, secretKey: Uint8Array): Promise<T> {
  if (envelope?.v !== 1 || envelope.alg !== ENVELOPE_ALG) throw new Error('Unsupported envelope format')
  const sharedSecret = ml_kem768_x25519.decapsulate(fromBase64(envelope.kem), secretKey)
  const key = await deriveAesKey(sharedSecret, aad, 'decrypt')
  sharedSecret.fill(0)
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(envelope.iv), additionalData: utf8(aad) },
    key,
    fromBase64(envelope.ct),
  )
  return JSON.parse(new TextDecoder().decode(pt)) as T
}

export { gigAad, phoneAad } from './aad'
