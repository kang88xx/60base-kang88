import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const origin = process.env.SAMPLE_BASE_URL || 'http://127.0.0.1:4411';
const output = path.resolve(process.env.SAMPLE_OUTPUT || '.artifacts/homepage-samples');
await mkdir(output, {recursive:true});
const expected = ['folding-clothes-2','dishwashing-10','cleaning-stove','cleaning-refrigerator','cleaning-desk','cleaning-desk-2','cleaning-fish-tank','cutting-vegetables','dishwashing','folding-clothes','vacuuming','folding-towels','dishwashing-2','cooking-tteokgalbi','cutting-apple','arranging-fruit','dishwashing-4','dishwashing-5','dishwashing-7'];
const dataset = 'https://huggingface.co/datasets/60base/korea-household-egocentric-samples';
const sampleUrl = id => `${dataset}/resolve/main/videos/${id}.mp4`;
const browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE || undefined});
const errors = [], checks = [], mediaRequests = [], mediaResponses = [], localSampleRequests = [];
const publicLocation = value => { const url = new URL(value); return {host:url.hostname,path:url.pathname}; };
function observe(page) {
  page.setDefaultTimeout(45000);
  page.on('pageerror',error=>errors.push(error.message.replace(/https?:\/\/[^\s"']+/g,value=>{const url=new URL(value);return url.origin+url.pathname;})));
  page.on('request',request=>{
    const url = new URL(request.url());
    const id = url.pathname.split('/').at(-1)?.replace(/\.mp4$/, '');
    if (url.origin === new URL(origin).origin && expected.includes(id) && url.pathname.endsWith('.mp4')) localSampleRequests.push(url.pathname);
    if (request.resourceType() === 'media') mediaRequests.push(publicLocation(request.url()));
  });
  page.on('response',response=>{
    if (response.request().resourceType() === 'media') mediaResponses.push({...publicLocation(response.url()),status:response.status()});
  });
}
try {
  for (const [width,language] of [[1440,'en'],[390,'ko'],[320,'ko'],[430,'en']]) {
    const page = await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce',serviceWorkers:'block'});
    observe(page);
    await page.goto(`${origin}/?lang=${language}#data`,{waitUntil:'domcontentloaded'});
    const cards = page.locator('#sample-catalog .catalog-card');
    await page.waitForFunction(()=>document.querySelectorAll('#sample-catalog .catalog-card').length===4);
    const expand = page.locator('.catalog-expand');
    assert.equal(await expand.getAttribute('aria-expanded'),'false');
    await expand.click();
    assert.equal(await cards.count(),19);
    assert.equal(await expand.getAttribute('aria-expanded'),'true');
    assert.equal(await cards.filter({has:page.locator('.catalog-tags span',{hasText:/^HOME$/})}).count(),7);
    assert.equal(await cards.filter({has:page.locator('.catalog-tags span',{hasText:/^KITCHEN$/})}).count(),12);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${width}px overflow`);
    for (const id of expected) {
      const card = cards.filter({has:page.locator(`img[src$="/${id}.jpg"]`)});
      assert.equal(await card.count(),1,`Exactly one card for ${id}`);
      assert.equal(await card.locator('a.editorial-hf').getAttribute('href'),`${dataset}/blob/main/videos/${id}.mp4`);
      if (![1440,390].includes(width))continue;
      await card.scrollIntoViewIfNeeded();
      await card.locator('.sample-image img').evaluate(img=>img.decode());
      await card.locator('.sample-image').click();
      await page.locator('.film-dialog[open]').waitFor();
      const video = page.locator('.film-dialog video');
      assert.equal(await video.getAttribute('src'),sampleUrl(id));
      await page.waitForFunction(()=>{const v=document.querySelector('.film-dialog video');return v?.readyState>=2;});
      const info = await video.evaluate(async v=>{await v.play();const url=new URL(v.currentSrc);return {duration:v.duration,muted:v.muted,width:v.videoWidth,sourceHost:url.hostname};});
      assert.ok(Math.abs(info.duration-20)<.1,`${id}: ${info.duration}s`);
      assert.equal(info.muted,true);
      assert.ok(info.width>=720);
      assert.notEqual(info.sourceHost,new URL(origin).hostname);
      await page.waitForFunction(()=>document.querySelector('.film-dialog video')?.currentTime>.15);
      await page.locator('.film-heading button').click();
      checks.push({width,language,id,source:sampleUrl(id),...info});
    }
    await page.locator('#data').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,`gallery-${width}-${language}.png`)});
    await expand.click();
    assert.equal(await cards.count(),4);
    await page.close();
  }
  const page = await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'no-preference',serviceWorkers:'block'});
  observe(page);
  await page.goto(`${origin}/?lang=en#data`,{waitUntil:'domcontentloaded'});
  await page.locator('.catalog-expand').click();
  const thumbnail = page.locator('.catalog-card').filter({has:page.locator('img[src$="/cooking-tteokgalbi.jpg"]')}).locator('.sample-image');
  const preview = thumbnail.locator('video');
  assert.equal(await preview.getAttribute('src'),null,'Hover preview is lazy before interaction');
  // Enter the viewport so the scroll-triggered card reveal can make hover actionable.
  await thumbnail.scrollIntoViewIfNeeded();
  await thumbnail.hover();
  await page.waitForFunction(()=>{
    const video=document.querySelector('img[src$="/cooking-tteokgalbi.jpg"]')?.parentElement.querySelector('video');
    return video?.currentTime>.15&&!video.paused;
  });
  assert.equal(await preview.getAttribute('src'),sampleUrl('cooking-tteokgalbi'));
  await thumbnail.click();
  await page.locator('.film-dialog[open]').waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('.catalog-preview-video')].every(video=>video.paused));
  const pausedAt = await preview.evaluate(video=>video.currentTime);
  await page.waitForFunction(()=>document.querySelector('.film-dialog video')?.currentTime>.15);
  assert.ok(Math.abs(await preview.evaluate(video=>video.currentTime)-pausedAt)<.05,'Background preview remains paused while the film plays');
  await page.locator('.film-heading button').click();
  await page.waitForFunction(time=>{
    const video=document.querySelector('img[src$="/cooking-tteokgalbi.jpg"]')?.parentElement.querySelector('video');
    return video&&!video.paused&&video.currentTime>time;
  },pausedAt);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(()=>{
    const video=document.querySelector('img[src$="/cooking-tteokgalbi.jpg"]')?.parentElement.querySelector('video');
    return video?.paused&&video.currentTime===0;
  });
  checks.push({type:'hover-preview',id:'cooking-tteokgalbi',source:sampleUrl('cooking-tteokgalbi'),lazy:true,modalSuspension:true,resumed:true,reducedMotionReset:true});
  await page.close();
  assert.deepEqual(localSampleRequests,[],'Catalog samples must not request local MP4 copies');
  for (const id of expected) assert.ok(mediaRequests.some(request=>request.host==='huggingface.co'&&request.path===new URL(sampleUrl(id)).pathname),`${id}: direct Hugging Face media request`);
  assert.deepEqual(errors,[]);
  await writeFile(path.join(output,'result.json'),JSON.stringify({origin,checks,errors,localSampleRequests,mediaRequests,mediaResponses},null,2));
  console.log(`PASS: ${checks.filter(check=>check.width).length} Hugging Face video playbacks; 19 samples (HOME 7 / KITCHEN 12), EN/KO, 4 viewport widths, hover/modal lifecycle, no local sample MP4 requests or page errors.`);
} finally {await browser.close();}
