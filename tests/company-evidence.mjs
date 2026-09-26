import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const playwrightPath = process.env.PLAYWRIGHT_MODULE || resolve(homedir(), '.claude/skills/gstack/node_modules/playwright/index.mjs');
const {chromium} = await import(pathToFileURL(playwrightPath));
const base = process.env.COMPANY_TEST_URL || 'http://127.0.0.1:4373';
const out = process.env.COMPANY_REVIEW_DIR || '/mnt/j/01_Project/Egocentric/.omx/reviews/homepage-evidence-20260913/behavior';
await mkdir(out, {recursive: true});

const browser = await chromium.launch({headless: true});
const errors = [];
const checks = [];

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
}

async function assertRightsDetails(page) {
  await page.locator('#quality-tab-3').click();
  await page.waitForFunction(() => document.querySelector('#quality-tab-3')?.getAttribute('aria-selected') === 'true');
  const panel = page.locator('#standards [role="tabpanel"].quality-panel:not([hidden])');
  assert.equal(await panel.locator('#consent-example,[data-consent-field]').count(), 0, 'rights evidence no longer uses mock document highlights');
  const buttons = panel.locator('button[data-rights]');
  assert.deepEqual(await buttons.evaluateAll(items => items.map(button => ({
    id: button.id,
    rights: button.dataset.rights,
    pressed: button.getAttribute('aria-pressed'),
    controls: button.getAttribute('aria-controls'),
  }))), [0, 1, 2].map(index => ({
    id: `rights-option-${index}`,
    rights: String(index),
    pressed: String(index === 0),
    controls: `rights-detail-${index}`,
  })), 'rights options use the new three-button control contract');
  for (const index of [1, 2, 0]) {
    await buttons.nth(index).click();
    await page.waitForFunction(value => document.querySelector(`#rights-option-${value}`)?.getAttribute('aria-pressed') === 'true', index);
    assert.equal(await panel.locator('article.rights-detail:not([hidden])').getAttribute('id'), `rights-detail-${index}`);
    assert.match(await panel.locator('article.rights-detail:not([hidden])').innerText(), /동의|이용|사용|개인정보|보호|consent|usage|privacy/i);
  }
}

async function assertContactMailto(page) {
  assert.equal(await page.locator('#contact > .contact-heading').count(), 1);
  assert.equal(await page.locator('#contact > .contact-heading > .contact-email').count(), 1);
  assert.equal(await page.locator('#contact .contact-body,#contact .contact-info,#draft-copy,#draft-clear,#copy-email,.toast').count(), 0);
  assert.equal(await page.locator('#contact-form input, #contact-form textarea').count(), 4);

  await page.evaluate(() => localStorage.setItem('koreo:inquiry-draft', JSON.stringify({name: 'Legacy', email: 'old@example.com', message: 'Prior request'})));
  await page.reload({waitUntil: 'networkidle'});
  assert.equal(await page.locator('#f-name').inputValue(), 'Legacy');
  assert.equal(await page.locator('#f-email').inputValue(), 'old@example.com');
  assert.equal(await page.locator('#f-msg').inputValue(), 'Prior request');
  if (await page.locator('#f-type').count()) assert.equal(await page.locator('#f-type').inputValue(), '');
  assert.doesNotMatch(await page.locator('#form-status').innerText(), /불러왔|Restored/i);

  await page.locator('#f-type').fill('1인칭 RGB 영상 / 작업 구간 라벨');
  await page.locator('#f-msg').fill('주방 작업 1인칭 영상 요청');
  await page.reload({waitUntil: 'networkidle'});
  assert.equal(await page.locator('#f-type').inputValue(), '1인칭 RGB 영상 / 작업 구간 라벨');
  await page.locator('#language-toggle').click();
  assert.equal(await page.locator('#f-type').inputValue(), '1인칭 RGB 영상 / 작업 구간 라벨');
  await page.locator('#language-toggle').click();

  await page.evaluate(() => {
    window.__mail = [];
    const create = Document.prototype.createElement;
    Document.prototype.createElement = function captureAnchor(tag, ...args) {
      const node = create.call(this, tag, ...args);
      if (String(tag).toLowerCase() === 'a') {
        node.click = function captureClick() {
          if (String(this.href).startsWith('mailto:')) window.__mail.push(this.href);
        };
      }
      return node;
    };
    window.open = url => {
      if (String(url).startsWith('mailto:')) window.__mail.push(String(url));
      return null;
    };
  });
  await page.locator('#contact-form [type="submit"]').click();
  const mailto = await page.evaluate(() => window.__mail.at(-1) || '');
  assert.match(mailto, /^mailto:60base\.ai@gmail\.com\?/i);
  assert.match(decodeURIComponent(mailto.replace(/\+/g, ' ')), /1인칭 RGB 영상|주방 작업|Legacy|old@example\.com/);
  assert.match(await page.locator('#form-status').innerText(), /Review and send your inquiry in your email app\.|이메일 앱에서 (?:문의 )?내용을 확인한 뒤 보내주세요/);
}

async function assertVideoFacts(page) {
  const facts = await page.locator('.video-facts').evaluate(node => {
    const video = document.querySelector('#sample-video').getBoundingClientRect();
    const box = node.getBoundingClientRect();
    const fontSizes = [...node.querySelectorAll(':scope > span')].map(span => parseFloat(getComputedStyle(span).fontSize));
    return {left: box.left - video.left, top: box.top - video.top, fontSizes, width: innerWidth};
  });
  const expectedRange = facts.width > 760 ? [15, 17] : [12, 14];
  assert.ok(facts.left <= 24 && facts.top <= 24, `video facts sit top-left: ${JSON.stringify(facts)}`);
  assert.equal(facts.fontSizes.length, 2, 'environment/viewpoint facts render as two badges');
  assert.ok(facts.fontSizes.every(size => size >= expectedRange[0] && size <= expectedRange[1]), `video fact badges use responsive font size: ${JSON.stringify(facts)}`);
}

try {
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, {waitUntil: 'networkidle'});
  await settle(page);
  await assertVideoFacts(page);
  checks.push('Hero environment/viewpoint facts sit top-left with responsive badge sizing');
  assert.equal(await page.locator('[data-preview-video][src]').count(), 0, 'secondary footage is deferred before scrolling');
  await page.locator('.service-films').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => [...document.querySelectorAll('.service-film video')].every(video => !video.paused && video.currentTime > 0));
  assert.equal(await page.locator('.service-film').count(), 3);
  await page.locator('.service-film video').first().evaluate(video => video.pause());
  await page.locator('#contact').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-preview-video]')].every(video => video.paused));
  await page.locator('.service-films').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => !document.querySelectorAll('.service-film video')[1].paused);
  assert.equal(await page.locator('.service-film video').first().evaluate(video => video.paused), true, 'manual pause is respected');
  checks.push('Authentic service videos load and play only in view; manual pause persists');

  await page.locator('#quality-tab-2').click();
  await page.locator('#annotation-video').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('#annotation-video').readyState >= 2);
  for (const [index, start] of [[1, 3], [2, 5.5], [3, 8.5], [4, 14]]) {
    await page.locator(`[data-phase="${index}"]`).click();
    await page.waitForFunction(({phase, startAt}) => {
      const video = document.querySelector('#annotation-video');
      return !video.paused && video.currentTime >= startAt && video.currentTime < startAt + 1.5 &&
        document.querySelector(`[data-phase="${phase}"]`).getAttribute('aria-pressed') === 'true';
    }, {phase: index, startAt: start});
  }
  await page.locator('#annotation-video').evaluate(video => { video.pause(); video.currentTime = 6.2; });
  await page.waitForFunction(() => document.querySelector('[data-phase="2"]').getAttribute('aria-pressed') === 'true');
  assert.match(await page.locator('#annotation-clock').innerText(), /00:06/);
  checks.push('Annotation phase seek, native seeking, playback highlight and clock');

  await assertRightsDetails(page);
  checks.push('Rights tab uses condition details instead of mock signed documents');

  await assertContactMailto(page);
  checks.push('Contact keeps old-compatible draft storage and submits through mailto only');
  await page.close();

  const reduced = await browser.newPage({viewport: {width: 390, height: 1000}, reducedMotion: 'reduce'});
  reduced.on('pageerror', error => errors.push(error.message));
  await reduced.goto(base, {waitUntil: 'networkidle'});
  await assertVideoFacts(reduced);
  await reduced.locator('#quality-tab-2').click();
  await reduced.locator('#annotation-video').scrollIntoViewIfNeeded();
  await reduced.waitForFunction(() => document.querySelector('#annotation-video').readyState >= 1);
  assert.equal(await reduced.locator('#annotation-video').evaluate(video => video.paused), true);
  await reduced.locator('[data-phase="4"]').click();
  await reduced.waitForFunction(() => document.querySelector('#annotation-video').currentTime >= 14 && !document.querySelector('#annotation-video').paused);
  assert.equal(await reduced.locator('#annotation-video').evaluate(video => {
    const rect = video.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < innerHeight;
  }), true, 'mobile phase selection reveals the video');
  await reduced.locator('.service-films').scrollIntoViewIfNeeded();
  const rail = await reduced.locator('.service-films').evaluate(element => ({
    scrollable: element.scrollWidth > element.clientWidth,
    body: document.documentElement.scrollWidth <= innerWidth,
  }));
  assert.ok(rail.scrollable && rail.body);
  await reduced.screenshot({path: `${out}/mobile-service-rail.png`});
  checks.push('Reduced-motion explicit playback and mobile service rail');
  await reduced.close();

  const nojs = await browser.newPage({javaScriptEnabled: false, viewport: {width: 390, height: 1000}});
  await nojs.goto(base, {waitUntil: 'load'});
  assert.equal(await nojs.locator('.preview-fallback').count(), 5);
  assert.equal(await nojs.locator('#standards article.rights-detail').count(), 3);
  assert.equal(await nojs.locator('#standards article.rights-detail').evaluateAll(nodes => nodes.every(node => {
    const style = getComputedStyle(node);
    return !!node.offsetParent && style.display !== 'none' && style.visibility !== 'hidden';
  })), true);
  assert.equal(await nojs.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await nojs.close();
  checks.push('No-JS poster links and all three rights details remain available');

  assert.deepEqual(errors, []);
  await writeFile(`${out}/report.json`, JSON.stringify({status: 'passed', base, checks, errors}, null, 2));
  console.log(`PASS evidence components: ${checks.length} behavior groups.`);
} finally {
  await browser.close();
}
