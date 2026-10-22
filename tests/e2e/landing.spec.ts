import { test, expect } from '@playwright/test';
test('public landing is bilingual, remembers language and keeps creator attribution understated', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Screen sharing, built for private spaces.' })).toBeVisible();
  await expect(page.getByRole('contentinfo')).toContainText('An experiment by Guilherme Moura');
  await expect(page.getByRole('contentinfo').getByRole('link', { name: 'GitHub', exact: true })).toHaveAttribute('href', 'https://github.com/gmouraws');
  await expect(page.getByRole('contentinfo').getByRole('link', { name: 'LinkedIn' })).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.locator('a[href*="releases/download"],a[href$=".exe"]')).toHaveCount(0);
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.generated/landing-${width}-en.png`, fullPage: true });
  }
  await page.getByRole('link', { name: 'PT-BR', exact: true }).click();
  await expect(page.getByRole('contentinfo')).toContainText('Um experimento de Guilherme Moura');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Compartilhamento de tela para espaços privados.' })).toBeVisible();
  await page.screenshot({ path: '.generated/landing-375-pt.png', fullPage: true });
});
test('private access has no anonymous administration controls or distribution panel', async ({ page }) => {
  await page.goto('/admin?lang=en');
  await expect(page.getByRole('heading', { name: 'Private access' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Request code', exact: true })).toBeVisible();
  await expect(page.getByText('Distribuição Windows', { exact: true })).toHaveCount(0);
  await page.goto('/admin?lang=pt-BR');
  await expect(page.getByRole('heading', { name: 'Acesso privado' })).toBeVisible();
});
