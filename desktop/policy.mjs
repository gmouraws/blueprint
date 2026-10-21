import { validBinding, accelerator, actions } from './keybindings.mjs';
export { accelerator, actions };
export function trusted(url, origin) { try { const u = new URL(url); return u.origin === origin && u.protocol === 'https:' && !u.username && !u.password; } catch { return false; } }
export function external(url) { try { const u = new URL(url); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password; } catch { return false; } }
export function validState(value) { return value && ['available','microphone','muted','combined'].every(k => typeof value[k] === 'boolean') && value.bindings && actions.every(k => value.bindings[k] === '' || validBinding(value.bindings[k])) && new Set(actions.map(k => value.bindings[k]).filter(Boolean)).size === actions.map(k => value.bindings[k]).filter(Boolean).length; }
export const inactive = { available: false, microphone: false, muted: false, combined: false, bindings: { microphone: '', listening: '', all: '' } };
