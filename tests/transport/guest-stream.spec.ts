import { test, expect, type Page } from '@playwright/test';
import { AccessToken, TrackSource, RoomConfiguration } from 'livekit-server-sdk';
import { instrument, captures, liveTracks, service, energy } from './fixtures';

test('transmission-only guests publish/watch one screen transport without microphone capture; mute and cleanup work', async ({ browser }) => {
  test.setTimeout(100000);
  const name = `guest-fixture-${Date.now()}`;
  const publisher = await browser.newPage(); const viewer = await browser.newPage();
  publisher.on('console', message => { if (message.text().startsWith('stream_publish_failed ')) console.log(message.text()); });
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
    expect(await service.listRooms([name])).toHaveLength(0);
    expect(await captures(publisher)).toBe(0); expect(await liveTracks(publisher)).toBe(0);
    await expect(viewer.getByRole('button', { name: 'Selecionar tela' })).toHaveCount(0);
    await publisher.getByRole('button', { name: 'Selecionar tela' }).click();
    try { await expect(publisher.getByRole('button', { name: 'Parar transmissão', exact: true })).toBeEnabled({timeout:45000}); } catch (error) { console.log('Synthetic publisher UI:', await publisher.locator('main').innerText()); console.log('Synthetic transport states:', await publisher.evaluate(()=>(window as unknown as {mediaProbe:{peers:RTCPeerConnection[]}}).mediaProbe.peers.map(peer=>({ice:peer.iceConnectionState,connection:peer.connectionState,signaling:peer.signalingState})))); throw error; }
    // Discovery deliberately polls every 10 seconds without a media connection.
    await expect(viewer.getByRole('button', { name: 'Assistir · Transmissão 1', exact: true })).toBeVisible({timeout:20000});
    expect(await service.listParticipants(name)).toHaveLength(1);
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
    await viewer.setViewportSize({width:1440,height:900});
    await expect.poll(() => viewer.locator('video').evaluate(el => (el as HTMLVideoElement).videoWidth)).toBe(640);
    const outbound = () => publisher.evaluate(async () => {
      const peers = (window as unknown as {mediaProbe:{peers:RTCPeerConnection[]}}).mediaProbe.peers;
      const reports = await Promise.all(peers.map(peer => peer.getStats()));
      const videos = reports.flatMap(report => [...report.values()]).filter(stat => stat.type === 'outbound-rtp' && stat.kind === 'video');
      const active = videos.filter(stat => stat.framesPerSecond > 0).sort((a,b)=>b.frameWidth*b.frameHeight-a.frameWidth*a.frameHeight);
      return active.length ? {...active[0],bytesSent:videos.reduce((sum,stat)=>sum+(stat.bytesSent??0),0),timestamp:Math.max(...videos.map(stat=>stat.timestamp))} : undefined;
    });
    await expect.poll(async () => (await outbound())?.framesPerSecond ?? 0).toBeGreaterThan(0);
    const first = await outbound(); await publisher.waitForTimeout(1100); const second = await outbound();
    expect(second.frameWidth).toBe(640); expect(second.frameHeight).toBe(360); expect(second.framesPerSecond).toBeLessThanOrEqual(30);
    const measuredMbps = (second.bytesSent-first.bytesSent)*8/((second.timestamp-first.timestamp)*1000);
    expect(measuredMbps).toBeGreaterThan(0);
    console.log(`Synthetic outbound: ${second.frameWidth}x${second.frameHeight}, ${second.framesPerSecond} fps, ${measuredMbps.toFixed(3)} video Mbps; audio and overhead separate.`);
    const people = await service.listParticipants(name); expect(people).toHaveLength(2);
    expect(people.flatMap(p => p.tracks).every(t => [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO].includes(t.source))).toBe(true);
    expect(announced).toBe(1);
    await publisher.getByRole('button', { name: 'Parar transmissão' }).click();
    await expect.poll(() => liveTracks(publisher)).toBe(0); await expect(viewer.locator('video')).toHaveCount(0);
    await expect.poll(async () => (await service.listParticipants(name)).length).toBe(1);
    await expect.poll(async () => (await service.listParticipants(name)).length, {timeout:40000}).toBe(0);
    await publisher.getByRole('button', { name: 'Sair', exact: true }).click(); await viewer.getByRole('button', { name: 'Sair', exact: true }).click();
    await expect.poll(async () => (await service.listParticipants(name)).length).toBe(0);
  } finally { await publisher.close(); await viewer.close(); await service.deleteRoom(name).catch(() => undefined); }
});
