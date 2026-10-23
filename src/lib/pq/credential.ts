// Portable, quantum-resistant work records: ML-DSA-65 (NIST FIPS 204) signatures over canonical JSON.
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { fromBase64, toBase64, utf8 } from './bytes'

export const CREDENTIAL_ALG = 'ML-DSA-65'

export interface CredentialRecord {
  code: string
  title: string
  category: string
  area: string
  completed_at: string
  rating: number | null
  review: string | null
  customer: string
}

export interface WorkCredential {
  type: 'SideGigsWorkHistory'
  version: 1
  issuer: 'SideGigs'
  issued_at: string
  demo_data: boolean
  worker: { id: string; name: string; area: string; member_since: string; skills: string[] }
  summary: { completed_gigs: number; average_rating: number | null; reviews: number; repeat_customers: number }
  records: CredentialRecord[]
  profile_url: string
}

export interface SignedCredential {
  credential: WorkCredential
  alg: typeof CREDENTIAL_ALG
  kid: string
  signature: string
}

/** Deterministic JSON: object keys sorted recursively, no whitespace. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(',')}}`
}

/** Any KashWise document (work history, income statement, skills profile) signed the same way. */
export interface SignedDocument<T> {
  credential: T
  alg: typeof CREDENTIAL_ALG
  kid: string
  signature: string
}

export function signDocument<T>(doc: T, signSeed: Uint8Array, kid: string): SignedDocument<T> {
  const { secretKey } = ml_dsa65.keygen(signSeed)
  const signature = ml_dsa65.sign(utf8(canonicalize(doc)), secretKey)
  secretKey.fill(0)
  return { credential: doc, alg: CREDENTIAL_ALG, kid, signature: toBase64(signature) }
}

export function verifyDocument<T>(signed: SignedDocument<T>, publicKey: Uint8Array): boolean {
  try {
    if (signed?.alg !== CREDENTIAL_ALG || typeof signed.signature !== 'string') return false
    return ml_dsa65.verify(fromBase64(signed.signature), utf8(canonicalize(signed.credential)), publicKey)
  } catch {
    return false
  }
}

export function signCredential(credential: WorkCredential, signSeed: Uint8Array, kid: string): SignedCredential {
  return signDocument(credential, signSeed, kid)
}

export function verifyCredential(signed: SignedCredential, publicKey: Uint8Array): boolean {
  return verifyDocument(signed, publicKey)
}
