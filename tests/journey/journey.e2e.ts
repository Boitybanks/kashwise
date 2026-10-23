// @vitest-environment node
// Full P0 journey against the LIVE Supabase project, using the public demo accounts (all data stays is_demo).
// Run: npm run test:journey   (needs .env and, for the decryption check, .env.pq)
import { readFileSync, existsSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ml_kem768_x25519 } from '@noble/post-quantum/hybrid.js'
import { encryptEnvelope, decryptEnvelope, type Envelope } from '../../src/lib/pq/envelope'
import { gigAad } from '../../src/lib/pq/aad'
import { fromBase64 } from '../../src/lib/pq/bytes'
import { KEM_KID, KEM_PUBLIC_KEY_B64 } from '../../src/lib/pq-public-keys'

function loadEnv(file: string): Record<string, string> {
  if (!existsSync(file)) return {}
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  )
}

const env = { ...loadEnv('.env'), ...loadEnv('.env.pq'), ...process.env } as Record<string, string>
const URL = env.VITE_SUPABASE_URL
const KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY
const PASSWORD = 'SideGigsDemo2026'

const client = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
async function signedIn(email: string) {
  const c = client()
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw error
  return { c, uid: data.user.id }
}
async function ok<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<NonNullable<T>> {
  const { data, error } = await p
  if (error) throw error
  return data as NonNullable<T> // void RPCs legitimately return null
}
function inDays(n: number) {
  const d = new Date(Date.now() + 2 * 3600_000)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

describe('SideGigs P0 journey (live database)', () => {
  let customer: { c: SupabaseClient; uid: string }
  let worker: { c: SupabaseClient; uid: string }
  const anon = client()
  const gigId = crypto.randomUUID()
  const address = `${Math.floor(Math.random() * 90) + 10} Vilakazi Street, Orlando West`
  let completedBefore = 0

  beforeAll(async () => {
    customer = await signedIn('demo.customer@sidegigs.app')
    worker = await signedIn('demo.worker@sidegigs.app')
    completedBefore = (await ok(worker.c.rpc('worker_stats', { p_worker: worker.uid }))).completed
  })

  it('AUTH: rejects a wrong password and weak sign-up input', async () => {
    const { error } = await client().auth.signInWithPassword({ email: 'demo.worker@sidegigs.app', password: 'wrong-password' })
    expect(error).toBeTruthy()
    const identity = { p_id: crypto.randomUUID(), p_id_number: '8001015009087', p_gender: 'male', p_identity_envelope: {}, p_address_envelope: {} }
    const bad = await anon.rpc('create_account', { ...identity, p_email: 'not-an-email', p_password: 'x', p_display_name: 'A', p_role: 'worker', p_area: 'soweto' })
    expect(bad.error?.message).toMatch(/valid email/)
    const dup = await anon.rpc('create_account', { ...identity, p_email: 'demo.worker@sidegigs.app', p_password: 'longenough1', p_display_name: 'Dup', p_role: 'worker', p_area: 'soweto' })
    expect(dup.error?.message).toMatch(/already exists/)
    const badId = await anon.rpc('create_account', { ...identity, p_id_number: '8001015009088', p_email: `journey-${Date.now()}@example.com`, p_password: 'longenough1', p_display_name: 'Journey Test', p_role: 'worker', p_area: 'soweto' })
    expect(badId.error?.message).toMatch(/checksum/)
  })

  it('POST GIG: customer posts with post-quantum-encrypted address; the fee is computed by the database', async () => {
    const envelope = await encryptEnvelope({ address, access_notes: 'Green gate' }, gigAad(gigId), {
      publicKey: fromBase64(KEM_PUBLIC_KEY_B64),
      kid: KEM_KID,
    })
    const id = await ok(customer.c.rpc('create_gig', {
      p_id: gigId, p_title: 'Journey test: paint a garden wall', p_category: 'painting',
      p_description: 'Automated end-to-end journey test gig. About 10 square metres.', p_area: 'soweto',
      p_date: inDays(3), p_time_window: 'morning', p_payout_cents: 50000, p_envelope: envelope,
    }))
    expect(id).toBe(gigId)
    const gig = await ok(customer.c.from('gigs').select('*').eq('id', gigId).single())
    expect(gig).toMatchObject({ status: 'open', payout_cents: 50000, fee_cents: 5000, total_cents: 50000, worker_net_cents: 45000, service_id: null, is_demo: true })
    const stored = await ok(customer.c.from('gig_private').select('envelope').eq('gig_id', gigId).single())
    expect(JSON.stringify(stored)).not.toContain('Vilakazi')
  })

  it('DISCOVER: worker finds the gig nearby; anonymous visitors see open gigs but no private data', async () => {
    const found = await ok(worker.c.rpc('discover_gigs', { p_area: 'soweto', p_category: 'painting', p_limit: 50 }))
    const mine = (found as { id: string; distance_km: number }[]).find((g) => g.id === gigId)
    expect(mine?.distance_km).toBe(0)
    expect((await anon.from('gigs').select('id').eq('id', gigId)).data).toHaveLength(1)
    expect((await anon.from('gig_private').select('*').eq('gig_id', gigId)).data ?? []).toHaveLength(0)
  })

  it('APPLY: worker applies once; cannot see private details before being chosen; customer cannot apply to own gig', async () => {
    await ok(worker.c.rpc('apply_to_gig', { p_gig: gigId, p_message: 'I live around the corner.' }))
    const again = await worker.c.rpc('apply_to_gig', { p_gig: gigId, p_message: 'again' })
    expect(again.error?.message).toMatch(/already applied/)
    expect((await worker.c.from('gig_private').select('*').eq('gig_id', gigId)).data).toHaveLength(0)
    const own = await customer.c.rpc('apply_to_gig', { p_gig: gigId, p_message: '' })
    expect(own.error?.message).toMatch(/own gig/)
  })

  it('SELECT: customer reviews the applicant and chooses them; simulated payment is held', async () => {
    const apps = await ok(customer.c.from('gig_applications').select('id, worker_id, status').eq('gig_id', gigId))
    const app = apps.find((a) => a.worker_id === worker.uid)!
    expect(app.status).toBe('pending')
    const stranger = await worker.c.rpc('select_worker', { p_gig: gigId, p_application: app.id })
    expect(stranger.error).toBeTruthy()
    await ok(customer.c.rpc('select_worker', { p_gig: gigId, p_application: app.id }))
    const gig = await ok(customer.c.from('gigs').select('status, assigned_worker_id').eq('id', gigId).single())
    expect(gig).toEqual({ status: 'matched', assigned_worker_id: worker.uid })
    const txn = await ok(worker.c.from('transactions').select('status, mode, total_cents, fee_cents, payout_cents').eq('gig_id', gigId).single())
    expect(txn).toEqual({ status: 'held', mode: 'simulation', total_cents: 50000, fee_cents: 5000, payout_cents: 45000 })
  })

  it('PRIVACY: the chosen worker can now read the envelope, which decrypts to the real address', async () => {
    const row = await ok(worker.c.from('gig_private').select('envelope').eq('gig_id', gigId).single())
    if (!env.PQ_KEM_SECRET_SEED) return // decryption check needs the server secret (.env.pq)
    const sk = ml_kem768_x25519.keygen(fromBase64(env.PQ_KEM_SECRET_SEED)).secretKey
    const plain = await decryptEnvelope<{ address: string }>(row.envelope as Envelope, gigAad(gigId), sk)
    expect(plain.address).toBe(address)
  })

  it('LIFECYCLE: the worker starts / marks done with the customer’s on-site codes; customer confirms completion', async () => {
    const codes = await ok(customer.c.from('gig_handshakes').select('step, code, used_at').eq('gig_id', gigId))
    const code = (step: string) => codes.find((h) => h.step === step)!.code as string
    expect(codes).toHaveLength(2)
    expect(await ok(worker.c.from('gig_handshakes').select('code').eq('gig_id', gigId))).toHaveLength(0) // worker must scan them
    expect((await customer.c.rpc('start_gig', { p_gig: gigId, p_code: code('start') })).error).toBeTruthy()
    expect((await worker.c.rpc('start_gig', { p_gig: gigId, p_code: 'ZZZZZZ' })).error?.message).toMatch(/doesn't match/)
    expect((await worker.c.rpc('start_gig', { p_gig: gigId, p_code: code('finish') })).error).toBeTruthy()
    await ok(worker.c.rpc('start_gig', { p_gig: gigId, p_code: code('start') }))
    const early = await customer.c.rpc('confirm_completion', { p_gig: gigId })
    expect(early.error?.message).toMatch(/mark the job as done/)
    await ok(worker.c.rpc('mark_gig_done', { p_gig: gigId, p_code: code('finish') }))
    expect((await worker.c.rpc('confirm_completion', { p_gig: gigId })).error).toBeTruthy()
    expect((await customer.c.rpc('cancel_gig', { p_gig: gigId })).error?.message).toMatch(/before work starts/)
    await ok(customer.c.rpc('confirm_completion', { p_gig: gigId }))
    const gig = await ok(anon.from('gigs').select('status').eq('id', gigId))
    expect(gig).toHaveLength(0) // completed gigs are no longer public
    const mine = await ok(worker.c.from('gigs').select('status').eq('id', gigId).single())
    expect(mine.status).toBe('completed')
    const txn = await ok(customer.c.from('transactions').select('status').eq('gig_id', gigId).single())
    expect(txn.status).toBe('released')
  })

  it('PORTFOLIO: a verified record appears automatically and publicly', async () => {
    const item = await ok(anon.from('portfolio_items').select('*').eq('gig_id', gigId).single())
    expect(item).toMatchObject({ worker_id: worker.uid, title: 'Journey test: paint a garden wall', customer_label: 'Thandi M.', rating: null })
    expect(item.record_code).toMatch(/^SG-[0-9A-F]{10}$/)
    const stats = await ok(anon.rpc('worker_stats', { p_worker: worker.uid }))
    expect(stats.completed).toBe(completedBefore + 1)
    expect(stats.earned_cents).toBeNull() // earnings are private to the worker
  })

  it('REVIEW: customer rates once; rating lands on the portfolio record', async () => {
    expect((await worker.c.rpc('submit_review', { p_gig: gigId, p_rating: 5, p_comment: 'self review' })).error).toBeTruthy()
    await ok(customer.c.rpc('submit_review', { p_gig: gigId, p_rating: 5, p_comment: 'Neat, on time and friendly. (automated journey test)' }))
    const dup = await customer.c.rpc('submit_review', { p_gig: gigId, p_rating: 1, p_comment: 'second' })
    expect(dup.error?.message).toMatch(/already reviewed/)
    const item = await ok(anon.from('portfolio_items').select('rating, review').eq('gig_id', gigId).single())
    expect(item.rating).toBe(5)
  })

  it('SECURITY: clients cannot write trust-bearing tables directly', async () => {
    const forge = await worker.c.from('portfolio_items').insert({
      worker_id: worker.uid, gig_id: gigId, title: 'Fake', category: 'painting', area_slug: 'soweto',
      completed_at: new Date().toISOString(), customer_label: 'Me', record_code: 'SG-FAKE',
    })
    expect(forge.error).toBeTruthy()
    const selfRate = await worker.c.from('portfolio_items').update({ rating: 5 }).eq('gig_id', gigId)
    expect(selfRate.error).toBeTruthy()
    const demoFlag = await worker.c.from('profiles').update({ is_demo: false }).eq('id', worker.uid)
    expect(demoFlag.error).toBeTruthy()
    const gigEdit = await customer.c.from('gigs').update({ status: 'completed' }).eq('id', gigId)
    expect(gigEdit.error).toBeTruthy()
    expect((await anon.from('transactions').select('*')).data ?? []).toHaveLength(0)
    expect((await anon.from('gig_events').select('*')).data ?? []).toHaveLength(0)
  })

  it('TIMELINE: every step is audited', async () => {
    const events = await ok(customer.c.from('gig_events').select('kind').eq('gig_id', gigId).order('id'))
    expect(events.map((e) => e.kind)).toEqual([
      'posted', 'applied', 'matched', 'payment_held', 'started', 'worker_done', 'completed', 'payment_released', 'portfolio_record', 'reviewed',
    ])
  })

  it('SERVICE: provider prices by take-home; clients see the price that pays it; booking matches at once', async () => {
    const serviceId = await ok(worker.c.rpc('save_service', {
      p_id: null, p_title: 'Journey test: fix a door hinge', p_category: 'repairs',
      p_description: 'Automated journey test service listing. Hinges and handles.', p_area: 'soweto', p_take_home_cents: 45000,
    }))
    const own = await ok(worker.c.from('services').select('take_home_cents, price_cents, is_demo').eq('id', serviceId).single())
    expect(own).toEqual({ take_home_cents: 45000, price_cents: 50000, is_demo: true })
    const listed = (await ok(anon.rpc('discover_services', { p_worker: worker.uid, p_limit: 50 }))) as Record<string, unknown>[]
    const card = listed.find((s) => s.id === serviceId)
    expect(card?.price_cents).toBe(50000)
    expect(card).not.toHaveProperty('take_home_cents')

    const booking = { p_id: null, p_service: serviceId, p_area: 'soweto', p_date: inDays(3), p_time_window: 'morning', p_envelope: null }
    expect((await worker.c.rpc('book_service', booking)).error?.message).toMatch(/own service/)
    const bookedId = await ok(customer.c.rpc('book_service', booking))
    const gig = await ok(customer.c.from('gigs')
      .select('status, assigned_worker_id, service_id, total_cents, fee_cents, worker_net_cents').eq('id', bookedId).single())
    expect(gig).toEqual({ status: 'matched', assigned_worker_id: worker.uid, service_id: serviceId, total_cents: 50000, fee_cents: 5000, worker_net_cents: 45000 })
    const txn = await ok(worker.c.from('transactions').select('status, total_cents, payout_cents').eq('gig_id', bookedId).single())
    expect(txn).toEqual({ status: 'held', total_cents: 50000, payout_cents: 45000 })
    expect(await ok(customer.c.from('gig_handshakes').select('step').eq('gig_id', bookedId))).toHaveLength(2)

    expect((await customer.c.rpc('decline_booking', { p_gig: bookedId })).error).toBeTruthy()
    await ok(worker.c.rpc('decline_booking', { p_gig: bookedId }))
    const declined = await ok(customer.c.from('gigs').select('status').eq('id', bookedId).single())
    expect(declined.status).toBe('cancelled')
    const refunded = await ok(customer.c.from('transactions').select('status').eq('gig_id', bookedId).single())
    expect(refunded.status).toBe('refunded')

    await ok(worker.c.rpc('set_service_active', { p_service: serviceId, p_active: false }))
    expect((await ok(anon.from('services').select('id').eq('id', serviceId)))).toHaveLength(0)
    expect((await customer.c.rpc('book_service', booking)).error?.message).toMatch(/no longer available/)
    expect((await worker.c.from('services').update({ take_home_cents: 1 }).eq('id', serviceId)).error).toBeTruthy()
  })

  it('WALLET: released earnings cash out as a shop voucher; one free cash-out a week; only your own', async () => {
    const before = await ok(worker.c.rpc('wallet_summary'))
    expect(before.available_cents).toBeGreaterThanOrEqual(45000) // the job confirmed above paid R450
    const cashout = await ok(worker.c.rpc('request_cashout', { p_method: 'cash', p_amount_cents: 5000, p_bank_name: null, p_account_last4: null }))
    expect(cashout).toMatchObject({ method: 'cash', amount_cents: 5000, fee_cents: before.free_cashout_available ? 0 : 2000, destination: 'Cash voucher by SMS' })
    expect(cashout.reference).toMatch(/^CO-[A-HJ-NP-Z2-9]{8}$/)
    const after = await ok(worker.c.rpc('wallet_summary'))
    expect(after.available_cents).toBe(before.available_cents - 5000)
    expect(after.free_cashout_available).toBe(false)
    const tooMuch = await worker.c.rpc('request_cashout', { p_method: 'bank', p_amount_cents: after.available_cents + 1, p_bank_name: 'Capitec', p_account_last4: '1234' })
    expect(tooMuch.error?.message).toMatch(/up to the R/)
    expect((await customer.c.from('wallet_cashouts').select('id').eq('reference', cashout.reference)).data ?? []).toHaveLength(0)
    expect((await anon.rpc('wallet_summary')).error).toBeTruthy()
    const forged = await worker.c.from('wallet_cashouts').insert({ worker_id: worker.uid, method: 'cash', amount_cents: 999999, fee_cents: 0, destination: 'x', reference: 'CO-AAAAAAAA' })
    expect(forged.error).toBeTruthy()
  })

  it('CANCEL: an open gig can be cancelled by its customer', async () => {
    const id = await ok(customer.c.rpc('create_gig', {
      p_id: null, p_title: 'Journey test: cancel me', p_category: 'cleaning',
      p_description: 'Automated journey test gig that will be cancelled.', p_area: 'soweto',
      p_date: inDays(2), p_time_window: 'flexible', p_payout_cents: 20000, p_envelope: null,
    }))
    await ok(customer.c.rpc('cancel_gig', { p_gig: id }))
    const g = await ok(customer.c.from('gigs').select('status').eq('id', id).single())
    expect(g.status).toBe('cancelled')
  })
})
