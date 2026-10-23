// Production smoke test: the full two-sided journey in one mobile browser using the demo switcher.
// HOME → AUTH → POST GIG → DISCOVER → APPLY → WORKER PROFILE → ASSIGN → START/DONE → COMPLETE → REVIEW → PORTFOLIO
import { expect, test, type Page } from '@playwright/test'

const shots = process.env.SHOTS_DIR

async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true })
}

test('P0 journey on a phone', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`)
  })
  const title = `Smoke test: fix garden gate ${Date.now().toString(36)}`

  // HOME
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('KashWise')
  await expect(page.getByRole('link', { name: /Get started/ })).toHaveAttribute('href', '/signup')
  await expect(page.getByRole('link', { name: 'I already have an account' })).toHaveAttribute('href', '/login')
  await shot(page, '01-home')

  // AUTH (demo customer)
  await page.getByRole('button', { name: /Try as Thandi/ }).click()
  await expect(page).toHaveURL(/\/my-gigs/)
  await expect(page.getByRole('heading', { name: /Sawubona, Thandi/ })).toBeVisible()
  await shot(page, '02-my-gigs')

  // POST GIG
  await page.getByRole('link', { name: 'Post a gig' }).first().click()
  await page.getByLabel('What do you need done?').fill(title)
  await page.getByRole('button', { name: /Repairs & handyman/ }).click()
  await page.getByLabel('Describe the work').fill('The garden gate hinge is broken and the latch sticks. Please bring tools.')
  await page.getByLabel('What will you pay for this job?').fill('500')
  await expect(page.getByLabel('Price breakdown')).toContainText('Nothing is added on top')
  await expect(page.getByLabel('Price breakdown')).toContainText('R450')
  await page.getByLabel(/Street address/).fill('7 Smoke Test Lane, Orlando East')
  await shot(page, '03-post-gig')
  await page.getByRole('button', { name: 'Publish gig' }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  const gigUrl = page.url()
  await expect(page.getByText('No applications yet')).toBeVisible()

  // DISCOVER + APPLY (switch to demo worker)
  await page.getByRole('button', { name: /Switch to Sipho/ }).click()
  await expect(page).toHaveURL(/\/discover/)
  await expect(page.getByRole('heading', { name: 'Find work near you' })).toBeVisible()
  await expect(page.getByText(/open gigs?/)).toBeVisible()
  await shot(page, '04-discover')
  await page.goto(gigUrl)
  await expect(page.getByText('You receive')).toBeVisible()
  await page.getByLabel(/Message to/).fill('I live nearby and fix gates often.')
  await page.getByRole('button', { name: 'Apply for this gig' }).click()
  await expect(page.getByText(/You applied/)).toBeVisible()

  // WORKER PROFILE + ASSIGN (back to customer)
  await page.getByRole('button', { name: /Switch to Thandi/ }).click()
  await expect(page).toHaveURL(/\/my-gigs/)
  await page.goto(gigUrl)
  await expect(page.getByRole('heading', { name: 'People who applied' })).toBeVisible()
  await expect(page.getByText('Sipho Dlamini', { exact: true })).toBeVisible()
  await shot(page, '05-applicants')
  await page.getByRole('button', { name: 'Choose Sipho' }).click()
  await page.getByRole('button', { name: 'Yes, choose Sipho' }).click()
  await expect(page.getByText('Worker chosen').first()).toBeVisible()
  await page.getByRole('button', { name: /Decrypt and show/ }).click()
  await expect(page.getByText('7 Smoke Test Lane, Orlando East')).toBeVisible()
  await expect(page.getByText(/Held by the payment provider/)).toBeVisible()
  await shot(page, '06-matched')

  // JOB QR CODES (customer reads the one-time codes the worker must scan on site)
  const readCode = async (item: RegExp) => {
    await page.getByRole('button', { name: /Show a QR code/ }).click()
    await page.getByRole('button', { name: item }).click()
    return (await page.getByLabel(/^Code /).textContent())!.trim()
  }
  const startCode = await readCode(/Start-job QR code/)

  // START (worker types the start code; on a real phone they would scan it)
  await page.getByRole('button', { name: /Switch to Sipho/ }).click()
  await expect(page).toHaveURL(/\/discover/)
  await page.goto(gigUrl)
  await page.getByRole('button', { name: 'Start job' }).click()
  await page.getByLabel('Or type the 6-character code').fill(startCode)
  await page.getByRole('dialog').getByRole('button', { name: 'Start job' }).click()
  await expect(page.getByRole('button', { name: 'Mark as done' })).toBeVisible()

  // FINISH (customer shows the finish code, worker types it)
  await page.getByRole('button', { name: /Switch to Thandi/ }).click()
  await expect(page).toHaveURL(/\/my-gigs/)
  await page.goto(gigUrl)
  const finishCode = await readCode(/Finish-job QR code/)
  await page.getByRole('button', { name: /Switch to Sipho/ }).click()
  await expect(page).toHaveURL(/\/discover/)
  await page.goto(gigUrl)
  await page.getByRole('button', { name: 'Mark as done' }).click()
  await page.getByLabel('Or type the 6-character code').fill(finishCode)
  await page.getByRole('dialog').getByRole('button', { name: 'Mark as done' }).click()
  await expect(page.getByText(/Waiting for the customer to confirm/)).toBeVisible()

  // COMPLETE + REVIEW (customer)
  await page.getByRole('button', { name: /Switch to Thandi/ }).click()
  await expect(page).toHaveURL(/\/my-gigs/)
  await page.goto(gigUrl)
  await page.getByRole('button', { name: 'Confirm job is complete' }).click()
  await page.getByRole('button', { name: 'Yes, confirm job is complete' }).click()
  await expect(page.getByText(/How did Sipho do\?/)).toBeVisible()
  await page.getByRole('radio', { name: /5 stars/ }).click()
  await page.getByLabel(/What would you tell a neighbour/).fill('Fixed the gate quickly and tidied up. (automated smoke test)')
  await page.getByRole('button', { name: 'Submit review' }).click()
  await expect(page.getByRole('link', { name: /Verified record SG-/ })).toBeVisible()
  await shot(page, '07-completed')

  // PORTFOLIO
  await page.getByRole('link', { name: /Verified record SG-/ }).click()
  await expect(page).toHaveURL(/\/w\//)
  await expect(page.getByRole('heading', { name: 'Recent experience' })).toBeVisible()
  const record = page.getByRole('article').filter({ hasText: title })
  await expect(record).toBeVisible()
  await expect(record.getByText(/Fixed the gate quickly and tidied up/)).toBeVisible()
  await expect(record.getByText(/Verified by customer confirmation/)).toBeVisible()
  await shot(page, '08-portfolio')

  // Signed record download → verify in the browser
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Signed record/ }).click()])
  const path = await download.path()
  await page.goto('/verify')
  await page.locator('#record-file').setInputFiles(path!)
  await expect(page.getByText('Genuine KashWise record')).toBeVisible()
  await shot(page, '09-verify')

  // IMPACT
  await page.goto('/impact')
  await expect(page.getByText(/people earned/)).toBeVisible()
  await expect(page.getByText('Marketplace funnel')).toBeVisible()
  await shot(page, '10-impact')

  expect(errors, errors.join('\n')).toEqual([])
})
