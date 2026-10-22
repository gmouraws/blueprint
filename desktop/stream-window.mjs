import { BrowserWindow, session, ipcMain, dialog, shell } from 'electron';
import path from 'node:path';
import { streamPage } from './stream-links.mjs';
import { external, trusted } from './policy.mjs';
import { createScreenPicker } from './screen-picker.mjs';
import { createProcessAudio } from './process-audio.mjs';
import { failurePage } from './startup.mjs';

// A separate WebContents/session never receives the account cookie or account IPC.
export function createStreamWindow({ profile, here, helper, version, onChange = () => {}, onHide = () => {}, diagnostic = () => {} }) {
  let disposed=false;
  let win, picker, audio, ticket, loading, heartbeat, lastSync = 0, failed = false, selected = false, available = false, expires = 0, opening = false;
  const sender = event => !disposed && win && !win.isDestroyed() && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame && streamPage(event.senderFrame.url, profile.origin);
  const canCapture = () => available && Date.now() < expires && Date.now() - lastSync < 15000;
  function stop() { available = false; selected = false; picker?.cancel(); audio?.stop(); }
  function destroy() {
    clearTimeout(loading); clearInterval(heartbeat); stop(); picker?.dispose(); picker = undefined; ticket = undefined;
    const previous=win; win=undefined;
    if(previous && !previous.isDestroyed())previous.destroy();
    if(!disposed)onChange();
  }
  function fail(category) {
    if (disposed || !win || win.isDestroyed() || failed) return;
    failed = true; diagnostic('guest_load_failed'); clearTimeout(loading); stop();
    // Recovery never embeds the capability in HTML/URLs or exception messages.
    void win.loadURL(failurePage({ ...profile, origin: `${profile.origin}/stream` }, version, category)).catch(() => {});
  }
  function load(intent = 'watch') {
    failed = false; const current = win;
    clearTimeout(loading); loading = setTimeout(() => fail('timeout'), 30000);
    void win.loadURL(`${profile.origin}/stream?intent=${intent}`).catch(() => { if (win === current) fail('network'); });
  }
  function restore() { if (!win || win.isDestroyed()) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
  ipcMain.handle('stream:invite', event => {
    if (!sender(event)) throw Error('Invalid stream origin');
    const result = ticket; ticket = undefined; diagnostic(result ? 'ticket_delivered' : 'ticket_already_consumed'); return result ?? null;
  });
  ipcMain.handle('stream:configure', (event, value) => {
    if (!sender(event) || !value || typeof value.available !== 'boolean' || !Number.isSafeInteger(value.expires) || value.expires < 0 || value.expires > Date.now() + 12 * 3600000) throw Error('Invalid stream state');
    lastSync = Date.now(); expires = value.expires; available = value.available && expires > Date.now();
    if (!available) stop(); return { ready: true };
  });
  ipcMain.handle('stream-capture:claim', event => {
    if (!sender(event) || !canCapture() || !selected) return null;
    selected = false; const grant = audio.claim(); if (!grant) throw Error('Application capture ended'); return grant;
  });
  ipcMain.handle('stream-capture:pull', (event, id) => sender(event) && canCapture() && typeof id === 'string' && id.length === 36 ? audio.pull(id) : null);
  ipcMain.handle('stream-capture:stop', (event, id) => { if (sender(event) && typeof id === 'string' && id.length === 36) audio.release(id); });
  ipcMain.handle('stream:diagnostic', (event, stage) => {
    if(!sender(event) || !['ticket_redeemed','ticket_rejected','media_connected','media_failed'].includes(stage))return;
    diagnostic(stage);
  });
  function dispose(){
    if(disposed)return; disposed=true; destroy();
    for(const channel of ['stream:invite','stream:configure','stream:diagnostic','stream-capture:claim','stream-capture:pull','stream-capture:stop'])ipcMain.removeHandler(channel);
  }
  return {
    dispose, restore, destroy, exists: () => !!win && !win.isDestroyed(),
    async open(link) {
      if (disposed || opening) return; opening = true;
      try {
        if (win && !win.isDestroyed()) {
          restore();
          const answer = await dialog.showMessageBox(win, { type: 'question', buttons: ['Cancelar', 'Abrir novo convite'], defaultId: 0, cancelId: 0, message: 'Abrir outro convite?', detail: 'A transmissão desta janela será encerrada. O convite atual será substituído somente após sua confirmação.' });
          if (disposed || answer.response !== 1) return;
          destroy();
        }
        ticket = link.credential; diagnostic('guest_window_opening');
        // In-memory, independent of member and Preview/Production cookie partitions.
        const ses = session.fromPartition(`blueprint-stream-${profile.name}`);
        ses.setUserAgent(ses.getUserAgent() + ` BlueprintRoom/${version}`);
        win = new BrowserWindow({ width: 1180, height: 800, minWidth: 375, minHeight: 560, title: 'Blueprint Room · Transmissão', icon: path.join(here, 'icon.png'), backgroundColor: '#10151b', webPreferences: { session: ses, preload: path.join(here, 'preload.cjs'), additionalArguments: ['--blueprint-stream-window'], nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: false } });
        const current = win;
        let choosing = false;
        audio = createProcessAudio(helper);
        const currentAudio = audio;
        picker = createScreenPicker(win, { guest: true, applicationAudio: currentAudio.supported, startApplicationAudio: id => currentAudio.start(id), cancelAudio: () => currentAudio.stop() });
        const currentPicker = picker;
        ses.setPermissionCheckHandler((contents, permission, origin) => win === current && contents === current.webContents && trusted(origin, profile.origin) && ['display-capture', 'speaker-selection'].includes(permission));
        ses.setPermissionRequestHandler((contents, permission, callback, details) => callback(win === current && contents === current.webContents && details.isMainFrame !== false && streamPage(details.requestingUrl, profile.origin) && ['display-capture', 'speaker-selection'].includes(permission)));
        ses.setDisplayMediaRequestHandler(async (request, callback) => {
          if (win !== current || choosing || !canCapture() || !request.userGesture || request.frame !== win?.webContents.mainFrame || !trusted(request.securityOrigin, profile.origin)) { callback({}); return; }
          choosing = true; selected = false; currentAudio.stop();
          try {
            const result = await currentPicker.choose(request.audioRequested);
            if (!result || win !== current || !canCapture() || request.frame !== win.webContents.mainFrame) callback({});
            else { const { applicationAudio, ...streams } = result; selected = applicationAudio === true; callback(streams); }
          } catch { callback({}); } finally { choosing = false; }
        });
        heartbeat = setInterval(() => { if (win === current && available && !canCapture()) fail('timeout'); }, 5000);
        win.on('close', event => { if(disposed)return; event.preventDefault(); current.hide(); onHide(); });
        win.webContents.on('will-navigate', (event, url) => {
          event.preventDefault(); if (win === current && streamPage(url, profile.origin)) load();
        });
        win.webContents.on('will-redirect', (event, url) => { if (win === current && !streamPage(url, profile.origin)) { event.preventDefault(); fail('redirect'); } });
        win.webContents.on('did-start-navigation', (_event, _url, inPlace, main) => { if (win === current && main && !inPlace) stop(); });
        win.webContents.setWindowOpenHandler(({ url }) => { if (external(url)) void shell.openExternal(url); return { action: 'deny' }; });
        win.webContents.on('will-attach-webview', event => event.preventDefault());
        win.webContents.on('did-finish-load', () => { if (win === current && streamPage(current.webContents.getURL(), profile.origin)) { clearTimeout(loading); diagnostic('guest_page_loaded'); } });
        win.webContents.on('did-fail-load', (_event, code, _description, _url, main) => { if (win === current && main && code !== -3) fail('network'); });
        win.webContents.on('render-process-gone', () => { if (win === current) fail('renderer'); });
        win.webContents.on('preload-error', () => { if (win === current) fail('preload'); });
        load(link.intent); onChange();
      } finally { opening = false; }
    },
  };
}
