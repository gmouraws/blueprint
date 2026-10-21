import { validateShortcuts, emptyShortcuts, type Shortcuts } from './shortcuts';
export type Preferences = { microphone: string; sounds: boolean; screenVolume: number; noiseSuppression: boolean; shortcuts: Shortcuts };
export const defaultPreferences: Preferences = { microphone: 'default', sounds: true, screenVolume: 80, noiseSuppression: true, shortcuts: emptyShortcuts };
const key = 'blueprint.audio-preferences';
export function validatePreferences(value: unknown): Preferences {
  const data = value && typeof value === 'object' ? value as Partial<Preferences> : {};
  return {
    shortcuts: validateShortcuts(data.shortcuts),
    microphone: typeof data.microphone === 'string' && data.microphone.length > 0 && data.microphone.length <= 256 ? data.microphone : 'default',
    sounds: typeof data.sounds === 'boolean' ? data.sounds : true,
    noiseSuppression: typeof data.noiseSuppression === 'boolean' ? data.noiseSuppression : true,
    screenVolume: typeof data.screenVolume === 'number' && Number.isFinite(data.screenVolume) ? Math.round(Math.min(100, Math.max(0, data.screenVolume))) : 80,
  };
}
export function readPreferences(): Preferences {
  try { return validatePreferences(JSON.parse(localStorage.getItem(key) ?? 'null')); } catch { return { ...defaultPreferences }; }
}
export function savePreferences(change: Partial<Preferences>) {
  try { localStorage.setItem(key, JSON.stringify(validatePreferences({ ...readPreferences(), ...change }))); } catch { /* Storage is optional. */ }
}
export function microphoneError(error: unknown) {
  const name = error instanceof Error ? error.name : '';
  if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(name)) return 'Acesso ao microfone negado. Confira a permissão do site no navegador. Você pode continuar ouvindo e usando o chat.';
  if (['NotFoundError', 'DevicesNotFoundError', 'OverconstrainedError'].includes(name)) return 'Microfone não encontrado. Conecte um dispositivo ou escolha outro microfone.';
  if (['NotReadableError', 'TrackStartError'].includes(name)) return 'Não foi possível abrir o microfone. Ele pode estar em uso por outro aplicativo ou indisponível no sistema.';
  return 'Não foi possível ativar o microfone. Confira o dispositivo e tente novamente.';
}
export function incomingVolume(globalMuted: boolean, muted: boolean, volume: number) {
  return globalMuted || muted ? 0 : Math.min(100, Math.max(0, volume)) / 100;
}
