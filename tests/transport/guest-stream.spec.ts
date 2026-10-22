import { test, expect, type Page } from '@playwright/test';
import { AccessToken, TrackSource, RoomConfiguration } from 'livekit-server-sdk';
import { instrument, captures, liveTracks, service, energy } from './fixtures';

test('transmission-only guests publish/watch one screen transport without microphone capture; mute and cleanup work', async ({ browser }) => {
  const name = `guest-fixture-${Date.now()}`;
  const publisher = await browser.newPage(); const viewer = await browser.newPage();
  let announced = 0;
  async function prepare(page: Page, id: string, share: boolean) {
    await instrument(page);
    await page.route('**/api/stream', async route => {
      const { action } = route.request().postDataJSON();
      if (action === 'join') {
        const token = new AccessToken('blueprint-test', 'local-test-secret-not-a-production-credential', { identity: id, name: `Visitante ${share ? 1 : 2}`, ttl: 120 });
        token.addGrant({ roomJoin: true, room: name, canSubscribe: true, canPublish: share, canPublishSources: share ? [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO] : [], canPublishData: false });
        token.roomConfig = new RoomConfiguration({ name, maxParticipants: 8 });
        return route.fulfill({ json: { token: await token.toJwt(), serverUrl: 'ws://127.0.0.1:7880', role: share ? 'share' : 'watch', expires: Date.now() + 60000, connectionId: crypto.randomUUID() } });
      }
      if (action === 'discover') { const people = (await service.listRooms([name])).length ? await service.listParticipants(name) : []; return route.fulfill({json:{streams:people.flatMap(p=>p.tracks.filter(t=>t.source===TrackSource.SCREEN_SHARE).map(t=>({identity:p.identity,sid:t.sid,label:1})))}}); }
      if (action === 'announce') announced++;
      return route.fulfill({ json: { ok: true, role: share ? 'share' : 'watch', expires: Date.now() + 60000 } });
    });
    await page.goto(`/stream?intent=${share ? 'share' : 'watch'}#invite=${'x'.repeat(43)}`);
  }
  try {
    await prepare(publisher, 'guest-publisher', true); await prepare(viewer, 'guest-viewer', false);
    await expect(publisher.getByRole('button', { name: 'Selecionar tela' })).toBeEnabled();
    expect(await captures(publisher)).toBe(0); expect(await liveTracks(publisher)).toBe(0);
    await expect(viewer.getByRole('button', { name: 'Selecionar tela' })).toHaveCount(0);
    await publisher.getByRole('button', { name: 'Selecionar tela' }).click();
    await expect(viewer.getByRole('button', { name: 'Assistir · Transmissão 1', exact: true })).toBeVisible();
    await viewer.getByRole('button', { name: 'Assistir · Transmissão 1', exact: true }).click();
    await expect.poll(() => viewer.locator('video').evaluate(el => (el as HTMLVideoElement).videoWidth)).toBe(640);
    await expect(viewer.locator('audio')).toHaveCount(0);
    await viewer.getByRole('button', { name: 'Ouvir áudio da tela de Visitante 1' }).click();
    await expect.poll(() => energy(viewer)).toBeGreaterThan(0);
    await expect(viewer.locator('audio')).toHaveCount(1);
    for (const width of [1440, 375]) {
      await viewer.setViewportSize({ width, height: 900 });
      expect(await viewer.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await viewer.screenshot({ path: `.generated/review/guest-stream-${width}.png`, fullPage: true });
    }
    await viewer.getByRole('slider', { name: 'Volume da tela de Visitante 1' }).fill('35');
    await expect.poll(() => viewer.locator('audio').evaluate(el => (el as HTMLAudioElement).volume)).toBeCloseTo(.35);
    await viewer.getByRole('button', { name: 'Silenciar áudio da tela de Visitante 1' }).click();
    await expect(viewer.locator('audio')).toHaveCount(0);
    expect(await captures(viewer)).toBe(0); expect(await captures(publisher)).toBe(0);
    const people = await service.listParticipants(name); expect(people).toHaveLength(2);
    expect(people.flatMap(p => p.tracks).every(t => [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO].includes(t.source))).toBe(true);
    expect(announced).toBe(1);
    await publisher.getByRole('button', { name: 'Parar transmissão' }).click();
    await expect.poll(() => liveTracks(publisher)).toBe(0); await expect(viewer.locator('video')).toHaveCount(0);
    await publisher.getByRole('button', { name: 'Sair', exact: true }).click(); await viewer.getByRole('button', { name: 'Sair', exact: true }).click();
    await expect.poll(async () => (await service.listParticipants(name)).length).toBe(0);
  } finally { await publisher.close(); await viewer.close(); await service.deleteRoom(name).catch(() => undefined); }
});
