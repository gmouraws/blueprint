import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installAccount, authenticate } from '../browser-account';

test('OTP entry stays explicit, preserves remembered choice and never captures or stores credentials',async({page})=>{
  await installAccount(page);let voice=0;let captures=0;
  await page.exposeFunction('unexpectedCapture',()=>{captures++;});
  await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{await (window as unknown as {unexpectedCapture:()=>Promise<void>}).unexpectedCapture();throw new Error('Unexpected capture');};});
  await page.route('**/api/token',route=>{voice++;return route.abort();});
  await page.goto('/admin');await page.getByLabel('E-mail',{exact:true}).fill('member@example.test');
  await expect(page.getByLabel('E-mail',{exact:true})).toHaveAttribute('autocomplete','username');
  await page.getByRole('button',{name:'Receber código'}).click();
  await expect(page.getByLabel('Manter conectado neste dispositivo')).not.toBeChecked();
  await expect(page.getByLabel('Código do e-mail')).toHaveAttribute('autocomplete','one-time-code');
  await page.getByLabel('Seu nome').fill('Ana');await page.getByLabel('Código do e-mail').fill('123456');
  await page.getByRole('button',{name:'Confirmar código'}).click();
  await expect(page.getByRole('button',{name:'Meu perfil'})).toBeEnabled();expect(voice).toBe(0);expect(captures).toBe(0);
  expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('123456');
  await page.route('**/api/logout',route=>route.fulfill({json:{ok:true}}));
  await page.getByRole('button',{name:'Esquecer acesso neste dispositivo'}).click();
  await expect(page.getByLabel('E-mail',{exact:true})).toBeVisible();
});
test('profile is compact, keyboard accessible and rejects conflicting account updates visibly',async({page})=>{
  await installAccount(page);await page.goto('/admin');await authenticate(page);
  await page.getByRole('button',{name:'Meu perfil'}).click();
  await expect(page.getByRole('heading',{name:'Meu perfil'})).toBeVisible();

  await page.route('**/api/account',route=>route.request().method()==='POST'?route.fulfill({status:409,json:{error:'As preferências mudaram em outro dispositivo. Reabra o perfil antes de salvar.'}}):route.fulfill({json:{id:'00000000-0000-4000-8000-000000000001',name:'Ana',role:'member',preferences:{},preference_version:0}}));
  await page.getByRole('button',{name:'Salvar nome'}).click();await expect(page.getByText(/As preferências mudaram/)).toBeVisible();
  for(const width of [1440,375]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);await page.screenshot({path:`test-results/account-profile-${width}.png`,fullPage:true});}
});
test('unknown/expired codes and email-network failures do not create a call',async({page})=>{
  await installAccount(page);await page.route('**/api/account/verify',route=>route.fulfill({status:401,json:{error:'Código inválido ou expirado. Solicite outro código.'}}));
  await page.goto('/admin');await page.getByLabel('E-mail',{exact:true}).fill('unknown@example.test');await page.getByRole('button',{name:'Receber código'}).click();
  await page.getByLabel('Seu nome').fill('Ana');await page.getByLabel('Código do e-mail').fill('123456');await page.getByRole('button',{name:'Confirmar código'}).click();
  await expect(page.getByText('Código inválido ou expirado. Solicite outro código.')).toBeVisible();await expect(page.getByRole('button',{name:'Meu perfil'})).toHaveCount(0);
});
