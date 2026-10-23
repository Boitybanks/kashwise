import { defineConfig, devices } from '@playwright/test'

// Browser smoke test of the P0 journey. Defaults to production; override with BASE_URL.
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'https://sidegigs-codecraft.netlify.app',
    ...devices['Pixel 7'],
    trace: 'retain-on-failure',
  },
})
