// I am the sign-up database, wanting to welcome people who hold a passport or an asylum / refugee permit,
// while still letting one document open only one account and keeping under-18s out.
import { beforeAll, describe, expect, it } from 'vitest'
import { createLocalDb, type LocalDb } from './helpers/local-db'

const ENVELOPE = JSON.stringify({ v: 1, kid: 'test-only', alg: 'test-only', kem: '', iv: '', ct: '' })
let l: LocalDb
let area: string
let n = 0

beforeAll(async () => {
  l = await createLocalDb()
  await l.admin(`select vault.create_secret('test-key', 'sa_id_hmac_key', 'test')`).catch(() => undefined)
  area = (await l.admin<{ slug: string }>('select slug from public.areas limit 1'))[0].slug
}, 60_000)

/** I sign up as anon, the way the browser does. Extra document fields are left out to mimic the old app build. */
async function signUp(doc: { number: string; type?: string; country?: string | null; dob?: string | null }) {
  n += 1
  const id = crypto.randomUUID()
  const withDoc = doc.type !== undefined
  const args = [id, `person${n}@test.local`, 'longenough1', 'Amara Okafor', 'worker', area, doc.number, 'female', ENVELOPE, ENVELOPE]
  const sql = withDoc
    ? 'select public.create_account($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13::date) as id'
    : 'select public.create_account($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb) as id'
  await l.as(null, sql, withDoc ? [...args, doc.type, doc.country ?? null, doc.dob ?? null] : args)
  return (await l.admin<{ document_type: string }>('select document_type from public.profile_identity where id = $1', [id]))[0]
}

describe('signing up with different identity documents', () => {
  it('still accepts an SA ID from callers that send only the old arguments', async () => {
    expect(await signUp({ number: '8001015009087' })).toEqual({ document_type: 'sa_id' })
  })

  it('accepts a foreign passport with country and date of birth', async () => {
    expect(await signUp({ number: 'fn 123 456', type: 'passport', country: 'zw', dob: '1990-04-12' })).toEqual({ document_type: 'passport' })
  })

  it('accepts an asylum-seeker or refugee permit number', async () => {
    expect(await signUp({ number: 'JHB/004512/2023', type: 'permit', country: 'CD', dob: '1988-11-02' })).toEqual({ document_type: 'permit' })
  })

  it('lets one document open only one account', async () => {
    await signUp({ number: 'MZ7654321', type: 'passport', country: 'MZ', dob: '1985-01-01' })
    await expect(signUp({ number: 'mz 7654321', type: 'passport', country: 'MZ', dob: '1985-01-01' })).rejects.toThrow(/already linked/)
    // The same number from a different country is a different passport.
    expect(await signUp({ number: 'MZ7654321', type: 'passport', country: 'MW', dob: '1985-01-01' })).toEqual({ document_type: 'passport' })
  })

  it('turns away bad details with a clear message', async () => {
    await expect(signUp({ number: 'AB12345', type: 'passport', country: 'ZA', dob: '1990-01-01' })).rejects.toThrow(/SA ID number/)
    await expect(signUp({ number: 'AB12345', type: 'passport', country: null, dob: '1990-01-01' })).rejects.toThrow(/country/)
    await expect(signUp({ number: 'AB12345', type: 'passport', country: 'NG', dob: null })).rejects.toThrow(/date of birth/)
    await expect(signUp({ number: 'AB12345', type: 'passport', country: 'NG', dob: '2015-01-01' })).rejects.toThrow(/18 or older/)
    await expect(signUp({ number: 'A1', type: 'passport', country: 'NG', dob: '1990-01-01' })).rejects.toThrow(/passport number/)
    await expect(signUp({ number: 'ABCDEFG', type: 'permit', country: 'SO', dob: '1990-01-01' })).rejects.toThrow(/permit/)
    await expect(signUp({ number: 'AB12345', type: 'licence', country: 'NG', dob: '1990-01-01' })).rejects.toThrow(/Choose SA ID/)
  })
})
