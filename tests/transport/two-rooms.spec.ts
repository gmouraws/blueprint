import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { prepare, join, service, liveTracks, energy, captures, closeChatStores } from './fixtures';
test.afterAll(closeChatStores);

test('room disclosure is view-only; switching isolates media, preserves shared chat and emits one local tone', async ({browser}, testInfo) => {
  const room='two-rooms-'+Date.now(); await service.createRoom({name:room,maxParticipants:8});
  const contexts=await Promise.all([browser.newContext(),browser.newContext()]);
  const [alice,bob]=await Promise.all(contexts.map(c=>c.newPage()));
  const tones=()=>alice.evaluate(()=>(window as unknown as {mediaProbe:{tones:number}}).mediaProbe.tones);
  try {
    await prepare(alice,'Alice',room); await join(alice);
    await prepare(bob,'Bruno',room); await join(bob);
    await expect.poll(tones).toBe(2);
    const before=await alice.evaluate(()=>(window as unknown as {mediaProbe:{peers:unknown[]}}).mediaProbe.peers.length);
    const second=alice.getByRole('region',{name:'Sala 2',exact:true});
    await second.getByRole('button',{name:/Sala 2/}).click();
    await second.getByRole('button',{name:'Ver sala',exact:true}).click();
    expect((await service.listParticipants(room)).length).toBe(2);
    expect(await tones()).toBe(2);
    expect(await alice.evaluate(()=>(window as unknown as {mediaProbe:{peers:unknown[]}}).mediaProbe.peers.length)).toBe(before);
    await alice.getByRole('button',{name:'Ativar microfone',exact:true}).click();
    await expect.poll(()=>energy(bob)).toBeGreaterThan(0);
    await alice.getByRole('tab',{name:'Chat',exact:true}).click();
    await alice.getByLabel('Mensagem',{exact:true}).fill('Draft survives switching');
    await second.getByRole('button',{name:'Entrar em Sala 2',exact:true}).click();
    await expect(alice.getByText('Conectado',{exact:true})).toBeVisible();
    await expect.poll(()=>service.listParticipants(room)).toHaveLength(1);
    await expect.poll(()=>service.listParticipants(room+'-second')).toHaveLength(1);
    await expect.poll(()=>liveTracks(alice)).toBe(0);
    await expect(alice.getByRole('button',{name:'Ativar microfone',exact:true})).toBeVisible();
    await expect(bob.locator('audio[data-audio-owner="Alice"]')).toHaveCount(0);
    await expect.poll(tones).toBe(3);
    await expect(alice.getByLabel('Mensagem',{exact:true})).toHaveValue('Draft survives switching');
    await alice.getByLabel('Mensagem',{exact:true}).press('Enter');
    await bob.getByRole('tab',{name:'Chat',exact:true}).click();
    await expect(bob.getByText('Draft survives switching',{exact:true})).toBeVisible({timeout:15000});
    await bob.getByRole('button',{name:'Ativar microfone',exact:true}).click();
    await expect(alice.locator('audio')).toHaveCount(0);
    expect(await tones()).toBe(3);
    for(const width of [1440,768,375]) {
      await alice.setViewportSize({width,height:1000});
      expect(await alice.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await alice.screenshot({path:`test-results/two-rooms-${width}.png`,fullPage:true});
    }
    await alice.getByRole('button',{name:'Sair da sala',exact:true}).click();
    await expect(alice.getByRole('button',{name:'Entrar na sala',exact:true})).toBeVisible();
    expect(await tones()).toBe(4);
    await testInfo.attach('sound-events',{body:JSON.stringify({localJoin:1,remoteJoin:1,localSwitch:1,localLeave:1}),contentType:'application/json'});
  } finally { await Promise.all(contexts.map(c=>c.close())); for(const name of [room,room+'-second']) await service.deleteRoom(name).catch(()=>{}); }
});

test('mini-player retains one video/audio path, hides without disconnect and clears on room switch',async({browser},testInfo)=>{
 const room='mini-'+Date.now(); await service.createRoom({name:room,maxParticipants:8});
 const contexts=await Promise.all([browser.newContext(),browser.newContext()]); const [host,viewer]=await Promise.all(contexts.map(c=>c.newPage()));
 try {
  await prepare(host,'Alice',room);await join(host);await prepare(viewer,'Bruno',room);await join(viewer);
  await host.evaluate(()=>Object.assign((window as unknown as {mediaProbe:object}).mediaProbe,{screenWidth:1280,screenHeight:720}));
  await viewer.setViewportSize({width:1440,height:900});
  await host.getByRole('button',{name:'Compartilhar tela',exact:true}).click();
  await expect(viewer.locator('video')).toHaveCount(1);await expect.poll(()=>energy(viewer)).toBeGreaterThan(0);
  await expect.poll(()=>viewer.locator('video').evaluate(video=>(video as HTMLVideoElement).videoWidth),{timeout:15000}).toBe(1280);
  const peers=await viewer.evaluate(()=>(window as unknown as {mediaProbe:{peers:unknown[]}}).mediaProbe.peers.length);
  await viewer.getByRole('tab',{name:'Chat',exact:true}).click();
  await expect(viewer.locator('.stream-mini video')).toBeVisible();await expect(viewer.locator('video')).toHaveCount(1);
  await expect(viewer.locator('audio[data-audio-kind="screen_share_audio"]')).toHaveCount(1);
  for(const width of [1440,768,375]) { await viewer.setViewportSize({width,height:1000}); expect(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true); await viewer.screenshot({path:`test-results/mini-player-${width}.png`,fullPage:true}); }
  await viewer.getByRole('button',{name:'Ocultar mini-player sem desligar áudio'}).click();await expect(viewer.locator('video')).toHaveCount(0);
  await expect(viewer.locator('audio')).toHaveCount(1);expect(await captures(viewer)).toBe(0);
  await viewer.getByRole('button',{name:'Mostrar mini-player',exact:true}).click();
  await viewer.setViewportSize({width:1440,height:900});
  await viewer.getByRole('button',{name:'Expandir tela e voltar à sala'}).click();await expect(viewer.locator('.stage-column video')).toBeVisible();
  await expect.poll(()=>viewer.locator('video').evaluate(video=>(video as HTMLVideoElement).videoWidth),{timeout:15000}).toBe(1280);
  expect(await viewer.evaluate(()=>(window as unknown as {mediaProbe:{peers:unknown[]}}).mediaProbe.peers.length)).toBe(peers);
  const measured=await viewer.evaluate(async()=>{ const probe=(window as unknown as {mediaProbe:{peers:RTCPeerConnection[]}}).mediaProbe; const values:object[]=[];for(const peer of probe.peers)(await peer.getStats()).forEach(s=>{if(s.type==='inbound-rtp'&&s.kind==='video')values.push({width:s.frameWidth,height:s.frameHeight,framesPerSecond:s.framesPerSecond,framesDecoded:s.framesDecoded});});return values;});
  expect(measured.length).toBeGreaterThan(0);await mkdir('.generated/review/two-rooms',{recursive:true});await writeFile('.generated/review/two-rooms/received-video.json',JSON.stringify(measured));await testInfo.attach('received-moving-canvas',{body:JSON.stringify(measured),contentType:'application/json'});
  const second=viewer.getByRole('region',{name:'Sala 2',exact:true});await second.getByRole('button',{name:/Sala 2/}).click();await second.getByRole('button',{name:'Entrar em Sala 2',exact:true}).click();
  await expect(viewer.getByText('Conectado',{exact:true})).toBeVisible();await expect(viewer.locator('video,audio')).toHaveCount(0);
 } finally {await Promise.all(contexts.map(c=>c.close()));for(const name of [room,room+'-second']) await service.deleteRoom(name).catch(()=>{});}
});
