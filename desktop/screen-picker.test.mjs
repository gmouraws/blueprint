import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
function harness(options={},sourceId='screen:1'){
 const handlers=new Map(),windows=[];let available=true,enumerations=0;
 class Window extends EventEmitter{constructor(options){super();this.options=options;this.webContents=Object.assign(new EventEmitter(),{mainFrame:{url:'file:///test/picker.html'},setWindowOpenHandler:()=>{},session:{setPermissionCheckHandler:()=>{},setPermissionRequestHandler:()=>{}}});windows.push(this);}isDestroyed(){return !!this.dead;}destroy(){this.dead=true;this.emit('closed');}loadFile(){return Promise.resolve();}}
 const source=()=>({id:sourceId,name:'Fixture',thumbnail:{toDataURL:()=> 'data:image/png;base64,fixture'}});
 const context={BrowserWindow:Window,desktopCapturer:{getSources:async()=>{enumerations++;return available?[source()]:[];}},ipcMain:{handle:(key,fn)=>handlers.set(key,fn)},fileURLToPath:()=>'/test/screen-picker.mjs',pathToFileURL:()=>({href:'file:///test/picker.html'}),path:{dirname:()=>'/test',join:(...parts)=>parts.join('/')},process:{platform:'win32'},setTimeout:()=>1,clearTimeout:()=>{}};
 vm.runInNewContext(readFileSync(new URL('./screen-picker.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export function','function').replaceAll('import.meta.url',"'file:///test/screen-picker.mjs'")+'\nglobalThis.factory=createScreenPicker;',context);
 const picker=context.factory({isDestroyed:()=>false},options);
 return {picker,handlers,windows,setAvailable:value=>available=value,enumerations:()=>enumerations,event:()=>({sender:windows.at(-1).webContents,senderFrame:windows.at(-1).webContents.mainFrame})};
}
test('picker isolates IPC, revalidates sources and opts in to system audio',async()=>{
 const h=harness();const result=h.picker.choose(true);await new Promise(setImmediate);
 assert.throws(()=>h.handlers.get('picker:list')({sender:{},senderFrame:{}}));
 assert.equal(h.handlers.get('picker:list')(h.event()).audio,true);
 assert.ok((await h.handlers.get('picker:choose')(h.event(),{id:'forged',audio:'system'})).error);
 h.setAvailable(false);assert.ok((await h.handlers.get('picker:choose')(h.event(),{id:'screen:1',audio:'system'})).error);
 h.setAvailable(true);await h.handlers.get('picker:choose')(h.event(),{id:'screen:1',audio:'none'});
 const choice=await result;assert.equal(choice.video.id,'screen:1');assert.equal(choice.audio,undefined);assert.ok(h.windows[0].dead);
 const second=h.picker.choose(true);await new Promise(setImmediate);await h.handlers.get('picker:choose')(h.event(),{id:'screen:1',audio:'system'});assert.equal((await second).audio,'loopback');
});
test('cancellation fences in-flight enumeration and closes picker without selection',async()=>{
 const h=harness();const early=h.picker.choose(true);h.picker.cancel();assert.equal(await early,null);assert.equal(h.windows.length,0);
 const result=h.picker.choose(false);await new Promise(setImmediate);assert.equal(h.handlers.get('picker:list')(h.event()).audio,false);h.windows[0].emit('closed');assert.equal(await result,null);
 assert.throws(()=>h.handlers.get('picker:list')(h.event()));
});

test('refresh is scoped and application capture never falls back after failure',async()=>{
 let starts=0,stops=0;
 const h=harness({applicationAudio:true,startApplicationAudio:async()=>{starts++;throw Error('unsupported-target');},cancelAudio:()=>stops++},'window:123:0');
 const result=h.picker.choose(true);await new Promise(setImmediate);
 await assert.rejects(h.handlers.get('picker:refresh')({sender:{},senderFrame:{}}));
 assert.equal((await h.handlers.get('picker:refresh')(h.event())).sources.length,1);
 const failed=await h.handlers.get('picker:choose')(h.event(),{id:'window:123:0',audio:'application'});
 assert.match(failed.error,/Nenhum áudio do sistema/);assert.equal(starts,1);assert.ok(stops);assert.ok(!h.windows[0].dead);
 h.handlers.get('picker:cancel')(h.event());assert.equal(await result,null);
});
test('unsupported application selection is rejected; successful application selection has no loopback',async()=>{
 const unavailable=harness({},'window:123:0');const denied=unavailable.picker.choose(true);await new Promise(setImmediate);
 assert.ok((await unavailable.handlers.get('picker:choose')(unavailable.event(),{id:'window:123:0',audio:'application'})).error);unavailable.picker.cancel();await denied;
 const h=harness({applicationAudio:true,startApplicationAudio:async()=>{}},'window:123:0');const selected=h.picker.choose(true);await new Promise(setImmediate);
 await h.handlers.get('picker:choose')(h.event(),{id:'window:123:0',audio:'application'});const streams=await selected;assert.equal(streams.audio,undefined);assert.equal(streams.applicationAudio,true);
});
