import { describe, expect, it } from 'vitest'
import { ml_kem768_x25519 } from '@noble/post-quantum/hybrid.js'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { decryptEnvelope, encryptEnvelope, ENVELOPE_ALG } from '../src/lib/pq/envelope'
import { canonicalize, signCredential, verifyCredential, type WorkCredential } from '../src/lib/pq/credential'
import { fromBase64, toBase64 } from '../src/lib/pq/bytes'
import { KEM_KID, KEM_PUBLIC_KEY_B64, SIGN_PUBLIC_KEY_B64 } from '../src/lib/pq-public-keys'

const kem = ml_kem768_x25519.keygen(new Uint8Array(32).fill(7))
const recipient = { publicKey: kem.publicKey, kid: 'test' }

describe('post-quantum envelope encryption (X-Wing + AES-256-GCM)', () => {
  it('round-trips private details and never stores plaintext', async () => {
    const env = await encryptEnvelope({ address: '12 Vilakazi St, Orlando West' }, 'gig:abc', recipient)
    expect(env.alg).toBe(ENVELOPE_ALG)
    expect(JSON.stringify(env)).not.toContain('Vilakazi')
    await expect(decryptEnvelope(env, 'gig:abc', kem.secretKey)).resolves.toEqual({ address: '12 Vilakazi St, Orlando West' })
  })
  it('uses a fresh encapsulation every time', async () => {
    const a = await encryptEnvelope({ x: 1 }, 'gig:1', recipient)
    const b = await encryptEnvelope({ x: 1 }, 'gig:1', recipient)
    expect(a.kem).not.toBe(b.kem)
    expect(a.ct).not.toBe(b.ct)
  })
  it('refuses to decrypt when moved to another record (associated data)', async () => {
    const env = await encryptEnvelope({ phone: '0712345678' }, 'phone:alice', recipient)
    await expect(decryptEnvelope(env, 'phone:mallory', kem.secretKey)).rejects.toThrow()
  })
  it('detects tampering and wrong keys', async () => {
    const env = await encryptEnvelope({ phone: '0712345678' }, 'phone:alice', recipient)
    const ct = fromBase64(env.ct)
    ct[0] ^= 1
    await expect(decryptEnvelope({ ...env, ct: toBase64(ct) }, 'phone:alice', kem.secretKey)).rejects.toThrow()
    const other = ml_kem768_x25519.keygen(new Uint8Array(32).fill(9))
    await expect(decryptEnvelope(env, 'phone:alice', other.secretKey)).rejects.toThrow()
  })
  it('ships well-formed production public keys', () => {
    expect(fromBase64(KEM_PUBLIC_KEY_B64)).toHaveLength(1216)
    expect(fromBase64(SIGN_PUBLIC_KEY_B64)).toHaveLength(1952)
    expect(KEM_KID).toMatch(/^[0-9a-f]{16}$/)
  })
})

const credential: WorkCredential = {
  type: 'SideGigsWorkHistory',
  version: 1,
  issuer: 'SideGigs',
  issued_at: '2026-09-26T10:00:00.000Z',
  demo_data: false,
  worker: { id: 'w1', name: 'Sipho Dlamini', area: 'Soweto, Johannesburg', member_since: '2026-05-01', skills: ['painting'] },
  summary: { completed_gigs: 1, average_rating: 4, reviews: 1, repeat_customers: 0 },
  records: [
    { code: 'SG-ABC', title: 'Paint wall', category: 'painting', area: 'Soweto', completed_at: '2026-09-01', rating: 4, review: 'Good', customer: 'Thandi M.' },
  ],
  profile_url: 'https://sidegigs.example/w/w1',
}

describe('ML-DSA-65 signed work records', () => {
  const seed = new Uint8Array(32).fill(3)
  const { publicKey } = ml_dsa65.keygen(seed)

  it('canonical JSON ignores key order', () => {
    expect(canonicalize({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } })).toBe('{"a":{"c":[3,{"y":2,"z":1}],"d":2},"b":1}')
  })
  it('verifies a genuine record, including after download and re-upload', () => {
    const signed = signCredential(credential, seed, 'kid')
    expect(verifyCredential(signed, publicKey)).toBe(true)
    expect(verifyCredential(JSON.parse(JSON.stringify(signed)), publicKey)).toBe(true)
  })
  it('rejects an edited record or a bogus signature', () => {
    const signed = signCredential(credential, seed, 'kid')
    const forged = structuredClone(signed)
    forged.credential.records[0].rating = 5
    forged.credential.summary.completed_gigs = 40
    expect(verifyCredential(forged, publicKey)).toBe(false)
    expect(verifyCredential({ ...signed, signature: 'AAAA' }, publicKey)).toBe(false)
  })
})
