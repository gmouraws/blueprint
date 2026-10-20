import { defineConfig, devices } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Continuous original test signal; Chromium's default fake mic contains silent intervals.
const waveform = path.resolve('.generated/test-tone.wav');
mkdirSync(path.dirname(waveform), { recursive: true });
const samples = 48000 * 2;
const wave = Buffer.alloc(44 + samples * 2);
wave.write('RIFF'); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8);
wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22);
wave.writeUInt32LE(48000, 24); wave.writeUInt32LE(96000, 28); wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34);
wave.write('data', 36); wave.writeUInt32LE(samples * 2, 40);
for (let sample = 0; sample < samples; sample++) wave.writeInt16LE(Math.round(8000 * Math.sin(2 * Math.PI * 440 * sample / 48000)), 44 + sample * 2);
writeFileSync(waveform, wave);

export default defineConfig({
  testDir: './tests/transport', workers: 1, timeout: 60000, retries: 0,
  reporter: [['list']],
  use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3005', trace: 'off', launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${waveform}`, '--autoplay-policy=user-gesture-required'] } },
  webServer: { command: 'node node_modules/next/dist/bin/next start --port 3005', url: 'http://localhost:3005', reuseExistingServer: false, env: {
    APP_ORIGIN: 'http://localhost:3005', ROOM_PASSWORD: 'test-only-password-not-a-secret', SESSION_SECRET: 'test-only-session-signing-key-for-browser-tests',
    LIVEKIT_URL: 'wss://fixture.livekit.cloud', LIVEKIT_API_KEY: 'test-api-key', LIVEKIT_API_SECRET: 'test-only-livekit-secret-for-browser-tests', LIVEKIT_ROOM_NAME: 'test-room',
    UPSTASH_REDIS_REST_URL: 'https://fixture.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'test-only-redis-token',
  } },
});
