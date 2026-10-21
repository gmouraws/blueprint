// Opt-in real Windows test. Quiet generated tones; PCM stays in memory.
import { spawn, fork } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createProcessAudio } from '../process-audio.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const fixture=path.join(here,'dist/audio-fixture.exe');
const children=[];
async function tone(hz,count=1,tree=false){const child=spawn(fixture,[String(hz),String(count),...(tree?['child']:[])],{windowsHide:true});children.push(child);const [data]=await once(child.stdout,'data');return {child,id:`window:${data.toString().trim()}:0`};}
const capture=createProcessAudio(path.join(here,'dist/process-audio.exe'));
function power(samples,hz){let re=0,im=0;for(let i=0;i<samples.length;i++){const phase=2*Math.PI*hz*i/48000;re+=samples[i]*Math.cos(phase);im+=samples[i]*Math.sin(phase);}return Math.hypot(re,im)/samples.length;}
try {
  assert.equal(capture.supported,true);
  if(!process.argv.includes('--worker')){
    const a=await tone(440,18,true),b=await tone(880);
    const worker=fork(fileURLToPath(import.meta.url),['--worker',a.id,b.id],{stdio:['ignore','inherit','inherit','ipc']});
    worker.on('message',message=>{if(message==='exit-target'){b.child.kill();worker.send('target-exited');}});
    const [code]=await once(worker,'exit');assert.equal(code,0);
  } else {
  const a={id:process.argv[3]},b={id:process.argv[4]};
  await new Promise(resolve=>setTimeout(resolve,1500));
  await capture.start(a.id);const grant=capture.claim();assert.ok(grant);
  const samples=[];while(samples.length<96000){const p=await capture.pull(grant.id);assert.ok(p);const pcm=new Float32Array(p.data.buffer,p.data.byteOffset,p.data.byteLength/4);for(let i=0;i<pcm.length;i+=2)samples.push(pcm[i]);}
  const selected=power(samples,440),child=power(samples,660),excluded=power(samples,880);
  assert.ok(selected>0.002,`Selected signal absent: ${selected}`);
  assert.ok(child>0.002,`Child-process signal absent: ${child}`);
  assert.ok(excluded<Math.min(selected,child)*0.02,`Unrelated signal leaked: ${excluded}`);
  console.log(JSON.stringify({realWindowsProcessLoopback:true,selected440:selected,child660:child,unrelated880:excluded,unrelatedRejectionDb:20*Math.log10(Math.min(selected,child)/Math.max(excluded,1e-10))}));
  capture.stop();assert.equal(await capture.pull(grant.id),null);
  await capture.start(b.id);const second=capture.claim();assert.ok(await capture.pull(second.id));
  process.send('exit-target');await once(process,'message');await new Promise(resolve=>setTimeout(resolve,500));
  assert.equal(await capture.pull(second.id),null);console.log('Repeated capture, explicit stop and target-exit cleanup passed.');
  }
} finally {capture.stop();for(const child of children)child.kill();if(process.connected)process.disconnect();}
