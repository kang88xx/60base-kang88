import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || path.join(os.homedir(), '.claude/skills/gstack/node_modules/playwright/index.mjs')));
const workspace = fileURLToPath(new URL('../', import.meta.url));
const roots = ['app'];
const server = createServer(async (request, response) => {
  const [, index, file] = request.url.split('/');
  if (!roots[index] || !['launch.js', 'launch.css'].includes(file)) {
    response.writeHead(404).end(); return;
  }
  response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/css');
  response.end(await readFile(path.join(workspace, roots[index], file)));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const errors = [];
async function open(index, { reduced = false, native = true, failure = '', delayed = false, paused = false } = {}) {
  const page = await browser.newPage({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  await page.evaluate(({ native, failure, delayed }) => {
    window.pulses = []; window.cycles = [];
    if (native) window.Capacitor = {
      isNativePlatform: () => true,
      isPluginAvailable: name => name === 'EgoTabHaptics',
      registerPlugin: name => {
        if (name !== 'EgoTabHaptics') throw Error('Wrong plugin');
        return { impact: () => {
          window.pulses.push(performance.now());
          if (failure === 'throw') throw Error('Unavailable');
          return failure === 'reject' ? Promise.reject(Error('Unavailable')) : Promise.resolve();
        } };
      },
    };
    if (delayed) document.fonts.load = () => new Promise(resolve => { window.releaseAssets = resolve; });
  }, { native, failure, delayed });
  await page.setContent(`<link rel="stylesheet" href="${origin}/${index}/launch.css">
    ${paused ? '<style>.app-launch.is-playing .app-launch-eyes{animation-play-state:paused}</style>' : ''}
    <div><main id="app-main" tabindex="-1"></main><div id="app-launch" class="app-launch" hidden>
    <div class="app-launch-stage"><svg class="app-launch-symbol" viewBox="0 0 76 76">
    <g class="app-launch-blob"><circle cx="38" cy="38" r="30"/></g>
    <g class="app-launch-eyes"><circle cx="28" cy="38" r="6"/><circle cx="48" cy="38" r="6"/></g></svg>
    <div class="app-launch-word">EGO</div><div class="app-launch-tag">Intro</div></div>
    <div class="app-launch-flood"></div><button class="app-launch-continue">Skip</button></div></div>`);
  await page.evaluate(async url => {
    const eyes = document.querySelector('.app-launch-eyes');
    for (const type of ['animationstart', 'animationiteration']) eyes.addEventListener(type, event => {
      if (event.animationName === 'ego-intro-blink') window.cycles.push(performance.now());
    });
    await import(url);
  }, `${origin}/${index}/launch.js`);
  return page;
}
try {
  for (const index of roots.keys()) {
    const normal = await open(index, { delayed: true });
    await normal.waitForTimeout(300);
    assert.equal(await normal.evaluate(() => pulses.length), 0, 'no feedback before assets');
    await normal.evaluate(() => releaseAssets([]));
    await normal.waitForFunction(() => document.querySelector('#app-launch').hidden);
    const result = await normal.evaluate(() => ({ pulses, cycles }));
    assert.equal(result.pulses.length, 2, roots[index]);
    assert.equal(result.cycles.length, 2);
    result.pulses.forEach((pulse, i) => assert.ok(Math.abs(pulse - result.cycles[i]) < 25, 'pulse follows actual animation event'));
    assert.ok(result.pulses[1] - result.pulses[0] >= 200, 'two distinct blink cycles');
    await normal.close();

    for (const options of [{ reduced: true }, { native: false }, { paused: true }]) {
      const page = await open(index, options);
      await page.waitForFunction(() => document.querySelector('#app-launch').hidden);
      assert.equal(await page.evaluate(() => pulses.length), 0, JSON.stringify(options));
      await page.close();
    }
    for (const cause of ['route', 'hidden', 'pagehide', 'reduced', 'dialog', 'element-hidden', 'animation-cancel']) {
      const page = await open(index);
      // Shorten only the initial delay, leaving a generous cancellation window.
      await page.addStyleTag({ content: '.app-launch.is-playing .app-launch-eyes{animation:ego-intro-blink .6s ease-in-out .1s 2}' });
      await page.waitForFunction(() => pulses.length === 1);
      if (cause === 'reduced') await page.emulateMedia({ reducedMotion: 'reduce' });
      else await page.evaluate(cause => {
        if (cause === 'route') window.dispatchEvent(new Event('hashchange'));
        if (cause === 'pagehide') window.dispatchEvent(new Event('pagehide'));
        if (cause === 'hidden') {
          Object.defineProperty(document, 'hidden', { get: () => true });
          document.dispatchEvent(new Event('visibilitychange'));
        }
        if (cause === 'dialog') { const dialog = document.createElement('dialog'); document.body.append(dialog); dialog.showModal(); }
        if (cause === 'element-hidden') document.querySelector('#app-launch').hidden = true;
        if (cause === 'animation-cancel') document.querySelector('.app-launch-eyes').style.animation = 'none';
      }, cause);
      await page.waitForTimeout(800);
      assert.equal(await page.evaluate(() => pulses.length), 1, `${cause} cancels remaining pulse`);
      await page.close();
    }
    for (const failure of ['throw', 'reject']) {
      const page = await open(index, { failure });
      await page.addStyleTag({ content: '.app-launch.is-playing .app-launch-eyes{animation:ego-intro-blink .1s ease-in-out .1s 2}' });
      await page.waitForFunction(() => document.querySelector('#app-launch').hidden);
      assert.equal(await page.evaluate(() => pulses.length), 2);
      await page.close();
    }
    console.log(`PASS ${roots[index]}: two animation-synchronized impacts, readiness, cancellation, reduced motion, optional bridge failures`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
