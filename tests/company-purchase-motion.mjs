import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {chromium} from '/home/kang/.claude/skills/gstack/node_modules/playwright/index.mjs';

const base = process.env.COMPANY_TEST_URL || 'http://127.0.0.1:4373';
const out = process.env.COMPANY_REVIEW_DIR || '../.omx/reviews/homepage-public-polish-20260913/motion';
await mkdir(out, {recursive:true});
const browser = await chromium.launch();
const checks = [], errors = [];
try {
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  const step = page.locator('.process-panel-step').nth(3);
  const icon = step.locator('.delivery-review-icon');
  await step.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('.delivery-review-icon').getAnimations({subtree:true}).length === 3);
  await page.waitForFunction(() => document.querySelector('.delivery-review-icon').getAnimations({subtree:true}).length === 0);
  await step.click();
  assert.equal(await step.getAttribute('aria-expanded'), 'true');
  await page.waitForFunction(() => document.querySelector('.delivery-review-icon').getAnimations({subtree:true}).length === 3);
  await page.waitForTimeout(600);
  await step.screenshot({path:`${out}/review-in-motion.png`});
  await page.waitForFunction(() => document.querySelector('.delivery-review-icon').getAnimations({subtree:true}).length === 0);
  await step.screenshot({path:`${out}/review-complete.png`});
  for (const key of ['Enter','Space']) {
    await step.focus(); await page.keyboard.press(key);
    assert.equal(await icon.evaluate(el => el.getAnimations({subtree:true}).length),3);
    assert.equal(await page.locator('.process-panel-step[aria-expanded="true"]').count(),1);
  }
  await page.locator('.process-panel-step').first().click();
  assert.equal(await icon.evaluate(el => el.getAnimations({subtree:true}).length),0);
  checks.push('Viewport preview, click/tap replay, Enter/Space and cancellation on selecting another stage');
  await step.hover();
  assert.equal(await icon.evaluate(el => el.getAnimations({subtree:true}).length),3);
  await page.evaluate(() => window.scrollTo({top:0,behavior:'instant'}));
  await page.waitForFunction(() => document.querySelector('.delivery-review-icon').getAnimations({subtree:true}).length === 0);
  await step.click();
  await page.evaluate(() => {Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(await icon.evaluate(el => el.getAnimations({subtree:true}).length),0);
  await page.evaluate(() => {delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await step.click(); await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(() => document.querySelector('#purchase-process').getAnimations({subtree:true}).length === 0);
  await step.click();
  assert.equal(await icon.evaluate(el => el.getAnimations({subtree:true}).length),0);
  checks.push('Pointer replay; offscreen/hidden cancellation; live reduced-motion preference stops and suppresses animations');
  for (const width of [320,390,768,1024]) {
    await page.setViewportSize({width,height:1000});
    for (const lang of ['ko','en']) {
      if ((await page.locator('html').getAttribute('lang')) !== lang) await page.locator('#language-toggle').click();
      for (let i=0;i<4;i++) {
        const card = page.locator('.process-panel-step').nth(i);
        await card.click();
        const sizes=await card.locator('.panel-extra').evaluate(el=>({client:el.clientHeight,scroll:el.scrollHeight}));
        assert(sizes.scroll<=sizes.client+1, `expanded copy clipped at ${width} ${lang} step${i+1}`);
      }
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), `page overflow at ${width} ${lang}`);
    }
  }
  checks.push('All four expanded stages fit at320/390/768/1024 in Korean and English');
  await page.close();
  const staticPage = await browser.newPage({javaScriptEnabled:false});
  await staticPage.goto(base);
  assert.equal(await staticPage.locator('.delivery-review-icon use.DocumentWithCheckmarkIcon__check').count(),2);
  assert.equal(await staticPage.locator('#process-step-4').isVisible(),true);
  await staticPage.close();
  checks.push('No-JS still renders the original complete icon and delivery details');
  assert.deepEqual(errors,[]);
  await writeFile(`${out}/report.json`,JSON.stringify({base,checks,errors},null,2));
  console.log(`PASS purchase motion: ${checks.length} behavior groups.`);
} finally { await browser.close(); }
