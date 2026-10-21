import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

for (const scale of [1, 1.25, 1.5]) test(`picker keeps many source thumbnails and names in cards at ${scale * 100}% emulated scale`, async ({ browser }) => {
  const context=await browser.newContext({deviceScaleFactor:scale});
  const page=await context.newPage();
  await page.addInitScript(() => {
    Object.assign(window,{screenPicker:{sources:async()=>({audio:true,sources:Array.from({length:24},(_,i)=>({id:`window:${i}`,kind:'window',name:`Aplicativo ${i} — nome muito longo que deve permanecer dentro do cartão sem comprimir as outras fontes`,thumbnail:i===0?null:`data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#28463d"/><text x="40" y="80" fill="white" font-size="40">Janela de teste</text></svg>')}`}))}),cancel:async()=>{},choose:async()=>({ok:true})}});
  });
  try {
    await page.goto(pathToFileURL(path.resolve('desktop/picker.html')).href);
    await page.getByRole('tab',{name:'Janelas',exact:true}).click();
    await mkdir('.generated/review/picker',{recursive:true});
    for(const width of [780,520]) {
      await page.setViewportSize({width,height:460});
      const dimensions=await page.evaluate(()=>{
        const panel=document.querySelector('#sources')!;
        const cards=[...panel.querySelectorAll('.source')];
        const rect=(e:Element)=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height,bottom:b.bottom,right:b.right};};
        return {panel:rect(panel),scroll:panel.scrollHeight>panel.clientHeight,footer:rect(document.querySelector('footer')!),cards:cards.map(card=>({card:rect(card),frame:rect(card.querySelector('.thumbnail')!),name:rect(card.querySelector('.source-name')!),image:card.querySelector('img')?rect(card.querySelector('img')!):null})),columns:getComputedStyle(panel).gridTemplateColumns.split(' ').length};
      });
      expect(dimensions.columns).toBe(width>600?2:1);
      expect(dimensions.scroll).toBe(true);expect(dimensions.panel.bottom).toBeLessThan(dimensions.footer.y);
      expect(dimensions.footer.bottom).toBeLessThanOrEqual(460);
      for(const {card,frame,name,image} of dimensions.cards) {
        expect(frame.width/frame.height).toBeCloseTo(16/9,1);
        expect(name.y).toBeGreaterThanOrEqual(frame.bottom);expect(name.height).toBe(24);expect(card.bottom).toBeGreaterThan(name.bottom);
        if(image){expect(image.bottom).toBeLessThanOrEqual(frame.bottom+1);expect(image.right).toBeLessThanOrEqual(frame.right+1);}
      }
      await expect(page.locator('.fallback:not([hidden])')).toHaveText('Prévia indisponível · a janela pode estar minimizada');
      await page.locator('.source').first().click();
      await expect(page.locator('.source').first()).toHaveAttribute('aria-pressed','true');
      await page.locator('.source').first().press('ArrowRight');await expect(page.locator('.source').nth(1)).toBeFocused();
      await page.screenshot({path:`.generated/review/picker/${width}-${scale}.png`});
    }
  } finally {await context.close();}
});
