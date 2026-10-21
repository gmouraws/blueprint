import { app, BrowserWindow, Tray, Menu, dialog, globalShortcut, ipcMain, session, shell, nativeImage } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { trusted, external, validState, inactive, accelerator, actions } from './policy.mjs';
import { failurePage } from './startup.mjs';
import { createScreenPicker } from './screen-picker.mjs';
import { createProcessAudio } from './process-audio.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const processAudio=createProcessAudio(path.join(app.isPackaged?process.resourcesPath:path.join(here,'native/dist'),'process-audio.exe'));
const profile = JSON.parse(readFileSync(path.join(here, 'profile.json'), 'utf8'));
const origins = { production: 'https://www.blueprint.app.br', preview: 'https://blueprint-git-codex-windows-room-gmouraws-8238s-projects.vercel.app' };
if (origins[profile.name] !== profile.origin) throw new Error('Invalid packaged profile');
app.setPath('userData', path.join(app.getPath('appData'), `Blueprint Room-${profile.name}`));
app.setAppUserModelId(`br.app.blueprint.room.${profile.name}`);
app.enableSandbox();
let applicationSelection=false;
let win, tray, picker, watchdog, webReady=false, lastSync=0, quitting = false, inputBlocked = false, recording = false, state = { ...inactive }, lastEvent = 0, registrationKey = '';
const prefsPath = path.join(app.getPath('userData'), 'desktop.json');
let preferences = { closeExplained: false };
try { preferences.closeExplained = JSON.parse(readFileSync(prefsPath, 'utf8')).closeExplained === true; } catch { /* First launch. */ }
function restore() { if (win?.isMinimized()) win.restore(); win?.show(); win?.focus(); }
function sender(event) { return win && !win.isDestroyed() && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame && trusted(event.senderFrame.url, profile.origin); }
function sendAction(action, fromShortcut = false) {
  if (!state.available || recording || quitting || !trusted(win.webContents.getURL(), profile.origin) || (fromShortcut && win.isFocused() && inputBlocked)) return;
  win.webContents.send('room:action', action);
}
function updateTray() {
  tray?.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir Blueprint Room', click: restore }, { type: 'separator' },
    { label: !webReady ? 'Aguardando integração da página' : state.available ? 'Chamada conectada' : 'Controles indisponíveis fora da chamada ou durante reconexão', enabled:false },
    { label: 'Silenciar microfone', type: 'checkbox', checked: !state.microphone, enabled: state.available && !recording, click: () => sendAction('microphone') },
    { label: 'Silenciar áudio recebido', type: 'checkbox', checked: state.muted, enabled: state.available && !recording, click: () => sendAction('listening') },
    { label: 'Silenciar tudo', type: 'checkbox', checked: state.combined, enabled: state.available && !recording, click: () => sendAction('all') },
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
      if (!repeated) sendAction(action,true);
    }); } catch { /* OS rejects unsupported/reserved accelerators. */ }
    if (!registered) conflicts.push(binding);
  }
  return conflicts;
}
let conflicts = [];
let loadTimer, failed = false;
function fail(category, code) {
  if (quitting || failed || !win || win.isDestroyed()) return;
  failed = true; clearTimeout(loadTimer);
  picker?.cancel();processAudio.stop();
  state = { ...inactive }; register(); updateTray();
  // Do not persist URLs, exception messages, cookies, or authentication data.
  void win.loadURL(failurePage(profile, app.getVersion(), category, code)).catch(() => {
    if (!quitting) void dialog.showMessageBox(win, { type: 'error', message: 'Blueprint Room não conseguiu abrir a tela de recuperação.', detail: 'Encerre o aplicativo pela bandeja e tente novamente.' });
  });
}
function loadApplication() {
  failed = false; clearTimeout(loadTimer);
  loadTimer = setTimeout(() => fail('timeout'), 30000);
  void win.loadURL(profile.origin).catch(() => fail('network'));
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', restore);
  app.on('before-quit', () => { quitting = true; clearTimeout(loadTimer);clearInterval(watchdog);picker?.cancel();processAudio.stop(); state = { ...inactive }; globalShortcut.unregisterAll(); tray?.destroy(); if (win && !win.isDestroyed()) win.destroy(); });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.whenReady().then(() => {
    const ses = session.fromPartition(`persist:blueprint-${profile.name}`);
    ses.setUserAgent(ses.getUserAgent()+` BlueprintRoom/${app.getVersion()}`);
    win = new BrowserWindow({ width: 1180, height: 800, minWidth: 375, minHeight: 560, title: `Blueprint Room${profile.name === 'preview' ? ' · Preview' : ''}`, icon: path.join(here, 'icon.png'), backgroundColor: '#10151b', webPreferences: { session: ses, preload: path.join(here, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: false } });
    Menu.setApplicationMenu(null);
    picker=createScreenPicker(win,{applicationAudio:processAudio.supported,startApplicationAudio:id=>processAudio.start(id),cancelAudio:()=>processAudio.stop()});
    ipcMain.handle('capture:claim',event=>{if(!sender(event)||!state.available)return null;if(!applicationSelection)return null;applicationSelection=false;const grant=processAudio.claim();if(!grant)throw Error('Application capture ended');return grant;});
    ipcMain.handle('capture:pull',(event,id)=>sender(event)&&state.available&&typeof id==='string'&&id.length===36?processAudio.pull(id):null);
    ipcMain.handle('capture:stop',(event,id)=>{if(sender(event)&&typeof id==='string'&&id.length===36)processAudio.release(id);});
    watchdog=setInterval(()=>{if(state.available&&Date.now()-lastSync>15000){state={...inactive};processAudio.stop();register();updateTray();}},5000);
    tray = new Tray(nativeImage.createFromPath(path.join(here, 'icon.png')).resize({ width: 32, height: 32 })); tray.setToolTip('Blueprint Room'); tray.on('double-click', restore); updateTray();
    win.on('close', event => { if (quitting) return; event.preventDefault(); win.hide(); if (!preferences.closeExplained) { preferences.closeExplained = true; try { writeFileSync(prefsPath, JSON.stringify(preferences)); } catch { /* Optional preference. */ } tray.displayBalloon({ title: 'Blueprint Room continua aberto', content: 'A chamada continua na bandeja. Para encerrar a mídia, use “Sair do aplicativo”.' }); } });
    win.webContents.on('will-navigate', (event, url) => {
      if (failed && (url === profile.origin || url === profile.origin + '/')) { event.preventDefault(); loadApplication(); }
      else if (!trusted(url, profile.origin)) event.preventDefault();
    });
    win.webContents.on('will-redirect', (event, url) => { if (!trusted(url, profile.origin)) { event.preventDefault(); fail('redirect'); } });
    win.webContents.setWindowOpenHandler(({ url }) => { if (external(url)) void shell.openExternal(url); return { action: 'deny' }; });
    win.webContents.on('will-attach-webview', event => event.preventDefault());
    win.webContents.on('did-start-navigation', (_event, _url, inPlace, main) => { if (main&&!inPlace) {picker.cancel();processAudio.stop();webReady=false; state = { ...inactive }; inputBlocked = false; register(); updateTray(); } });
    win.webContents.on('render-process-gone', () => fail('renderer'));
    win.webContents.on('preload-error', () => fail('preload'));
    win.webContents.on('did-fail-load', (_event, code, _description, _url, main) => { if (main && code !== -3) fail('network', code); });
    win.webContents.on('did-finish-load', () => { if (trusted(win.webContents.getURL(), profile.origin)) {clearTimeout(loadTimer);setTimeout(()=>{if(!quitting&&!webReady&&trusted(win.webContents.getURL(),profile.origin))void dialog.showMessageBox(win,{type:'warning',message:'Esta página não iniciou a integração desktop.',detail:'Os atalhos globais e a bandeja não estão disponíveis. Saia da chamada e reabra o aplicativo para carregar a versão atual. Sua chamada não será interrompida automaticamente.'});},15000);} });
    win.on('unresponsive', () => fail('renderer'));
    ses.setPermissionCheckHandler((contents, permission, origin, details) => contents === win.webContents && trusted(origin, profile.origin) && (permission === 'media' ? details.mediaType === 'audio' : ['display-capture', 'speaker-selection'].includes(permission)));
    ses.setPermissionRequestHandler(async (contents, permission, callback, details) => {
      if (contents !== win.webContents || !trusted(details.requestingUrl, profile.origin) || details.isMainFrame === false) { callback(false); return; }
      if (permission === 'speaker-selection' || permission === 'display-capture') { callback(true); return; }
      if (permission !== 'media' || !details.mediaTypes?.length || details.mediaTypes.some(type => type !== 'audio')) { callback(false); return; }
      const result = await dialog.showMessageBox(win, { type: 'question', buttons: ['Cancelar', 'Permitir microfone'], defaultId: 0, cancelId: 0, message: 'Permitir o microfone para Blueprint Room?', detail: 'Solicitado pela ação de ativar ou testar o microfone.' }); callback(result.response === 1 && !quitting);
    });
    let choosing = false;
    ses.setDisplayMediaRequestHandler(async (request, callback) => {
      if (choosing || !state.available || !request.userGesture || request.frame !== win.webContents.mainFrame || !trusted(request.securityOrigin, profile.origin)) { callback({}); return; }
      choosing = true;applicationSelection=false;processAudio.stop();
      try {
        const selection = await picker.choose(request.audioRequested);
        if (!selection || !state.available || quitting || request.frame!==win.webContents.mainFrame || !trusted(win.webContents.getURL(), profile.origin)) callback({});
        else {const {applicationAudio,...streams}=selection;applicationSelection=applicationAudio===true;callback(streams);}
      } catch { callback({}); } finally { choosing = false; }
    });
    ipcMain.handle('room:configure', (event, value) => { if (!sender(event) || !validState(value)) throw new Error('Invalid request');webReady=true;lastSync=Date.now(); state = value;if(!state.available){picker.cancel();processAudio.stop();} const result = register(); updateTray(); return { conflicts: result }; });
    ipcMain.on('room:input', (event, value) => { if (sender(event) && value && typeof value.typing === 'boolean' && typeof value.recording === 'boolean') { inputBlocked = value.typing; recording = value.recording; win.webContents.send('room:conflicts', register());updateTray(); } });
    ipcMain.handle('room:settings', event => { if (!sender(event)) throw new Error('Invalid origin');webReady=true;updateTray(); return { startup: app.getLoginItemSettings().openAtLogin, profile: profile.name, version: app.getVersion() }; });
    ipcMain.handle('room:startup', (event, enabled) => { if (!sender(event) || typeof enabled !== 'boolean' || !app.isPackaged) throw new Error('Invalid request'); app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath }); return app.getLoginItemSettings().openAtLogin; });
    loadApplication();
  });
}
