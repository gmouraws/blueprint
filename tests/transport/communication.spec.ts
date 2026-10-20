import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { captures, energy, gain, join, liveTracks, prepare, service } from './fixtures';

test('real peers exchange chat and audio; independent volumes, device labels, cleanup', async ({ browser }, testInfo) => {
  const room = `transport-${Date.now()}`;
  await service.createRoom({ name: room, maxParticipants: 8 });
  const a = await browser.newContext(); const b = await browser.newContext();
  const alice = await a.newPage(); const bob = await b.newPage();
  try {
    await prepare(alice, 'Alice', room); await join(alice);
    await prepare(bob, 'Bruno', room); await join(bob);
    await expect(alice.getByText('Bruno', { exact: true })).toBeVisible();
    expect(await captures(alice)).toBe(0); expect(await captures(bob)).toBe(0);
    await alice.getByLabel('Mensagem', { exact: true }).fill('Olá da Alice');
    await alice.getByLabel('Mensagem', { exact: true }).press('Enter');
    await expect(bob.getByText('Olá da Alice', { exact: true })).toBeVisible();
    await expect(alice.locator('.message')).toHaveCount(1);
    const draft = bob.getByLabel('Mensagem', { exact: true });
    await draft.fill('Linha um'); await draft.press('Shift+Enter'); await draft.pressSequentially('Linha dois');
    await expect(draft).toHaveValue('Linha um\nLinha dois');
    await draft.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
    await expect(bob.locator('.message')).toHaveCount(1);
    await bob.getByRole('button', { name: 'Enviar mensagem' }).click();
    await expect(alice.getByText('Linha um\nLinha dois', { exact: true })).toBeVisible();
    await expect(alice.locator('.message')).toHaveCount(2); await expect(bob.locator('.message')).toHaveCount(2);
    await alice.evaluate(() => { (window as unknown as { mediaProbe: { failData: boolean } }).mediaProbe.failData = true; });
    await alice.getByLabel('Mensagem', { exact: true }).fill('Reenviar');
    await expect(async () => { await alice.getByRole('button', { name: 'Enviar mensagem' }).click(); await expect(alice.locator('.chat-form .error')).toContainText('Seu texto foi mantido'); }).toPass();
    await expect(alice.getByLabel('Mensagem', { exact: true })).toHaveValue('Reenviar');
    await alice.evaluate(() => { (window as unknown as { mediaProbe: { failData: boolean } }).mediaProbe.failData = false; });
    await expect(async () => { await alice.getByLabel('Mensagem', { exact: true }).press('Enter'); await expect(bob.getByText('Reenviar', { exact: true })).toBeVisible(); }).toPass();
    const started = Date.now();
    await alice.getByRole('button', { name: 'Ativar microfone', exact: true }).click();
    await expect(alice.getByRole('button', { name: 'Desligar microfone', exact: true })).toBeVisible();
    const activationMs = Date.now() - started;
    await expect.poll(() => energy(bob)).toBeGreaterThan(0);
    const first = await energy(bob); await expect.poll(() => energy(bob)).toBeGreaterThan(first);
    await expect.poll(() => gain(bob, 'microphone', 'Alice')).toBe(1);
    expect(await captures(bob)).toBe(0);
    await bob.getByRole('slider', { name: 'Voz de Alice' }).fill('35');
    await expect.poll(() => gain(bob, 'microphone', 'Alice')).toBeCloseTo(0.35);
    await bob.getByRole('button', { name: 'Silenciar voz de alice', exact: true }).click();
    await expect.poll(() => gain(bob, 'microphone', 'Alice')).toBe(0);
    await bob.getByRole('button', { name: 'Ouvir voz de alice', exact: true }).click();
    await bob.getByRole('button', { name: 'Silenciar áudio', exact: true }).click();
    await expect.poll(() => gain(bob, 'microphone', 'Alice')).toBe(0);
    await bob.getByRole('button', { name: 'Ouvir áudio', exact: true }).click();
    await expect.poll(() => gain(bob, 'microphone', 'Alice')).toBeCloseTo(0.35);
    await bob.getByRole('button', { name: 'Ativar microfone', exact: true }).click();
    await expect.poll(() => energy(alice)).toBeGreaterThan(0);
    const capturesBefore = await captures(alice);
    for (let i = 0; i < 3; i++) {
      await alice.getByRole('button', { name: 'Desligar microfone', exact: true }).click();
      await alice.getByRole('button', { name: 'Ativar microfone', exact: true }).click();
    }
    await expect(alice.getByRole('button', { name: 'Desligar microfone', exact: true })).toBeVisible();
    expect(await captures(alice)).toBe(capturesBefore);
    await alice.getByText('Configurações de áudio', { exact: true }).click();
    await expect.poll(() => alice.getByLabel('Selecionar microfone', { exact: true }).locator('option').allTextContents()).toContain('Fake Audio Input 1');
    const enumerations = await alice.evaluate(() => (window as unknown as { mediaProbe: { enumerations: number } }).mediaProbe.enumerations);
    expect(enumerations).toBeLessThan(20);
    for (const width of [1440, 768, 375]) {
      await alice.setViewportSize({ width, height: 1000 });
      expect(await alice.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await alice.evaluate(() => document.querySelector('.chat-form')!.getBoundingClientRect().bottom <= document.querySelector('.call-controls')!.getBoundingClientRect().top + 1)).toBe(true);
      expect((await new AxeBuilder({ page: alice }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
      await alice.screenshot({ path: `test-results/call-connected-${width}.png`, fullPage: true });
    }
    const measurements = JSON.stringify({ activationMs, enumerations, capturesBefore, aliceReceivedEnergy: await energy(alice), bobReceivedEnergy: await energy(bob) });
    await mkdir(testInfo.outputDir, { recursive: true });
    await writeFile(testInfo.outputPath('media-measurements.json'), measurements);
    await testInfo.attach('safe-media-measurements', { contentType: 'application/json', body: measurements });
    await alice.getByRole('button', { name: 'Sair da sala' }).click();
    await expect.poll(() => liveTracks(alice)).toBe(0);
    await expect(bob.locator('audio[data-audio-owner="Alice"]')).toHaveCount(0);
  } finally { await a.close(); await b.close(); await service.deleteRoom(room); }
});

test('selected screen has one audio path, separate volume, and global mute restores it', async ({ browser }) => {
  const room = `screens-${Date.now()}`; await service.createRoom({ name: room, maxParticipants: 8 });
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const pages = await Promise.all(contexts.map(context => context.newPage()));
  const [alice, bob, viewer] = pages;
  try {
    for (const [index, page] of pages.entries()) { await prepare(page, ['Alice', 'Bruno', 'Clara'][index], room); await join(page); }
    await alice.getByRole('button', { name: 'Compartilhar tela', exact: true }).click();
    await expect(viewer.locator('audio[data-audio-kind="screen_share_audio"][data-audio-owner="Alice"]')).toHaveCount(1);
    await bob.getByRole('button', { name: 'Compartilhar tela', exact: true }).click();
    await expect(viewer.getByLabel('Escolher tela compartilhada').locator('option')).toHaveCount(2);
    await viewer.getByLabel('Escolher tela compartilhada').selectOption({ label: 'Bruno' });
    await expect(viewer.locator('audio[data-audio-kind="screen_share_audio"]')).toHaveCount(1);
    await expect(viewer.locator('audio[data-audio-owner="Alice"]')).toHaveCount(0);
    await expect.poll(() => gain(viewer, 'screen_share_audio', 'Bruno')).toBeCloseTo(0.8);
    await viewer.getByRole('slider', { name: 'Áudio da tela selecionada' }).fill('45');
    await expect.poll(() => gain(viewer, 'screen_share_audio', 'Bruno')).toBeCloseTo(0.45);
    await viewer.getByRole('button', { name: 'Silenciar áudio', exact: true }).click();
    await expect.poll(() => gain(viewer, 'screen_share_audio', 'Bruno')).toBe(0);
    await viewer.getByRole('button', { name: 'Ouvir áudio', exact: true }).click();
    await expect.poll(() => gain(viewer, 'screen_share_audio', 'Bruno')).toBeCloseTo(0.45);
    expect(await captures(viewer)).toBe(0); await expect.poll(() => energy(viewer)).toBeGreaterThan(0);
    await expect(alice.locator('audio[data-audio-owner="Alice"]')).toHaveCount(0);
    await bob.getByRole('button', { name: 'Parar compartilhamento', exact: true }).click();
    await expect(viewer.locator('audio[data-audio-owner="Bruno"]')).toHaveCount(0);
    await expect(viewer.locator('audio[data-audio-kind="screen_share_audio"]')).toHaveCount(1);
    await expect.poll(() => liveTracks(bob)).toBe(0);
  } finally { await Promise.all(contexts.map(context => context.close())); await service.deleteRoom(room); }
});
