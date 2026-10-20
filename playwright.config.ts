import { defineConfig, devices } from '@playwright/test';
const port = process.env.PLAYWRIGHT_PORT ?? '3001';
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: true, workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0, reporter: [['list'], ['html', {open: 'never'}]],
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: {...devices['Desktop Chrome']} }],
  webServer: { command: `npm run start -- --port ${port}`, url: `http://localhost:${port}`, reuseExistingServer: false, timeout: 60000,
    env: {
      APP_ORIGIN: `http://localhost:${port}`, ROOM_PASSWORD: 'test-only-password-not-a-secret', SESSION_SECRET: 'test-only-session-signing-key-for-browser-tests',
      LIVEKIT_URL: 'wss://fixture.livekit.cloud', LIVEKIT_API_KEY: 'test-api-key', LIVEKIT_API_SECRET: 'test-only-livekit-secret-for-browser-tests', LIVEKIT_ROOM_NAME: 'test-room',
      UPSTASH_REDIS_REST_URL: 'https://fixture.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'test-only-redis-token',
    },
  },
});
