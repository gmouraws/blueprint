import { installAccount, authenticate } from '../browser-account';
import { expect, type Page } from '@playwright/test';
import { AccessToken, RoomServiceClient, TrackSource, RoomConfiguration } from 'livekit-server-sdk';
import { createChatFixture } from '../chat-fixture';
const chatStores = new Map<string, ReturnType<typeof createChatFixture>>();
export function chatStore(room: string) {
  if (!chatStores.has(room)) chatStores.set(room, createChatFixture());
  return chatStores.get(room)!;
}
export async function closeChatStores() {
  for (const store of chatStores.values()) await (await store).close();
  chatStores.clear();
}

export async function observeMembership(page: Page) {
  await page.evaluate(() => {
    const messages: string[] = [];
    (window as unknown as { membershipProbe: string[] }).membershipProbe = messages;
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node instanceof Element && node.matches('.membership-notice')) messages.push(node.querySelector('p')!.textContent!);
      }
    }).observe(document.body, { subtree: true, childList: true });
  });
  return () => page.evaluate(() => (window as unknown as { membershipProbe: string[] }).membershipProbe);
}

// Loopback-only development credentials, never used by application auth or a cloud service.
const key = 'blueprint-test';
const secret = 'local-test-secret-not-a-production-credential';
export const service = new RoomServiceClient('http://127.0.0.1:7880', key, secret);

export async function instrument(page: Page) {
  await page.addInitScript(() => {
    const probe = {
      captures: 0, enumerations: 0, tones: 0, failData: false, blockAudio: false, pendingCapture: false,
      failCapture: '', devices: null as MediaDeviceInfo[] | null, screenWidth: 640, screenHeight: 360,
      releaseCapture: undefined as (() => void) | undefined,
      streams: [] as MediaStream[], peers: [] as RTCPeerConnection[], contexts: [] as AudioContext[],
      microphoneConstraints: [] as MediaTrackConstraints[], bypassSpeechDSP: true,
    };
    Object.assign(window, { mediaProbe: probe });
    const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      probe.captures++;
      if (probe.pendingCapture) await new Promise<void>(resolve => { probe.releaseCapture = resolve; });
      if (probe.failCapture) throw new DOMException('Controlled device failure', probe.failCapture);
      // A synthetic tone is not speech: bypass speech DSP only in this test fixture.
      const audio = typeof constraints?.audio === 'object' ? constraints.audio : {};
      probe.microphoneConstraints.push(audio);
      const stream = await capture({ ...constraints, audio: probe.bypassSpeechDSP ? { ...audio, echoCancellation: false, noiseSuppression: false, autoGainControl: false } : audio }); probe.streams.push(stream); return stream;
    };
    const enumerate = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
    navigator.mediaDevices.enumerateDevices = async () => { probe.enumerations++; return probe.devices ?? enumerate(); };
    const Peer = window.RTCPeerConnection;
    window.RTCPeerConnection = new Proxy(Peer, { construct(target, args) { const peer = Reflect.construct(target, args) as RTCPeerConnection; probe.peers.push(peer); return peer; } });
    const Context = window.AudioContext;
    window.AudioContext = new Proxy(Context, { construct(target, args) { const context = Reflect.construct(target, args) as AudioContext; probe.contexts.push(context); return context; } });
    const resume = Context.prototype.resume;
    Context.prototype.resume = function () { return probe.blockAudio ? Promise.reject(new DOMException('Controlled autoplay block', 'NotAllowedError')) : resume.call(this); };
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { return probe.blockAudio ? Promise.reject(new DOMException('Controlled autoplay block', 'NotAllowedError')) : play.call(this); };
    const oscillator = Context.prototype.createOscillator;
    Context.prototype.createOscillator = function () { const node = oscillator.call(this); const start = node.start.bind(node); node.start = (...args) => { probe.tones++; start(...args); }; return node; };
    const send = RTCDataChannel.prototype.send;
    RTCDataChannel.prototype.send = function (...args) { if (probe.failData) throw new Error('Controlled data transport failure'); return Reflect.apply(send, this, args); };
    navigator.mediaDevices.getDisplayMedia = async constraints => {
      Object.assign(probe, { screenConstraints: constraints });
      const canvas = document.createElement('canvas'); canvas.width = probe.screenWidth; canvas.height = probe.screenHeight;
      const paint = canvas.getContext('2d')!;
      let frame = 0;
      const draw = () => {
        paint.fillStyle = '#26364c'; paint.fillRect(0, 0, canvas.width, canvas.height);
        paint.strokeStyle = '#a3e1c5'; paint.lineWidth = 1;
        for (let x = 0; x < canvas.width; x += 32) { paint.beginPath(); paint.moveTo(x + 0.5, 0); paint.lineTo(x + 0.5, canvas.height); paint.stroke(); }
        paint.fillStyle = '#a3e1c5'; paint.font = '20px monospace'; paint.fillText(`Loopback test · ${canvas.width} × ${canvas.height}`, 24, 40);
        paint.fillRect((frame++ * 4) % canvas.width, canvas.height - 24, 24, 16);
      };
      draw(); const moving = setInterval(draw, 33);
      const video = canvas.captureStream(30).getVideoTracks()[0];
      const context = new AudioContext(); await context.resume();
      const tone = context.createOscillator(); const destination = context.createMediaStreamDestination();
      tone.frequency.value = 220; tone.connect(destination); tone.start();
      const stream = new MediaStream([video, destination.stream.getAudioTracks()[0]]); probe.streams.push(stream);
      const stop = video.stop.bind(video); video.stop = () => { clearInterval(moving); stop(); tone.stop(); void context.close(); stream.getAudioTracks().forEach(track => track.stop()); };
      return stream;
    };
  });
}

export async function prepare(page: Page, identity: string, room: string) {
  await (await chatStore(room)).install(page, identity);
  await instrument(page);
  await installAccount(page, identity );
  await page.route('**/api/token', async route => {
    const voiceRoom = route.request().postDataJSON().room ?? 'main';
    const destination = voiceRoom === 'second' ? room + '-second' : room;
    const token = new AccessToken(key, secret, { identity, name: identity, ttl: 300 });
    token.addGrant({ roomJoin: true, room: destination, canSubscribe: true, canPublish: true, canPublishData: true, canPublishSources: [TrackSource.MICROPHONE], canUpdateOwnMetadata: false });
    token.roomConfig = new RoomConfiguration({ name: destination, maxParticipants: 8 });
    const screens = new AccessToken(key, secret, { identity, name: identity, ttl: 300 });
    screens.addGrant({ roomJoin: true, room: destination + '-screens', canSubscribe: true, canPublish: true, canPublishData: false, canPublishSources: [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO], canUpdateOwnMetadata: false });
    screens.roomConfig = new RoomConfiguration({ name: destination + '-screens', maxParticipants: 16 });
    await route.fulfill({ json: { nickname: identity, identity, voiceRoom, token: await token.toJwt(), serverUrl: 'ws://127.0.0.1:7880', screens: { nickname: identity, identity, voiceRoom, token: await screens.toJwt(), serverUrl: 'ws://127.0.0.1:7880' } } });
  });
  let viewRequest = 0;
  await page.route('**/api/view', async route => {
    const voiceRoom = route.request().postDataJSON().room;
    const destination = (voiceRoom === 'second' ? room + '-second' : room) + '-screens';
    const observer = `${identity}:view:${++viewRequest}`;
    const token = new AccessToken(key, secret, { identity: observer, name: identity, ttl: 300 });
    token.addGrant({ roomJoin: true, room: destination, canSubscribe: true, canPublish: false, canPublishData: false, hidden: true, canUpdateOwnMetadata: false });
    token.roomConfig = new RoomConfiguration({ name: destination, maxParticipants: 16 });
    await route.fulfill({ json: { nickname: identity, identity: observer, voiceRoom, token: await token.toJwt(), serverUrl: 'ws://127.0.0.1:7880' } });
  });
  await page.route('**/api/voice', async route => {
    const rooms = await service.listRooms([room, room + '-second']);
    const roster = async (name: string) => rooms.some(item => item.name === name) ? (await service.listParticipants(name)).map(person => ({identity:person.identity,name:person.name,muted:!person.tracks.some(track => track.source === TrackSource.MICROPHONE && !track.muted)})) : [];
    await route.fulfill({ json: { rooms: { main: await roster(room), second: await roster(room + '-second') } } });
  });
  await page.route('**/api/voice/leave', route => route.fulfill({json:{ok:true}}));
  await page.route('**/api/view/leave', async route => {
    const body = route.request().postDataJSON();
    const name = (body.room === 'second' ? room + '-second' : room) + '-screens';
    // The loopback server has no Cloud token revocation. Remove only the test observer.
    const exists = (await service.listRooms([name])).some(item => item.name === name);
    if (exists && (await service.listParticipants(name)).some(person => person.identity === body.identity)) await service.removeParticipant(name, body.identity);
    await route.fulfill({ json: { ok: true } });
  });
  await page.route('**/api/logout', route => route.fulfill({ json: { ok: true } }));
  await page.goto('/');
  await authenticate(page, identity);
}
export async function join(page: Page) {
  const entry = page.getByRole('region', { name: 'Entrar na sala', exact: true });
  await expect(entry).toBeVisible();
  await entry.getByRole('button', { name: 'Entrar na sala', exact: true }).click();
  await expect(page.getByText('Conectado', { exact: true })).toBeVisible();
}
export async function energy(page: Page) {
  return page.evaluate(async () => {
    const probe = (window as unknown as { mediaProbe: { peers: RTCPeerConnection[] } }).mediaProbe;
    let energy = 0;
    for (const peer of probe.peers) (await peer.getStats()).forEach(stat => { if (stat.type === 'inbound-rtp' && stat.kind === 'audio') energy += stat.totalAudioEnergy ?? 0; });
    return energy;
  });
}
export async function gain(page: Page, kind: string, owner: string) {
  return page.evaluate(({ kind, owner }) => {
    const element = document.querySelector<HTMLAudioElement>(`audio[data-audio-kind="${kind}"][data-audio-owner="${owner}"]`);
    return element?.volume ?? 0; // No renderer means no playback, including deafen.
  }, { kind, owner });
}
export async function captures(page: Page) { return page.evaluate(() => (window as unknown as { mediaProbe: { captures: number } }).mediaProbe.captures); }
export async function liveTracks(page: Page) { return page.evaluate(() => (window as unknown as { mediaProbe: { streams: MediaStream[] } }).mediaProbe.streams.flatMap(stream => stream.getTracks()).filter(track => track.readyState === 'live').length); }
