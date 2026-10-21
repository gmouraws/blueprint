import { test, expect } from '@playwright/test';
import { captures, liveTracks, prepare, join, service, closeChatStores } from './fixtures';
test.afterAll(closeChatStores);

test('native processing updates the microphone without republishing, persists through device change and reconnect, and leaves screen audio untouched',async({page,context})=>{
  test.setTimeout(90000);
  const room='processing-'+Date.now();await service.createRoom({name:room,maxParticipants:8});
  try{
    await prepare(page,'Ana',room);
    await page.evaluate(()=>{(window as unknown as {mediaProbe:{bypassSpeechDSP:boolean}}).mediaProbe.bypassSpeechDSP=false;});
    await join(page);
    await page.getByRole('button',{name:'Configurações de áudio',exact:true}).click();
    const preference=page.getByLabel('Supressão de ruído',{exact:true});
    await expect(preference).toBeChecked();await preference.click();await expect(preference).not.toBeChecked();expect(await captures(page)).toBe(0);
    await expect(page.getByText('A preferência será aplicada ao ativar o microfone.')).toBeVisible();
    await page.keyboard.press('Escape');await page.getByRole('button',{name:'Ativar microfone',exact:true}).click();
    await page.getByRole('button',{name:'Compartilhar tela',exact:true}).click();
    await expect(page.getByRole('button',{name:'Parar compartilhamento',exact:true})).toBeEnabled();
    const settings=()=>page.evaluate(()=>{const probe=(window as unknown as {mediaProbe:{streams:MediaStream[];peers:RTCPeerConnection[]}}).mediaProbe;return {microphone:probe.streams[0].getAudioTracks()[0].getSettings().noiseSuppression,screen:probe.streams[1].getAudioTracks()[0].getSettings(),peers:probe.peers.length};});
    await expect.poll(async()=> (await settings()).microphone).toBe(false);
    const before=await settings();const count=await captures(page);
    await page.getByRole('button',{name:'Configurações de áudio',exact:true}).click();await preference.click();await expect(preference).toBeChecked();
    await expect(page.getByText('Supressão ativa, informada pelo navegador.')).toBeVisible();
    expect((await settings()).screen).toEqual(before.screen);expect((await settings()).peers).toBe(before.peers);expect(await captures(page)).toBeLessThanOrEqual(count+1);
    expect(await liveTracks(page)).toBe(3); // One mic plus screen video/audio, no leaked old capture.
    await page.keyboard.press('Escape');await page.getByRole('button',{name:'Desligar microfone',exact:true}).click();
    await page.getByRole('button',{name:'Configurações de áudio',exact:true}).click();
    await preference.click();await expect(preference).not.toBeChecked();await expect(page.getByText('Supressão inativa, informada pelo navegador.')).toBeVisible();
    await expect(page.getByRole('button',{name:'Ativar microfone',exact:true})).toBeEnabled();
    await page.getByLabel('Selecionar microfone',{exact:true}).selectOption({label:'Fake Audio Input 1'});
    await expect(preference).not.toBeChecked();await expect(page.getByText('Supressão inativa, informada pelo navegador.')).toBeVisible();
    const requested=await page.evaluate(()=>(window as unknown as {mediaProbe:{microphoneConstraints:MediaTrackConstraints[]}}).mediaProbe.microphoneConstraints.at(-1));
    expect(requested?.noiseSuppression).toBe(false);expect(requested?.echoCancellation).toBe(true);
    await page.keyboard.press('Escape');await context.setOffline(true);
    await expect(page.getByText('Reconectando…',{exact:true})).toBeVisible({timeout:20000});await context.setOffline(false);
    await expect(page.getByText('Conectado',{exact:true})).toBeVisible({timeout:20000});
    await page.getByRole('button',{name:'Configurações de áudio',exact:true}).click();await expect(preference).not.toBeChecked();
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('blueprint.audio-preferences')!).noiseSuppression)).toBe(false);
    await page.keyboard.press('Escape');await page.getByRole('button',{name:'Sair da sala',exact:true}).click();await expect.poll(()=>liveTracks(page)).toBe(0);
    await join(page);await page.getByRole('button',{name:'Configurações de áudio',exact:true}).click();await expect(preference).not.toBeChecked();
    expect(await liveTracks(page)).toBe(0);
    await page.keyboard.press('Escape');await page.getByRole('button',{name:'Ativar microfone',exact:true}).click();
    await page.evaluate(()=>{(window as unknown as {mediaProbe:{pendingCapture:boolean}}).mediaProbe.pendingCapture=true;});
    await page.getByRole('button',{name:'Configurações de áudio',exact:true}).click();await preference.click();await expect(preference).toBeDisabled();
    await page.keyboard.press('Escape');await page.getByRole('button',{name:'Sair da sala',exact:true}).click();
    await page.evaluate(()=>{const probe=(window as unknown as {mediaProbe:{pendingCapture:boolean;releaseCapture?:()=>void}}).mediaProbe;probe.pendingCapture=false;probe.releaseCapture?.();});
    await expect.poll(()=>liveTracks(page)).toBe(0);
  }finally{await context.setOffline(false);await service.deleteRoom(room);}
});
