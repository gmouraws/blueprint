import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import AxeBuilder from '@axe-core/playwright';
import { prepare, join, service, captures, energy, gain, closeChatStores } from './fixtures';
const sharp: typeof import('sharp').default = createRequire(import.meta.url)('sharp');
test.afterAll(closeChatStores);

test('original sizing, contextual controls and fullscreen preserve one media path and independent audio', async ({ browser }, testInfo) => {
  const name = 'viewing-' + Date.now(); await service.createRoom({ name, maxParticipants: 8 });
  const hostContext = await browser.newContext();
  const viewerContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
  const host = await hostContext.newPage(); const page = await viewerContext.newPage();
  const folder = '.generated/review/viewing'; await mkdir(folder, { recursive: true });
  try {
    await prepare(host, 'Alice', name); await join(host); await prepare(page, 'Bruno', name); await join(page);
    await host.getByRole('button', { name: 'Compartilhar tela', exact: true }).click();
    const video = page.locator('video'); const viewer = page.locator('.screen-viewer');
    await expect.poll(() => video.evaluate(el => (el as HTMLVideoElement).videoWidth)).toBe(640);
    await expect.poll(() => energy(page)).toBeGreaterThan(0);
    const hostVideoBounds = await host.locator('video').boundingBox();
    await host.locator('.screen-viewer').hover(); await host.mouse.move(0, 0);
    await expect(host.locator('.viewer-toolbar')).toHaveCSS('opacity', '0', { timeout: 5000 });
    expect(await host.locator('video').boundingBox()).toEqual(hostVideoBounds);
    await host.locator('.screen-viewer').hover();
    await expect(host.locator('.viewer-toolbar')).toHaveCSS('opacity', '1');
    const path = await video.elementHandle();
    const peerCount = await page.evaluate(() => (window as unknown as { mediaProbe: { peers: unknown[] } }).mediaProbe.peers.length);
    const dimensions = await video.boundingBox(); expect(dimensions!.width).toBeGreaterThan(640);
    await expect(video).toHaveCSS('object-fit', 'scale-down');
    // Inspect the drawn bitmap, not the deliberately larger adaptive-observer element.
    const { data, info } = await sharp(await video.screenshot()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixels = Array.from({ length: info.width }, (_, x) => {
      const at = (Math.floor(info.height / 2) * info.width + x) * info.channels;
      return data[at] + data[at + 1] + data[at + 2] > 70;
    });
    const left = pixels.indexOf(true); const right = pixels.lastIndexOf(true);
    expect(right - left + 1).toBeGreaterThanOrEqual(638); expect(right - left + 1).toBeLessThanOrEqual(642);
    expect(Math.abs(left - (info.width - right - 1))).toBeLessThanOrEqual(2);
    await viewer.hover(); await page.mouse.move(0, 0);
    await expect(viewer).toHaveAttribute('data-controls-visible', 'false', { timeout: 5000 });
    expect(await video.boundingBox()).toEqual(dimensions);
    await viewer.focus(); await page.keyboard.press('Tab');
    await expect(page.getByLabel('Escolher tela compartilhada')).toBeFocused();
    await expect(page.locator('.viewer-toolbar')).toHaveCSS('opacity', '1');
    expect(await video.boundingBox()).toEqual(dimensions);
    await page.getByRole('button', { name: 'Opções de visualização' }).tap();
    await page.getByRole('button', { name: 'Ajustar à área', exact: true }).click();
    await expect(video).toHaveCSS('object-fit', 'contain');
    await page.getByRole('button', { name: 'Tamanho original', exact: true }).click();
    await page.getByRole('slider', { name: 'Áudio da tela selecionada' }).fill('45');
    await page.getByRole('button', { name: 'Alternar tela cheia' }).click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await page.keyboard.press('Escape'); // Dismiss the options popover, retaining fullscreen.
    const full = page.locator('.fullscreen-audio');
    await expect(full.getByRole('button', { name: 'Ativar microfone', exact: true })).toBeVisible();
    await full.getByRole('button', { name: 'Ativar microfone', exact: true }).click();
    await expect(full.getByRole('button', { name: 'Desligar microfone', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await full.getByRole('button', { name: 'Silenciar áudio', exact: true }).click();
    await expect.poll(() => gain(page, 'screen_share_audio', 'Alice')).toBe(0);
    await expect(full.getByRole('button', { name: 'Desligar microfone', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await full.getByRole('button', { name: 'Ouvir áudio', exact: true }).click();
    await expect.poll(() => gain(page, 'screen_share_audio', 'Alice')).toBeCloseTo(0.45);
    await full.getByRole('button', { name: 'Desligar microfone', exact: true }).click();
    await viewer.hover(); await page.getByRole('button', { name: 'Opções de visualização' }).click();
    await page.getByRole('button', { name: 'Alternar tela cheia' }).click(); await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
    expect(await video.evaluate((el, original) => el === original, path)).toBe(true);
    await expect(page.locator('video')).toHaveCount(1); await expect(page.locator('audio')).toHaveCount(1);
    expect(await page.evaluate(() => (window as unknown as { mediaProbe: { peers: unknown[] } }).mediaProbe.peers.length)).toBe(peerCount);
    expect(await captures(page)).toBe(1);
    const layouts: object[] = [];
    for (const [width, height] of [[1440, 900], [1366, 600], [768, 900], [375, 667], [320, 568]]) {
      await page.setViewportSize({ width, height }); await viewer.tap();
      const box = await video.boundingBox(); expect(box!.width).toBeGreaterThan(100); expect(box!.height).toBeGreaterThan(100);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
      await page.screenshot({ path: `${folder}/stream-${width}.png`, fullPage: true });
      await page.getByRole('tab', { name: 'Chat', exact: true }).click();
      await expect(page.locator('.stream-mini video')).toBeVisible();
      const composer = await page.locator('.chat-form').boundingBox(); const controls = await page.locator('.call-controls').boundingBox();
      const messages = await page.locator('.messages').boundingBox();
      expect(composer!.y + composer!.height).toBeLessThanOrEqual(controls!.y + 1);
      expect(controls!.y + controls!.height).toBeLessThanOrEqual(height);
      expect(messages!.height).toBeGreaterThan(width <= 375 ? 70 : 200);
      expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
      await page.screenshot({ path: `${folder}/chat-mini-${width}.png`, fullPage: true });
      layouts.push({ width, height, video: box, messages: messages!.height, composer: composer!.height });
      await page.getByRole('button', { name: 'Expandir tela e voltar à sala' }).click();
      await expect.poll(() => gain(page, 'screen_share_audio', 'Alice')).toBeCloseTo(0.45);
    }
    await writeFile(`${folder}/layout-measurements.json`, JSON.stringify({ drawnWidth: right - left + 1, received: [640, 360], layouts }, null, 2));
    await testInfo.attach('viewing-measurements', { body: JSON.stringify(layouts), contentType: 'application/json' });
  } finally { await hostContext.close(); await viewerContext.close(); await service.deleteRoom(name); }
});
