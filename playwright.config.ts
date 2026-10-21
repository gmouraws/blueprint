import { defineConfig, devices } from '@playwright/test';
const port = process.env.PLAYWRIGHT_PORT ?? '3001';
const diagnosticsPort = String(Number(port) + 2);
const fixtureEnv = {
  BETTER_AUTH_SECRET: 'test-only-account-secret-at-least-32-characters', RESEND_API_KEY: 're_test-only-browser-email-credential', RESEND_FROM: 'room@example.test', DATABASE_URL: 'postgres://fixture:fixture@fixture.neon.tech/fixture?sslmode=require', CHAT_ENVIRONMENT: 'preview',
  APP_ORIGIN: `http://localhost:${port}`, ROOM_PASSWORD: 'test-only-password-not-a-secret', SESSION_SECRET: 'test-only-session-signing-key-for-browser-tests',
  LIVEKIT_URL: 'wss://fixture.livekit.cloud', LIVEKIT_API_KEY: 'test-api-key', LIVEKIT_API_SECRET: 'test-only-livekit-secret-for-browser-tests', LIVEKIT_ROOM_NAME: 'test-room',
  UPSTASH_REDIS_REST_URL: 'https://fixture.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'test-only-redis-token',
};
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: true, workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0, reporter: [['list'], ['html', {open: 'never'}]],
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: {...devices['Desktop Chrome']} }],
  webServer: [
    { command: `node --import ./tests/browser-database.mjs node_modules/next/dist/bin/next start --port ${port}`, url: `http://localhost:${port}`, reuseExistingServer: false, timeout: 60000, env: fixtureEnv },
    { command: `npm run start -- --port ${diagnosticsPort}`, url: `http://localhost:${diagnosticsPort}`, reuseExistingServer: false, timeout: 60000,
      env: { ...fixtureEnv, APP_ORIGIN: 'invalid-origin-canary', LIVEKIT_API_SECRET: '', UPSTASH_REDIS_REST_TOKEN: 'replace-with-redis-canary' },
    },
  ],
});
