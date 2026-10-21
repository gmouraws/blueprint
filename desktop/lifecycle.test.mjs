import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as policy from './policy.mjs';
import { failurePage } from './startup.mjs';
import { streamLinkFromArgs } from './stream-links.mjs';

async function harness() {
 const registered = new Map(), ipc = new Map(), sent = [], permission = {}, windows = [];
 const origin='https://blueprint-git-codex-windows-room-gmouraws-8238s-projects.vercel.app';
 const app = Object.assign(new EventEmitter(), { getPath:()=>'/test',setPath:()=>{},setAppUserModelId:()=>{},enableSandbox:()=>{},requestSingleInstanceLock:()=>true,whenReady:()=>Promise.resolve(),quit:()=>{app.emit('before-quit');app.emit('will-quit');},getLoginItemSettings:()=>({openAtLogin:app.startup??false}),setLoginItemSettings:({openAtLogin})=>{app.startup=openAtLogin;},getVersion:()=> '0.1.0',isPackaged:true });
 class Window extends EventEmitter {
   constructor(options) { super(); this.options=options; this.hidden=false; this.dead=false; windows.push(this); this.webContents=Object.assign(new EventEmitter(),{mainFrame:{url:origin},getURL:()=>origin,send:(...args)=>sent.push(args),setWindowOpenHandler:handler=>{this.open=handler;}}); }
   hide(){this.hidden=true;} show(){this.hidden=false;} focus(){} isFocused(){return !this.hidden;} isMinimized(){return false;} restore(){this.hidden=false;} isDestroyed(){return this.dead;} destroy(){this.dead=true;} loadURL(url){this.loaded=url;return Promise.resolve();}
 }
 class Tray extends EventEmitter {setContextMenu(menu){this.menu=menu;}setToolTip(){}destroy(){this.dead=true;}displayBalloon(){this.balloon=true;}}
 const ses={getUserAgent:()=>"test",setUserAgent:()=>{},setPermissionCheckHandler:fn=>permission.check=fn,setPermissionRequestHandler:fn=>permission.request=fn,setDisplayMediaRequestHandler:fn=>permission.display=fn};
 const context = { ...policy, app, BrowserWindow:Window,Tray,Menu:{buildFromTemplate:x=>x,setApplicationMenu:()=>{}},dialog:{showMessageBox:async()=>({response:0})},globalShortcut:{register:(key,fn)=>{if(key==='F9')return false;registered.set(key,fn);return true;},unregisterAll:()=>registered.clear()},ipcMain:{handle:(key,fn)=>ipc.set(key,fn),on:(key,fn)=>ipc.set(key,fn)},session:{fromPartition:()=>ses},desktopCapturer:{getSources:async()=>[]},shell:{openExternal:()=>{}},nativeImage:{createFromPath:()=>({resize:()=>({})})},readFileSync:()=>JSON.stringify({name:'preview',origin}),writeFileSync:()=>{},fileURLToPath:()=>'/test/main.mjs',path:{dirname:()=>'/test',join:(...args)=>args.join('/')},process:{platform:'win32',execPath:'/test/app.exe'},console,URL,Date,JSON };
 Object.assign(context, { streamLinkFromArgs, createStreamWindow:()=>({exists:()=>false,destroy:()=>{},open:async()=>{}}), failurePage, createProcessAudio:()=>({supported:false,stop:()=>{},claim:()=>null,pull:()=>null,release:()=>{}}), createScreenPicker:()=>({cancel:()=>{},choose:async()=>null}), setTimeout: () => 1, clearTimeout: () => {}, setInterval:()=>1,clearInterval:()=>{} });
 let source=readFileSync(new URL('./main.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('import.meta.url',"'file:///test/main.mjs'");
 source+='\nglobalThis.inspect = () => ({win,tray,state});';
 vm.runInNewContext(source,context); await Promise.resolve();
 return {context,app,registered,ipc,sent,permission,win:windows[0],event:{sender:windows[0].webContents,senderFrame:windows[0].webContents.mainFrame}};
}
test('close-to-tray preserves renderer; restore and exit follow lifecycle, no implicit startup',async()=>{
 const h=await harness();let prevented=false;h.win.emit('close',{preventDefault:()=>prevented=true});assert.ok(prevented);assert.ok(h.win.hidden);assert.equal(h.win.dead,false);assert.ok(h.context.inspect().tray.balloon);
 h.app.emit('second-instance');assert.equal(h.win.hidden,false);assert.equal(h.app.startup,undefined);
 h.ipc.get('room:startup')(h.event,true);assert.equal(h.app.startup,true);h.app.quit();assert.equal(h.win.dead,true);assert.equal(h.registered.size,0);
});
test('load failure shows safe retry UI, unregisters actions, and retries only packaged origin', async()=>{
 const h=await harness();
 h.ipc.get('room:configure')(h.event,{...policy.inactive,available:true,bindings:{microphone:'F8',listening:'',all:''}});
 h.win.webContents.emit('did-fail-load',{},-105,'secret error','https://host/?token=SECRET',true);
 assert.equal(h.registered.size,0);
 const html=decodeURIComponent(h.win.loaded); assert.match(html,/Tentar novamente/); assert.match(html,/-105/); assert.doesNotMatch(html,/SECRET|secret error/);
 let prevented=false;h.win.webContents.emit('will-navigate',{preventDefault:()=>prevented=true},h.event.senderFrame.url+'/');
 assert.ok(prevented);assert.equal(h.win.loaded,h.event.senderFrame.url);
});
test('renderer/preload failures and blocked redirects recover without origin widening',async()=>{
 for (const event of ['render-process-gone','preload-error','will-redirect']) {
  const h=await harness();let prevented=false;
  h.win.webContents.emit(event,{preventDefault:()=>prevented=true},'https://untrusted.test/?secret=hidden');
  assert.match(decodeURIComponent(h.win.loaded),/Não foi possível abrir/);
  assert.doesNotMatch(decodeURIComponent(h.win.loaded),/hidden|untrusted/);
  if(event==='will-redirect')assert.ok(prevented);
 }
});
test('native shortcuts require call state, conflicts are returned, recording unregisters, stale/foreign IPC denied',async()=>{
 const h=await harness();const state={...policy.inactive,available:true,bindings:{microphone:'Alt+F8',listening:'F9',all:''}};
 assert.equal(h.registered.size,0);const result=h.ipc.get('room:configure')(h.event,state);assert.equal(result.conflicts[0],'F9');
 h.win.hide();h.registered.get('Alt+F8')();assert.equal(h.sent[0][1],'microphone');
 h.ipc.get('room:input')(h.event,{recording:true,typing:true});assert.equal(h.registered.size,0);
 assert.throws(()=>h.ipc.get('room:configure')({...h.event,senderFrame:{url:'https://evil.test'}},state));
 h.ipc.get('room:configure')(h.event,policy.inactive);assert.equal(h.registered.size,0);
});
test('permissions reject other origins/camera and canceled display selection',async()=>{
 const h=await harness();assert.equal(h.permission.check(h.win.webContents,'media','https://evil.test',{mediaType:'audio'}),false);
 assert.equal(h.permission.check(h.win.webContents,'media',h.event.senderFrame.url,{mediaType:'video'}),false);
 let allowed=true;await h.permission.request(h.win.webContents,'media',v=>allowed=v,{requestingUrl:h.event.senderFrame.url,isMainFrame:true,mediaTypes:['audio']});assert.equal(allowed,false);
 let result;await h.permission.display({userGesture:false,frame:h.event.senderFrame,securityOrigin:h.event.senderFrame.url},v=>result=v);assert.equal(Object.keys(result).length,0);
});
test('tray actions share dispatcher but do not inherit keyboard typing exclusion; navigation clears availability',async()=>{
 const h=await harness();const active={...policy.inactive,available:true,bindings:{microphone:'Alt+F8',listening:'',all:''}};
 h.ipc.get('room:configure')(h.event,active);
 h.ipc.get('room:input')(h.event,{recording:false,typing:true});
 h.registered.get('Alt+F8')();assert.equal(h.sent.filter(value=>value[0]==='room:action').length,0);
 const mute=h.context.inspect().tray.menu.find(item=>item.label==='Silenciar microfone');assert.equal(mute.enabled,true);mute.click();assert.equal(h.sent.at(-1)[1],'microphone');
 h.ipc.get('room:configure')(h.event,{...active,microphone:true,muted:true,combined:true});
 assert.equal(h.context.inspect().tray.menu.find(item=>item.label==='Silenciar microfone').checked,false);
 assert.equal(h.context.inspect().tray.menu.find(item=>item.label==='Silenciar tudo').checked,true);
 h.win.webContents.emit('did-start-navigation',{},h.event.senderFrame.url,false,true);
 assert.equal(h.registered.size,0);assert.equal(h.context.inspect().tray.menu.find(item=>item.label==='Silenciar tudo').enabled,false);
});
