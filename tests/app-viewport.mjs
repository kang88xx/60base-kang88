import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createService } from '../server/app.mjs';

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || path.join(os.homedir(), '.claude/skills/gstack/node_modules/playwright/index.mjs')));
const directory = await mkdtemp(path.join(os.tmpdir(), 'ego-viewport-'));
const origin = 'http://127.0.0.1:4398', service = createService({ directory, origin });
await new Promise(resolve => service.server.listen(4398, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 390, height: 400 }, { width: 844, height: 390 }, { width: 800, height: 900 }]) {
    const page = await browser.newPage({ viewport });
    await page.goto(origin + '/app/#home');
    await page.getByRole('button', { name: '건너뛰기' }).click();
    await page.locator('.ego-welcome').waitFor();
    // The iOS welcome has one additional Apple action and safe-area padding.
    await page.evaluate(() => {
      const google = document.querySelector('[data-provider=google]');
      const apple = google.cloneNode(true); apple.dataset.provider = 'apple'; apple.textContent = 'Apple로 계속하기'; google.before(apple);
      document.querySelector('.ego-welcome').style.paddingTop = '59px';
      document.querySelector('.ego-welcome').style.paddingBottom = '56px';
    });
    const bounds = await page.evaluate(() => {
      const main = document.querySelector('#app-main'), welcome = document.querySelector('.ego-welcome');
      return { documentHeight: document.documentElement.scrollHeight, viewportHeight: innerHeight, documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, mainHeight: main.clientHeight, mainScroll: main.scrollHeight, welcomeHeight: welcome.offsetHeight, overscroll: getComputedStyle(main).overscrollBehaviorY };
    });
    assert.ok(bounds.documentHeight <= bounds.viewportHeight, `outer page must not scroll: ${JSON.stringify({ viewport, bounds })}`);
    assert.ok(bounds.documentWidth <= bounds.viewportWidth, 'outer page must not pan horizontally');
    assert.equal(bounds.overscroll, 'none');
    if (viewport.width === 390 && viewport.height === 844) assert.ok(bounds.mainScroll <= bounds.mainHeight + 1, `full-height iPhone welcome fits: ${JSON.stringify(bounds)}`);
    if (viewport.height <= 568) {
      await page.locator('#app-main').evaluate(node => { node.scrollTop = node.scrollHeight; });
      assert.ok(await page.locator('#app-main').evaluate(node => node.scrollTop > 0), 'short viewport keeps inner scrolling');
      await page.locator('.welcome-legal').scrollIntoViewIfNeeded();
      await page.getByRole('button', { name: '이메일로 계속하기' }).scrollIntoViewIfNeeded();
      assert.ok(await page.getByRole('button', { name: '이메일로 계속하기' }).evaluate(node => { const rect = node.getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= innerHeight; }), 'email action remains reachable');
    }
    await page.close();
  }
  console.log('PASS viewport: iPhone safe-area welcome fits, no document pan/scroll, short/keyboard/landscape views retain inner scrolling, desktop frame fits.');
} finally { await browser.close(); await service.close(); await rm(directory, { recursive: true, force: true }); }
