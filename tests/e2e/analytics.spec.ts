import { test, expect } from '@playwright/test';

test('production layouts mount the official analytics SDK and preserve pageview privacy', async ({page}) => {
  test.skip(process.env.VERCEL_ENV !== 'production', 'Requires production build output');
  // Substitute only the provider script; exercise the real bundled Next.js SDK
  // without sending visits to Vercel or relying on its bot-filtered script.
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).pathname.endsWith('/script.js')) {
      await route.fulfill({contentType:'application/javascript',body:'window.__analyticsScriptLoaded = true;'});
    } else await route.continue();
  });
  for (const route of ['/', '/pt']) {
    await page.goto(`${route}?private=value#private`);
    const sdk = page.locator('script[data-sdkn="@vercel/analytics/next"]');
    await expect(sdk).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => (window as typeof window & {__analyticsScriptLoaded?: boolean}).__analyticsScriptLoaded)).toBe(true);
    const result = await page.evaluate(() => {
      const state = window as typeof window & {
        vam?: string;
        vaq?: [string, unknown][];
        __analyticsScriptLoaded?: boolean;
      };
      const callbacks = state.vaq?.filter(([type]) => type === 'beforeSend');
      const callback = callbacks?.at(-1)?.[1] as ((event: {type:string;url:string}) => {url:string} | null) | undefined;
      return {
        mode: state.vam,
        pageviewQueued: state.vaq?.some(([type]) => type === 'pageview'),
        pageview: callback?.({type:'pageview',url:location.href}),
        customEvent: callback?.({type:'event',url:location.href}),
      };
    });
    expect(result.mode).toBe('production');
    expect(result.pageviewQueued).toBe(true);
    expect(result.pageview?.url).toBe(new URL(route, page.url()).href);
    expect(result.customEvent).toBe(null);
  }
});
