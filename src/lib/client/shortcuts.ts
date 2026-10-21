import type { AudioAction } from './audio-controller';
import { validBinding as validateBinding } from '../shared/keybindings.mjs';
export const audioActions: AudioAction[] = ['microphone', 'listening', 'all'];
export type Shortcuts = Record<AudioAction, string>;
export const emptyShortcuts: Shortcuts = { microphone: '', listening: '', all: '' };
export const actionLabels: Record<AudioAction, string> = { microphone: 'Microfone', listening: 'Áudio recebido', all: 'Silenciar tudo' };
export function validBinding(value: unknown): value is string {
  return validateBinding(value);
}
export function validateShortcuts(value: unknown): Shortcuts {
  const result = { ...emptyShortcuts }; const seen = new Set<string>();
  if (!value || typeof value !== 'object') return result;
  for (const action of audioActions) {
    const binding = (value as Shortcuts)[action];
    if (validBinding(binding) && !seen.has(binding)) { result[action] = binding; seen.add(binding); }
  }
  return result;
}
export function bindingFromEvent(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'> & { code?: string }) {
  const names: Record<string, string> = { ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', '-': 'Minus', '=': 'Equal', ',': 'Comma', '.': 'Period', '/': 'Slash', '\\': 'Backslash', ';': 'Semicolon', "'": 'Quote', '[': 'BracketLeft', ']': 'BracketRight', '`': 'Backquote' };
  const punctuationCodes = new Set(['Minus', 'Equal', 'Comma', 'Period', 'Slash', 'Backslash', 'Semicolon', 'Quote', 'BracketLeft', 'BracketRight', 'Backquote']);
  const key = event.code && punctuationCodes.has(event.code) ? event.code : names[event.key] ?? (event.key.length === 1 ? event.key.toUpperCase() : event.key);
  const value = [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Meta', key].filter(Boolean).join('+');
  return validBinding(value) ? value : '';
}
export function shortcutAction(event: KeyboardEvent, bindings: Shortcuts): AudioAction | undefined {
  if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 || event.getModifierState('AltGraph')) return;
  if (event.composedPath().some(target => target instanceof HTMLElement && (target.isContentEditable || target.matches('input,textarea,select,[role="textbox"],[data-shortcut-editor]')))) return;
  const binding = bindingFromEvent(event);
  return binding ? audioActions.find(action => bindings[action] === binding) : undefined;
}
