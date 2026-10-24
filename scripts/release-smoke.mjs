// Read-only public deployment checks; never creates users, gigs or payment records.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const base = (process.env.DEPLOY_URL ?? 'https://sidegigs-codecraft.netlify.app').replace(/\/$/, '')
const checks = []
async function request(path, options) {
  return fetch(base + path, { signal: AbortSignal.timeout(20000), ...options })
}
for (const path of ['/', '/welcome', '/discover?category=tutoring', '/login', '/gigs/new', '/trust', '/identity-demo', '/money', '/money/earn-goal', '/verify']) {
  const r = await request(path)
  assert.equal(r.status, 200, path)
  const html = await r.text()
  assert.match(html, /DM\+Sans/, 'Approved typography must be deployed')
  assert.match(html, /id="root"/, 'SPA entry point')
  assert.match(html, /<title>KashWise/, 'Current KashWise branding must be deployed')
  assert.ok(r.headers.get('content-security-policy'))
  assert.match(r.headers.get('permissions-policy'), /camera=\(self\)/)
  assert.match(r.headers.get('permissions-policy'), /microphone=\(\)/)
  checks.push({ path, status: r.status })
}
for (const name of ['photographer', 'tutor', 'stylist']) {
  const path = `/images/${name}.webp`
  const r = await request(path)
  assert.equal(r.status, 200)
  assert.match(r.headers.get('content-type'), /image\/webp/)
  const digest = bytes => createHash('sha256').update(bytes).digest('hex')
  assert.equal(digest(Buffer.from(await r.arrayBuffer())), digest(readFileSync(`public${path}`)))
  checks.push({ path, matchesApprovedAsset: true })
}
const html = await (await request('/')).text()
const script = html.match(/src="([^" ]+\.js)"/)[1]
const js = await (await request(script)).text()
assert.match(js, /Your thing/)
assert.match(js, /Someone’s next find/)
assert.match(js, /ProofScript/, 'ProofScript branding is missing')
checks.push({ approvedHeroBundle: true, proofScriptBranding: true })
const identityChunk = js.match(/IdentityDemo-[\w-]+\.js/)[0]
const identityJs = await (await request(`/assets/${identityChunk}`)).text()
assert.match(identityJs, /demo_completed/)
assert.match(identityJs, /no biometric analysis/)
assert.match(identityJs, /selfie skipped/)
assert.doesNotMatch(identityJs, /SA ID & Face Verified/)
checks.push({ honestIdentityDemoBundle: true })
const denied = await request('/api/reveal-contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
assert.equal(denied.status, 401)
checks.push({ unauthenticatedContactReveal: denied.status })
const invalid = await request('/api/work-credential?worker=invalid')
assert.equal(invalid.status, 400)
checks.push({ invalidCredentialRequest: invalid.status })
for (const [path, method] of [
  ['/api/earn-goal', 'GET'],
  ['/api/ibanks/ask', 'POST'],
  ['/api/payments/sandbox', 'POST'],
  ['/api/payments/webhook', 'POST'],
]) {
  const r = await request(path, { method, headers: { 'Content-Type': 'application/json' }, ...(method === 'POST' ? { body: '{}' } : {}) })
  assert.equal(r.status, 401, `${path}: expected authentication/signature rejection`)
  assert.match(r.headers.get('content-type') ?? '', /application\/json/, `${path}: must be a function, not the SPA fallback`)
  checks.push({ path, unauthenticatedRequestRejected: true })
}
console.log(JSON.stringify({ result: 'PASS', checkedAt: new Date().toISOString(), checks }, null, 2))
