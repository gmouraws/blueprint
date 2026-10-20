import { test, expect } from '@playwright/test';
import { captures, energy, gain, join, liveTracks, prepare, service } from './fixtures';

test('prejoin meter cleans up, pending capture is cancellable, and device errors are useful', async ({ page }) => {
  const room = `lifecycle-${Date.now()}`; await service.createRoom({ name: room, maxParticipants: 8 });
  try {
    await prepare(page, 'Alice', room);
    await page.getByText('Testar microfone (opcional)', { exact: true }).click();
    expect(await captures(page)).toBe(0);
    await page.getByRole('button', { name: 'Testar microfone', exact: true }).click();
    await expect.poll(() => page.getByRole('meter').evaluate(el => (el as HTMLMeterElement).value), { timeout: 15000 }).toBeGreaterThan(0);
    await expect(page.locator('audio')).toHaveCount(0);
    await join(page);
    await expect.poll(() => liveTracks(page)).toBe(0);
    await expect(page.getByRole('button', { name: 'Ativar microfone', exact: true })).toBeVisible();
    await page.evaluate(() => { (window as unknown as { mediaProbe: { pendingCapture: boolean } }).mediaProbe.pendingCapture = true; });
    await page.getByRole('button', { name: 'Ativar microfone', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Ativando…', exact: true })).toBeDisabled();
    const count = await captures(page);
    await page.getByRole('button', { name: 'Cancelar ativação' }).click();
    await page.evaluate(() => { const probe = (window as unknown as { mediaProbe: { pendingCapture: boolean; releaseCapture?: () => void } }).mediaProbe; probe.pendingCapture = false; probe.releaseCapture?.(); });
    await expect(page.getByRole('button', { name: 'Ativar microfone', exact: true })).toBeEnabled();
    await expect.poll(() => liveTracks(page)).toBe(0); expect(await captures(page)).toBe(count);
    for (const [failure, text] of [['NotAllowedError', 'Acesso ao microfone negado'], ['NotFoundError', 'Microfone não encontrado'], ['NotReadableError', 'Não foi possível abrir o microfone']]) {
      await page.evaluate(value => { (window as unknown as { mediaProbe: { failCapture: string } }).mediaProbe.failCapture = value; }, failure);
      await page.getByRole('button', { name: 'Ativar microfone', exact: true }).click();
      await expect(page.locator('.banner')).toContainText(text);
    }
    await page.evaluate(() => { const probe = (window as unknown as { mediaProbe: { pendingCapture: boolean; failCapture: string } }).mediaProbe; probe.pendingCapture = true; probe.failCapture = ''; });
    await page.getByRole('button', { name: 'Ativar microfone', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Ativando…', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Sair da sala' }).click();
    await page.evaluate(() => { const probe = (window as unknown as { mediaProbe: { pendingCapture: boolean; releaseCapture?: () => void } }).mediaProbe; probe.pendingCapture = false; probe.releaseCapture?.(); });
    await expect.poll(() => liveTracks(page)).toBe(0);
    await expect(page.getByRole('button', { name: 'Entrar na sala', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as unknown as { mediaProbe: { contexts: AudioContext[] } }).mediaProbe.contexts.filter(context => context.state !== 'closed').length)).toBe(0);
  } finally { await service.deleteRoom(room); }
});

test('blocked playback unlocks without capturing a microphone; device changes update routes safely', async ({ browser }) => {
  const room = `playback-${Date.now()}`; await service.createRoom({ name: room, maxParticipants: 8 });
  const a = await browser.newContext(); const b = await browser.newContext();
  const alice = await a.newPage(); const bob = await b.newPage();
  try {
    await prepare(alice, 'Alice', room); await join(alice);
    await prepare(bob, 'Bruno', room);
    await bob.evaluate(() => { Reflect.deleteProperty(HTMLMediaElement.prototype, 'setSinkId'); });
    await bob.evaluate(() => { (window as unknown as { mediaProbe: { blockAudio: boolean } }).mediaProbe.blockAudio = true; });
    await join(bob);
    await alice.getByRole('button', { name: 'Ativar microfone', exact: true }).click();
    await expect(bob.getByRole('button', { name: 'Ativar áudio', exact: true })).toBeVisible();
    expect(await captures(bob)).toBe(0);
    await bob.evaluate(() => { (window as unknown as { mediaProbe: { blockAudio: boolean } }).mediaProbe.blockAudio = false; });
    await bob.getByRole('button', { name: 'Ativar áudio', exact: true }).click();
    await expect(bob.getByRole('button', { name: 'Ativar áudio', exact: true })).toHaveCount(0);
    await expect.poll(() => energy(bob)).toBeGreaterThan(0);
    await expect.poll(() => gain(bob, 'microphone', 'Alice')).toBe(1);
    expect(await captures(bob)).toBe(0);
    await bob.getByText('Configurações de áudio', { exact: true }).click();
    await expect(bob.getByText('A seleção de saída não é suportada neste navegador. O áudio segue o padrão do sistema operacional.')).toBeVisible();
    await bob.getByRole('slider', { name: 'Voz de Alice' }).fill('35');
    await alice.getByText('Configurações de áudio', { exact: true }).click();
    const input = alice.getByLabel('Selecionar microfone', { exact: true });
    await input.selectOption({ label: 'Fake Audio Input 1' });
    await expect(alice.getByRole('button', { name: 'Desligar microfone', exact: true })).toBeVisible();
    const prior = await energy(bob); await expect.poll(() => energy(bob)).toBeGreaterThan(prior);
    await expect.poll(() => gain(bob, 'microphone', 'Alice')).toBeCloseTo(0.35);
    await expect(bob.locator('audio[data-audio-kind="microphone"]')).toHaveCount(1);
    const output = alice.getByLabel('Selecionar saída de áudio', { exact: true });
    await expect(output).toBeVisible();
    const outputId = await output.locator('option').evaluateAll(options => (options as HTMLOptionElement[]).find(option => option.value !== 'default')?.value);
    expect(outputId).toBeTruthy(); await output.selectOption(outputId!);
    await expect(output).toHaveValue(outputId!);
    await alice.evaluate(() => {
      const probe = (window as unknown as { mediaProbe: { devices: MediaDeviceInfo[] | null } }).mediaProbe;
      probe.devices = [{ deviceId: 'default', kind: 'audioinput', label: 'Microfone padrão disponível', groupId: 'input' }, { deviceId: 'default', kind: 'audiooutput', label: 'Saída padrão disponível', groupId: 'output' }] as MediaDeviceInfo[];
      navigator.mediaDevices.dispatchEvent(new Event('devicechange'));
    });
    await expect(input).toHaveValue('default'); await expect(output).toHaveValue('default');
    const count = await alice.evaluate(() => (window as unknown as { mediaProbe: { enumerations: number } }).mediaProbe.enumerations);
    expect(count).toBeLessThan(30);
  } finally { await a.close(); await b.close(); await service.deleteRoom(room); }
});

test('membership tones skip initial snapshot, mute, disabled preference and reconnect', async ({ browser }) => {
  const room = `sounds-${Date.now()}`; await service.createRoom({ name: room, maxParticipants: 8 });
  const a = await browser.newContext(); const b = await browser.newContext();
  const alice = await a.newPage(); const bob = await b.newPage();
  const tones = () => alice.evaluate(() => (window as unknown as { mediaProbe: { tones: number } }).mediaProbe.tones);
  try {
    await prepare(alice, 'Alice', room); await join(alice); expect(await tones()).toBe(0);
    await prepare(bob, 'Bruno', room); await join(bob);
    await expect.poll(tones).toBe(1);
    await alice.getByRole('slider', { name: 'Voz de Bruno' }).fill('40');
    expect(await bob.evaluate(() => (window as unknown as { mediaProbe: { tones: number } }).mediaProbe.tones)).toBe(0);
    await a.setOffline(true);
    await expect(alice.getByText('Reconectando…', { exact: true })).toBeVisible({ timeout: 20000 });
    await a.setOffline(false);
    await expect(alice.getByText('Conectado', { exact: true })).toBeVisible({ timeout: 20000 });
    expect(await tones()).toBe(1);
    await expect(alice.getByRole('slider', { name: 'Voz de Bruno' })).toHaveValue('40');
    await alice.getByRole('button', { name: 'Silenciar áudio', exact: true }).click();
    await bob.getByRole('button', { name: 'Sair da sala' }).click();
    await expect(alice.getByText('Bruno', { exact: true })).toHaveCount(0); expect(await tones()).toBe(1);
    await alice.getByRole('button', { name: 'Ouvir áudio', exact: true }).click();
    await alice.getByText('Configurações de áudio', { exact: true }).click();
    await alice.getByLabel('Sons de entrada e saída').uncheck();
    await expect(bob.getByLabel('Senha da sala')).toHaveCount(0);
    await join(bob);
    await expect(alice.getByText('Bruno', { exact: true })).toBeVisible(); expect(await tones()).toBe(1);
    await alice.getByLabel('Sons de entrada e saída').check();
    await bob.getByRole('button', { name: 'Sair da sala' }).click();
    await expect.poll(tones).toBe(2);
  } finally { await a.setOffline(false); await a.close(); await b.close(); await service.deleteRoom(room); }
});
