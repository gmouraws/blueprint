import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function harness(supported=true){
 const children=[],timers=[];
 const context={Buffer,Uint8Array,BigInt,Date,Promise,Error,Number,process:{platform:'win32',pid:10},randomUUID:()=>`00000000-0000-4000-8000-${String(children.length).padStart(12,'0')}`,execFileSync:()=>supported?'supported':'unsupported',spawn:(_path,args)=>{const child=Object.assign(new EventEmitter(),{stdout:new EventEmitter(),stderr:new EventEmitter(),args,kill(){this.killed=true;this.emit('exit',0);}});children.push(child);return child;},setTimeout:fn=>{timers.push(fn);return fn;},clearTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{}};
 vm.runInNewContext(readFileSync(new URL('./process-audio.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export function','function')+'\nglobalThis.audio=createProcessAudio("helper.exe");',context);
 return {audio:context.audio,children,timers};
}
function packet(frames=480){const b=Buffer.alloc(12+frames*8);b.writeUInt32LE(frames);b.writeDoubleLE(1000,4);return b;}
test('native bridge requires supported window selection and a single claimed grant',async()=>{
 const unavailable=harness(false);await assert.rejects(unavailable.audio.start('window:12:0'));
 const h=harness();await assert.rejects(h.audio.start('screen:12:0'));await assert.rejects(h.audio.start('window:0:0'));assert.equal(h.children.length,0);
 const starting=h.audio.start('window:123:0');const child=h.children[0];assert.deepEqual([...child.args],['123','10']);child.stderr.emit('data',Buffer.from('ready\r\n'));await starting;
 const grant=h.audio.claim();assert.ok(grant);assert.equal(h.audio.claim(),null);assert.equal(await h.audio.pull('forged'),null);h.audio.release('forged');assert.ok(!child.killed);
 const pending=h.audio.pull(grant.id);child.stdout.emit('data',packet());assert.equal((await pending).frames,480);h.audio.release(grant.id);assert.ok(child.killed);assert.equal(await h.audio.pull(grant.id),null);
});
test('fragmented PCM and slow readers have a bounded 100ms queue; invalid frames fail closed',async()=>{
 const h=harness();const start=h.audio.start('window:1:0'),child=h.children[0];child.stderr.emit('data',Buffer.from('ready\n'));await start;const grant=h.audio.claim();
 const p=packet();child.stdout.emit('data',p.subarray(0,9));child.stdout.emit('data',p.subarray(9));for(let i=0;i<30;i++)child.stdout.emit('data',p);
 for(let i=0;i<10;i++)assert.equal((await h.audio.pull(grant.id)).frames,480);
 const pending=h.audio.pull(grant.id);const invalid=Buffer.alloc(12);invalid.writeUInt32LE(999999);child.stdout.emit('data',invalid);assert.equal(await pending,null);assert.ok(child.killed);
});
test('cancellation and old activation deadlines cannot kill a newer capture',async()=>{
 const h=harness();const old=h.audio.start('window:1:0');const rejected=assert.rejects(old);h.audio.stop();await rejected;
 const next=h.audio.start('window:2:0'),child=h.children[1];child.stderr.emit('data',Buffer.from('ready\n'));await next;
 h.timers[0]();h.timers[1]();assert.ok(!child.killed);h.audio.stop();
});
