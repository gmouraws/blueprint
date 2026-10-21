const { contextBridge, ipcRenderer } = require('electron');
const subscribe = (channel, callback) => { const listener = (_event, value) => callback(value); ipcRenderer.on(channel, listener); return () => ipcRenderer.removeListener(channel, listener); };
contextBridge.exposeInMainWorld('blueprintDesktop', {
  configure: state => ipcRenderer.invoke('room:configure', state),
  onAction: callback => subscribe('room:action', callback),
  onConflicts: callback => subscribe('room:conflicts', callback),
  settings: () => ipcRenderer.invoke('room:settings'),
  startup: enabled => ipcRenderer.invoke('room:startup', enabled),
});
let recording = false;
function inputState() { const target = document.activeElement; ipcRenderer.send('room:input', { recording, typing: !!target?.closest('input,textarea,select,[contenteditable="true"],[role="textbox"],[data-shortcut-editor]') }); }
window.addEventListener('blueprint-recording', event => { recording = event.detail === true; inputState(); });
document.addEventListener('focusin', inputState); document.addEventListener('focusout', () => queueMicrotask(inputState));
// Main destroys the WebContents on explicit exit; Chromium releases all capture, including observers.
