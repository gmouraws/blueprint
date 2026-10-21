import { installAccount, authenticate } from '../browser-account';
import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { createChatFixture } from '../chat-fixture';
const sharp: typeof import('sharp').default = createRequire(import.meta.url)('sharp');

test('chat-only clients reconcile confirmed deletion, image-only removal, failed requests and lost acknowledgements', async ({ browser }) => {
  test.setTimeout(70000);
  const store=await createChatFixture();
  const contexts=await Promise.all([browser.newContext(),browser.newContext()]);
  const [owner,reader]=await Promise.all(contexts.map(context=>context.newPage()));
  try {
    for(const [page,name] of [[owner,'Ana'],[reader,'Bruno']] as const){
      await store.install(page,name);await installAccount(page, name);
      await page.goto('/');await authenticate(page, name);await page.getByRole('button',{name:'Abrir chat'}).click();
      await expect(page.getByText('Carregando histórico…')).toHaveCount(0);
    }
    const bytes=await sharp({create:{width:64,height:32,channels:3,background:'#a3e1c5'}}).png().toBuffer();
    await owner.getByLabel('Mensagem',{exact:true}).fill('Preservar o texto');
    await owner.getByLabel('Selecionar imagem',{exact:true}).setInputFiles({name:'disposable.png',mimeType:'image/png',buffer:bytes});
    await owner.getByRole('button',{name:'Enviar mensagem'}).click();
    await expect(reader.getByText('Preservar o texto',{exact:true})).toBeVisible({timeout:15000});
    await expect(reader.getByRole('button',{name:'Excluir mensagem',exact:true})).toHaveCount(0);
    const row=(await store.db.query<{id:string;attachment_id:string}>('SELECT id,attachment_id FROM blueprint_chat_messages')).rows[0];
    const touchContext=await browser.newContext({hasTouch:true,isMobile:true,viewport:{width:375,height:812}});contexts.push(touchContext);
    const touch=await touchContext.newPage();await store.install(touch,'Ana');await installAccount(touch, 'Ana');
    await touch.goto('/');await authenticate(touch, 'Ana');await touch.getByRole('button',{name:'Abrir chat',exact:true}).click();
    const touchTrash=touch.getByRole('button',{name:'Excluir imagem',exact:true});await expect(touchTrash).toHaveCSS('opacity','1');
    const size=await touchTrash.boundingBox();expect(size!.width).toBeGreaterThanOrEqual(44);expect(size!.height).toBeGreaterThanOrEqual(44);
    await mkdir('.generated/review/deletion',{recursive:true});await touch.screenshot({path:'.generated/review/deletion/trash-touch.png'});
    await touchTrash.tap();await touch.getByRole('dialog',{name:'Confirmar exclusão'}).getByRole('button',{name:'Cancelar'}).click();await touchContext.close();contexts.pop();

    const attempt=await reader.evaluate(async id=>(await fetch('/api/chat',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({id,target:'message'})})).status,String(row.id));
    expect(attempt).toBe(404);
    await expect(reader.getByRole('button',{name:'Excluir imagem',exact:true})).toHaveCount(0);
    const trash=owner.getByRole('button',{name:'Excluir imagem',exact:true});
    const messageTrash=owner.getByRole('button',{name:'Excluir mensagem',exact:true});
    for (const control of [trash,messageTrash]) {
      await expect(control).toHaveCount(1);
      await expect(control).toHaveText('');
      await expect(control).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
      await expect(control).toHaveCSS('border-top-width','0px');
    }
    const before=await owner.getByText('Preservar o texto',{exact:true}).boundingBox();
    await messageTrash.hover();
    await expect(messageTrash).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
    await messageTrash.focus();
    await expect(messageTrash).toHaveCSS('color','rgb(255, 155, 155)');
    expect(await owner.getByText('Preservar o texto',{exact:true}).boundingBox()).toEqual(before);
    await owner.getByLabel('Mensagem',{exact:true}).focus();
    await expect(trash).toHaveCSS('opacity','0');
    await trash.focus(); await expect(trash).toHaveCSS('opacity','1');
    await trash.press('Enter');
    const dialog=owner.getByRole('dialog',{name:'Confirmar exclusão'});
    await expect(dialog.getByRole('button',{name:'Cancelar'})).toBeFocused();
    await dialog.getByRole('button',{name:'Cancelar'}).click();await expect(owner.getByRole('button',{name:'Ampliar imagem da mensagem'})).toBeVisible();
    await reader.getByRole('button',{name:'Ampliar imagem da mensagem'}).click();
    await trash.focus();
    await owner.getByRole('button',{name:'Excluir imagem',exact:true}).click();
    await mkdir('.generated/review/deletion',{recursive:true});
    for(const width of [1440,375]){
      await owner.setViewportSize({width,height:900});
      expect((await new AxeBuilder({page:owner}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
      await owner.screenshot({path:`.generated/review/deletion/confirmation-${width}.png`,fullPage:true});
    }
    await dialog.getByRole('button',{name:'Excluir',exact:true}).click();
    await expect(owner.getByRole('button',{name:'Ampliar imagem da mensagem'})).toHaveCount(0);
    await expect(reader.getByRole('dialog',{name:'Imagem ampliada'})).toHaveCount(0,{timeout:15000});
    await expect(reader.getByText('Preservar o texto',{exact:true})).toBeVisible();
    expect(await reader.evaluate(async id=>(await fetch(`/api/attachments/${id}`)).status,row.attachment_id)).toBe(404);
    await owner.getByRole('button',{name:'Excluir mensagem',exact:true}).click();
    store.faults.failDeletion=true;await dialog.getByRole('button',{name:'Excluir',exact:true}).click();
    await expect(dialog.getByRole('alert')).toContainText('Não foi possível confirmar');
    await expect(reader.getByText('Preservar o texto',{exact:true})).toBeVisible();
    store.faults.failDeletion=false;store.faults.loseDeleteResponse=true;
    await dialog.getByRole('button',{name:'Excluir',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Não foi possível confirmar');
    // Retry the same server operation after an acknowledgement loss; no resurrection.
    expect(await owner.evaluate(async id=>(await fetch('/api/chat',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({id,target:'message'})})).status,String(row.id))).toBe(200);
    await expect(reader.getByText('Preservar o texto',{exact:true})).toHaveCount(0,{timeout:15000});
    await expect(owner.getByText('Preservar o texto',{exact:true})).toHaveCount(0,{timeout:15000});
    expect((await store.db.query('SELECT * FROM blueprint_chat_deletions')).rows).toHaveLength(2);
    await owner.getByLabel('Selecionar imagem',{exact:true}).setInputFiles({name:'image-only.png',mimeType:'image/png',buffer:bytes});
    await owner.getByRole('button',{name:'Enviar mensagem'}).click();
    await expect(owner.getByRole('button',{name:'Excluir imagem',exact:true})).toHaveCount(1);
    await expect(owner.getByRole('button',{name:'Excluir mensagem',exact:true})).toHaveCount(0);
  } finally {await Promise.all(contexts.map(context=>context.close()));await store.close();}
});
