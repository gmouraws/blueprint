import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('home is stream-only, accessible and never joins or captures; admin is a discreet separate entry', async ({page}) => {
  const media: string[] = [];
  await page.route('**/api/**', route => { media.push(route.request().url()); return route.abort(); });
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Compartilhe sua tela'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Administração'})).toHaveAttribute('href','/admin');
  await expect(page.getByRole('button',{name:/Entrar na sala|Abrir chat|microfone/i})).toHaveCount(0);
  for (const width of [1440,375,320]) {
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag22aa']).analyze()).violations).toEqual([]);
  }
  expect(media).toEqual([]);
});
test('idle guest discovery and cancelled capture consume no admission, and 30/60 preserves resolution',async({page})=>{
  const calls: string[]=[]; const options: unknown[]=[];
  await page.exposeFunction('captureOptions', (value:unknown)=>options.push(value));
  await page.addInitScript(()=>{navigator.mediaDevices.getDisplayMedia=async value=>{await (window as unknown as {captureOptions:(value:unknown)=>Promise<void>}).captureOptions(value);throw new DOMException('cancelled','NotAllowedError');};});
  await page.route('**/api/stream',route=>{const {action}=route.request().postDataJSON();calls.push(action);return route.fulfill({json:{role:'share',expires:Date.now()+60000,streams:[]}});});
  await page.goto('/stream?intent=share#invite='+'x'.repeat(43));
  await expect(page.getByRole('button',{name:'Selecionar tela'})).toBeEnabled();
  await expect(page.getByLabel('Fluidez')).toHaveValue('30');
  expect(calls).not.toContain('join');
  await page.getByRole('button',{name:'Selecionar tela'}).click();
  await expect(page.getByRole('status')).toContainText('cancelado');
  await page.getByLabel('Fluidez').selectOption('60');
  await page.getByRole('button',{name:'Selecionar tela'}).click();
  await expect.poll(()=>options.length).toBe(2);
  expect(calls).not.toContain('join');
  const constraints=options as {video:{width:{ideal:number};height:{ideal:number};frameRate:{ideal:number}}}[];
  expect(JSON.stringify(constraints)).toContain('1920');
  expect(JSON.stringify(constraints[0])).toContain('30'); expect(JSON.stringify(constraints[1])).toContain('60');
});

test('authorization loss removes capture controls while idle without a media admission',async({page})=>{
  await page.clock.install(); let revoked=false, joins=0;
  await page.route('**/api/stream',route=>{
    const {action}=route.request().postDataJSON(); if(action==='join')joins++;
    if(revoked && action==='status')return route.fulfill({status:401,json:{error:'Convite revogado.'}});
    return route.fulfill({json:{role:'share',expires:Date.now()+60000,streams:[]}});
  });
  await page.goto('/stream?intent=share#invite='+'x'.repeat(43));
  await expect(page.getByRole('button',{name:'Selecionar tela'})).toBeEnabled();
  revoked=true;await page.clock.fastForward(16000);
  await expect(page.getByRole('status')).toContainText('Convite revogado');
  await expect(page.getByRole('button',{name:'Selecionar tela'})).toHaveCount(0);expect(joins).toBe(0);
});
