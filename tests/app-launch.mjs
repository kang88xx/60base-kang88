import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createService } from '../server/app.mjs';

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || path.join(os.homedir(), '.claude/skills/gstack/node_modules/playwright/index.mjs')));
const directory = await mkdtemp(path.join(os.tmpdir(), 'ego-intro-lifecycle-'));
const origin = 'http://127.0.0.1:4399', service = createService({ directory, origin });
await new Promise(resolve => service.server.listen(4399, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true }), errors = [];
async function open({ hash = '#home', reduced = false, offline = false, fontDelay = 0 } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  if (offline) await context.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }));
  await context.addInitScript(() => {
    new MutationObserver(() => {
      const launch = document.querySelector('#app-launch');
      if (launch?.classList.contains('is-playing') && !window.introPlayedAt) window.introPlayedAt = performance.now();
      if (window.introPlayedAt && launch?.hidden && !window.introHiddenAt) window.introHiddenAt = performance.now();
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
  });
  const page = await context.newPage();
  if (fontDelay) await page.route('**/inter-tight-latin-variable.woff2', async route => {
    await new Promise(resolve => setTimeout(resolve, fontDelay));
    await route.continue();
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/app/' + hash, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => import('/app/launch.js'));
  return { context, page, launch: page.locator('#app-launch') };
}
try {
  const normal = await open();
  await normal.launch.waitFor({ state: 'visible' });
  assert.equal(await normal.page.locator('#app-main').evaluate(node => node.inert), true);
  await normal.page.waitForFunction(async () => !(await import('/app/service.js')).getAppState().loading);
  assert.equal(await normal.launch.isVisible(), true, 'fast API readiness does not cancel the selected motion');
  const style = await normal.page.evaluate(() => {
    const css = selector => getComputedStyle(document.querySelector(selector));
    return { background: css('#app-launch').backgroundColor, symbol: css('.app-launch-symbol').width, word: css('.app-launch-word').fontSize, weight: css('.app-launch-word').fontWeight, gap: css('.app-launch-word').marginTop, tag: css('.app-launch-tag').fontSize, tagGap: css('.app-launch-tag').marginTop };
  });
  assert.deepEqual(style, { background: 'rgb(0, 10, 102)', symbol: '76px', word: '46px', weight: '800', gap: '16px', tag: '14px', tagGap: '10px' });
  await normal.launch.waitFor({ state: 'hidden', timeout: 4000 });
  assert.ok(await normal.page.evaluate(() => introHiddenAt - introPlayedAt >= 3000), 'ready artwork remains visible for at least 3 seconds');
  assert.equal(await normal.page.locator('#app-main').evaluate(node => node.inert), false);
  assert.equal(await normal.page.locator('.app-shell').getAttribute('data-screen'), 'welcome', 'intro completion does not bypass login');
  await normal.page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
  assert.equal(await normal.launch.isHidden(), true, 'foreground/account refresh does not replay');
  await normal.page.reload();
  await normal.launch.waitFor({ state: 'visible' });
  await normal.page.getByRole('button', { name: '건너뛰기' }).click();
  await normal.context.close();

  const skip = await open();
  await skip.page.getByRole('button', { name: '건너뛰기' }).click();
  assert.equal(await skip.launch.isHidden(), true);
  assert.equal(await skip.page.evaluate(() => document.activeElement.id), 'app-main');
  assert.equal(await skip.page.locator('.skip-link').evaluate(node => node.inert), false);
  await skip.page.evaluate(() => { location.hash = 'ranking'; window.dispatchEvent(new Event('focus')); });
  assert.equal(await skip.launch.isHidden(), true);
  await skip.context.close();

  const deep = await open({ hash: '#profile' });
  assert.equal(await deep.launch.isHidden(), true);
  await deep.page.evaluate(() => { location.hash = 'home'; });
  await deep.page.reload();
  await deep.launch.waitFor({ state: 'visible' });
  await deep.page.getByRole('button', { name: '건너뛰기' }).click();
  await deep.context.close();

  const motion = await open({ reduced: true });
  await motion.page.waitForFunction(() => document.querySelector('#app-launch').classList.contains('is-playing'));
  assert.equal(await motion.page.locator('.app-launch-flood').evaluate(node => getComputedStyle(node).display), 'none');
  assert.equal(await motion.page.locator('.app-launch-word').evaluate(node => getComputedStyle(node).animationName), 'none');
  await motion.launch.waitFor({ state: 'hidden', timeout: 4000 });
  assert.ok(await motion.page.evaluate(() => introHiddenAt - introPlayedAt >= 3000), 'reduced motion keeps the same static 3-second minimum');
  assert.equal(await motion.page.locator('#app-main').evaluate(node => node.inert), false);
  await motion.context.close();

  for (const cause of ['dialog', 'hidden', 'route']) {
    const item = await open(); await item.launch.waitFor({ state: 'visible' });
    await item.page.evaluate(async value => {
      if (value === 'dialog') { const node = document.createElement('dialog'); document.body.append(node); node.showModal(); }
      if (value === 'hidden') { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); }
      if (value === 'route') location.hash = 'education';
    }, cause);
    await item.launch.waitFor({ state: 'hidden' });
    assert.equal(await item.page.locator('#app-main').evaluate(node => node.inert), false, `${cause} restores the original inert state`);
    await item.context.close();
  }
  const delayed = await open({ fontDelay: 1700 });
  await delayed.page.waitForFunction(() => window.introPlayedAt > 0);
  assert.ok(await delayed.page.evaluate(() => introPlayedAt >= 1700), 'animation waits for the delayed intro font');
  await delayed.page.evaluate(async () => (await import('/app/launch.js')).updateLaunch({ error: 'fixture unavailable', accountConnectionError: 'fixture unavailable' }));
  assert.equal(await delayed.launch.isVisible(), true, 'background API failures do not shorten the intro');
  await delayed.launch.waitFor({ state: 'hidden', timeout: 4000 });
  assert.ok(await delayed.page.evaluate(() => introHiddenAt - introPlayedAt >= 3000), 'font loading time is excluded from the visible minimum');
  await delayed.context.close();
  const callback = await open({ hash: '?code=fixture&state=fixture#home' });
  assert.equal(await callback.launch.isHidden(), true, 'OAuth callback document does not replay intro');
  await callback.context.close();
  const offline = await open({ offline: true });
  await offline.launch.waitFor({ state: 'visible' });
  await offline.page.waitForFunction(() => window.introPlayedAt > 0);
  await offline.page.evaluate(async () => {
    window.dispatchEvent(new Event('offline'));
    (await import('/app/launch.js')).updateLaunch({ error: 'offline fixture' });
  });
  assert.equal(await offline.launch.isVisible(), true, 'offline startup and connection updates preserve the intro');
  await offline.launch.waitFor({ state: 'hidden', timeout: 4000 });
  assert.ok(await offline.page.evaluate(() => introHiddenAt - introPlayedAt >= 3000), 'offline cold start keeps the 3-second minimum');
  assert.equal(await offline.page.locator('#app-main').evaluate(node => node.inert), false);
  await offline.context.close();
  assert.deepEqual(errors, []);
  console.log('PASS D intro lifecycle: 3 seconds after delayed font readiness, every cold reload, reduced motion minimum, callback/deep-link exclusion, login gate, skip/focus/inert restoration, API failure, offline-start minimum, dialog/hidden/route cleanup.');
} finally { await browser.close(); await service.close(); await rm(directory, { recursive: true, force: true }); }
