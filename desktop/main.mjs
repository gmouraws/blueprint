import { app, BrowserWindow, Tray, Menu, dialog, globalShortcut, ipcMain, session, desktopCapturer, shell, nativeImage } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { trusted, external, validState, inactive, accelerator, actions } from './policy.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const profile = JSON.parse(readFileSync(path.join(here, 'profile.json'), 'utf8'));
const origins = { production: 'https://www.blueprint.app.br', preview: 'https://blueprint-git-codex-windows-room-gmouraws-8238s-projects.vercel.app' };
if (origins[profile.name] !== profile.origin) throw new Error('Invalid packaged profile');
app.setPath('userData', path.join(app.getPath('appData'), `Blueprint Room-${profile.name}`));
app.setAppUserModelId(`br.app.blueprint.room.${profile.name}`);
app.enableSandbox();
let win, tray, quitting = false, inputBlocked = false, recording = false, state = { ...inactive }, lastEvent = 0, registrationKey = '';
const prefsPath = path.join(app.getPath('userData'), 'desktop.json');
let preferences = { closeExplained: false };
try { preferences.closeExplained = JSON.parse(readFileSync(prefsPath, 'utf8')).closeExplained === true; } catch { /* First launch. */ }
function restore() { if (win?.isMinimized()) win.restore(); win?.show(); win?.focus(); }
function sender(event) { return win && !win.isDestroyed() && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame && trusted(event.senderFrame.url, profile.origin); }
function sendAction(action) {
  if (!state.available || quitting || !trusted(win.webContents.getURL(), profile.origin) || (win.isFocused() && inputBlocked)) return;
  win.webContents.send('room:action', action);
}
function updateTray() {
  tray?.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir Blueprint Room', click: restore }, { type: 'separator' },
    { label: 'Silenciar microfone', type: 'checkbox', checked: !state.microphone, enabled: state.available, click: () => sendAction('microphone') },
    { label: 'Silenciar áudio recebido', type: 'checkbox', checked: state.muted, enabled: state.available, click: () => sendAction('listening') },
    { label: 'Silenciar tudo', type: 'checkbox', checked: state.combined, enabled: state.available, click: () => sendAction('all') },
    { type: 'separator' }, { label: 'Sair do aplicativo', click: () => app.quit() },
  ]));
}
function register() {
  const key = JSON.stringify([state.bindings, state.available, recording]);
  if (key === registrationKey) return conflicts;
  registrationKey = key; globalShortcut.unregisterAll(); conflicts = [];
  if (state.available && !recording) for (const action of actions) {
    const binding = state.bindings[action]; if (!binding) continue;
    let registered = false;
    try { registered = globalShortcut.register(accelerator(binding), () => {
      const now = Date.now(); const repeated = now - lastEvent < 500; lastEvent = now;
      if (!repeated) sendAction(action);
    }); } catch { /* OS rejects unsupported/reserved accelerators. */ }
    if (!registered) conflicts.push(binding);
  }
  return conflicts;
}
let conflicts = [];
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', restore);
  app.on('before-quit', () => { quitting = true; state = { ...inactive }; globalShortcut.unregisterAll(); tray?.destroy(); if (win && !win.isDestroyed()) win.destroy(); });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.whenReady().then(() => {
    const ses = session.fromPartition(`persist:blueprint-${profile.name}`);
    win = new BrowserWindow({ width: 1180, height: 800, minWidth: 375, minHeight: 560, title: `Blueprint Room${profile.name === 'preview' ? ' · Preview' : ''}`, icon: path.join(here, 'icon.png'), backgroundColor: '#10151b', webPreferences: { session: ses, preload: path.join(here, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: false } });
    Menu.setApplicationMenu(null);
    tray = new Tray(nativeImage.createFromPath(path.join(here, 'icon.png')).resize({ width: 32, height: 32 })); tray.setToolTip('Blueprint Room'); tray.on('double-click', restore); updateTray();
    win.on('close', event => { if (quitting) return; event.preventDefault(); win.hide(); if (!preferences.closeExplained) { preferences.closeExplained = true; try { writeFileSync(prefsPath, JSON.stringify(preferences)); } catch { /* Optional preference. */ } tray.displayBalloon({ title: 'Blueprint Room continua aberto', content: 'A chamada continua na bandeja. Para encerrar a mídia, use “Sair do aplicativo”.' }); } });
    win.webContents.on('will-navigate', (event, url) => { if (!trusted(url, profile.origin)) event.preventDefault(); });
    win.webContents.on('will-redirect', (event, url) => { if (!trusted(url, profile.origin)) event.preventDefault(); });
    win.webContents.setWindowOpenHandler(({ url }) => { if (external(url)) void shell.openExternal(url); return { action: 'deny' }; });
    win.webContents.on('will-attach-webview', event => event.preventDefault());
    win.webContents.on('did-start-navigation', (_event, _url, _inPlace, main) => { if (main) { state = { ...inactive }; inputBlocked = false; register(); updateTray(); } });
    win.webContents.on('render-process-gone', () => { state = { ...inactive }; register(); updateTray(); });
    ses.setPermissionCheckHandler((contents, permission, origin, details) => contents === win.webContents && trusted(origin, profile.origin) && (permission === 'media' ? details.mediaType === 'audio' : ['display-capture', 'speaker-selection'].includes(permission)));
    ses.setPermissionRequestHandler(async (contents, permission, callback, details) => {
      if (contents !== win.webContents || !trusted(details.requestingUrl, profile.origin) || details.isMainFrame === false) { callback(false); return; }
      if (permission === 'speaker-selection' || permission === 'display-capture') { callback(true); return; }
      if (permission !== 'media' || !details.mediaTypes?.length || details.mediaTypes.some(type => type !== 'audio')) { callback(false); return; }
      const result = await dialog.showMessageBox(win, { type: 'question', buttons: ['Cancelar', 'Permitir microfone'], defaultId: 0, cancelId: 0, message: 'Permitir o microfone para Blueprint Room?', detail: 'Solicitado pela ação de ativar ou testar o microfone.' }); callback(result.response === 1 && !quitting);
    });
    let choosing = false;
    ses.setDisplayMediaRequestHandler(async (request, callback) => {
      if (choosing || !request.userGesture || request.frame !== win.webContents.mainFrame || !trusted(request.securityOrigin, profile.origin)) { callback({}); return; }
      choosing = true;
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } });
        const selection = await dialog.showMessageBox(win, { title: 'Compartilhar tela', message: 'Escolha a tela ou janela', buttons: ['Cancelar', ...sources.map(source => source.name)], defaultId: 0, cancelId: 0, checkboxLabel: request.audioRequested ? 'Compartilhar áudio do sistema (inclui outros aplicativos)' : undefined, checkboxChecked: false });
        const source = sources[selection.response - 1];
        if (!source || quitting || !trusted(win.webContents.getURL(), profile.origin)) callback({});
        else callback({ video: source, ...(request.audioRequested && selection.checkboxChecked && process.platform === 'win32' ? { audio: 'loopback' } : {}) });
      } catch { callback({}); } finally { choosing = false; }
    });
    ipcMain.handle('room:configure', (event, value) => { if (!sender(event) || !validState(value)) throw new Error('Invalid request'); state = value; const result = register(); updateTray(); return { conflicts: result }; });
    ipcMain.on('room:input', (event, value) => { if (sender(event) && value && typeof value.typing === 'boolean' && typeof value.recording === 'boolean') { inputBlocked = value.typing; recording = value.recording; win.webContents.send('room:conflicts', register()); } });
    ipcMain.handle('room:settings', event => { if (!sender(event)) throw new Error('Invalid origin'); return { startup: app.getLoginItemSettings().openAtLogin, profile: profile.name, version: app.getVersion() }; });
    ipcMain.handle('room:startup', (event, enabled) => { if (!sender(event) || typeof enabled !== 'boolean' || !app.isPackaged) throw new Error('Invalid request'); app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath }); return app.getLoginItemSettings().openAtLogin; });
    void win.loadURL(profile.origin);
  });
}
