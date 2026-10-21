import { test, expect } from '@playwright/test';
import { installAccount, authenticate } from '../browser-account';
test('owner explicitly creates/copies persistent links; rotation confirmation and provider cleanup are visible',async({page})=>{
 await installAccount(page);
 await page.route('**/api/account',route=>route.fulfill({json:{id:'00000000-0000-4000-8000-000000000001',name:'Ana',role:'owner',preferences:{},preference_version:0}}));
 const operations:string[]=[];let active=false;
 await page.route('**/api/stream/manage',route=>{const {operation}=route.request().postDataJSON();operations.push(operation);if(operation==='create')active=true;if(operation==='rotate')active=false;return route.fulfill({json:{active,cleanupPending:operation==='rotate',urls:active&&operation!=='status'?{share:'https://example.test/stream?intent=share#invite='+'s'.repeat(43),watch:'https://example.test/stream?intent=watch#invite='+'w'.repeat(43)}:undefined}});});
 await page.goto('/');await authenticate(page);await page.getByRole('button',{name:'Meu perfil'}).click();await page.getByText('Convites para transmissão sem conta',{exact:true}).click();
 await expect(page.getByRole('button',{name:'Criar link sem expiração'})).toHaveCount(0);
 await page.getByRole('button',{name:'Atualizar link persistente'}).click();await page.getByRole('button',{name:'Criar link sem expiração'}).click();await expect(page.getByLabel('Link para transmitir e assistir',{exact:true})).toBeVisible();
 page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Trocar link'}).click();expect(operations).not.toContain('rotate');
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Trocar link'}).click();await expect(page.getByText(/desconexão de mídia pendente/)).toBeVisible();await expect(page.getByLabel('Link para transmitir e assistir',{exact:true})).toHaveCount(0);
 for(const width of [1440,375]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
});
