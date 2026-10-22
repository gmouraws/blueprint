import { test, expect } from '@playwright/test';
import { installAccount, authenticate } from '../browser-account';
test('session expiry closes viewing and preserves same-account draft without rejoining',async({page})=>{
  await page.clock.install();await installAccount(page);await page.route('**/api/chat?*',route=>route.fulfill({json:{messages:[],hasMore:false,cursor:'0',changes:[]}}));
  await page.goto('/');await authenticate(page);await page.getByRole('button',{name:'Abrir chat',exact:true}).click();
  await page.getByLabel('Mensagem',{exact:true}).fill('Rascunho privado');
  await page.route('**/api/account',route=>route.fulfill({status:401,json:{error:'Sessão expirada.'}}));
  await page.clock.fastForward(31000);
  const dialog=page.getByRole('dialog',{name:'Entrar novamente'});await expect(dialog).toBeVisible();
  await installAccount(page);await dialog.getByLabel('E-mail',{exact:true}).fill('member@example.test');await dialog.getByRole('button',{name:'Receber código'}).click();
  await dialog.getByLabel('Seu nome').fill('Ana');await dialog.getByLabel('Código do e-mail').fill('123456');await dialog.getByRole('button',{name:'Confirmar código'}).click();
  await expect(dialog).toHaveCount(0);await expect(page.getByLabel('Mensagem',{exact:true})).toHaveValue('Rascunho privado');
  await expect(page.getByText('Voz: Desconectado',{exact:true})).toBeVisible();
});
