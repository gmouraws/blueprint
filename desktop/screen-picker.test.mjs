import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
function harness(){
 const handlers=new Map(),windows=[];let available=true,enumerations=0;
 class Window extends EventEmitter{constructor(options){super();this.options=options;this.webContents=Object.assign(new EventEmitter(),{mainFrame:{url:'file:///test/picker.html'},setWindowOpenHandler:()=>{},session:{setPermissionCheckHandler:()=>{},setPermissionRequestHandler:()=>{}}});windows.push(this);}isDestroyed(){return !!this.dead;}destroy(){this.dead=true;this.emit('closed');}loadFile(){return Promise.resolve();}}
 const source=()=>({id:'screen:1',name:'Fixture',thumbnail:{toDataURL:()=> 'data:image/png;base64,fixture'}});
 const context={BrowserWindow:Window,desktopCapturer:{getSources:async()=>{enumerations++;return available?[source()]:[];}},ipcMain:{handle:(key,fn)=>handlers.set(key,fn)},fileURLToPath:()=>'/test/screen-picker.mjs',pathToFileURL:()=>({href:'file:///test/picker.html'}),path:{dirname:()=>'/test',join:(...parts)=>parts.join('/')},process:{platform:'win32'},setTimeout:()=>1,clearTimeout:()=>{}};
 vm.runInNewContext(readFileSync(new URL('./screen-picker.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export function','function').replaceAll('import.meta.url',"'file:///test/screen-picker.mjs'")+'\nglobalThis.factory=createScreenPicker;',context);
 const picker=context.factory({isDestroyed:()=>false});
 return {picker,handlers,windows,setAvailable:value=>available=value,enumerations:()=>enumerations,event:()=>({sender:windows.at(-1).webContents,senderFrame:windows.at(-1).webContents.mainFrame})};
}
test('picker isolates IPC, revalidates sources and opts in to system audio',async()=>{
 const h=harness();const result=h.picker.choose(true);await new Promise(setImmediate);
 assert.throws(()=>h.handlers.get('picker:list')({sender:{},senderFrame:{}}));
 assert.equal(h.handlers.get('picker:list')(h.event()).audio,true);
 assert.ok((await h.handlers.get('picker:choose')(h.event(),{id:'forged',audio:true})).error);
 h.setAvailable(false);assert.ok((await h.handlers.get('picker:choose')(h.event(),{id:'screen:1',audio:true})).error);
 h.setAvailable(true);await h.handlers.get('picker:choose')(h.event(),{id:'screen:1',audio:false});
 const choice=await result;assert.equal(choice.video.id,'screen:1');assert.equal(choice.audio,undefined);assert.ok(h.windows[0].dead);
 const second=h.picker.choose(true);await new Promise(setImmediate);await h.handlers.get('picker:choose')(h.event(),{id:'screen:1',audio:true});assert.equal((await second).audio,'loopback');
});
test('cancellation fences in-flight enumeration and closes picker without selection',async()=>{
 const h=harness();const early=h.picker.choose(true);h.picker.cancel();assert.equal(await early,null);assert.equal(h.windows.length,0);
 const result=h.picker.choose(false);await new Promise(setImmediate);assert.equal(h.handlers.get('picker:list')(h.event()).audio,false);h.windows[0].emit('closed');assert.equal(await result,null);
 assert.throws(()=>h.handlers.get('picker:list')(h.event()));
});
