import { test, expect, type Page } from '@playwright/test';
import { AccessToken, TrackSource, RoomConfiguration } from 'livekit-server-sdk';
import { instrument, captures, liveTracks, service, energy } from './fixtures';
import { STREAM_VIEW_ATTRIBUTE } from '../../src/lib/stream-labels';

test('transmission-only guests publish/watch one screen transport without microphone capture; mute and cleanup work', async ({ browser }) => {
  test.setTimeout(150000);
  const name = `guest-fixture-${Date.now()}`;
  const publisher = await browser.newPage(); const viewer = await browser.newPage();
  publisher.on('console', message => { if (message.text().startsWith('stream_publish_failed ')) console.log(message.text()); });
  let announced = 0;
  async function prepare(page: Page, id: string, share: boolean) {
    await instrument(page);
    await page.route('**/api/stream', async route => {
      const { action, trackSid } = route.request().postDataJSON();
      if (action === 'join') {
        const token = new AccessToken('blueprint-test', 'local-test-secret-not-a-production-credential', { identity: id, name: `Visitante ${share ? 1 : 2}`, ttl: 300 });
        token.addGrant({ roomJoin: true, room: name, canSubscribe: true, canPublish: share, canPublishSources: share ? [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO] : [], canPublishData: false });
        token.roomConfig = new RoomConfiguration({ name, maxParticipants: 8 });
        return route.fulfill({ json: { token: await token.toJwt(), serverUrl: 'ws://127.0.0.1:7880', role: share ? 'share' : 'watch', expires: Date.now() + 300000, connectionId: crypto.randomUUID() } });
      }
      if (action === 'viewing') { await service.updateParticipant(name,id,{attributes:{[STREAM_VIEW_ATTRIBUTE]:trackSid??''}}); return route.fulfill({json:{ok:true}}); }
      if (action === 'discover') { const people = (await service.listRooms([name])).length ? await service.listParticipants(name) : []; return route.fulfill({json:{streams:people.flatMap(p=>p.tracks.filter(t=>t.source===TrackSource.SCREEN_SHARE).map(t=>({identity:p.identity,sid:t.sid,label:1,viewers:people.filter(v=>v.identity!==p.identity&&v.attributes[STREAM_VIEW_ATTRIBUTE]===t.sid).length})))}}); }
      if (action === 'announce') announced++;
      return route.fulfill({ json: { ok: true, role: share ? 'share' : 'watch', expires: Date.now() + 300000 } });
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
    await expect.poll(async()=>(await service.getParticipant(name,'guest-viewer')).attributes[STREAM_VIEW_ATTRIBUTE]).toBeTruthy();
    await expect(publisher.getByText('👁 1 assistindo',{exact:true})).toBeVisible({timeout:20000});
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
    // Viewing modes retain the decoded track, audio level and single connection.
    await viewer.setViewportSize({width:1440,height:900});
    await viewer.locator('video').evaluate(el => { (window as unknown as {sameVideo:Element}).sameVideo=el; });
    const video = viewer.locator('video');
    const options = viewer.getByRole('button',{name:'Opções de visualização',exact:true});
    await expect(video).toHaveCSS('object-fit','scale-down');
    const image = await video.boundingBox(), bar = await viewer.locator('.viewer-toolbar').boundingBox();
    expect(bar!.y).toBeGreaterThanOrEqual(image!.y+image!.height);
    await options.click();await viewer.getByRole('button',{name:'Ajustar à área',exact:true}).click();
    await expect(video).toHaveCSS('object-fit','contain');
    await options.click();await viewer.getByRole('button',{name:'Tamanho original',exact:true}).click();
    await expect(video).toHaveCSS('object-fit','scale-down');
    await options.click();await viewer.getByRole('button',{name:'Alternar tela cheia'}).click();
    await expect.poll(()=>viewer.evaluate(()=>document.fullscreenElement?.classList.contains('screen-viewer'))).toBe(true);
    await expect.poll(()=>viewer.locator('.screen-viewer').evaluate(el=>Math.abs(el.getBoundingClientRect().height-innerHeight))).toBeLessThan(2);
    await expect(options).toHaveAttribute('aria-expanded','false');
    await video.click({position:{x:20,y:20}});
    await expect(viewer.locator('.viewer-toolbar')).toHaveCSS('opacity','0',{timeout:5000});
    await viewer.mouse.move(100,100);
    await expect(viewer.locator('.viewer-toolbar')).toHaveCSS('opacity','1');
    await options.click();await viewer.waitForTimeout(2600);
    await expect(viewer.locator('.viewer-toolbar')).toHaveCSS('opacity','1');
    await viewer.getByRole('button',{name:'Fechar',exact:true}).click();
    await viewer.keyboard.press('Escape');
    await expect.poll(()=>viewer.evaluate(()=>document.fullscreenElement===null)).toBe(true);
    expect(await video.evaluate(el=>(window as unknown as {sameVideo:Element}).sameVideo===el)).toBe(true);
    await expect.poll(()=>viewer.locator('audio').evaluate(el=>(el as HTMLAudioElement).volume)).toBeCloseTo(.35);
    expect(await service.listParticipants(name)).toHaveLength(2);expect(announced).toBe(1);
    // A denied request must be visible instead of leaving a silent no-op control.
    await viewer.locator('.screen-viewer').evaluate(el=>{el.requestFullscreen=async()=>{throw new DOMException('Denied','NotAllowedError');};});
    await options.click();await viewer.getByRole('button',{name:'Alternar tela cheia'}).click();
    await expect(viewer.locator('.viewer-error')).toContainText('Não foi possível alternar');
    await viewer.getByRole('button',{name:'Fechar',exact:true}).click();
    await viewer.getByRole('button', { name: 'Silenciar áudio da tela de Visitante 1' }).click();
    await expect(viewer.locator('audio')).toHaveCount(0);
    expect(await captures(viewer)).toBe(0); expect(await captures(publisher)).toBe(0);
    const outbound = () => publisher.evaluate(async () => {
      const peers = (window as unknown as {mediaProbe:{peers:RTCPeerConnection[]}}).mediaProbe.peers;
      const reports = await Promise.all(peers.map(peer => peer.getStats()));
      return reports.flatMap(report => [...report.values()]).filter(stat => stat.type === 'outbound-rtp' && stat.kind === 'video' && stat.framesPerSecond > 0).sort((a,b) => b.frameWidth-a.frameWidth)[0];
    });
    await expect.poll(async () => (await outbound())?.framesPerSecond ?? 0).toBeGreaterThan(0);
    const first = await outbound(); await publisher.waitForTimeout(1100); const second = await outbound();
    // Adaptive encoding can reduce resolution after the viewer becomes narrow.
    // Full-size reception was verified above; no layer may upscale the source.
    expect(second.frameWidth).toBeGreaterThan(0); expect(second.frameWidth).toBeLessThanOrEqual(640);
    expect(second.frameHeight).toBeGreaterThan(0); expect(second.frameHeight).toBeLessThanOrEqual(360);
    expect(second.frameWidth / second.frameHeight).toBeCloseTo(16 / 9, 1);
    // RTCStats rounds its short rolling sampling window; allow one frame of jitter.
    expect(second.framesPerSecond).toBeLessThanOrEqual(31);
    const measuredMbps = (second.bytesSent-first.bytesSent)*8/((second.timestamp-first.timestamp)*1000);
    expect(measuredMbps).toBeGreaterThan(0);
    console.log(`Synthetic outbound: ${second.frameWidth}x${second.frameHeight}, ${second.framesPerSecond} fps, ${measuredMbps.toFixed(3)} video Mbps; audio and overhead separate.`);
    // Browser/SDK stats may omit FPS on an inactive encoding. Keep transmitting
    // through a full usage-sampling interval; an optional metric must not crash UI.
    const runtimeErrors: string[] = [];
    publisher.on('pageerror', error => runtimeErrors.push(error.name));
    await publisher.evaluate(() => {
      const original = RTCRtpSender.prototype.getStats;
      RTCRtpSender.prototype.getStats = async function () {
        const report = await original.call(this);
        return new Map([...report.entries()].map(([id, stat]) => [id, stat.type === 'outbound-rtp' && stat.kind === 'video' ? { ...stat, framesPerSecond: undefined } : stat])) as RTCStatsReport;
      };
    });
    await publisher.waitForTimeout(12000);
    expect(runtimeErrors).toEqual([]);
    await expect(publisher.getByRole('button', { name: 'Parar transmissão', exact: true })).toBeEnabled();
    await expect(viewer.locator('video')).toHaveCount(1);
    const people = await service.listParticipants(name); expect(people).toHaveLength(2);
    expect(people.flatMap(p => p.tracks).every(t => [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO].includes(t.source))).toBe(true);
    expect(announced).toBe(1);
    await publisher.getByRole('button', { name: 'Parar transmissão' }).click();
    await expect.poll(() => liveTracks(publisher)).toBe(0); await expect(viewer.locator('video')).toHaveCount(0);
    await expect.poll(async () => (await service.listParticipants(name)).length).toBe(1);
    await expect.poll(async () => (await service.listParticipants(name)).length, {timeout:40000}).toBe(0);
    // A subsequent conventional capture ending at its source also releases audio/admission.
    await publisher.getByRole('button',{name:'Selecionar tela',exact:true}).click();
    await expect(publisher.getByRole('button',{name:'Parar transmissão',exact:true})).toBeEnabled();
    await expect.poll(()=>announced).toBe(2);
    await publisher.evaluate(()=>{
      const streams=(window as unknown as {mediaProbe:{streams:MediaStream[]}}).mediaProbe.streams;
      const track=streams.at(-1)!.getVideoTracks()[0];track.stop();track.dispatchEvent(new Event('ended'));
    });
    await expect.poll(()=>liveTracks(publisher)).toBe(0);
    await expect.poll(async()=>(await service.listParticipants(name)).length).toBe(0);
    await publisher.getByRole('button', { name: 'Sair', exact: true }).click(); await viewer.getByRole('button', { name: 'Sair', exact: true }).click();
    await expect.poll(async () => (await service.listParticipants(name)).length).toBe(0);
  } finally { await publisher.close(); await viewer.close(); await service.deleteRoom(name).catch(() => undefined); }
});
