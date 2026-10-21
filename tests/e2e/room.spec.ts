import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('viewing authorization fails safely without joining voice; disclosure and keyboard selection remain separate', async ({ page, request, baseURL }) => {
  const denied = await request.post('/api/view', { headers: { origin: baseURL! }, data: { room: 'second' } });
  expect(denied.status()).toBe(401);
  let voiceRequests = 0; const viewed: string[] = [];
  await page.route('**/api/login', route => route.fulfill({ json: { nickname: 'Ana' } }));
  await page.route('**/api/token', route => { voiceRequests++; return route.abort(); });
  await page.route('**/api/voice', route => route.fulfill({ json: { rooms: { main: [], second: [] } } }));
  await page.route('**/api/chat**', route => route.fulfill({ json: { messages: [], hasMore: false, serverTime: new Date().toISOString() } }));
  await page.route('**/api/view', route => { viewed.push(route.request().postDataJSON().room); return route.fulfill({ status: 503, json: { error: 'Visualização indisponível. Tente novamente.' } }); });
  await page.goto('/'); await page.getByLabel('Seu apelido').fill('Ana'); await page.getByLabel('Senha da sala').fill('fixture-password');
  await page.getByRole('button', { name: 'Abrir chat' }).click();
  await page.getByRole('button', { name: 'Expandir participantes de Sala 2' }).click();
  expect(viewed).toEqual([]);
  await page.getByRole('button', { name: 'Ver Sala 2', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.locator('main').getByRole('alert')).toContainText('Visualização indisponível');
  await expect(page.getByRole('button', { name: 'Entrar na sala: Sala 2' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Ativar microfone', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Tentar visualização novamente' }).click();
  await expect.poll(() => viewed.length).toBe(2); expect(viewed).toEqual(['second', 'second']); expect(voiceRequests).toBe(0);
});

test('entry is Portuguese, accessible, private and responsive', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await expect(page.getByText('Até 8 pessoas · Voz, chat e compartilhamento de tela', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Entrar na sala', level: 1 })).toBeVisible();
  await expect(page.getByText(/Boa companhia|Uma tela em comum|Entre, a sala é nossa|Feito para estar junto/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Entrar na sala' })).toBeEnabled();
  for (const width of [1440, 1024, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    if ([1440, 768, 375].includes(width)) await page.screenshot({ path: `test-results/room-entry-${width}.png`, fullPage: true });
  }
  const response = await request.get('/');
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(response.headers()['x-robots-tag']).toContain('noindex');
  expect(response.headers()['permissions-policy']).toContain('microphone=(self)');
  expect(await (await request.get('/robots.txt')).text()).toContain('Disallow: /');
  for (const old of ['/sitemap.xml', '/about', '/builds', '/pt']) expect((await request.get(old)).status()).toBe(404);
  await expect(page.locator('script[src*="analytics"]')).toHaveCount(0);
});

test('runtime configuration diagnoses missing and invalid fields without leaking values', async ({ page, request }) => {
  // The same optimized build is served with different runtime environments.
  const origin = `http://localhost:${Number(process.env.PLAYWRIGHT_PORT ?? '3001') + 2}`;
  await page.goto(origin);
  await expect(page.getByText('Configuração necessária', { exact: true })).toBeVisible();
  for (const label of ['Seu apelido', 'Senha da sala']) await expect(page.getByLabel(label)).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Entrar na sala' })).toBeDisabled();
  await page.getByText('Ver diagnóstico da configuração', { exact: true }).click();
  const issues = page.locator('.configuration-notice li');
  await expect(issues).toHaveCount(3);
  await expect(issues.filter({ hasText: 'LIVEKIT_API_SECRET' })).toContainText('ausente');
  await expect(issues.filter({ hasText: 'UPSTASH_REDIS_REST_TOKEN' })).toContainText('valor de exemplo');
  await expect(issues.filter({ hasText: 'APP_ORIGIN' })).toContainText('formato inválido');
  const response = await request.get(origin);
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toContain('no-store');
  const html = await response.text();
  for (const value of ['invalid-origin-canary', 'replace-with-redis-canary', 'test-only-password-not-a-secret', 'test-only-session-signing-key-for-browser-tests', 'test-api-key', 'wss://fixture.livekit.cloud', 'https://fixture.upstash.io']) expect(html).not.toContain(value);
  for (const width of [1440, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    if (width !== 320) await page.screenshot({ path: `test-results/room-configuration-${width}.png`, fullPage: true });
  }
});

test('authentication errors clear password and show useful feedback without a fake call', async ({ page }) => {
  await page.route('**/api/login', route => route.fulfill({ status: 401, json: { error: 'Senha incorreta.' } }));
  await page.goto('/');
  await page.getByLabel('Seu apelido').fill('João');
  await page.getByLabel('Senha da sala').fill('incorrect-test-password');
  await page.getByRole('button', { name: 'Entrar na sala' }).click();
  await expect(page.locator('main').getByRole('alert')).toHaveText('Senha incorreta.');
  await expect(page.getByLabel('Senha da sala')).toHaveValue('');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('incorrect-test-password');
  await expect(page.getByRole('button', { name: 'Compartilhar tela' })).toHaveCount(0);
});

test('room full response is visible and nickname persists without password', async ({ page }) => {
  await page.route('**/api/login', route => route.fulfill({ json: { nickname: 'Ana' } }));
  await page.route('**/api/token', route => route.fulfill({ status: 409, json: { error: 'A sala está cheia: 8 pessoas já estão conectadas.' } }));
  await page.goto('/');
  await page.getByLabel('Seu apelido').fill('Ana');
  await page.getByLabel('Senha da sala').fill('test-only-password');
  await page.getByRole('button', { name: 'Entrar na sala' }).click();
  await expect(page.locator('main').getByRole('alert')).toHaveText('A sala está cheia: 8 pessoas já estão conectadas.');
  await page.reload();
  await expect(page.getByLabel('Seu apelido')).toHaveValue('Ana');
  await expect(page.getByLabel('Senha da sala')).toHaveValue('');
});

test('network failure uses Portuguese feedback and clears the password', async ({ page }) => {
  await page.route('**/api/login', route => route.abort('internetdisconnected'));
  await page.goto('/');
  await page.getByLabel('Seu apelido').fill('Ana');
  await page.getByLabel('Senha da sala').fill('test-only-password');
  await page.getByRole('button', { name: 'Entrar na sala' }).click();
  await expect(page.locator('main').getByRole('alert')).toHaveText('Não foi possível acessar a sala. Confira sua conexão e tente novamente.');
  await expect(page.getByLabel('Senha da sala')).toHaveValue('');
});

test('actual room layout handles failed connection and exposes accessible controls', async ({ page }) => {
  // UI-only network fixtures. These do not simulate a successful media connection.
  await page.route('**/api/login', route => route.fulfill({ json: { nickname: 'Ana' } }));
  await page.route('**/api/token', route => route.fulfill({ json: { nickname: 'Ana', identity: 'fixture', serverUrl: 'ws://127.0.0.1:9', token: 'unusable-fixture-token' } }));
  let logoutCalls = 0;
  await page.route('**/api/logout', route => { logoutCalls++; return route.fulfill({ json: { ok: true } }); });
  await page.goto('/');
  await page.getByLabel('Seu apelido').fill('Ana');
  await page.getByLabel('Senha da sala').fill('test-only-password');
  await page.getByRole('button', { name: 'Entrar na sala' }).click();
  await expect(page.getByRole('heading', { name: 'Sala principal' })).toBeVisible();
  await expect(page.getByTitle('Até 8 participantes nas duas salas juntas')).toContainText('Voz');
  await expect(page.getByLabel('Contagem indisponível', { exact: true })).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Ativar microfone' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Compartilhar tela' })).toBeDisabled();
  await page.getByRole('button', { name: 'Silenciar todo o áudio' }).click();
  await expect(page.getByRole('button', { name: 'Restaurar áudio' })).toHaveAttribute('aria-pressed', 'true');
  for (const width of [1440, 1024, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    if ([1440, 768, 375].includes(width)) await page.screenshot({ path: `test-results/room-disconnected-${width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Sair da sala' }).click();
  await expect(page.getByRole('heading', { name: 'Entrar na sala', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar na sala', exact: true })).toBeVisible();
  await expect(page.getByLabel('Senha da sala')).toHaveCount(0);
  expect(logoutCalls).toBe(0);
  await page.getByRole('button', { name: 'Esquecer acesso neste dispositivo' }).click();
  await expect(page.getByLabel('Senha da sala')).toBeVisible();
  expect(logoutCalls).toBe(1);
});

test('real HTTP endpoint rejects unauthorized and cross-origin token requests', async ({ request }) => {
  const origin = `http://localhost:${process.env.PLAYWRIGHT_PORT ?? '3001'}`;
  expect((await request.post('/api/token', { data: {}, headers: { origin } })).status()).toBe(401);
  expect((await request.post('/api/token', { data: {}, headers: { origin: 'https://attacker.test' } })).status()).toBe(403);
});
