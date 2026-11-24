import { test, expect, type Page } from '@playwright/test'

// Read-only beta QA at 360 px against the local `netlify dev` build. Signs in with the demo accounts and only
// navigates: no gigs, applications, reviews or AI calls are made. Screenshots go to REVIEW_OUTPUT.
const OUT = process.env.REVIEW_OUTPUT ?? 'test-results'

test.beforeEach(async ({ baseURL, page }) => {
  expect(baseURL, 'Beta QA must only run on the local server').toMatch(/^http:\/\/(localhost|127\.0\.0\.1):/)
  await page.setViewportSize({ width: 360, height: 780 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

async function check(page: Page, name: string, errors: string[]) {
  await page.waitForLoadState('networkidle')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect.soft(overflow, `${name}: no sideways scroll at 360 px`).toBeLessThanOrEqual(0)
  expect.soft(errors, `${name}: no page errors`).toEqual([])
  await page.screenshot({ path: `${OUT}/360-${name}.png`, fullPage: true })
}

async function demo(page: Page, who: 'Sipho' | 'Thandi') {
  await page.goto('/login')
  await page.getByRole('button', { name: new RegExp(`Try as ${who}`) }).click()
  await page.waitForURL(/\/(home|my-gigs)/)
}

test('signed out: landing, password reset pages', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/welcome')
  await expect(page.getByRole('heading', { name: /Good work/ })).toBeVisible()
  await check(page, 'landing', errors)
  await page.goto('/forgot-password')
  await expect(page.getByText('We’ll email you a reset link.')).toBeVisible()
  await check(page, 'forgot-password', errors)
  await page.goto('/reset-password#error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
  await expect(page.getByText(/expired or was already used/)).toBeVisible()
  await check(page, 'reset-password-expired', errors)
})

test('worker: home, matching, gig with client record, CV, dictation, money', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await demo(page, 'Sipho')
  await expect(page.getByRole('heading', { name: 'Matched for you' })).toBeVisible()
  await check(page, 'worker-home', errors)

  await page.goto('/discover')
  await check(page, 'discover', errors)
  const firstGig = page.locator('main a[href^="/gigs/"]:not([href="/gigs/new"]):visible').first()
  if (await firstGig.count()) {
    await firstGig.click()
    await expect(page.getByText('Never pay anyone to get a job.')).toBeVisible()
    await check(page, 'gig-detail-worker', errors)
  }

  await page.goto('/proofscript')
  await page.waitForURL(/\/w\//)
  await check(page, 'worker-proofscript', errors)
  const workerUrl = page.url()
  await page.goto(`${workerUrl}/cv`)
  await expect(page.getByRole('heading', { name: 'Experience' })).toBeVisible()
  await expect(page.getByText('not verified')).toHaveCount(0)
  await check(page, 'cv', errors)

  await page.goto('/profile')
  await check(page, 'profile-dictation', errors)
  await page.goto('/money')
  await expect(page.getByText(/simulat/i).first()).toBeVisible()
  await check(page, 'money', errors)
  await page.goto('/wallet')
  await expect(page.getByText(/simulat/i).first()).toBeVisible()
  await check(page, 'wallet', errors)
})

test('client: home, client profile, gig applicants', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await demo(page, 'Thandi')
  await expect(page.getByRole('link', { name: /Post a gig/ }).first()).toBeVisible()
  await check(page, 'client-home', errors)
  const gig = page.locator('main a[href^="/gigs/"]:not([href="/gigs/new"]):visible').first()
  if (await gig.count()) {
    await gig.click()
    await check(page, 'gig-detail-client', errors)
  }
  await page.goto('/profile')
  const me = await page.evaluate(async () => {
    const key = Object.keys(localStorage).find((k) => k.includes('auth-token'))
    return key ? JSON.parse(localStorage.getItem(key)!).user?.id : null
  })
  if (me) {
    await page.goto(`/w/${me}`)
    await expect(page.getByText('Client', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Reviews .* has left/ })).toBeVisible()
    await check(page, 'client-profile', errors)
  }
})
