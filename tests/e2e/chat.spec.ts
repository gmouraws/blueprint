import { installAccount, authenticate } from '../browser-account';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { createChatFixture } from '../chat-fixture';

test('chat without voice persists, retries once, paginates, catches up and keeps drafts across views', async ({ browser }) => {
  const store = await createChatFixture(); const first = await browser.newContext(); const late = await browser.newContext();
  const page = await first.newPage(); const other = await late.newPage();
  let tokens = 0;
  try {
    for (const [tab, name] of [[page, 'Ana'], [other, 'Bruno']] as const) {
      await store.install(tab, name);
      await installAccount(tab, name );
      await tab.route('**/api/token', route => { tokens++; return route.abort(); });
      await tab.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new Error('Chat must not capture'); }; });
    }
    async function openChat(tab = page, name = 'Ana') {
      await tab.goto('/'); await authenticate(tab, name);
      await tab.getByRole('button', { name: 'Abrir chat' }).click();
      await expect(tab.getByRole('tab', { name: 'Chat', exact: true })).toHaveAttribute('aria-selected', 'true');
      await expect(tab.getByText('Carregando histórico…')).toHaveCount(0);
    }
    await openChat();
    const field = page.getByLabel('Mensagem', { exact: true });
    const oneLine = await field.evaluate(element => element.clientHeight);
    expect(oneLine).toBeLessThanOrEqual(44);
    await field.fill(Array(20).fill('A multiline draft').join('\n'));
    expect(await field.evaluate(element => element.clientHeight)).toBeGreaterThan(oneLine);
    expect(await field.evaluate(element => element.clientHeight)).toBeLessThanOrEqual(128);
    await field.fill('');
    expect(await field.evaluate(element => element.clientHeight)).toBe(oneLine);
    await expect(page.locator('.image-composer')).toHaveCount(0);
    await page.getByRole('button', { name: 'Informações do chat' }).click();
    await expect(page.getByText(/Mensagens visíveis a todos/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Informações do chat' })).toBeFocused();
    await field.fill('Primeira mensagem'); store.faults.loseNextResponse = true;
    await field.press('Enter'); await expect(page.locator('.chat-form .error')).toContainText('Seu texto foi mantido');
    await expect(field).toHaveValue('Primeira mensagem');
    await field.press('Enter'); await expect(page.getByText('Salva no histórico', { exact: true })).toBeVisible();
    expect((await store.db.query('SELECT count(*) AS total FROM blueprint_chat_messages')).rows[0]).toEqual({ total: 1 });
    await openChat(other, 'Bruno'); await expect(other.getByText('Primeira mensagem', { exact: true })).toBeVisible();
    await openChat(); await expect(page.getByText('Primeira mensagem', { exact: true })).toBeVisible();
    await field.fill('Rascunho'); await page.getByRole('tab', { name: 'Sala', exact: true }).click();
    await page.getByRole('tab', { name: 'Sala', exact: true }).press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Chat', exact: true })).toBeFocused(); await expect(field).toHaveValue('Rascunho');
    const sender = randomUUID();
    for (let i = 0; i < 65; i++) await store.db.query("SELECT * FROM blueprint_chat_put('preview',$1,'Fixture',$2,$3)", [sender, `Histórico ${i}`, randomUUID()]);
    await openChat(); await expect(page.locator('.message')).toHaveCount(50);
    await page.getByRole('button', { name: 'Carregar anteriores' }).click(); await expect(page.locator('.message')).toHaveCount(66);
    await page.locator('.messages').evaluate(element => { element.scrollTop = 0; });
    await other.getByLabel('Mensagem', { exact: true }).fill('Sem precisar de voz'); await other.getByLabel('Mensagem', { exact: true }).press('Enter');
    await expect(page.getByText('Sem precisar de voz', { exact: true })).toBeAttached({ timeout: 15000 });
    expect(await page.locator('.messages').evaluate(element => element.scrollTop)).toBe(0);
    await page.getByRole('tab', { name: 'Sala', exact: true }).click();
    await page.getByRole('tab', { name: 'Chat', exact: true }).click();
    for (const width of [1440, 768, 375, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width <= 375) expect(await page.locator('.chat-view').evaluate(element => element.getBoundingClientRect().height)).toBeLessThanOrEqual(800);
      expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
      if (width !== 320) await page.screenshot({ path: `test-results/persistent-chat-${width}.png`, fullPage: true });
    }
    expect(tokens).toBe(0);
  } finally { await first.close(); await late.close(); await store.close(); }
});

test('real chat HTTP endpoints reject unauthorized reads, writes and cleanup', async ({ request }) => {
  expect((await request.get('/api/chat')).status()).toBe(401);
  expect((await request.post('/api/chat', { data: { body: 'Denied', requestId: randomUUID() }, headers: { origin: 'http://localhost:3001' } })).status()).toBe(401);
  expect((await request.get('/api/chat/cleanup')).status()).toBe(401);
});
