import { test, expect } from '@playwright/test';

for (const initialVoice of [false, true]) test(`stalled ${initialVoice ? 'initial' : 'chat-to-voice'} entry releases controls and preserves chat without capture`, async ({ page }) => {
  await page.clock.install();
  await page.route('**/api/login', route => route.fulfill({ json: { nickname: 'Ana' } }));
  await page.route('**/api/token', route => route.fulfill({ json: { nickname: 'Ana', identity: 'fixture', serverUrl: 'ws://127.0.0.1:7899', token: 'test-only-token', voiceRoom: 'main' } }));
  await page.route('**/api/voice', route => route.fulfill({ json: { rooms: { main: [], second: [] } } }));
  await page.route('**/api/chat**', route => route.fulfill({ json: { messages: [], hasMore: false, serverTime: new Date().toISOString() } }));
  await page.route('**/api/voice/leave', route => route.fulfill({ json: { ok: true } }));
  // Keep the signaling socket open without a join response. The application must recover.
  let signalStarted!: () => void;
  const signaling = new Promise<void>(resolve => { signalStarted = resolve; });
  await page.routeWebSocket('ws://127.0.0.1:7899/**', () => { signalStarted(); });
  await page.addInitScript(() => {
    Object.assign(window, { captureAttempts: 0 });
    navigator.mediaDevices.getUserMedia = async () => {
      (window as unknown as { captureAttempts: number }).captureAttempts++;
      throw new Error('No automatic capture allowed');
    };
  });
  await page.goto('/');
  await page.getByLabel('Seu apelido').fill('Ana');
  await page.getByLabel('Senha da sala').fill('test-only-password');
  await page.getByRole('button', { name: initialVoice ? 'Entrar na sala' : 'Abrir chat sem entrar na voz', exact: true }).click();
  if (initialVoice) await page.getByRole('tab', { name: 'Chat', exact: true }).click();
  await page.getByLabel('Mensagem', { exact: true }).fill('Draft survives failed voice entry');
  if (!initialVoice) await page.getByRole('button', { name: 'Entrar em Sala principal', exact: true }).click();
  await signaling;
  await expect(page.getByRole('button', { name: 'Entrar em Sala principal', exact: true })).toBeDisabled();
  await page.clock.runFor(36000);
  // The SDK may reject first; both failures must leave the same usable, disconnected UI.
  await expect(page.getByText(/A conexão de voz demorou demais|Não foi possível entrar na voz/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar na voz', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Sair da sala', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Mensagem', { exact: true })).toHaveValue('Draft survives failed voice entry');
  expect(await page.evaluate(() => (window as unknown as { captureAttempts: number }).captureAttempts)).toBe(0);
});
