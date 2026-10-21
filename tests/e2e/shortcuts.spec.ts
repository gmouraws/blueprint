import { installAccount, authenticate } from '../browser-account';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

test('shortcuts are unset, validated, persistent and ignore typing, composition and repeats', async ({ page }) => {
  await installAccount(page, 'Ana' );
  await page.route('**/api/voice', route => route.fulfill({ json: { rooms: { main: [], second: [] } } }));
  await page.route('**/api/chat**', route => route.fulfill({ json: { messages: [], hasMore: false, serverTime: new Date().toISOString() } }));
  async function enter() {
    await page.goto('/'); await authenticate(page, 'Ana');
    await page.getByRole('button', { name: 'Abrir chat', exact: true }).click();
  }
  async function settings() { await page.getByRole('button', { name: 'Configurações de áudio', exact: true }).click(); await page.getByText('Atalhos de teclado', { exact: true }).click(); }
  await enter(); await settings();
  for (const size of [{width:1280,height:600},{width:768,height:512},{width:375,height:600}]) {
    await page.setViewportSize(size);
    await page.getByRole('button',{name:'Definir atalho: Microfone',exact:true}).click();
    await expect(page.locator('.shortcut-recording')).toHaveCount(1);
    await page.getByRole('button',{name:'Gravar combinação'}).press('Alt+F8');
    await page.getByRole('button',{name:'Remover atalho',exact:true}).scrollIntoViewIfNeeded();
    const bounds=await page.locator('.call-settings').boundingBox();
    const controls=await page.locator('.call-controls').boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(controls!.y);
    expect(await page.locator('.call-settings').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await mkdir('.generated/review/settings',{recursive:true});
    await page.screenshot({path:`.generated/review/settings/${size.width}.png`});
    await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  }
  await page.getByLabel('Avisar quando alguém compartilhar tela',{exact:true}).uncheck();
  await page.keyboard.press('Escape');
  await enter(); await settings();
  await expect(page.getByLabel('Avisar quando alguém compartilhar tela',{exact:true})).not.toBeChecked();
  async function record(label: string, keys: string, save = true) {
    await page.getByRole('button', { name: `Definir atalho: ${label}`, exact: true }).click();
    await page.getByRole('button', { name: 'Gravar combinação' }).press(keys);
    if (save) await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  }
  await expect(page.getByText('Sem atalho', { exact: true })).toHaveCount(3);
  await record('Microfone', 'Control+Shift+M');
  await record('Áudio recebido', 'Control+Shift+M', false);
  await expect(page.getByText('Esse atalho já está atribuído a outro controle.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Gravar combinação' }).press('Escape');
  await record('Áudio recebido', 'Control+Shift+Y');
  await record('Silenciar tudo', 'Alt+F8', false);
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByText('Alt+F8', { exact: true })).toHaveCount(0);
  await record('Silenciar tudo', 'Control+Shift+U');
  await mkdir('.generated/review/shortcuts', { recursive: true });
  for (const width of [1440, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `.generated/review/shortcuts/settings-${width}.png` });
  }
  await page.keyboard.press('Escape');
  const toggle = page.getByRole('button', { name: 'Silenciar todo o áudio', exact: true });
  await toggle.focus(); await page.keyboard.press('Control+Shift+Y');
  const restore = page.getByRole('button', { name: 'Restaurar áudio', exact: true });
  await expect(restore).toBeVisible(); await page.keyboard.press('Control+Shift+Y');
  await page.getByLabel('Mensagem', { exact: true }).focus(); await page.keyboard.press('Control+Shift+Y'); await expect(toggle).toBeVisible();
  await toggle.focus();
  for (const extra of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }]) {
    await toggle.dispatchEvent('keydown', { key: 'Y', ctrlKey: true, shiftKey: true, bubbles: true, ...extra }); await expect(toggle).toBeVisible();
  }
  await page.evaluate(() => { const field = document.createElement('div'); field.contentEditable = 'true'; field.id = 'editable-test'; document.body.append(field); field.focus(); });
  await page.keyboard.press('Control+Shift+Y'); await expect(toggle).toBeVisible();
  await page.locator('#editable-test').evaluate(element => element.remove());
  await toggle.focus(); await page.keyboard.press('Control+Shift+U');
  await expect(page.getByRole('button', { name: 'Restaurar estados anteriores' })).toBeVisible();
  await page.keyboard.press('Control+Shift+U'); await expect(toggle).toBeVisible();
  await enter(); await settings(); await expect(page.getByText('Ctrl+Shift+Y', { exact: true })).toBeVisible();
  await record('Microfone', 'Alt+F8');
  await enter(); await settings(); await expect(page.getByText('Alt+F8', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Definir atalho: Microfone', exact: true }).click();
  await page.getByRole('button', { name: 'Remover atalho', exact: true }).click();
  await page.getByRole('button', { name: 'Redefinir atalhos', exact: true }).click();
  await expect(page.getByText('Sem atalho', { exact: true })).toHaveCount(3);
});

test('failed account shortcut save keeps the candidate and does not claim success', async ({page}) => {
  await installAccount(page);
  await page.route('**/api/account',async route=>{
    if(route.request().method()==='POST') return route.fulfill({status:503,json:{error:'Não foi possível salvar os atalhos.'}});
    await route.fallback();
  });
  await page.route('**/api/voice',route=>route.fulfill({json:{rooms:{main:[],second:[]}}}));
  await page.route('**/api/chat**',route=>route.fulfill({json:{messages:[],hasMore:false,serverTime:new Date().toISOString()}}));
  await page.goto('/');await authenticate(page);
  await page.getByRole('button',{name:'Abrir chat',exact:true}).click();
  await page.getByRole('button',{name:'Configurações de áudio',exact:true}).click();
  await page.getByText('Atalhos de teclado',{exact:true}).click();
  await page.getByRole('button',{name:'Definir atalho: Microfone',exact:true}).click();
  await page.getByRole('button',{name:'Gravar combinação'}).press('Alt+F8');
  await page.getByRole('button',{name:'Salvar',exact:true}).click();
  await expect(page.getByText('Não foi possível salvar os atalhos.',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Gravar combinação'})).toHaveText('Alt+F8');
  await expect(page.getByText('Sem atalho',{exact:true})).toHaveCount(3);
  await expect(page.getByText('Atalho salvo na conta.',{exact:true})).toHaveCount(0);
});
