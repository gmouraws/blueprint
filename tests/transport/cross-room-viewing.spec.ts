import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { prepare, join, service, captures, gain, liveTracks, closeChatStores } from './fixtures';

test.afterAll(closeChatStores);
test('view either room without joining: authorized screens, isolated microphones, explicit screen audio and cleanup', async ({ browser }, testInfo) => {
  test.setTimeout(150000);
  const room = 'cross-room-' + Date.now();
  await service.createRoom({ name: room, maxParticipants: 8 });
  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext()));
  const [alice, bob, viewer, chatOnly] = await Promise.all(contexts.map(context => context.newPage()));
  const screenPeople = async (suffix = '') => service.listParticipants(room + suffix + '-screens');
  const observers = async (suffix = '') => (await screenPeople(suffix)).filter(person => person.permission?.hidden);
  const browse = (name: string) => viewer.getByRole('button', { name: `Ver ${name}`, exact: true });
  const decoded = () => viewer.locator('video').evaluate(video => ({ width: (video as HTMLVideoElement).videoWidth, height: (video as HTMLVideoElement).videoHeight }));
  const tones = () => viewer.evaluate(() => (window as unknown as { mediaProbe: { tones: number } }).mediaProbe.tones);
  try {
    for (const [page, identity] of [[alice, 'Alice'], [bob, 'Bruno'], [viewer, 'Clara']] as const) { await prepare(page, identity, room); await join(page); }
    await bob.getByRole('button', { name: 'Ver Sala 2', exact: true }).dblclick();
    await expect(bob.locator('.connection')).toContainText('Sala 2');
    for (const page of [alice, bob]) {
      await page.getByRole('button', { name: 'Ativar microfone', exact: true }).click();
      await page.getByRole('button', { name: 'Compartilhar tela', exact: true }).click();
    }
    await expect(viewer.locator('audio[data-audio-kind="microphone"][data-audio-owner="Alice"]')).toHaveCount(1);
    await expect(viewer.getByRole('button', { name: 'Opções de Bruno', exact: true })).toHaveCount(0);
    const before = await tones();
    await browse('Sala 2').click();
    await expect(viewer.getByRole('heading', { name: 'Sala 2', exact: true })).toBeVisible();
    await expect.poll(decoded).toEqual({ width: 640, height: 360 });
    await expect(viewer.locator('.connection')).toContainText('Sala principal');
    await expect(viewer.getByRole('button', { name: 'Entrar na voz de Sala 2' })).toBeVisible();
    await expect.poll(() => service.listParticipants(room)).toHaveLength(2);
    await expect.poll(() => service.listParticipants(room + '-second')).toHaveLength(1);
    await expect.poll(() => observers('-second')).toHaveLength(1);
    const observer = (await observers('-second'))[0];
    expect(observer.permission?.canPublish).toBe(false); expect(observer.permission?.canPublishData).toBe(false); expect(observer.tracks).toHaveLength(0);
    await expect(viewer.locator('audio[data-audio-owner="Bruno"]')).toHaveCount(0);
    await expect(viewer.locator('audio[data-audio-kind="screen_share_audio"]')).toHaveCount(0);
    await expect(viewer.getByRole('button', { name: 'Ouvir áudio da tela de Bruno', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await captures(viewer)).toBe(0); expect(await tones()).toBe(before);
    await viewer.getByRole('button', { name: 'Recolher participantes de Sala 2' }).click();
    await expect.poll(decoded).toEqual({ width: 640, height: 360 });
    expect(await tones()).toBe(before);

    await viewer.getByRole('button', { name: 'Ouvir áudio da tela de Bruno', exact: true }).click();
    await expect.poll(() => gain(viewer, 'screen_share_audio', 'Bruno')).toBeCloseTo(0.8);
    await viewer.getByRole('slider', { name: /Volume da tela de/ }).fill('45'); await viewer.keyboard.press('Escape');
    await viewer.getByRole('button', { name: 'Silenciar todo o áudio', exact: true }).click();
    await expect.poll(() => gain(viewer, 'screen_share_audio', 'Bruno')).toBe(0);
    await expect.poll(() => gain(viewer, 'microphone', 'Alice')).toBe(0);
    await viewer.getByRole('button', { name: 'Restaurar áudio', exact: true }).click();
    await expect.poll(() => gain(viewer, 'screen_share_audio', 'Bruno')).toBeCloseTo(0.45);
    await expect.poll(() => gain(viewer, 'microphone', 'Alice')).toBe(1);
    await expect(viewer.locator('audio[data-audio-kind="microphone"][data-audio-owner="Bruno"]')).toHaveCount(0);
    expect(await tones(), 'listening and mute controls do not emit membership sounds').toBe(before);

    // Disconnect/reconnect signaling is not another arrival or an opt-in reset.
    await contexts[2].setOffline(true);
    await expect(viewer.getByText('Reconectando…', { exact: true })).toBeVisible({ timeout: 20000 });
    await contexts[2].setOffline(false);
    await expect.poll(decoded, { timeout: 20000 }).toEqual({ width: 640, height: 360 });
    expect(await tones()).toBe(before);
    for (let i = 0; i < 3; i++) {
      await browse('Sala principal').click();
      await expect.poll(() => observers('-second')).toHaveLength(0);
      await expect(viewer.locator('audio[data-audio-owner="Bruno"]')).toHaveCount(0);
      await browse('Sala 2').click();
      await expect.poll(decoded).toEqual({ width: 640, height: 360 });
      await expect.poll(() => observers('-second')).toHaveLength(1);
      await expect(viewer.locator('audio[data-audio-kind="screen_share_audio"]')).toHaveCount(0);
    }
    expect(await tones()).toBe(before);
    // Cancel authorization/connection attempts before they finish; only the final
    // destination may retain an observer. The original voice call stays intact.
    for (let i = 0; i < 3; i++) { await browse('Sala principal').click(); await browse('Sala 2').click(); }
    await expect.poll(decoded).toEqual({ width: 640, height: 360 });
    await expect.poll(() => observers('-second')).toHaveLength(1);
    await expect.poll(() => service.listParticipants(room)).toHaveLength(2);
    await expect(viewer.locator('audio[data-audio-kind="screen_share_audio"]')).toHaveCount(0);
    await viewer.getByRole('button', { name: 'Ouvir áudio da tela de Bruno', exact: true }).click();
    await expect.poll(() => gain(viewer, 'screen_share_audio', 'Bruno')).toBeCloseTo(0.45);
    await viewer.getByRole('tab', { name: 'Chat', exact: true }).click();
    await expect(viewer.locator('.stream-mini video')).toBeVisible();
    await expect(viewer.locator('video')).toHaveCount(1);
    await expect(viewer.locator('audio[data-audio-kind="screen_share_audio"]')).toHaveCount(1);
    await viewer.getByRole('button', { name: 'Expandir tela e voltar à sala' }).click();
    await mkdir('.generated/review/cross-room', { recursive: true });
    for (const [width, height] of [[1440, 900], [1366, 768], [768, 1024], [375, 812], [320, 740]]) {
      await viewer.setViewportSize({ width, height });
      expect(await viewer.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await viewer.screenshot({ path: `.generated/review/cross-room/viewing-${width}.png`, fullPage: true });
    }
    expect((await new AxeBuilder({ page: viewer }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);

    await prepare(chatOnly, 'Diego', room); await chatOnly.getByRole('button', { name: 'Abrir chat sem entrar na voz' }).click();
    await chatOnly.getByRole('button', { name: 'Ver Sala principal', exact: true }).focus(); await chatOnly.keyboard.press('Enter');
    await expect.poll(() => chatOnly.locator('video').evaluate(video => (video as HTMLVideoElement).videoWidth)).toBe(640);
    await expect(chatOnly.locator('audio')).toHaveCount(0); expect(await captures(chatOnly)).toBe(0);
    await expect.poll(() => service.listParticipants(room)).toHaveLength(2);

    // Touch/keyboard join action follows the same safe flow as double-click.
    await viewer.getByRole('button', { name: 'Entrar na voz de Sala 2' }).click();
    await expect(viewer.locator('.connection')).toContainText('Sala 2');
    await expect.poll(() => observers('-second')).toHaveLength(0);
    await expect.poll(() => service.listParticipants(room)).toHaveLength(1);
    await expect.poll(() => service.listParticipants(room + '-second')).toHaveLength(2);
    await expect(viewer.locator('audio[data-audio-owner="Alice"]')).toHaveCount(0);
    await expect.poll(() => liveTracks(viewer)).toBe(0);
    await expect.poll(() => gain(viewer, 'microphone', 'Bruno')).toBe(1);
    await bob.getByRole('button', { name: 'Parar compartilhamento', exact: true }).click();
    await expect(viewer.locator('video')).toHaveCount(0);
    await expect(viewer.locator('audio[data-audio-kind="screen_share_audio"]')).toHaveCount(0);
    await testInfo.attach('scope', { body: 'Four independent Chromium contexts, real loopback SFU, synthetic microphone and moving canvas. Cloud revocation and physical-device audibility not established.', contentType: 'text/plain' });
  } finally {
    await Promise.all(contexts.map(context => context.close()));
    for (const suffix of ['', '-second', '-screens', '-second-screens']) await service.deleteRoom(room + suffix).catch(() => {});
  }
});
