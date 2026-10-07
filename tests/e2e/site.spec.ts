import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { publishedEntries, entryUrl } from '../../src/lib/content';
const routes = ['/', '/builds', '/experiments', '/notes', '/about', '/pt', '/pt/builds', '/pt/experiments', '/pt/notes', '/pt/about', ...publishedEntries().map(entryUrl)];
for (const route of routes) {
  test(`published route ${route}`, async ({page}) => {
    const response = await page.goto(route); expect(response?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', route === '/pt' || route.startsWith('/pt/') ? 'pt-BR' : 'en');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://blueprint.app.br${route === '/' ? '' : route}`);
    await expect(page.locator('link[hreflang="en"]')).toHaveCount(1);
    await expect(page.locator('link[hreflang="pt-BR"]')).toHaveCount(1);
    expect((await new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({width, height:900});
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (width === 320 || width === 768) expect((await new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    }
  });
}
test('article language switch preserves equivalent page', async ({page}) => {
  await page.goto('/builds/blueprint'); await page.getByRole('link', {name: 'Change language: Português'}).click();
  await expect(page).toHaveURL(/\/pt\/builds\/blueprint$/);
});
for (const locale of ['en', 'pt-BR'] as const) {
  test(`planned ClinDevLab build and lifecycle indicators in ${locale}`, async ({page}) => {
    const prefix = locale === 'en' ? '' : '/pt';
    const planned = locale === 'en' ? 'Planned' : 'Planejado';
    const building = locale === 'en' ? 'Building' : 'Em construção';
    await page.goto(prefix || '/');
    await expect(page.locator('.featured .entry-meta')).toContainText('BUILD-001');
    await expect(page.locator('.featured .status')).toHaveText(building);
    await expect(page.locator('.featured .status-dot')).toHaveCSS('background-color', 'rgb(228, 184, 102)');
    await expect(page.locator('.activity').getByRole('link', {name: 'ClinDevLab'})).toHaveAttribute('href', `${prefix}/builds/clindevlab`);

    await page.goto(`${prefix}/builds`);
    const row = page.locator('.entry-list li').filter({has: page.getByRole('link', {name: 'ClinDevLab'})});
    await expect(row).toContainText('BUILD-002');
    await expect(row.locator('.status')).toHaveText(planned);
    await expect(row.locator('.status-dot')).toHaveAttribute('aria-hidden', 'true');
    await expect(row.locator('.status-dot')).toHaveCSS('background-color', 'rgb(138, 184, 255)');
    await row.getByRole('link', {name: 'ClinDevLab'}).click();
    await expect(page.locator('h1')).toHaveText('ClinDevLab');
    await expect(page.locator('.article-heading .status')).toHaveText(planned);
    await expect(page.locator('.article-heading .status-dot')).toHaveCSS('background-color', 'rgb(138, 184, 255)');
    await expect(page.locator('.prose h2')).toHaveCount(5);
    await expect(page.locator('.prose')).toContainText(locale === 'en' ? 'no application has been implemented' : 'nenhuma aplicação foi implementada');
    await expect(page.locator('.prose')).toContainText('CDISC');
    await expect(page.locator('.prose')).toContainText('SDTM');
    await page.getByRole('link', {name: locale === 'en' ? 'Change language: Português' : 'Mudar idioma: English'}).click();
    await expect(page).toHaveURL(locale === 'en' ? /\/pt\/builds\/clindevlab$/ : /\/builds\/clindevlab$/);
  });
}

test('capture responsive release review views', async ({page}) => {
  for (const [name, width, route] of [['desktop',1920,'/'], ['tablet',768,'/pt'], ['mobile',375,'/pt'], ['article',768,'/notes/designing-repositories-for-ai-agents']] as const) {
    await page.setViewportSize({width,height:1080}); await page.goto(route);
    await page.screenshot({path:`test-results/review-${name}.png`,fullPage:true});
  }
  for (const [name, width, route] of [['clindevlab-en',1440,'/builds/clindevlab'], ['clindevlab-pt',375,'/pt/builds/clindevlab'], ['builds',1440,'/builds']] as const) {
    await page.setViewportSize({width,height:1080}); await page.goto(route);
    await page.screenshot({path:`test-results/review-${name}.png`,fullPage:true});
  }
});
test('skip link provides keyboard access to main', async ({page}) => {
  await page.goto('/'); await page.keyboard.press('Tab'); await expect(page.getByText('Skip to content')).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.locator('main')).toBeFocused();
});
test('missing content returns 404', async ({page}) => {
  expect((await page.goto('/notes/not-published'))?.status()).toBe(404);
});
test('all rendered internal links resolve', async ({page, request}) => {
  const links = new Set<string>();
  for (const route of routes) {
    await page.goto(route);
    for (const href of await page.locator('a[href^="/"]').evaluateAll(nodes => nodes.map(n => n.getAttribute('href')!))) links.add(href);
  }
  for (const href of links) expect((await request.get(href)).status(), href).toBe(200);
});
test('preview has no analytics and refuses indexing', async ({page, request}) => {
  await page.goto('/'); await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  expect(await page.locator('script[src*="insights"]').count()).toBe(0);
  expect((await request.get('/')).headers()['x-robots-tag']).toBe('noindex, nofollow');
});
