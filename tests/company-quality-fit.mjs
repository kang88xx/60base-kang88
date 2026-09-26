import assert from 'node:assert/strict';
import {chromium} from '/home/kang/.claude/skills/gstack/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
const out=(process.env.COMPANY_REVIEW_DIR || '/mnt/j/01_Project/Egocentric/.omx/reviews/quality-panel-fit-20260913')+'/';
await fs.mkdir(out,{recursive:true});
const base=process.env.COMPANY_TEST_URL||'http://127.0.0.1:4375';
const browser=await chromium.launch();const rows=[],errors=[];
for(const width of [320,390,768,1024,1440]){
 const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.locator('.header-contact').innerText(),'데이터 문의');
 assert.equal(await page.title(),'60BASE | 행동 데이터 구매·맞춤 수집');
 const og=await page.locator('meta[property="og:image"]').getAttribute('content');
 assert.match(og,/^https:\/\/60base\.kr\/assets\/social\//);
 if(width===320){
  const response=await page.request.get(base+new URL(og).pathname);assert(response.ok());const png=await response.body();
  assert.equal(png.readUInt32BE(16),1200);assert.equal(png.readUInt32BE(20),630);
  assert.equal(await page.locator('meta[property="og:title"]').getAttribute('content'),await page.title());
  assert.equal(await page.locator('meta[name="twitter:title"]').getAttribute('content'),await page.title());
 }

 for(const lang of ['ko','en']){
  if(lang==='en')await page.locator('#language-toggle').click();
  for(let tab=0;tab<4;tab++){
   await page.locator('.quality-nav-button').nth(tab).click();await page.locator('.quality-panel:visible').scrollIntoViewIfNeeded();
   await page.waitForTimeout(100);
   const metrics=await page.evaluate(({width,lang,tab})=>{
    const p=document.querySelector('.quality-panel:not([hidden])'),nav=document.querySelector('.quality-nav'),content=p.lastElementChild;
    const relevant=[content,...p.querySelectorAll('.annotation-log,.phase-list,.rights-points,.rights-details,.rights-detail:not([hidden]),.delivery-artifact,.artifact-content')];
    return {width,lang,tab,navHeight:nav.offsetHeight,panelHeight:p.offsetHeight,overflow:document.documentElement.scrollWidth>innerWidth,overflows:relevant.filter(e=>e.scrollHeight>e.clientHeight+2||e.scrollWidth>e.clientWidth+2).map(e=>({class:e.className,w:e.clientWidth,sw:e.scrollWidth,h:e.clientHeight,sh:e.scrollHeight})),title:document.title,cta:document.querySelector('.header-contact').textContent};
   },{width,lang,tab});rows.push(metrics);
   assert.equal(metrics.overflow,false,`page overflow ${width} ${lang}`);
   if(width>960)assert.equal(metrics.panelHeight,metrics.navHeight,`menu/panel height ${width} ${lang} ${tab}`);
   assert.deepEqual(metrics.overflows,[],`content overflow ${width} ${lang} ${tab}`);
   if(tab===2){
    for(const choice of [1,2,0]){
     await page.locator(`[data-rights="${choice}"]`).click();
     const overflow=await page.locator('.quality-panel:visible .rights-evidence,.quality-panel:visible .rights-details,.rights-detail:visible').evaluateAll(items=>items.some(e=>e.scrollHeight>e.clientHeight+2||e.scrollWidth>e.clientWidth+2));
     assert.equal(overflow,false,`rights choice ${choice} overflow ${width} ${lang}`);
    }
   }
   if(tab===3){
    for(const choice of [1,2,0]){
     await page.locator(`[data-delivery="${choice}"]`).click();
     const overflow=await page.locator('.quality-panel:visible .delivery-evidence, .quality-panel:visible .artifact-content').evaluateAll(items=>items.some(e=>e.scrollHeight>e.clientHeight+2||e.scrollWidth>e.clientWidth+2));
     assert.equal(overflow,false,`delivery choice ${choice} overflow ${width} ${lang}`);
    }
   }

   if([390,1440].includes(width)){
    if(tab<2)await page.waitForFunction(()=>[...document.querySelectorAll('.quality-panel:not([hidden]) video')].every(v=>v.readyState>=4));
    await page.waitForTimeout(1200);await page.mouse.move(0,0);
    await page.locator('.quality-console').screenshot({path:`${out}quality-${width}-${lang}-${tab}.png`});
   }
  }
  await page.locator('#quality-tab-2').click();
  await page.locator('#annotation-video').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('#annotation-video').readyState>=1);
  await page.locator('#annotation-video').evaluate(v=>{v.pause();v.currentTime=6.2;});
  await page.waitForFunction(()=>document.querySelector('[data-phase="2"]').getAttribute('aria-pressed')==='true');
  assert.equal(await page.locator('#annotation-action').textContent(),await page.locator('[data-phase="2"] .phase-description').textContent());
 }
 await page.close();
}
await browser.close();assert.deepEqual(errors,[]);await fs.writeFile(out+'layout.json',JSON.stringify({rows,errors},null,2));console.log(JSON.stringify({cases:rows.length,issues:rows.filter(x=>x.overflow||x.overflows.length),errors}));
