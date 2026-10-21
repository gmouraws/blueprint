import type { Room } from 'livekit-client';

export function microphoneProcessing(noiseSuppression: boolean, supported: MediaTrackSupportedConstraints) {
  return { ...(supported.noiseSuppression ? { noiseSuppression } : {}), ...(supported.echoCancellation ? { echoCancellation: true } : {}), ...(supported.autoGainControl ? { autoGainControl: true } : {}) };
}
export function processingStatus(supported: boolean, settings?: MediaTrackSettings) {
  if (!supported) return 'Este navegador não oferece controle de supressão de ruído.';
  if (!settings) return 'A preferência será aplicada ao ativar o microfone.';
  if (settings.noiseSuppression === undefined) return 'O navegador não informa se a supressão está ativa.';
  return settings.noiseSuppression ? 'Supressão ativa, informada pelo navegador.' : 'Supressão inativa, informada pelo navegador.';
}
// Room is an imperative SDK instance, not React state. Retain the preference
// when the SDK must create a fresh microphone after a disconnect.
export function setMicrophoneDefaults(room: Room, constraints: ReturnType<typeof microphoneProcessing>) {
  room.options.audioCaptureDefaults = { ...room.options.audioCaptureDefaults, ...constraints };
}
