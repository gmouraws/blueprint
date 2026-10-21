import { expect, type Page } from '@playwright/test';
export async function installAccount(page: Page, name='Ana') {
  await page.route('**/api/account',route=>route.fulfill({json:{id:'00000000-0000-4000-8000-000000000001',name,role:'member',avatar_id:null,preferences:{},preference_version:0}}));
  await page.route('**/api/account/code',route=>route.fulfill({json:{ok:true,message:'Se este e-mail tem acesso, você receberá um código.'}}));
  await page.route('**/api/account/verify',route=>route.fulfill({json:{ok:true}}));
  await page.route('**/api/account/avatar?*',route=>route.fulfill({status:404,body:''}));
}
export async function authenticate(page:Page,name='Ana') {
  await page.getByLabel('E-mail',{exact:true}).fill('member@example.test');
  await page.getByRole('button',{name:'Receber código',exact:true}).click();
  await page.getByLabel('Seu nome',{exact:true}).fill(name);
  await page.getByLabel('Código do e-mail',{exact:true}).fill('123456');
  await page.getByRole('button',{name:'Confirmar código',exact:true}).click();
  await expect(page.getByRole('button',{name:'Abrir chat',exact:true})).toBeEnabled();
}
