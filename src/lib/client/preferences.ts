import { accountPreferences, type AccountPreferences } from '../account-preferences';
import { validateShortcuts, emptyShortcuts, type Shortcuts } from './shortcuts';
export type Preferences = { microphone: string; output: string; sounds: boolean; screenVolume: number; noiseSuppression: boolean; shortcuts: Shortcuts };
export const defaultPreferences: Preferences = { microphone: 'default', output: 'default', sounds: true, screenVolume: 80, noiseSuppression: true, shortcuts: emptyShortcuts };
const legacyKey = 'blueprint.audio-preferences';
let accountId = '';
let defaults: AccountPreferences = {};
export function preferencePlatform() { return typeof navigator !== 'undefined' && /Win/.test(navigator.platform) ? 'windows' : typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? 'mac' : 'other'; }
const key = () => `blueprint.preferences.v2:${accountId || 'guest'}:${preferencePlatform()}`;
export function currentPreferenceAccount() { return accountId; }
function overrides(value: unknown): Partial<Preferences> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const validated = validatePreferences(value);
  return Object.fromEntries(Object.keys(defaultPreferences).filter(name => Object.hasOwn(value, name)).map(name => [name, validated[name as keyof Preferences]]));
}
export function shortcutPlatform(): 'browser'|'windowsDesktop' { return typeof window !== 'undefined' && (window.blueprintDesktop || /BlueprintRoom\//.test(navigator.userAgent)) ? 'windowsDesktop' : 'browser'; }
export function configurePreferences(id: string, value: unknown) { const changed=accountId!==id;accountId = id; defaults = accountPreferences(value); if(typeof window!=='undefined'){if(changed)void window.blueprintDesktop?.configure({bindings:emptyShortcuts,available:false,microphone:false,muted:false,combined:false}).catch(()=>undefined);window.dispatchEvent(new Event('blueprint-preferences'));} }
export function legacyLocalShortcuts(): Shortcuts | null { try { const local=JSON.parse(localStorage.getItem(key())??'{}'); return Object.hasOwn(local,'shortcuts') ? validateShortcuts(local.shortcuts) : null; } catch { return null; } }
export async function saveAccountShortcuts(bindings: Shortcuts) {
  const expected=accountId;if(!expected)throw new Error('Entre novamente para salvar os atalhos.');
  const response=await fetch('/api/account',{cache:'no-store'});if(!response.ok)throw new Error('Não foi possível carregar os atalhos da conta.');
  const current=await response.json();if(current.id!==expected||accountId!==expected)throw new Error('A conta mudou. Reabra as configurações.');
  const result=await fetch('/api/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'shortcuts',accountId:expected,version:current.preference_version,platform:shortcutPlatform(),bindings})});
  const saved=await result.json();if(!result.ok)throw new Error(saved.error||'Não foi possível salvar os atalhos.');
  if(accountId!==expected||saved.id!==expected)throw new Error('A conta mudou. Reabra as configurações.');
  configurePreferences(expected,saved.preferences);
}
export function canImportPreferences() { try { return !!accountId && !!localStorage.getItem(legacyKey) && !localStorage.getItem(key() + ':imported'); } catch { return false; } }
export function importPreferences() { if (!canImportPreferences()) return; try { const old = validatePreferences(JSON.parse(localStorage.getItem(legacyKey)!)); const current = overrides(JSON.parse(localStorage.getItem(key()) ?? '{}')); localStorage.setItem(key(), JSON.stringify({ ...old, ...current })); localStorage.setItem(key() + ':imported', 'true'); } catch { /* Optional storage. */ } }
export function validatePreferences(value: unknown): Preferences {
  const data = value && typeof value === 'object' ? value as Partial<Preferences> : {};
  return {
    shortcuts: validateShortcuts(data.shortcuts),
    output: typeof data.output === 'string' && data.output.length > 0 && data.output.length <= 256 ? data.output : 'default',
    microphone: typeof data.microphone === 'string' && data.microphone.length > 0 && data.microphone.length <= 256 ? data.microphone : 'default',
    sounds: typeof data.sounds === 'boolean' ? data.sounds : true,
    noiseSuppression: typeof data.noiseSuppression === 'boolean' ? data.noiseSuppression : true,
    screenVolume: typeof data.screenVolume === 'number' && Number.isFinite(data.screenVolume) ? Math.round(Math.min(100, Math.max(0, data.screenVolume))) : 80,
  };
}
export function readPreferences(): Preferences {
  const shortcuts = accountId ? defaults.shortcuts?.[shortcutPlatform()] ?? defaults.shortcuts?.[preferencePlatform()] ?? emptyShortcuts : emptyShortcuts;
  const base = { ...defaultPreferences, ...defaults, shortcuts };
  try { return validatePreferences({ ...base, ...overrides(JSON.parse(localStorage.getItem(key()) ?? '{}')), shortcuts }); } catch { return validatePreferences(base); }
}
export function savePreferences(change: Partial<Preferences>) {
  try {
    const previous = overrides(JSON.parse(localStorage.getItem(key()) ?? '{}'));
    const validated = validatePreferences({ ...readPreferences(), ...change });
    const allowed = Object.keys(change).filter(name => name in defaultPreferences) as (keyof Preferences)[];
    localStorage.setItem(key(), JSON.stringify({ ...previous, ...Object.fromEntries(allowed.map(name => [name, validated[name]])) }));
  } catch { /* Storage is optional. */ }
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
