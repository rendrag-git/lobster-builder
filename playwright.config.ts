import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.LOBSTER_BUILDER_E2E_PORT ?? 5174)
const host = '127.0.0.1'
const baseURL = `http://${host}:${port}`

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run dev -- --host ${host} --port ${port}`,
    url: baseURL,
    reuseExistingServer: process.env.LOBSTER_BUILDER_E2E_REUSE_SERVER === '1',
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
