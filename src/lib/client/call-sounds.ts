import type { Room } from 'livekit-client';

const contexts = new WeakMap<Room, AudioContext>();
export function prepareSounds(room: Room) {
  try { const context = new AudioContext(); contexts.set(room, context); void context.resume().catch(() => undefined); } catch { /* Optional browser capability. */ }
}
export function resumeSounds(room: Room) { void contexts.get(room)?.resume().catch(() => undefined); }
export async function setSoundsOutput(room: Room, deviceId: string) {
  const context = contexts.get(room) as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | undefined;
  // Never send optional tones to a different speaker from the selected call output.
  if (!context?.setSinkId) { if (deviceId !== 'default') closeSounds(room); return; }
  try { await context.setSinkId(deviceId); } catch { closeSounds(room); }
}
export function closeSounds(room: Room) { const context = contexts.get(room); contexts.delete(room); if (context && context.state !== 'closed') void context.close().catch(() => undefined); }
export function playMembershipTone(room: Room, joining: boolean) {
  const context = contexts.get(room);
  if (!context || context.state !== 'running') return;
  // Original short sine tones. No media assets, capture, recording or retries.
  const oscillator = context.createOscillator(); const gain = context.createGain();
  const now = context.currentTime;
  oscillator.frequency.setValueAtTime(joining ? 520 : 420, now);
  oscillator.frequency.linearRampToValueAtTime(joining ? 660 : 320, now + 0.12);
  gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(0.025, now + 0.015); gain.gain.linearRampToValueAtTime(0, now + 0.16);
  oscillator.connect(gain); gain.connect(context.destination); oscillator.start(now); oscillator.stop(now + 0.17);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}
