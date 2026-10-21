// Explicit real-Windows integration test, separate from unit mocks. No cloud accounts.
import { _electron } from 'playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {AccessToken} from 'livekit-server-sdk';
import {randomUUID} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'.generated/native-test');mkdirSync(out,{recursive:true});
const guestMode=process.argv.includes('--guest');
const children=[];let electron;
const room='native-test-'+randomUUID();
const tokens=await Promise.all(['publisher','receiver'].map(async identity=>{const t=new AccessToken('blueprint-test','local-test-secret-not-a-production-credential',{identity});t.addGrant({roomJoin:true,room,canPublish:true,canSubscribe:true});return t.toJwt();}));
const livekit=spawn(path.join(root,'.generated/livekit/livekit-server.exe'),['--config',path.join(root,'.generated/livekit/local.yaml')],{windowsHide:true,stdio:'ignore'});children.push(livekit);
await new Promise(resolve=>setTimeout(resolve,800));
async function fixture(hz,count,tree=false){const child=spawn(path.join(root,'desktop/native/dist/audio-fixture.exe'),[String(hz),String(count),...(tree?['child']:[])],{windowsHide:true});children.push(child);const [data]=await once(child.stdout,'data');return `window:${data.toString().trim()}:0`;}
const server=createServer((req,res)=>{if(req.url==='/livekit.js'){res.setHeader('Content-Type','application/javascript');res.end(readFileSync(path.join(root,'node_modules/livekit-client/dist/livekit-client.umd.js')));return;}res.setHeader('Content-Type','text/html');res.end('<!doctype html><script src="/livekit.js"></script><button id="start">Capturar</button><script>start.onclick=async()=>{try{window.captured=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true});window.captureResult="ready";}catch(e){window.captureResult=e.name+": "+e.message;}}</script>');}).listen(0,'127.0.0.1');await once(server,'listening');
const origin=`http://127.0.0.1:${server.address().port}`;
writeFileSync(path.join(out,'main.mjs'),`
import {app,BrowserWindow,ipcMain,session} from 'electron';
import {createScreenPicker} from ${JSON.stringify(pathToFileURL(path.join(root,'desktop/screen-picker.mjs')).href)};
import {createProcessAudio} from ${JSON.stringify(pathToFileURL(path.join(root,'desktop/process-audio.mjs')).href)};
app.setPath('userData',${JSON.stringify(path.join(out,'profile'))});
app.whenReady().then(async()=>{const w=new BrowserWindow({show:true,webPreferences:{backgroundThrottling:false,preload:${JSON.stringify(path.join(root,'desktop/preload.cjs'))},sandbox:true,contextIsolation:true,nodeIntegration:false}});
const audio=createProcessAudio(${JSON.stringify(path.join(root,'desktop/native/dist/process-audio.exe'))});
const picker=createScreenPicker(w,{applicationAudio:audio.supported,startApplicationAudio:id=>audio.start(id),cancelAudio:()=>audio.stop()});
const allowed=e=>e.sender===w.webContents&&e.senderFrame===w.webContents.mainFrame&&e.senderFrame.url.startsWith(${JSON.stringify(origin+'/')});
ipcMain.handle('capture:claim',e=>allowed(e)?audio.claim():null);ipcMain.handle('capture:pull',(e,id)=>allowed(e)?audio.pull(id):null);ipcMain.handle('capture:stop',(e,id)=>{if(allowed(e))audio.release(id);});
session.defaultSession.setDisplayMediaRequestHandler(async(request,callback)=>{const selected=await picker.choose(request.audioRequested);if(selected){const {applicationAudio,...streams}=selected;callback(streams);}else callback({});});
app.on('before-quit',()=>{audio.stop();picker.cancel();});await w.loadURL(${JSON.stringify(origin)});});
`);
if(guestMode) writeFileSync(path.join(out,'main.mjs'),`
import {app,session,net} from 'electron';
import {createStreamWindow} from ${JSON.stringify(pathToFileURL(path.join(root,'desktop/stream-window.mjs')).href)};
app.setPath('userData',${JSON.stringify(path.join(out,'guest-profile'))});
app.whenReady().then(async()=>{
 const ses=session.fromPartition('blueprint-stream-production');
 globalThis.permissionDiagnostics=[];
 for(const method of ['setPermissionCheckHandler','setPermissionRequestHandler','setDisplayMediaRequestHandler']){const original=ses[method].bind(ses);ses[method]=handler=>original((...args)=>{globalThis.permissionDiagnostics.push({method,permission:typeof args[1]==='string'?args[1]:undefined,gesture:args[0]?.userGesture});return handler(...args);});}

 ses.protocol.handle('https',request=>net.fetch(${JSON.stringify(origin)}+new URL(request.url).pathname));
 const guest=createStreamWindow({profile:{name:'production',origin:'https://stream.blueprint.test'},here:${JSON.stringify(path.join(root,'desktop'))},helper:${JSON.stringify(path.join(root,'desktop/native/dist/process-audio.exe'))},version:'0.1.5'});
 app.on('before-quit',()=>guest.destroy());
 await guest.open({intent:'share',credential:'test-fixture-only'});
});
`);
try{
  const selected=await fixture(440,18,true);await fixture(880,1);
  electron=await _electron.launch({executablePath:path.join(root,'desktop/node_modules/electron/dist/electron.exe'),args:[path.join(out,'main.mjs')]});
  const page=await electron.firstWindow();
  if(guestMode){
    const safety=await page.evaluate(async()=>{
      const bridge=window.blueprintStreamDesktop;
      const ticket=await bridge.consumeInvite();const second=await bridge.consumeInvite();
      let microphone='unexpected';try{const media=await navigator.mediaDevices.getUserMedia({audio:true});media.getTracks().forEach(t=>t.stop());}catch(e){microphone=e.name;}
      const expires=Date.now()+120000;await bridge.configure({available:true,expires});setInterval(()=>bridge.configure({available:true,expires}),5000);
      return {bridge:bridge.version,oneUse:ticket==='test-fixture-only'&&second===null,microphone};
    });
    assert.equal(safety.oneUse,true);assert.equal(safety.microphone,'NotAllowedError');console.log(JSON.stringify({guestSafety:safety}));
  }
  const pendingPicker=electron.waitForEvent('window');
  await page.locator('#start').click();
  if(guestMode){await new Promise(r=>setTimeout(r,1000));console.log(JSON.stringify({capture:await page.evaluate(()=>window.captureResult),permissions:await electron.evaluate(()=>globalThis.permissionDiagnostics)}));}
  const picker=await pendingPicker;await picker.waitForLoadState();
  await picker.getByRole('tab',{name:'Janelas',exact:true}).click();
  const counts=await picker.evaluate(async()=>{const {sources}=await window.screenPicker.sources();return {apiWindows:sources.filter(s=>s.kind==='window').length,rendered:document.querySelectorAll('.source').length,fixtures:sources.filter(s=>s.name.startsWith('Blueprint capture fixture')).length};});
  assert.equal(counts.apiWindows,counts.rendered);assert.ok(counts.fixtures>=18);console.log(JSON.stringify({realEnumeration:counts}));
  await picker.getByRole('searchbox').fill('Blueprint capture fixture');
  await picker.locator('.source').last().click();assert.equal(await picker.locator('.source').last().getAttribute('aria-pressed'),'true');
  await picker.getByRole('button',{name:'Atualizar',exact:true}).click();
  await picker.waitForFunction(()=>!document.querySelector('#refresh').disabled);
  await picker.locator(`[data-source-id="${selected}"]`).click();
  await picker.locator('#audio').selectOption('application');
  await picker.screenshot({path:path.join(out,'picker-fixtures.png')});
  await picker.getByRole('button',{name:'Compartilhar',exact:true}).click();
  await page.waitForFunction(()=>window.captureResult,{timeout:15000});assert.equal(await page.evaluate(()=>window.captureResult),'ready');
  const result=await page.evaluate(async(tokens)=>{
    const stream=window.captured;const track=stream.getAudioTracks()[0];if(!track)throw Error('No application audio track');
    // Real WebRTC transport, no speakers: analyse the remote track in memory.
    const sdk=window.LivekitClient;
    const sender=new sdk.Room(),receiver=new sdk.Room();
    const remote=new Promise(resolve=>receiver.on(sdk.RoomEvent.TrackSubscribed,remoteTrack=>{if(remoteTrack.source===sdk.Track.Source.ScreenShareAudio)resolve(remoteTrack.mediaStreamTrack);}));
    await receiver.connect('ws://127.0.0.1:7880',tokens[1]);await sender.connect('ws://127.0.0.1:7880',tokens[0]);
    await sender.localParticipant.publishTrack(stream.getVideoTracks()[0],{source:sdk.Track.Source.ScreenShare});
    const publication=await sender.localParticipant.publishTrack(track,{source:sdk.Track.Source.ScreenShareAudio});
    const context=new AudioContext({sampleRate:48000});await context.resume();const analyser=context.createAnalyser();analyser.fftSize=32768;const silent=context.createGain();silent.gain.value=0;analyser.connect(silent).connect(context.destination);const received=await remote;const media=new MediaStream([received]);const element=new Audio();element.srcObject=media;element.volume=0;await element.play();const input=context.createMediaStreamSource(media);input.connect(analyser);
    // Simulate Blueprint's own received-call playback: this process must be excluded.
    const oscillator=context.createOscillator(),gain=context.createGain();oscillator.frequency.value=990;gain.gain.value=.01;oscillator.connect(gain).connect(context.destination);oscillator.start();
    await new Promise(r=>setTimeout(r,3000));const bins=new Float32Array(analyser.frequencyBinCount);analyser.getFloatFrequencyData(bins);
    const at=hz=>Math.max(...bins.slice(Math.round(hz/48000*32768)-2,Math.round(hz/48000*32768)+3));
    const stats=await publication.track.getRTCStatsReport();const outbound=[...stats.values()].filter(s=>s.type==='outbound-rtp').map(s=>({bytes:s.bytesSent,packets:s.packetsSent}));
    const evidence={contextState:context.state,connection:sender.state,source:publication.source,stats:outbound,selected440Db:at(440),child660Db:at(660),excluded880Db:at(880),self990Db:at(990),audioState:track.readyState,audioTracks:stream.getAudioTracks().length,videoTracks:stream.getVideoTracks().length};
    track.stop();await new Promise(r=>setTimeout(r,100));evidence.videoEnded=stream.getVideoTracks()[0].readyState==='ended';
    oscillator.stop();element.pause();element.srcObject=null;await context.close();await sender.disconnect();await receiver.disconnect();return evidence;
  },tokens);
  console.log(JSON.stringify({measurement:result}));
  assert.ok(result.selected440Db>-80);assert.ok(result.child660Db>-80);assert.ok(result.excluded880Db<result.selected440Db-30);assert.ok(result.self990Db<result.selected440Db-30);assert.equal(result.videoEnded,true);
  console.log(JSON.stringify({realElectronLiveKit:result}));
}finally{if(electron)await electron.close();for(const child of children)child.kill();server.close();}
