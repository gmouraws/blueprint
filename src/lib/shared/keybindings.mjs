export const actions = ['microphone', 'listening', 'all'];
const modifiers = ['Ctrl', 'Alt', 'Shift', 'Meta'];
const keys = /^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Space|Enter|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Up|Down|Left|Right|Tab|Minus|Equal|Comma|Period|Slash|Backslash|Semicolon|Quote|BracketLeft|BracketRight|Backquote)$/;
const reserved = new Set(['Alt+F4', 'Ctrl+Alt+Delete', 'Ctrl+W', 'Ctrl+T', 'Ctrl+N', 'Ctrl+L', 'Ctrl+R', 'Ctrl+Shift+N', 'Ctrl+Shift+T', 'Ctrl+Shift+W', 'Ctrl+Shift+Q', 'Ctrl+Shift+I', 'Ctrl+Shift+J', 'Ctrl+Shift+C', 'Ctrl+Shift+P', 'Meta+L', 'Meta+D', 'Meta+Tab', 'F5', 'F11', 'F12']);
export function validBinding(value) {
  if (typeof value !== 'string' || value.length > 70 || reserved.has(value)) return false;
  const parts = value.split('+'); const key = parts.pop();
  return keys.test(key ?? '') && parts.every((part, index) => modifiers.includes(part) && (index === 0 || modifiers.indexOf(parts[index - 1]) < modifiers.indexOf(part))) && (parts.length > 0 || /^F\d+$/.test(key ?? ''));
}
export function accelerator(binding) {
  if (!validBinding(binding)) return '';
  const replacements = { Meta: 'Super', Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backquote: '`' };
  return binding.split('+').map(part => replacements[part] ?? part).join('+');
}
