import { test, expect } from '@playwright/test'
import { DEMO_PASSWORD } from '../src/lib/demo-password'

// I check today's layout rules at 360 px: the role choice comes first on Profile, and cash-out
// options are closed cards that open on tap (never hidden, greyed out when there is no money).
test.beforeEach(async ({ baseURL, page }) => {
  expect(baseURL, 'Runs only against a local preview').toMatch(/^http:\/\/(localhost|127\.0\.0\.1):/)
  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto('/login')
  await page.getByLabel('Email').fill('demo.worker@sidegigs.app')
  await page.getByLabel('Password').fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/\/(home|discover)/)
})

test('profile starts with the role choice', async ({ page }) => {
  await page.goto('/profile')
  const role = page.getByText('I mostly want to…')
  await expect(role).toBeVisible()
  const cv = page.getByRole('heading', { name: /Upload your CV/ })
  const [roleBox, cvBox] = [await role.boundingBox(), await cv.boundingBox()]
  expect(roleBox && cvBox && roleBox.y < cvBox.y).toBeTruthy()
  await page.screenshot({ path: 'test-results/360-profile-role-first.png', fullPage: true })
})

test('cash-out options are closed cards that open on tap', async ({ page }) => {
  await page.goto('/wallet')
  await expect(page.getByRole('heading', { name: 'Cash out' })).toBeVisible()
  const spaza = page.getByRole('button', { name: /Cash at a spaza or shop/ })
  await expect(spaza).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByLabel('Amount')).toHaveCount(0)
  await spaza.click()
  await expect(spaza).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByLabel('Amount')).toBeVisible()
  await page.getByRole('button', { name: /Bank account/ }).click()
  await expect(spaza).toHaveAttribute('aria-expanded', 'false')
  await page.screenshot({ path: 'test-results/360-wallet-cards.png', fullPage: true })
})
