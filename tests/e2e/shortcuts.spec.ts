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
  const microphone = page.getByLabel('Atalho: Microfone', { exact: true });
  const listening = page.getByLabel('Atalho: Áudio recebido', { exact: true });
  const all = page.getByLabel('Atalho: Silenciar tudo', { exact: true });
  await expect(microphone).toHaveValue('Não definido');
  await microphone.press('Control+Shift+M'); await expect(microphone).toHaveValue('Ctrl+Shift+M');
  await listening.press('Control+Shift+M'); await expect(page.getByText('Esse atalho já está atribuído a outro controle.')).toBeVisible();
  await listening.press('Control+Shift+T'); await expect(listening).toHaveValue('Não definido');
  await listening.press('Control+Shift+Y'); await all.press('Control+Shift+U');
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
  await enter(); await settings(); await expect(listening).toHaveValue('Ctrl+Shift+Y');
  await page.getByRole('button', { name: 'Limpar atalho: Microfone', exact: true }).click(); await expect(microphone).toHaveValue('Não definido');
  await page.getByRole('button', { name: 'Redefinir atalhos', exact: true }).click(); await expect(listening).toHaveValue('Não definido'); await expect(all).toHaveValue('Não definido');
});
