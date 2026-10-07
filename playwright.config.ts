import { defineConfig, devices } from '@playwright/test';
const port = process.env.PLAYWRIGHT_PORT ?? '3000';
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: true, workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0, reporter: [['list'], ['html', {open: 'never'}]],
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: {...devices['Desktop Chrome']} }],
  webServer: { command: `npm run start -- --port ${port}`, url: `http://localhost:${port}`, reuseExistingServer: false, timeout: 60000 },
});
