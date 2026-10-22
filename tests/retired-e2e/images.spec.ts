import { installAccount, authenticate } from '../browser-account';
import {test,expect} from '@playwright/test';
import { createRequire } from 'node:module';
const sharp: typeof import('sharp').default = createRequire(import.meta.url)('sharp');
import {createChatFixture} from '../chat-fixture';

test('image paste/removal, attachment retry, safe links, viewer and reload use stable attachment/message IDs',async({page})=>{
 const store=await createChatFixture();
 const bytes=await sharp({create:{width:64,height:32,channels:3,background:'#a3e1c5'}}).png().toBuffer();
 try {
  await store.install(page,'Ana'); await installAccount(page, 'Ana');
  const open=async()=>{await page.goto('/');await authenticate(page, 'Ana');await page.getByRole('button',{name:'Abrir chat'}).click();await expect(page.getByText('Carregando histórico…')).toHaveCount(0);};
  await open();
  const field=page.getByLabel('Mensagem',{exact:true});
  await field.fill('https://example.test/docs <script>plain</script>');
  await field.evaluate((element,base64)=>{const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));const data=new DataTransfer();data.items.add(new File([bytes],'paste.png',{type:'image/png'}));element.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));},bytes.toString('base64'));
  await expect(page.getByAltText('Prévia da imagem a enviar')).toBeVisible();
  await expect(field).toHaveValue('https://example.test/docs <script>plain</script>');
  await page.getByRole('button',{name:'Remover imagem antes de enviar'}).click();
  await page.getByLabel('Selecionar imagem',{exact:true}).setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:bytes});
  store.faults.failImageCompletion=true;
  await page.getByRole('button',{name:'Enviar mensagem'}).click();await expect(page.locator('.chat-form .error')).toContainText('Validação indisponível');
  await expect(page.getByAltText('Prévia da imagem a enviar')).toBeVisible();
  store.faults.failImageCompletion=false;store.faults.loseNextResponse=true;
  await page.getByRole('button',{name:'Enviar mensagem'}).click();await expect(page.locator('.chat-form .error')).toContainText('Seu texto foi mantido');
  await page.getByRole('button',{name:'Enviar mensagem'}).click();await expect(page.getByText('Salva no histórico',{exact:true})).toBeVisible();
  expect((await store.db.query('SELECT count(*) AS total FROM blueprint_chat_attachments')).rows[0]).toEqual({total:1});
  expect((await store.db.query('SELECT count(*) AS total FROM blueprint_chat_messages')).rows[0]).toEqual({total:1});
  const link=page.getByRole('link',{name:'https://example.test/docs'});await expect(link).toHaveAttribute('rel','noopener noreferrer');await expect(link).toHaveAttribute('target','_blank');
  await page.getByRole('button',{name:'Ampliar imagem da mensagem'}).click();await expect(page.getByRole('dialog',{name:'Imagem ampliada'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();
  await open();await expect(page.getByRole('button',{name:'Ampliar imagem da mensagem'})).toBeVisible();
  await store.db.query("UPDATE blueprint_chat_messages SET created_at=now()-interval '30 days'");await open();await expect(page.getByRole('button',{name:'Ampliar imagem da mensagem'})).toHaveCount(0);
 } finally {await store.close();}
});
