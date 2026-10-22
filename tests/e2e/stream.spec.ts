import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('Windows tries handoff once before media; blocked opening keeps explicit browser/download choices',async({page,baseURL})=>{
 const origin='https://www.blueprint.app.br';const capability='p'.repeat(43);let handoffs=0,joins=0;
 await page.addInitScript(()=>Object.defineProperty(navigator,'platform',{value:'Win32'}));
 // Serve the local build under the approved origin. No production API or OS protocol is contacted.
 await page.route(origin+'/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/api/stream'){
   const body=route.request().postDataJSON();expect(page.url()).not.toContain(capability);
   if(body.action==='exchange')return route.fulfill({json:{role:'share'}});
   if(body.action==='handoff'){handoffs++;return route.fulfill({json:{credential:'invalid-test-ticket-prevents-os-launch'}});}
   if(body.action==='join'){joins++;return route.fulfill({status:409,json:{error:'Espaço cheio de teste.'}});}
   return route.fulfill({json:{role:'share',expires:Date.now()+60000,streams:[]}});
  }
  const response=await route.fetch({url:baseURL+url.pathname+url.search});await route.fulfill({response});
 });
 await page.goto(origin+'/stream?intent=share#invite='+capability);
 await expect(page.getByRole('status')).toContainText('abertura automática');expect(handoffs).toBe(1);expect(joins).toBe(0);
 await expect(page.getByRole('button',{name:'Abrir no aplicativo'})).toBeVisible();await expect(page.getByRole('link',{name:'Baixar para Windows',exact:true})).toHaveCount(0);await expect(page.getByText('Windows · Distribuição privada. Solicite o instalador ao responsável pelo espaço.')).toBeVisible();
 await page.waitForTimeout(1000);expect(handoffs).toBe(1);expect(joins).toBe(0);
 await page.getByRole('button',{name:'Continuar no navegador',exact:true}).click();await expect(page.getByRole('button',{name:'Selecionar tela'})).toBeEnabled();expect(joins).toBe(0);expect(handoffs).toBe(1);
});
test('guest invitation is stripped before exchange; no nickname, profile or microphone requests', async ({ page }) => {
  const capability = 'x'.repeat(43); let microphone = 0; let exchange = 0; let joins = 0;
  await page.exposeFunction('microphoneAttempt', () => { microphone++; });
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { await (window as unknown as { microphoneAttempt: () => Promise<void> }).microphoneAttempt(); throw Error('unexpected capture'); }; });
  await page.route('**/api/stream', async route => {
    expect(page.url()).not.toContain(capability);
    const body = route.request().postDataJSON();
    if (body.action === 'exchange') { exchange++; expect(body.credential).toBe(capability); return route.fulfill({ json: { role: 'watch', expires: Date.now() + 60000 } }); }
    if(body.action==='join') joins++; return route.fulfill({ json: {role:'watch',expires:Date.now()+60000,streams:[]} });
  });
  await page.goto(`/stream?intent=watch#invite=${capability}`);
  await expect(page.getByText('Nenhuma transmissão ativa.',{exact:true})).toBeVisible();
  expect(exchange).toBe(1); expect(joins).toBe(0); expect(microphone).toBe(0);
  await expect(page.locator('input')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /microfone|perfil|chat/i })).toHaveCount(0);
  expect(await page.evaluate(() => Object.values(localStorage).some(value => value.includes('x'.repeat(43))))).toBe(false);
  for (const width of [1440, 375]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze()).violations).toEqual([]); await page.screenshot({ path: `test-results/stream-${width}.png`, fullPage: true }); }
});
test('invalid guest access has no entry form; page denies microphone and member APIs reject guest cookie', async ({ page, request, baseURL }) => {
  await page.route('**/api/stream', route => route.fulfill({ status: 401, json: { error: 'Convite inválido, expirado ou revogado.' } }));
  await page.goto('/stream?intent=share#invite=invalid');
  await expect(page.getByRole('status')).toContainText('Convite inválido');
  await expect(page.getByRole('button', { name: 'Selecionar tela' })).toHaveCount(0);
  const response = await request.get('/stream');
  expect(response.headers()['permissions-policy']).toContain('microphone=()'); expect(response.headers()['referrer-policy']).toBe('no-referrer');
  const headers = { origin: baseURL!, cookie: `blueprint_stream=${'a'.repeat(43)}` };
  for (const path of ['/api/account', '/api/chat', '/api/voice', '/api/attachments/00000000-0000-4000-8000-000000000000']) expect((await request.get(path, { headers })).status()).toBe(401);
  for (const path of ['/api/token', '/api/view']) expect((await request.post(path, { headers, data: { room: 'main' } })).status()).toBe(401);
});


test('native invitation arrives through the isolated bridge, never asks for an account or capture', async ({ page }) => {
  await page.addInitScript(() => { window.blueprintStreamDesktop = { version: 1, consumeInvite: async () => 'n'.repeat(43), configure: async () => ({ ready: true }) }; });
  let exchanged = false;
  await page.route('**/api/stream', route => {
    const body = route.request().postDataJSON();
    expect(page.url()).not.toContain('n'.repeat(43));
    if (body.action === 'exchange') { expect(body.credential).toBe('n'.repeat(43)); exchanged = true; return route.fulfill({ json: {} }); }
    return route.fulfill({ status: 401, json: { error: 'Convite revogado.' } });
  });
  await page.goto('/stream?intent=share');
  await expect(page.getByRole('status')).toContainText('Convite revogado');expect(exchanged).toBe(true);
  await expect(page.locator('input')).toHaveCount(0);await expect(page.getByRole('button', { name: 'Selecionar tela' })).toHaveCount(0);
});
