import type { AudioAction } from './audio-controller';
export const audioActions: AudioAction[] = ['microphone', 'listening', 'all'];
export type Shortcuts = Record<AudioAction, string>;
export const emptyShortcuts: Shortcuts = { microphone: '', listening: '', all: '' };
export const actionLabels: Record<AudioAction, string> = { microphone: 'Microfone', listening: 'Áudio recebido', all: 'Silenciar tudo' };
export function validBinding(value: unknown): value is string {
  // Deliberately narrow: Ctrl+Shift+letter avoids plain typing and AltGr.
  return typeof value === 'string' && /^Ctrl\+Shift\+[A-Z]$/.test(value) && !['Ctrl+Shift+N', 'Ctrl+Shift+T', 'Ctrl+Shift+W', 'Ctrl+Shift+Q', 'Ctrl+Shift+I', 'Ctrl+Shift+J', 'Ctrl+Shift+C', 'Ctrl+Shift+P'].includes(value);
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
export function bindingFromEvent(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'>) {
  const value = event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey ? `Ctrl+Shift+${event.key.toUpperCase()}` : '';
  return validBinding(value) ? value : '';
}
export function shortcutAction(event: KeyboardEvent, bindings: Shortcuts): AudioAction | undefined {
  if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 || event.getModifierState('AltGraph')) return;
  if (event.composedPath().some(target => target instanceof HTMLElement && (target.isContentEditable || target.matches('input,textarea,select,[role="textbox"],[data-shortcut-editor]')))) return;
  const binding = bindingFromEvent(event);
  return binding ? audioActions.find(action => bindings[action] === binding) : undefined;
}
