import { test, expect } from '@playwright/test';
import { captures, liveTracks, prepare, join, service, closeChatStores, gain } from './fixtures';
test.afterAll(closeChatStores);

test('one dispatcher restores individual states, mutes all playback and works across buttons and shortcuts', async ({ browser }) => {
  test.setTimeout(90000);
  const room = 'combined-' + Date.now();
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const [alice, bob] = await Promise.all(contexts.map(context => context.newPage()));
  try {
    await alice.addInitScript(() => localStorage.setItem('blueprint.audio-preferences', JSON.stringify({ shortcuts: { microphone: 'Ctrl+Shift+M', listening: 'Ctrl+Shift+Y', all: 'Ctrl+Shift+U' } })));
    await prepare(alice, 'Ana', room); await join(alice); await prepare(bob, 'Bruno', room); await join(bob);
    await bob.getByRole('button', { name: 'Ativar microfone', exact: true }).click();
    await bob.getByRole('button', { name: 'Compartilhar tela', exact: true }).click();
    const controls = alice.locator('.call-controls');
    await expect.poll(() => gain(alice, 'microphone', 'Bruno')).toBe(1);
    await expect.poll(() => gain(alice, 'screen_share_audio', 'Bruno')).toBe(.8);
    for (const mic of [false, true]) for (const deaf of [false, true]) {
      if (await controls.getByRole('button', { name: 'Desligar microfone', exact: true }).count() !== Number(mic)) {
        await controls.locator('.microphone-toggle').click();
      }
      await expect(controls.locator('.microphone-toggle')).toHaveAttribute('aria-pressed', String(mic));
      if (await controls.locator('.listening-toggle').getAttribute('aria-pressed') !== String(deaf)) await controls.locator('.listening-toggle').click();
      const count = await captures(alice);
      await controls.getByRole('button', { name: 'Silenciar tudo', exact: true }).click();
      await expect(controls.locator('.microphone-toggle')).toHaveAttribute('aria-pressed', 'false');
      await expect.poll(() => gain(alice, 'microphone', 'Bruno')).toBe(0);
      await expect.poll(() => gain(alice, 'screen_share_audio', 'Bruno')).toBe(0);
      const restore = controls.getByRole('button', { name: 'Restaurar estados anteriores', exact: true });
      await expect(restore).toBeEnabled(); await restore.focus(); await alice.keyboard.press('Control+Shift+U');
      await expect(controls.locator('.microphone-toggle')).toHaveAttribute('aria-pressed', String(mic));
      await expect(controls.locator('.listening-toggle')).toHaveAttribute('aria-pressed', String(deaf));
      expect(await captures(alice)).toBe(count);
    }
    await controls.getByRole('button', { name: 'Silenciar tudo', exact: true }).click();
    await expect(controls.locator('.microphone-toggle')).toBeEnabled();
    await controls.locator('.microphone-toggle').focus(); await alice.keyboard.press('Control+Shift+M');
    await expect(controls.locator('.microphone-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect(controls.locator('.listening-toggle')).toHaveAttribute('aria-pressed', 'true');
    await controls.getByRole('button', { name: 'Silenciar tudo', exact: true }).click();
    await expect(controls.getByRole('button', { name: 'Restaurar estados anteriores', exact: true })).toBeEnabled();
    await controls.locator('.listening-toggle').focus(); await alice.keyboard.press('Control+Shift+Y');
    await expect(controls.locator('.microphone-toggle')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => gain(alice, 'screen_share_audio', 'Bruno')).toBe(.8);
    await controls.locator('.microphone-toggle').click();
    await expect(controls.locator('.microphone-toggle')).toHaveAttribute('aria-pressed', 'true');
    await controls.getByRole('button', { name: 'Silenciar tudo', exact: true }).click();
    await alice.getByRole('button', { name: 'Configurações de áudio', exact: true }).click();
    const beforeDevice = await captures(alice);
    await alice.getByLabel('Selecionar microfone', { exact: true }).selectOption({ label: 'Fake Audio Input 1' });
    await alice.keyboard.press('Escape');
    await controls.getByRole('button', { name: 'Restaurar estados anteriores', exact: true }).click();
    expect(await captures(alice)).toBe(beforeDevice);
    await expect(controls.locator('.microphone-toggle')).toHaveAttribute('aria-pressed', 'false');
    await controls.getByRole('button', { name: 'Silenciar tudo', exact: true }).click();
    await alice.getByRole('button', { name: 'Ver Sala 2', exact: true }).dblclick();
    await expect(alice.getByText('Conectado', { exact: true })).toBeVisible();
    await expect(controls.getByRole('button', { name: 'Silenciar tudo', exact: true })).toBeVisible();
    await expect(controls.locator('.microphone-toggle')).toHaveAttribute('aria-pressed', 'false');
    expect(await liveTracks(alice)).toBe(0);
  } finally { await Promise.all(contexts.map(context => context.close())); await service.deleteRoom(room); }
});

test('combined mute cancels pending capture, never reacquires on restore and safely reports device denial', async ({ page }) => {
  const room = 'pending-combined-' + Date.now();
  try {
    await prepare(page, 'Ana', room); await join(page);
    await page.evaluate(() => { (window as unknown as { mediaProbe: { pendingCapture: boolean } }).mediaProbe.pendingCapture = true; });
    await page.getByRole('button', { name: 'Ativar microfone', exact: true }).click();
    await expect.poll(() => captures(page)).toBe(1);
    await page.getByRole('button', { name: 'Silenciar tudo', exact: true }).click();
    await page.evaluate(() => { const probe = (window as unknown as { mediaProbe: { pendingCapture: boolean; releaseCapture?: () => void } }).mediaProbe; probe.pendingCapture = false; probe.releaseCapture?.(); });
    await expect(page.getByRole('button', { name: 'Ativar microfone', exact: true })).toBeEnabled();
    await expect.poll(() => liveTracks(page)).toBe(0);
    await page.getByRole('button', { name: 'Restaurar estados anteriores', exact: true }).click();
    expect(await captures(page)).toBe(1);
    await page.evaluate(() => { (window as unknown as { mediaProbe: { failCapture: string } }).mediaProbe.failCapture = 'NotAllowedError'; });
    await page.getByRole('button', { name: 'Ativar microfone', exact: true }).click();
    await expect(page.getByText(/Acesso ao microfone negado/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ativar microfone', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Silenciar tudo', exact: true }).click();
    await service.removeParticipant(room, 'Ana');
    await expect(page.getByText('Desconectado', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Restaurar estados anteriores', exact: true })).toHaveCount(0);
    expect(await liveTracks(page)).toBe(0);
  } finally { await service.deleteRoom(room); }
});
