import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { parseStreamLink, streamLinkFromArgs, streamPage } from './stream-links.mjs';
import { external, trusted } from './policy.mjs';
import { failurePage } from './startup.mjs';
const origin = 'https://www.blueprint.app.br', credential = 'x'.repeat(43);
test('protocol accepts only one canonical packaged-profile invitation, never arbitrary navigation', () => {
  const good = `blueprint-room://stream?intent=share#invite=${credential}`;
  assert.equal(parseStreamLink(good, 'production').intent, 'share');
  for (const bad of [good+'extra', good+'&url=https://evil.test', good.replace('share','admin'), good.replace('stream?', 'evil?'), good.replace('#invite=', '?invite='), 'https://www.blueprint.app.br/stream', good.replace('blueprint-room:', 'blueprint-room-preview:')]) assert.equal(parseStreamLink(bad,'production'),null);
  assert.equal(streamLinkFromArgs(['app.exe',good,good],'production'),null);
  assert.equal(streamLinkFromArgs(['app.exe',good],'production').credential,credential);
  assert.equal(streamPage(origin+'/api/account',origin),false);
  assert.equal(streamPage('https://evil.test/stream',origin),false);
});
function harness() {
 const ipc=new Map(), windows=[], permissions={}, audio=[], pickers=[], intervals=[];
 class Window extends EventEmitter {
  constructor(options){super();this.options=options;windows.push(this);this.webContents=Object.assign(new EventEmitter(),{mainFrame:{url:origin+'/stream'},getURL:()=>this.url,setWindowOpenHandler:fn=>this.external=fn});}
  loadURL(url){this.url=url;this.webContents.mainFrame.url=url;return Promise.resolve();} isDestroyed(){return !!this.dead;} destroy(){this.dead=true;} hide(){this.hidden=true;} show(){this.hidden=false;} focus(){} isMinimized(){return false;}
 }
 const state={now:Date.now(),answer:1,partitions:[]};
 const ses={getUserAgent:()=>'',setUserAgent:()=>{},setPermissionCheckHandler:fn=>permissions.check=fn,setPermissionRequestHandler:fn=>permissions.request=fn,setDisplayMediaRequestHandler:fn=>permissions.display=fn};
 const context={BrowserWindow:Window,session:{fromPartition:name=>{state.partitions.push(name);return ses;}},ipcMain:{handle:(key,fn)=>ipc.set(key,fn)},dialog:{showMessageBox:async()=>({response:state.answer})},shell:{openExternal:()=>{}},path:{join:(...x)=>x.join('/')},streamPage,external,trusted,failurePage,Date:{now:()=>state.now},Number,Error,setTimeout:()=>1,clearTimeout:()=>{},setInterval:fn=>{intervals.push(fn);return 1;},clearInterval:()=>{},createProcessAudio:()=>{const item={supported:true,stopped:0,stop(){this.stopped++;},start:async()=>{},claim:()=>({id:'test'}),pull:()=>null,release:()=>{}};audio.push(item);return item;},createScreenPicker:(_win,options)=>{const item={options,cancel(){},dispose(){this.disposed=true;},choose:async()=>({video:{id:'screen:1'},applicationAudio:true})};pickers.push(item);return item;}};
 const source=readFileSync(new URL('./stream-window.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export function','function');
 vm.runInNewContext(source+'\nglobalThis.factory=createStreamWindow;',context);
 const api=context.factory({profile:{name:'production',origin},here:'/test',helper:'/helper',version:'0.1.5'});
 const event=()=>({sender:windows.at(-1).webContents,senderFrame:windows.at(-1).webContents.mainFrame});
 return {api,ipc,windows,permissions,audio,pickers,state,intervals,event};
}
test('guest window isolates cookies/IPC, denies microphone and requires connected state plus explicit capture gesture',async()=>{
 const h=harness();await h.api.open({credential,intent:'share'});const win=h.windows[0],event=h.event();
 assert.equal(h.state.partitions[0],'blueprint-stream-production');
 assert.equal(win.options.webPreferences.sandbox,true);assert.equal(win.options.webPreferences.nodeIntegration,false);
 assert.ok(!win.url.includes(credential));assert.equal(h.ipc.get('stream:invite')(event),credential);assert.equal(h.ipc.get('stream:invite')(event),null);
 assert.throws(()=>h.ipc.get('stream:invite')({...event,sender:{}}));
 assert.equal(h.permissions.check(win.webContents,'media',origin),false);
 let permission=true;h.permissions.request(win.webContents,'media',v=>permission=v,{requestingUrl:origin+'/stream',isMainFrame:true});assert.equal(permission,false);
 const request={userGesture:true,frame:win.webContents.mainFrame,securityOrigin:origin+'/',audioRequested:true};let captured;
 await h.permissions.display(request,v=>captured=v);assert.equal(Object.keys(captured).length,0);
 h.ipc.get('stream:configure')(event,{available:true,expires:h.state.now+60000});
 await h.permissions.display({...request,userGesture:false},v=>captured=v);assert.equal(Object.keys(captured).length,0);
 await h.permissions.display(request,v=>captured=v);assert.equal(captured.video.id,'screen:1');assert.ok(!('applicationAudio' in captured));
 assert.equal(h.ipc.get('stream-capture:claim')(event).id,'test');assert.equal(h.ipc.get('stream-capture:claim')(event),null);
 win.emit('close',{preventDefault(){}});assert.equal(win.hidden,true);assert.ok(!win.dead);h.api.restore();assert.equal(win.hidden,false);
 h.state.now+=16000;h.intervals[0]();assert.match(decodeURIComponent(win.url),/Não foi possível abrir/);assert.ok(!win.url.includes(credential));
 h.api.destroy();assert.ok(win.dead);assert.ok(h.pickers[0].disposed);assert.ok(h.audio[0].stopped>0);
});
test('replacement cancels previous capture and stale window events cannot stop the replacement',async()=>{
 const h=harness();await h.api.open({credential,intent:'watch'});const old=h.windows[0];
 await h.api.open({credential,intent:'share'});const next=h.windows[1],stops=h.audio[1].stopped;
 assert.ok(old.dead);assert.ok(h.pickers[0].disposed);
 old.webContents.emit('render-process-gone');old.webContents.emit('did-start-navigation',{},'',false,true);
 assert.equal(h.audio[1].stopped,stops);assert.equal(next.url,origin+'/stream?intent=share');
 h.state.answer=0;await h.api.open({credential,intent:'watch'});assert.equal(h.windows.length,2);
 h.api.destroy();
});
