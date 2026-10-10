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
async function open({ hash = '#home', reduced = false, offline = false, storageBlocked = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  if (offline) await context.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }));
  if (storageBlocked) await context.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) { if (key === 'ego.intro-d.20261011') throw new DOMException('Disabled', 'SecurityError'); return original.call(this, key, value); };
  });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
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
  assert.deepEqual(style, { background: 'rgb(243, 246, 253)', symbol: '76px', word: '46px', weight: '800', gap: '16px', tag: '14px', tagGap: '10px' });
  const started = Date.now();
  await normal.launch.waitFor({ state: 'hidden', timeout: 4000 });
  assert.ok(Date.now() - started > 1500, 'normal entry completes its motion before leaving');
  assert.equal(await normal.page.locator('#app-main').evaluate(node => node.inert), false);
  assert.equal(await normal.page.locator('.app-shell').getAttribute('data-screen'), 'welcome', 'intro completion does not bypass login');
  await normal.page.reload();
  assert.equal(await normal.launch.isHidden(), true, 'same tab reload/OAuth return does not replay');
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
  assert.equal(await deep.launch.isHidden(), true, 'deep-link session never starts a later intro');
  await deep.context.close();

  const motion = await open({ reduced: true });
  assert.equal(await motion.page.locator('.app-launch-flood').evaluate(node => getComputedStyle(node).display), 'none');
  assert.equal(await motion.page.locator('.app-launch-word').evaluate(node => getComputedStyle(node).animationName), 'none');
  await motion.launch.waitFor({ state: 'hidden', timeout: 1500 });
  assert.equal(await motion.page.locator('#app-main').evaluate(node => node.inert), false);
  await motion.context.close();

  for (const cause of ['dialog', 'error', 'hidden', 'offline', 'route']) {
    const item = await open(); await item.launch.waitFor({ state: 'visible' });
    await item.page.evaluate(async value => {
      if (value === 'dialog') { const node = document.createElement('dialog'); document.body.append(node); node.showModal(); }
      if (value === 'error') (await import('/app/launch.js')).updateLaunch({ error: 'fixture error' });
      if (value === 'hidden') { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); }
      if (value === 'offline') window.dispatchEvent(new Event('offline'));
      if (value === 'route') location.hash = 'education';
    }, cause);
    await item.launch.waitFor({ state: 'hidden' });
    assert.equal(await item.page.locator('#app-main').evaluate(node => node.inert), false, `${cause} restores the original inert state`);
    await item.context.close();
  }
  const offline = await open({ offline: true }); assert.equal(await offline.launch.isHidden(), true); await offline.context.close();
  const storage = await open({ storageBlocked: true }); await storage.page.getByRole('button', { name: '건너뛰기' }).click(); assert.equal(await storage.launch.isHidden(), true); await storage.context.close();
  assert.deepEqual(errors, []);
  console.log('PASS D intro lifecycle: exact dimensions, full bounded fast-start motion, login gate, once per tab/deep link, skip/focus/inert restoration, reduced motion, dialog/error/hidden/offline/route cleanup, blocked storage.');
} finally { await browser.close(); await service.close(); await rm(directory, { recursive: true, force: true }); }
