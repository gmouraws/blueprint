import type { Room } from 'livekit-client';

const contexts = new WeakMap<Room, AudioContext>();
const policies = new WeakMap<Room, { enabled: boolean; muted: boolean }>();
const unavailableOutputs = new WeakSet<Room>();
export function setSoundPolicy(room: Room, policy: { enabled: boolean; muted: boolean }) { policies.set(room, policy); }
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
export function closeSounds(room: Room) { const context = contexts.get(room); contexts.delete(room); if (context && context.state !== 'closed') void context.close().catch(() => undefined); }
export function playMembershipTone(room: Room, joining: boolean): Promise<void> {
  const context = contexts.get(room);
  const policy = policies.get(room);
  if (!context || context.state !== 'running' || policy?.muted || policy?.enabled === false || !room.canPlaybackAudio) return Promise.resolve();
  // Original short sine tones. No media assets, capture, recording or retries.
  const oscillator = context.createOscillator(); const gain = context.createGain();
  const now = context.currentTime;
  oscillator.frequency.setValueAtTime(joining ? 520 : 420, now);
  oscillator.frequency.linearRampToValueAtTime(joining ? 660 : 320, now + 0.12);
  gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(0.025, now + 0.015); gain.gain.linearRampToValueAtTime(0, now + 0.16);
  oscillator.connect(gain); gain.connect(context.destination); oscillator.start(now); oscillator.stop(now + 0.17);
  return new Promise(resolve => {
    const timer = setTimeout(resolve, 250);
    oscillator.onended = () => { clearTimeout(timer); oscillator.disconnect(); gain.disconnect(); resolve(); };
  });
}
