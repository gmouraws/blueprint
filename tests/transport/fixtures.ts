import { expect, type Page } from '@playwright/test';
import { AccessToken, RoomServiceClient, TrackSource, RoomConfiguration } from 'livekit-server-sdk';

// Loopback-only development credentials, never used by application auth or a cloud service.
const key = 'blueprint-test';
const secret = 'local-test-secret-not-a-production-credential';
export const service = new RoomServiceClient('http://127.0.0.1:7880', key, secret);

export async function instrument(page: Page) {
  await page.addInitScript(() => {
    const probe = {
      captures: 0, enumerations: 0, tones: 0, failData: false, blockAudio: false, pendingCapture: false,
      failCapture: '', devices: null as MediaDeviceInfo[] | null,
      releaseCapture: undefined as (() => void) | undefined,
      streams: [] as MediaStream[], peers: [] as RTCPeerConnection[], contexts: [] as AudioContext[],
    };
    Object.assign(window, { mediaProbe: probe });
    const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      probe.captures++;
      if (probe.pendingCapture) await new Promise<void>(resolve => { probe.releaseCapture = resolve; });
      if (probe.failCapture) throw new DOMException('Controlled device failure', probe.failCapture);
      // A synthetic tone is not speech: bypass speech DSP only in this test fixture.
      const audio = typeof constraints?.audio === 'object' ? constraints.audio : {};
      const stream = await capture({ ...constraints, audio: { ...audio, echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); probe.streams.push(stream); return stream;
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
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
      const paint = canvas.getContext('2d')!; paint.fillStyle = '#a3e1c5'; paint.fillRect(0, 0, 640, 360);
      const video = canvas.captureStream(5).getVideoTracks()[0];
      const context = new AudioContext(); await context.resume();
      const tone = context.createOscillator(); const destination = context.createMediaStreamDestination();
      tone.frequency.value = 220; tone.connect(destination); tone.start();
      const stream = new MediaStream([video, destination.stream.getAudioTracks()[0]]); probe.streams.push(stream);
      const stop = video.stop.bind(video); video.stop = () => { stop(); tone.stop(); void context.close(); stream.getAudioTracks().forEach(track => track.stop()); };
      return stream;
    };
  });
}

export async function prepare(page: Page, identity: string, room: string) {
  const token = new AccessToken(key, secret, { identity, name: identity, ttl: 300 });
  token.addGrant({ roomJoin: true, room, canSubscribe: true, canPublish: true, canPublishData: true,
    canPublishSources: [TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO], canUpdateOwnMetadata: false });
  token.roomConfig = new RoomConfiguration({ name: room, maxParticipants: 8 });
  const jwt = await token.toJwt();
  await instrument(page);
  await page.route('**/api/login', route => route.fulfill({ json: { nickname: identity } }));
  await page.route('**/api/token', route => route.fulfill({ json: { nickname: identity, identity, token: jwt, serverUrl: 'ws://127.0.0.1:7880' } }));
  await page.route('**/api/logout', route => route.fulfill({ json: { ok: true } }));
  await page.goto('/');
  await page.getByLabel('Seu apelido').fill(identity);
  await page.getByLabel('Senha da sala').fill('browser-fixture-password');
}
export async function join(page: Page) {
  await page.getByRole('button', { name: 'Entrar na sala', exact: true }).click();
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
    return element?.volume ?? -1;
  }, { kind, owner });
}
export async function captures(page: Page) { return page.evaluate(() => (window as unknown as { mediaProbe: { captures: number } }).mediaProbe.captures); }
export async function liveTracks(page: Page) { return page.evaluate(() => (window as unknown as { mediaProbe: { streams: MediaStream[] } }).mediaProbe.streams.flatMap(stream => stream.getTracks()).filter(track => track.readyState === 'live').length); }
