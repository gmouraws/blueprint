import { test, expect, type BrowserContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createHmac } from 'node:crypto';
import { SignJWT } from 'jose';

// Matches only playwright.config.ts's isolated runtime fixture. No cloud credentials.
const origin = `http://localhost:${process.env.PLAYWRIGHT_PORT ?? '3001'}`;
const cookieName = 'blueprint-room-session';
const password = 'test-only-password-not-a-secret';
const signingSecret = 'test-only-session-signing-key-for-browser-tests';
async function fixtureSession(remember = true, options: { expired?: boolean; password?: string } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const lifetime = remember ? 2592000 : 43200;
  const issuedAt = options.expired ? now - lifetime - 1 : now;
  return new SignJWT({ nickname: 'Ana', remember }).setProtectedHeader({ alg: 'HS256' })
    .setSubject('00000000-0000-0000-0000-000000000000').setIssuer('blueprint-room').setAudience('test-room')
    .setIssuedAt(issuedAt).setExpirationTime(issuedAt + lifetime)
    .sign(createHmac('sha256', signingSecret).update(options.password ?? password).digest());
}
async function installCookie(context: BrowserContext, value: string) {
  await context.addCookies([{ name: cookieName, value, url: origin, httpOnly: true, sameSite: 'Strict', expires: Math.floor(Date.now() / 1000) + 2592000 }]);
}

for (const remember of [false, true]) {
  test(`login ${remember ? 'remembers access' : 'defaults to a browser session'} and returning entry stays explicit`, async ({ page, context }) => {
    let loginCalls = 0; let tokenCalls = 0;
    const token = await fixtureSession(remember);
    await page.addInitScript(() => {
      Object.assign(window, { captureAttempts: 0 });
      navigator.mediaDevices.getUserMedia = async () => { (window as unknown as { captureAttempts: number }).captureAttempts++; throw new Error('Unexpected capture'); };
    });
    await page.route('**/api/login', route => {
      loginCalls++;
      expect(route.request().postDataJSON()).toEqual({ nickname: 'Ana', password, remember });
      return route.fulfill({ json: { nickname: 'Ana' }, headers: { 'set-cookie': `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict${remember ? '; Max-Age=2592000' : ''}` } });
    });
    await page.route('**/api/token', route => { tokenCalls++; return route.fulfill({ status: 409, json: { error: 'A sala está cheia: 8 pessoas já estão conectadas.' } }); });
    await page.goto('/');
    await expect(page.getByLabel('Manter conectado neste dispositivo')).not.toBeChecked();
    await expect(page.locator('form')).toHaveAttribute('autocomplete', 'on');
    await expect(page.getByLabel('Seu apelido')).toHaveAttribute('autocomplete', 'username');
    await expect(page.getByLabel('Senha da sala')).toHaveAttribute('autocomplete', 'current-password');
    await page.getByLabel('Seu apelido').fill('Ana');
    await page.getByLabel('Senha da sala').fill(password);
    if (remember) await page.getByLabel('Manter conectado neste dispositivo').check();
    await page.getByRole('button', { name: 'Entrar na sala', exact: true }).click();
    await expect(page.locator('main').getByRole('alert')).toContainText('A sala está cheia');
    const cookie = (await context.cookies()).find(cookie => cookie.name === cookieName)!;
    expect(cookie.httpOnly).toBe(true); expect(cookie.sameSite).toBe('Strict');
    if (remember) expect(cookie.expires - Date.now() / 1000).toBeGreaterThan(2591900); else expect(cookie.expires).toBe(-1);
    await page.reload();
    await expect(page.getByLabel('Senha da sala')).toHaveCount(0);
    await expect(page.getByLabel('Seu apelido')).toHaveValue('Ana');
    await expect(page.getByLabel('Seu apelido')).toHaveAttribute('readonly', '');
    await expect(page.getByText('Acesso reconhecido neste dispositivo. Clique para entrar na sala.')).toBeVisible();
    expect(loginCalls).toBe(1); expect(tokenCalls).toBe(1);
    expect(await page.evaluate(() => (window as unknown as { captureAttempts: number }).captureAttempts)).toBe(0);
    expect(await page.evaluate(() => document.cookie)).not.toContain(cookieName);
    const storage = await page.evaluate(() => JSON.stringify({ local: localStorage, session: sessionStorage }));
    expect(storage).not.toContain(password); expect(storage).not.toContain(token);
    const html = await (await context.request.get('/')).text();
    expect(html).not.toContain(token); expect(html).not.toContain(signingSecret);
    expect(await page.evaluate(() => document.querySelectorAll('audio,video').length)).toBe(0);
    if (remember) for (const width of [1440, 375, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
      if (width !== 320) await page.screenshot({ path: `test-results/room-remembered-${width}.png`, fullPage: true });
    }
    await page.getByRole('button', { name: 'Entrar na sala', exact: true }).click();
    await expect(page.locator('main').getByRole('alert')).toContainText('A sala está cheia');
    expect(loginCalls).toBe(1); expect(tokenCalls).toBe(2);
    expect(await page.evaluate(() => (window as unknown as { captureAttempts: number }).captureAttempts)).toBe(0);
  });
}

test('expired, tampered and password-rotated cookies do not skip authentication or issue tokens', async ({ page, context }) => {
  for (const token of [await fixtureSession(true, { expired: true }), `${await fixtureSession()}x`, await fixtureSession(true, { password: 'previous-test-only-password' })]) {
    await installCookie(context, token);
    await page.goto('/');
    await expect(page.getByLabel('Senha da sala')).toBeVisible();
    await expect(page.getByLabel('Manter conectado neste dispositivo')).not.toBeChecked();
    expect((await context.request.post('/api/token', { data: {}, headers: { origin } })).status()).toBe(401);
  }
});

test('session invalidated while entry is open returns to password entry without connecting', async ({ page, context }) => {
  await installCookie(context, await fixtureSession());
  await page.goto('/');
  await expect(page.getByLabel('Senha da sala')).toHaveCount(0);
  await installCookie(context, await fixtureSession(true, { expired: true }));
  await page.getByRole('button', { name: 'Entrar na sala', exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toHaveText('Sua sessão expirou. Entre novamente.');
  await expect(page.getByLabel('Senha da sala')).toBeVisible();
  await expect(page.getByLabel('Manter conectado neste dispositivo')).not.toBeChecked();
  await expect(page.getByRole('heading', { name: 'Entre amigos' })).toHaveCount(0);
});

test('forget access reports failures honestly and clears even an expired cookie through the real endpoint', async ({ page, context }) => {
  await installCookie(context, await fixtureSession());
  await page.goto('/');
  await page.route('**/api/logout', route => route.abort('internetdisconnected'));
  await page.getByRole('button', { name: 'Esquecer acesso neste dispositivo' }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText('Não foi possível esquecer o acesso');
  await expect(page.getByLabel('Senha da sala')).toHaveCount(0);
  expect((await context.cookies()).some(cookie => cookie.name === cookieName)).toBe(true);
  await page.unroute('**/api/logout');
  // Expiration during the open page also avoids contacting the cloud fixture for removal.
  await installCookie(context, await fixtureSession(true, { expired: true }));
  await page.getByRole('button', { name: 'Esquecer acesso neste dispositivo' }).click();
  await expect(page.getByLabel('Senha da sala')).toBeVisible();
  await expect(page.getByLabel('Manter conectado neste dispositivo')).not.toBeChecked();
  expect((await context.cookies()).some(cookie => cookie.name === cookieName)).toBe(false);
  await page.reload(); await expect(page.getByLabel('Senha da sala')).toBeVisible();
  expect((await context.request.post('/api/token', { data: {}, headers: { origin } })).status()).toBe(401);
});
