import type { Room } from 'livekit-client';

const contexts = new WeakMap<Room, AudioContext>();
const policies = new WeakMap<Room, { enabled: boolean; muted: boolean }>();
const unavailableOutputs = new WeakSet<Room>();
type ToneKind = 'membership' | 'screen' | 'confirmation';
const activeGains = new WeakMap<Room, Map<GainNode, ToneKind>>();
export function setSoundPolicy(room: Room, policy: { enabled: boolean; muted: boolean }) {
  policies.set(room, policy);
  for (const [gain, kind] of activeGains.get(room) ?? []) if (kind !== 'confirmation' && (policy.muted || (kind === 'membership' && !policy.enabled))) {
    gain.gain.cancelScheduledValues(gain.context.currentTime); gain.gain.setValueAtTime(0, gain.context.currentTime);
  }
}
export function prepareSounds(room: Room) {
  if (unavailableOutputs.has(room)) return;
  if (contexts.has(room)) { resumeSounds(room); return; }
  try { const context = new AudioContext(); contexts.set(room, context); void context.resume().catch(() => undefined); } catch { /* Optional browser capability. */ }
}
export function resumeSounds(room: Room) { void contexts.get(room)?.resume().catch(() => undefined); }
export async function setSoundsOutput(room: Room, deviceId: string) {
  const context = contexts.get(room) as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | undefined;
  // Never send optional tones to a different speaker from the selected call output.
  if (deviceId === 'default') unavailableOutputs.delete(room);
  if (!context?.setSinkId) { if (deviceId !== 'default') { unavailableOutputs.add(room); closeSounds(room); } return; }
  try { await context.setSinkId(deviceId); unavailableOutputs.delete(room); } catch { unavailableOutputs.add(room); closeSounds(room); }
}
export function closeSounds(room: Room) { const context = contexts.get(room); contexts.delete(room); for (const gain of activeGains.get(room)?.keys() ?? []) gain.disconnect(); activeGains.delete(room); if (context && context.state !== 'closed') void context.close().catch(() => undefined); }
export function playMembershipTone(room: Room, joining: boolean): Promise<void> {
  return playTone(room, 'membership', joining ? 520 : 420, joining ? 660 : 320);
}
export function playScreenTone(room: Room) { return playTone(room, 'screen', 760, 1140, 0.22); }
export function playConfirmationTone(room: Room, silenced: boolean) { return playTone(room, 'confirmation', silenced ? 280 : 360, silenced ? 220 : 480, 0.09); }
function playTone(room: Room, kind: ToneKind, start: number, end: number, duration = 0.17): Promise<void> {
  const context = contexts.get(room);
  const policy = policies.get(room);
  if (!context || context.state !== 'running' || (kind !== 'confirmation' && policy?.muted) || (kind === 'membership' && policy?.enabled === false) || !room.canPlaybackAudio) return Promise.resolve();
  // Original short sine tones. No media assets, capture, recording or retries.
  const oscillator = context.createOscillator(); const gain = context.createGain();
  if (!activeGains.has(room)) activeGains.set(room, new Map());
  activeGains.get(room)!.set(gain, kind);
  const now = context.currentTime;
  oscillator.frequency.setValueAtTime(start, now);
  oscillator.frequency.linearRampToValueAtTime(end, now + duration * 0.7);
  gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(0.025, now + 0.015); gain.gain.linearRampToValueAtTime(0, now + duration - 0.01);
  oscillator.connect(gain); gain.connect(context.destination); oscillator.start(now); oscillator.stop(now + duration);
  return new Promise(resolve => {
    const timer = setTimeout(resolve, 250);
    oscillator.onended = () => { clearTimeout(timer); activeGains.get(room)?.delete(gain); oscillator.disconnect(); gain.disconnect(); resolve(); };
  });
}
