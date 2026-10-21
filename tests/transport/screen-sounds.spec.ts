import {test,expect} from '@playwright/test';
import {prepare,join,service,closeChatStores} from './fixtures';
test.afterAll(closeChatStores);
test('screen-start tones use joined-room publications, survive navigation and respect deafen',async({browser})=>{
  test.setTimeout(90000);
  const room=`screen-tones-${Date.now()}`;await service.createRoom({name:room,maxParticipants:8});
  const a=await browser.newContext(),b=await browser.newContext();const alice=await a.newPage(),bob=await b.newPage();
  const tones=()=>alice.evaluate(()=>(window as unknown as {mediaProbe:{screenTones:number}}).mediaProbe.screenTones);
  const confirmations=()=>alice.evaluate(()=>(window as unknown as {mediaProbe:{confirmationTones:number}}).mediaProbe.confirmationTones);
  const start=()=>bob.getByRole('button',{name:'Compartilhar tela',exact:true}).click();
  const stop=async()=>{await bob.getByRole('button',{name:'Parar compartilhamento',exact:true}).click();await expect(alice.locator('video')).toHaveCount(0);};
  try{
    await prepare(bob,'Bruno',room);await join(bob);await start();
    await prepare(alice,'Alice',room);await join(alice);await expect(alice.locator('video')).toBeVisible();expect(await tones()).toBe(0);
    await stop();await alice.waitForTimeout(550);await start();await expect.poll(tones).toBe(1);
    await alice.getByRole('tab',{name:'Chat',exact:true}).click();await alice.getByRole('tab',{name:'Sala',exact:true}).click();expect(await tones()).toBe(1);
    await a.setOffline(true);await expect(alice.getByText('Reconectando…',{exact:true})).toBeVisible({timeout:20000});await a.setOffline(false);await expect(alice.getByText('Conectado',{exact:true})).toBeVisible({timeout:20000});expect(await tones()).toBe(1);
    await alice.getByRole('button',{name:'Silenciar todo o áudio',exact:true}).click();await expect.poll(confirmations).toBe(1);
    await stop();await alice.waitForTimeout(550);await start();await expect(alice.locator('video')).toBeVisible();expect(await tones()).toBe(1);
    await alice.getByRole('button',{name:'Restaurar áudio',exact:true}).click();await expect.poll(confirmations).toBe(2);
    await alice.getByRole('button',{name:'Configurações de áudio',exact:true}).click();await alice.getByLabel('Avisar quando alguém compartilhar tela').uncheck();await alice.keyboard.press('Escape');
    await stop();await alice.waitForTimeout(550);await start();await expect(alice.locator('video')).toBeVisible();expect(await tones()).toBe(1);
    await bob.getByRole('button',{name:'Ver Sala 2',exact:true}).dblclick();await expect(bob.locator('.connection')).toContainText('Sala 2');await start();
    await alice.getByRole('button',{name:'Configurações de áudio',exact:true}).click();await alice.getByLabel('Avisar quando alguém compartilhar tela').check();await alice.keyboard.press('Escape');
    await alice.getByRole('button',{name:'Ver Sala 2',exact:true}).click();await expect(alice.locator('video')).toBeVisible();expect(await tones()).toBe(1);
  }finally{await a.setOffline(false);await a.close();await b.close();for(const suffix of ['', '-screens','-second','-second-screens'])await service.deleteRoom(room+suffix).catch(()=>{});}
});
