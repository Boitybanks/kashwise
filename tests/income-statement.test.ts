import { describe, expect, it } from 'vitest'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { buildIncomeStatement, monthName, statementReference, type RawStatement } from '../src/lib/income-statement'
import { signDocument, verifyDocument } from '../src/lib/pq/credential'

const raw: RawStatement = {
  worker: { id: 'w1', name: 'Sipho Dlamini', area_slug: 'soweto', member_since: '2026-05-01T00:00:00Z', is_demo: true },
  period: { from: '2026-07-01', to: '2026-09-28', months: 3 },
  months: [
    { month: '2026-07', jobs: 1, client_paid_cents: 120000, fee_cents: 12000, net_cents: 108000 },
    { month: '2026-08', jobs: 2, client_paid_cents: 95000, fee_cents: 9500, net_cents: 85500 },
    { month: '2026-09', jobs: 0, client_paid_cents: 0, fee_cents: 0, net_cents: 0 },
  ],
  lines: [
    { settled_at: '2026-08-27T10:00:00Z', title: 'Fix cupboard doors', category: 'repairs', area_slug: 'soweto', client_paid_cents: 35000,
      fee_cents: 3500, net_cents: 31500, record_code: 'SG-B2', customer_label: 'Thandi M.', is_demo: true },
  ],
  clients: 2,
  cashouts: { count: 1, amount_cents: 45000, fee_cents: 0 },
  simulated: true,
}

const build = () => buildIncomeStatement(raw, {
  areaName: (slug) => (slug === 'soweto' ? 'Soweto, Johannesburg' : slug),
  origin: 'https://sidegigs.test',
  issuedAt: new Date('2026-09-28T12:00:00Z'),
  reference: 'IS-ABCDEFGH',
})

describe('buildIncomeStatement', () => {
  it('totals the months and averages over the whole period, empty months included', () => {
    const s = build()
    expect(s.totals).toEqual({ jobs: 3, client_paid_cents: 215000, fee_cents: 21500, net_cents: 193500, average_monthly_net_cents: 64500, distinct_clients: 2 })
    expect(s.worker.area).toBe('Soweto, Johannesburg')
    expect(s.lines[0]).toMatchObject({ area: 'Soweto, Johannesburg', record: 'SG-B2', net_cents: 31500 })
    expect(s.verify_url).toBe('https://sidegigs.test/verify')
  })

  it('carries the simulation and demo warnings into the signed document', () => {
    const s = build()
    expect(s.payments_simulated).toBe(true)
    expect(s.demo_data).toBe(true)
  })

  it('signs and verifies, and any edit breaks the signature', () => {
    const seed = new Uint8Array(32).fill(7)
    const signed = signDocument(build(), seed, 'test')
    const { publicKey } = ml_dsa65.keygen(new Uint8Array(32).fill(7))
    expect(verifyDocument(signed, publicKey)).toBe(true)
    const tampered = { ...signed, credential: { ...signed.credential, totals: { ...signed.credential.totals, net_cents: 9_999_999 } } }
    expect(verifyDocument(tampered, publicKey)).toBe(false)
  })
})

describe('helpers', () => {
  it('names months and makes readable references', () => {
    expect(monthName('2026-09')).toBe('September 2026')
    expect(statementReference(() => new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]))).toBe('IS-ABCDEFGH')
  })
})
