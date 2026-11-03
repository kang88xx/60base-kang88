import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const origin = process.env.SAMPLE_BASE_URL || 'http://127.0.0.1:4411';
const output = path.resolve(process.env.SAMPLE_OUTPUT || '.artifacts/homepage-samples');
await mkdir(output, {recursive:true});
const expected = ['folding-clothes-2','dishwashing-10','cleaning-stove','cleaning-refrigerator','cleaning-desk','cleaning-desk-2','cleaning-fish-tank'];
const browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE || undefined});
const errors = [], checks = [];
try {
  for (const [width,language] of [[1440,'en'],[390,'ko'],[320,'ko'],[430,'en']]) {
    const page = await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce',serviceWorkers:'block'});
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${origin}/?lang=${language}#data`,{waitUntil:'domcontentloaded'});
    const cards = page.locator('#sample-catalog .catalog-card');
    await page.waitForFunction(()=>document.querySelectorAll('#sample-catalog .catalog-card').length===4);
    const expand = page.locator('.catalog-expand');
    assert.equal(await expand.getAttribute('aria-expanded'),'false');
    await expand.click();
    assert.equal(await cards.count(),13);
    assert.equal(await expand.getAttribute('aria-expanded'),'true');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${width}px overflow`);
    for (const id of expected) {
      const card = cards.filter({has:page.locator(`img[src$="/${id}.jpg"]`)});
      assert.equal(await card.count(),1,`Exactly one card for ${id}`);
      assert.equal(await card.locator('a.editorial-hf').getAttribute('href'),`https://huggingface.co/datasets/60base/korea-household-egocentric-samples/blob/main/videos/${id}.mp4`);
      if (![1440,390].includes(width))continue;
      await card.scrollIntoViewIfNeeded();
      await card.locator('.sample-image img').evaluate(img=>img.decode());
      await card.locator('.sample-image').click();
      await page.locator('.film-dialog[open]').waitFor();
      const video = page.locator('.film-dialog video');
      await page.waitForFunction(()=>{const v=document.querySelector('.film-dialog video');return v?.readyState>=2;});
      const info = await video.evaluate(async v=>{await v.play();return {duration:v.duration,muted:v.muted,width:v.videoWidth,src:v.currentSrc};});
      assert.ok(Math.abs(info.duration-20)<.1,`${id}: ${info.duration}s`);
      assert.equal(info.muted,true);
      assert.ok(info.width>=720);
      assert.ok(info.src.endsWith(`/${id}.mp4`));
      await page.waitForFunction(()=>document.querySelector('.film-dialog video')?.currentTime>.15);
      await page.locator('.film-heading button').click();
      checks.push({width,language,id,...info});
    }
    await page.locator('#data').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,`gallery-${width}-${language}.png`)});
    await expand.click();
    assert.equal(await cards.count(),4);
    await page.close();
  }
  assert.deepEqual(errors,[]);
  await writeFile(path.join(output,'result.json'),JSON.stringify({origin,checks,errors},null,2));
  console.log(`PASS: ${checks.length} video playbacks; 13 samples reachable, EN/KO, 4 viewport widths, no page errors.`);
} finally {await browser.close();}
