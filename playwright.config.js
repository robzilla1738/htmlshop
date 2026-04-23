import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 20_000,
  expect: {
    timeout: 5_000
  },
  use: {
    ...devices['Desktop Chrome'],
    browserName: 'chromium',
    headless: true,
    actionTimeout: 5_000
  }
})
