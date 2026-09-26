import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';

const playwrightPath = process.env.PLAYWRIGHT_MODULE || resolve(homedir(), '.claude/skills/gstack/node_modules/playwright/index.mjs');
const {chromium} = await import(pathToFileURL(playwrightPath));
const url = process.env.COMPANY_TEST_URL || 'http://127.0.0.1:4317';
const out = resolve(process.env.COMPANY_REVIEW_DIR || new URL('../../.omx/reviews/homepage-motion-20260913', import.meta.url).pathname);
const server = process.env.COMPANY_TEST_URL ? null : spawn(process.execPath, ['dev-server.mjs'], {
  cwd: new URL('../', import.meta.url),
  env: {...process.env, PORT: '4317'},
  stdio: 'ignore',
});

const sections = ['data', 'services', 'standards', 'about'];
const samples = ['cutting-vegetables', 'dishwashing', 'folding-clothes', 'vacuuming', 'folding-towels', 'dishwashing-2'];
const labelPatterns = {
  'dishwashing-2': {environment: /주방|kitchen/i, action: /헹구기|식기|rinsing|dishes/i},
  'folding-towels': {environment: /거실|living room/i, action: /수건|접고|fold|towels/i},
  vacuuming: {environment: /거실|living room/i, action: /청소기|바닥|vacuum|floor/i},
  dishwashing: {
    environment: /주방|kitchen/i,
    action: /설거지|식기|물|dish|washing|sink/i,
  },
  'folding-clothes': {
    environment: /세탁|의류|laundry|clothing/i,
    action: /빨래|옷|개기|fold|clothes|laundry/i,
  },
  'cutting-vegetables': {
    environment: /주방|kitchen/i,
    action: /채소|손질|썰기|vegetable|cut|prep/i,
  },
};
const viewports = [
  {name: '320', width: 320, height: 844},
  {name: '390', width: 390, height: 844},
  {name: '768', width: 768, height: 1000},
  {name: '1024', width: 1024, height: 900},
  {name: '1440', width: 1440, height: 1000},
];

let browser;
const results = [];

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error(`Server did not respond: ${url}`);
}

function recordPageErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function installMotionRecorder(context) {
  await context.addInitScript(() => {
    window.__motionCalls = [];
    const originalAnimate = Element.prototype.animate;
    Element.prototype.animate = function recordedAnimate(keyframes, options) {
      window.__motionCalls.push({
        id: this.id || '',
        className: typeof this.className === 'string' ? this.className : '',
        reveal: this.hasAttribute('data-reveal'),
        tag: this.tagName,
        time: performance.now(),
        duration: typeof options === 'number' ? options : options?.duration,
      });
      return originalAnimate.call(this, keyframes, options);
    };
  });
}

async function noOverflow(page, width, label) {
  const state = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll('body *')]
      .filter(element => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && element.scrollWidth > element.clientWidth + 2;
      })
      .slice(0, 12)
      .map(element => ({
        tag: element.tagName,
        id: element.id,
        className: String(element.className),
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      })),
  }));
  assert.ok(state.documentWidth <= width + 1, `${label} has no horizontal overflow: ${JSON.stringify(state)}`);
}

async function assertReducedMotionScrollBehavior(page, motion, label) {
  if (motion !== 'reduced') return;
  const behavior = await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
  assert.equal(behavior, 'auto', `${label} disables native smooth anchor scrolling in reduced motion`);
}

async function useLanguage(page, lang) {
  const current = await page.locator('html').getAttribute('lang');
  if (current !== lang) await page.locator('#language-toggle').click();
  assert.equal(await page.locator('html').getAttribute('lang'), lang, `language is ${lang}`);
}

async function assertHeader(page, viewport, lang) {
  assert.equal(await page.locator('header.header-shell > .site-header.wrap').count(), 1, 'sticky shell wraps one site header');
  const header = await page.evaluate(() => {
    const rect = selector => document.querySelector(selector)?.getBoundingClientRect().toJSON();
    const shell = document.querySelector('header.header-shell');
    return {
      shell: rect('header.header-shell'),
      wrap: rect('header.header-shell > .site-header.wrap'),
      brand: rect('header.header-shell .brand'),
      nav: rect('header.header-shell nav.section-nav'),
      actions: rect('header.header-shell .header-actions'),
      position: getComputedStyle(shell).position,
      top: parseFloat(getComputedStyle(shell).top),
    };
  });
  assert.ok(['sticky', 'fixed'].includes(header.position), `header shell is sticky or fixed, got ${header.position}`);
  assert.ok(header.top >= 0 && header.top <= 24, `header floating top offset stays within 0-24px, got ${header.top}`);
  for (const [name, box] of Object.entries({brand: header.brand, nav: header.nav, actions: header.actions})) {
    assert.ok(box, `${name} exists in header`);
    assert.ok(box.left >= header.wrap.left - 1 && box.right <= header.wrap.right + 1, `${name} stays within header width at ${viewport.name} ${lang}`);
    assert.ok(box.top >= header.shell.top - 1 && box.bottom <= header.shell.bottom + 1, `${name} stays within sticky shell height at ${viewport.name} ${lang}`);
  }
  if (viewport.width >= 1024) {
    const centers = [
      header.brand.top + header.brand.height / 2,
      header.nav.top + header.nav.height / 2,
      header.actions.top + header.actions.height / 2,
    ];
    assert.ok(Math.max(...centers) - Math.min(...centers) <= 3, `desktop header centers align in one row at ${viewport.name} ${lang}`);
  } else {
    assert.ok(header.nav.top >= Math.min(header.brand.bottom, header.actions.bottom) - 2, `mobile header puts section nav on second row at ${viewport.name} ${lang}`);
  }
  assert.deepEqual(await page.locator('nav.section-nav a').evaluateAll(links => links.map(link => link.getAttribute('href'))), sections.map(id => `#${id}`), 'section nav has four ordered anchors');
  for (const id of sections) {
    const link = page.locator(`nav.section-nav a[href="#${id}"]`);
    await link.focus();
    assert.equal(await link.evaluate(element => document.activeElement === element), true, `${id} anchor can receive focus`);
    const box = await link.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= viewport.width, `${id} focused anchor remains in viewport`);
  }
}

async function assertBalancedLogo(page) {
  for (const selector of ['.brand img', '.footer-brand img']) {
    assert.equal(await page.locator(selector).count(), 1, `${selector} exists`);
    assert.match(await page.locator(selector).getAttribute('src'), /assets\/brand\/60base-original02-01-horizontal-web\.svg$/, `${selector} uses the user-selected horizontal Original02 lockup`);
  }
}

async function assertSectionsAndScrollspy(page, label) {
  const order = await page.locator('.page-section').evaluateAll(nodes => nodes.map(node => node.id));
  assert.deepEqual(order, sections, `${label} sections stay visible and ordered`);
  for (const id of sections) {
    const section = page.locator(`#${id}.page-section`);
    assert.equal(await section.count(), 1, `${id} section exists`);
    assert.ok(await section.isVisible(), `${id} section is visible`);
    const labelled = await section.evaluate(element => {
      const target = document.getElementById(element.getAttribute('aria-labelledby') || '');
      return !!target && element.contains(target) && /^H[1-6]$/.test(target.tagName) && target.textContent.trim().length > 0;
    });
    assert.equal(labelled, true, `${id} aria-labelledby points to an internal heading`);
  }
  await page.evaluate(() => history.replaceState(null, '', location.pathname));
  for (const id of sections) {
    await page.locator(`#${id}`).evaluate(element => element.scrollIntoView({block: 'start', behavior: 'instant'}));
    await page.waitForFunction(expected => document.querySelector(`nav.section-nav a[href="#${expected}"]`)?.getAttribute('aria-current') === 'location', id);
    assert.equal(new URL(page.url()).hash, '', `scrollspy does not write hash while scrolling to ${id}`);
  }
  const before = new URL(page.url()).hash;
  await page.mouse.wheel(0, 420);
  await delay(120);
  assert.equal(new URL(page.url()).hash, before, `${label} wheel scrolling does not mutate hash`);
}

async function assertServiceArtDecorative(page) {
  const cards = page.locator('.service-film');
  assert.equal(await cards.count(), 3, 'three B2B service video cards');
  assert.equal(await cards.locator('video[data-preview-video]').count(), 3, 'each service uses an actual recording');
  assert.equal(await cards.locator('video').evaluateAll(nodes => nodes.every(video => video.controls && video.muted && video.playsInline && /^assets\/videos\/(collection|workflow)\//.test(video.dataset.src))), true, 'service videos retain native controls and owner-provided sources');
}

async function assertVideoInteractions(page, motion) {
  assert.equal(await page.locator('#data video').count(), 1, 'hero keeps one video element');
  assert.equal(await page.locator('#sample-play').count(), 0, 'custom play button is removed from the renewed homepage');
  assert.equal(await page.locator('#sample-video').evaluate(video => video.autoplay === !matchMedia('(prefers-reduced-motion: reduce)').matches && video.muted && video.loop && video.playsInline && video.controls), true, 'video starts as a muted looping inline autoplay preview with native controls');
  assert.equal(await page.locator('[data-filter]').count(), 0, 'category filters are removed from the renewed homepage');
  assert.deepEqual(await page.locator('button[data-sample]').evaluateAll(buttons => buttons.map(button => button.dataset.sample)), samples, 'three sample switch buttons remain visible in order');
  assert.equal(await page.locator('#sample-counter,#sample-source,.sample-selected,.selected-badge,.video-selected-badge').count(), 0, 'counter, source overlay and selected-video badges are removed');
  assert.equal(await page.locator('.video-labels #sample-title').count(), 1, 'sample title is part of the video label overlay');
  assert.equal(await page.locator('.video-facts #sample-environment').count(), 1, 'sample environment is part of the facts badge group');
  assert.equal(await page.locator('.video-task #sample-action').count(), 1, 'sample action stays in the lower video task label');
  assert.equal(await page.locator('.video-facts > span').count(), 2, 'environment and viewpoint facts render as two badges');
  const labelMetrics = await page.locator('.video-facts').evaluate(facts => {
    const video = document.querySelector('#sample-video').getBoundingClientRect();
    const box = facts.getBoundingClientRect();
    const fontSizes = [...facts.querySelectorAll(':scope > span')].map(node => parseFloat(getComputedStyle(node).fontSize));
    return {left: box.left - video.left, top: box.top - video.top, fontSizes, width: innerWidth};
  });
  assert.ok(labelMetrics.left <= 24 && labelMetrics.top <= 24, `video facts stay top-left: ${JSON.stringify(labelMetrics)}`);
  const expectedRange = labelMetrics.width > 760 ? [15, 17] : [12, 14];
  assert.ok(labelMetrics.fontSizes.every(size => size >= expectedRange[0] && size <= expectedRange[1]), `video facts scale with viewport: ${JSON.stringify(labelMetrics)}`);
  for (const sample of samples) {
    await page.locator(`button[data-sample="${sample}"]`).click();
    await page.waitForFunction(value => {
      const video = document.querySelector('#sample-video');
      return video?.getAttribute('src')?.includes(value) && video?.getAttribute('poster')?.includes(value);
    }, sample);
    const state = await page.evaluate(value => {
      const video = document.querySelector('#sample-video');
      const title = document.querySelector('#sample-title')?.textContent.trim() || '';
      return {
        active: document.querySelector(`button[data-sample="${value}"]`)?.getAttribute('aria-pressed'),
        activeCount: [...document.querySelectorAll('button[data-sample][aria-pressed="true"]')].length,
        source: video?.getAttribute('src') || '',
        poster: video?.getAttribute('poster') || '',
        label: video?.getAttribute('aria-label') || '',
        title,
        environment: document.querySelector('#sample-environment')?.textContent.trim() || '',
        action: document.querySelector('#sample-action')?.textContent.trim() || '',
        frameAnimations: document.querySelector('.video-frame')?.getAnimations().length || 0,
      };
    }, sample);
    assert.equal(state.active, 'true', `${sample} becomes selected`);
    assert.equal(state.activeCount, 1, `${sample} is the only active sample`);
    assert.ok(state.source.includes(`assets/videos/collection/${sample}.mp4`), `${sample} uses collection video source`);
    assert.ok(state.poster.includes(`assets/videos/collection/${sample}.jpg`), `${sample} uses collection poster`);
    assert.ok(state.label.includes(state.title), `${sample} video label includes action title`);
    assert.match(state.label, /60BASE 촬영 예시|60BASE filming example/, `${sample} video label keeps provenance`);
    assert.match(state.environment, labelPatterns[sample].environment, `${sample} updates the environment label`);
    assert.match(state.action, labelPatterns[sample].action, `${sample} updates the action label`);
    if (motion === 'reduced') assert.equal(state.frameAnimations, 0, `${sample} has no video-frame animation in reduced motion`);
  }
  if (motion === 'default') {
    const calls = await page.evaluate(() => window.__motionCalls.filter(call => call.className.includes('video-frame')).length);
    assert.ok(calls >= 1, 'sample switching triggers video-frame WAAPI motion');
  }
  await page.waitForFunction(() => {
    const video = document.querySelector('#sample-video');
    return video && !video.paused && video.currentTime > 0;
  }); // Choosing a video is an explicit playback request, including reduced motion.
}

async function assertProcessB(page, motion) {
  const group = page.locator('[data-process-group="B"]');
  assert.equal(await group.count(), 1, 'purchase process uses selected process B group');
  const steps = group.locator('[data-step]');
  assert.equal(await steps.count(), 4, 'process B exposes four stages');
  assert.equal(await group.locator('.step-index').count(), 0, 'visual ordinal step indexes are removed');
  const connectors = group.locator('.process-connector');
  assert.ok(await connectors.count() >= 3, 'decorative process connectors remain between stages');
  assert.equal(await connectors.evaluateAll(items => items.every(item => item.getAttribute('aria-hidden') === 'true')), true, 'process connectors are hidden from assistive tech');
  assert.deepEqual(await steps.evaluateAll(items => items.map(item => item.getAttribute('aria-expanded'))), ['true', 'false', 'false', 'false'], 'process B starts with one expanded stage');

  const second = steps.nth(1);
  await second.click();
  await page.waitForFunction(() => document.querySelector('[data-process-group="B"] [data-step="1"]')?.getAttribute('aria-expanded') === 'true');
  assert.deepEqual(await steps.evaluateAll(items => items.map(item => item.getAttribute('aria-expanded'))), ['false', 'true', 'false', 'false'], 'click expands exactly one process B stage');
  assert.ok((await second.locator('.panel-extra').innerText()).trim().length > 0, 'expanded process B stage exposes explanatory copy');

  const third = steps.nth(2);
  await third.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('[data-process-group="B"] [data-step="2"]')?.getAttribute('aria-expanded') === 'true');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.querySelector('[data-process-group="B"] [data-step="2"]')?.getAttribute('aria-expanded') === 'true');
  assert.deepEqual(await steps.evaluateAll(items => items.map(item => item.getAttribute('aria-expanded'))), ['false', 'false', 'true', 'false'], 'process B keyboard activation keeps one active stage');

  if (motion === 'default') {
    const processCalls = await page.evaluate(() => window.__motionCalls.filter(call => /process|panel-step|step-icon/.test(call.className)).length);
    assert.ok(processCalls >= 1, 'process B selection triggers motion feedback');
  } else {
    const running = await group.evaluate(element => element.getAnimations({subtree: true}).length);
    assert.equal(running, 0, 'reduced process B leaves no running step animations');
  }
}

async function qualityPanelState(page) {
  return page.evaluate(() => {
    const tabs = [...document.querySelectorAll('#standards [role="tab"].quality-nav-button')];
    const panel = document.querySelector('#standards [role="tabpanel"].quality-panel:not([hidden])');
    return {
      selected: tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true'),
      tabCount: tabs.length,
      selectedCount: tabs.filter(tab => tab.getAttribute('aria-selected') === 'true').length,
      focused: tabs.findIndex(tab => tab === document.activeElement),
      tabIndexes: tabs.map(tab => tab.getAttribute('tabindex') || ''),
      controls: tabs.map(tab => tab.getAttribute('aria-controls')),
      controlledPanelIds: tabs.map(tab => document.getElementById(tab.getAttribute('aria-controls'))?.id || ''),
      panelId: panel?.id || '',
      labelledBy: panel?.getAttribute('aria-labelledby') || '',
      panelText: panel?.textContent.trim() || '',
      recordCount: panel?.querySelectorAll('.sample-criteria li').length || 0,
      panelAnimations: panel?.getAnimations({subtree: true}).length || 0,
    };
  });
}

async function assertQualityC(page, motion) {
  assert.equal(await page.locator('details.standard-row').count(), 0, 'quality C replaces the old details rows');
  assert.equal(await page.locator('#standards [role="tablist"].quality-nav').count(), 1, 'quality C uses one tablist');
  assert.equal(await page.locator('#standards [role="tabpanel"].quality-panel:not([hidden])').count(), 1, 'quality C uses one detail panel');

  let state = await qualityPanelState(page);
  assert.equal(state.tabCount, 4, 'quality C exposes four standard tabs');
  assert.equal(state.selected, 0, 'quality C starts on sample approval');
  assert.equal(state.selectedCount, 1, 'quality C has one selected tab');
  assert.ok(state.panelId, 'quality C panel has an id');
  assert.deepEqual(state.controls, state.controlledPanelIds, 'every quality C tab controls an existing panel');
  assert.equal(state.controls[state.selected], state.panelId, 'selected quality C tab controls the visible panel');
  assert.ok(state.labelledBy && await page.locator(`#${state.labelledBy}`).getAttribute('aria-selected') === 'true', 'quality C panel is labelled by the selected tab');
  assert.equal(state.recordCount, 3, 'sample panel shows three approval checks');
  assert.match(state.panelText, /샘플 승인|Sample approval/i, 'initial quality C panel matches the first tab');

  await page.locator('#standards [role="tab"].quality-nav-button').nth(1).click();
  await page.waitForFunction(() => document.querySelectorAll('#standards [role="tab"].quality-nav-button')[1]?.getAttribute('aria-selected') === 'true');
  state = await qualityPanelState(page);
  assert.equal(state.selected, 1, 'click selects the second quality C tab');
  assert.equal(state.selectedCount, 1, 'click keeps one selected quality C tab');
  assert.match(state.panelText, /촬영·라벨 품질|Capture|label/i, 'selected quality C panel copy follows clicked tab');

  await page.locator('#standards [role="tab"].quality-nav-button').nth(1).focus();
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => document.querySelectorAll('#standards [role="tab"].quality-nav-button')[2]?.getAttribute('aria-selected') === 'true');
  state = await qualityPanelState(page);
  assert.equal(state.selected, 2, 'ArrowDown selects the next quality C tab');
  assert.equal(state.focused, 2, 'ArrowDown moves focus to the selected quality C tab');
  assert.match(state.panelText, /동의·이용 권리|Usage scope/i, 'keyboard-selected quality C panel updates copy');
  const rightsPanel = page.locator('#standards [role="tabpanel"].quality-panel:not([hidden])');
  assert.equal(await rightsPanel.locator('#consent-example,[data-consent-field]').count(), 0, 'rights tab no longer uses mock document highlights');
  const rightsButtons = rightsPanel.locator('button[data-rights]');
  assert.deepEqual(await rightsButtons.evaluateAll(buttons => buttons.map(button => ({
    id: button.id,
    key: button.dataset.rights,
    pressed: button.getAttribute('aria-pressed'),
    controls: button.getAttribute('aria-controls'),
  }))), [0,1,2].map(index => ({
    id: `rights-option-${index}`,
    key: String(index),
    pressed: String(index === 0),
    controls: `rights-detail-${index}`,
  })), 'rights tab exposes three condition controls');
  assert.equal(await rightsPanel.locator('article.rights-detail').count(), 3, 'rights tab has three detail articles');
  assert.equal(await rightsPanel.locator('article.rights-detail:not([hidden])').count(), 1, 'rights tab shows one detail article');
  await rightsButtons.nth(2).click();
  assert.deepEqual(await rightsButtons.evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-pressed'))), ['false', 'false', 'true'], 'rights detail click updates selected state');
  assert.equal(await rightsPanel.locator('article.rights-detail:not([hidden])').getAttribute('id'), 'rights-detail-2', 'rights click reveals the controlled detail');

  await useLanguage(page, 'en');
  await delay(motion === 'reduced' ? 50 : 320);
  state = await qualityPanelState(page);
  assert.equal(state.selected, 2, 'language switch preserves active quality C tab');
  assert.match(state.panelText, /usage|scope|consent|rights/i, 'active quality C panel translates to English');
  await useLanguage(page, 'ko');
  await delay(motion === 'reduced' ? 50 : 320);
  state = await qualityPanelState(page);
  assert.equal(state.selected, 2, 'switching back to Korean preserves active quality C tab');
  assert.match(state.panelText, /동의|이용|권리/, 'active quality C panel translates back to Korean');

  if (motion === 'reduced') {
    assert.equal(state.panelAnimations, 0, 'reduced quality C leaves no running panel animations');
  } else {
    const duration = await page.locator('.quality-selection-surface').evaluate(surface => parseFloat(getComputedStyle(surface).transitionDuration));
    assert.ok(duration > 0, 'selected I1 quality surface provides sliding motion feedback');
  }
}

async function assertReveal(page, motion) {
  const count = await page.locator('[data-reveal],.reveal').count();
  assert.ok(count >= 1, 'reveal targets exist');
  for (const id of sections) await page.locator(`#${id}`).evaluate(element => element.scrollIntoView({block: 'start', behavior: 'instant'}));
  await delay(motion === 'reduced' ? 50 : 250);
  const state = await page.locator('[data-reveal],.reveal').evaluateAll(nodes => nodes.map(node => ({
    visible: !!node.offsetParent && getComputedStyle(node).visibility !== 'hidden' && getComputedStyle(node).opacity !== '0',
    runningAnimations: node.getAnimations({subtree: true}).length,
  })));
  assert.ok(state.every(item => item.visible), `${motion} reveal targets are fully visible after intersection`);
  if (motion === 'reduced') {
    assert.equal(state.reduce((sum, item) => sum + item.runningAnimations, 0), 0, 'reduced reveal animations are cancelled');
  } else {
    const revealCalls = await page.evaluate(() => window.__motionCalls.filter(call => call.reveal || /\breveal\b/.test(call.className)).length);
    assert.ok(revealCalls >= 1, 'default reveal uses WAAPI after intersection');
  }
}

async function runInteractiveCase(viewport, lang, motion) {
  const context = await browser.newContext({
    viewport: {width: viewport.width, height: viewport.height},
    reducedMotion: motion === 'reduced' ? 'reduce' : 'no-preference',
  });
  await installMotionRecorder(context);
  const page = await context.newPage();
  const errors = recordPageErrors(page);
  await page.goto(url, {waitUntil: 'networkidle'});
  await useLanguage(page, lang);
  await assertReducedMotionScrollBehavior(page, motion, `${viewport.name} ${lang}`);
  await noOverflow(page, viewport.width, `${viewport.name} ${lang} ${motion}`);
  await assertHeader(page, viewport, lang);
  await assertBalancedLogo(page);
  await assertSectionsAndScrollspy(page, `${viewport.name} ${lang} ${motion}`);
  await assertServiceArtDecorative(page);
  if (viewport.width === 390 && lang === 'ko') {
    await assertVideoInteractions(page, motion);
    await assertProcessB(page, motion);
    await assertQualityC(page, motion);
    await assertReveal(page, motion);
  }
  await page.screenshot({path: `${out}/${motion}-${lang}-${viewport.name}.png`, fullPage: false});
  assert.deepEqual(errors, [], `${viewport.name} ${lang} ${motion} has no runtime errors`);
  results.push({viewport: viewport.name, lang, motion, overflow: 'none'});
  await context.close();
}

async function assertNoJs() {
  const context = await browser.newContext({javaScriptEnabled: false, viewport: {width: 390, height: 844}});
  const page = await context.newPage();
  await page.goto(url, {waitUntil: 'load'});
  await page.waitForLoadState('networkidle').catch(() => {});
  await delay(100);
  await noOverflow(page, 390, 'no-js 390 after stylesheet/layout settle');
  assert.deepEqual(await page.locator('.page-section').evaluateAll(nodes => nodes.map(node => ({id: node.id, visible: !!node.offsetParent}))), sections.map(id => ({id, visible: true})), 'all sections are visible without JavaScript');
  assert.equal(await page.locator('#standards article.rights-detail').count(), 3, 'no-JS exposes all three rights details');
  assert.equal(await page.locator('#standards article.rights-detail').evaluateAll(nodes => nodes.every(node => {
    const style = getComputedStyle(node);
    return !!node.offsetParent && style.display !== 'none' && style.visibility !== 'hidden';
  })), true, 'no-JS rights details are visible without scripting');
  const revealVisible = await page.locator('[data-reveal],.reveal').evaluateAll(nodes => nodes.every(node => !!node.offsetParent && getComputedStyle(node).visibility !== 'hidden' && getComputedStyle(node).opacity !== '0'));
  assert.equal(revealVisible, true, 'reveal content is exposed without JavaScript');
  await page.screenshot({path: `${out}/no-js-390.png`, fullPage: true});
  await context.close();
}

try {
  await waitForServer();
  await mkdir(out, {recursive: true});
  browser = await chromium.launch({headless: true});

  for (const motion of ['default', 'reduced']) {
    for (const viewport of viewports) {
      for (const lang of ['ko', 'en']) {
        await runInteractiveCase(viewport, lang, motion);
      }
    }
  }
  await assertNoJs();
  await writeFile(`${out}/company-interactions-report.json`, JSON.stringify({url, playwrightPath, results}, null, 2));
  console.log(`PASS homepage interaction contract: sticky header, section anchors, focused anchors, video motion, purchase cards, quality navigator, reveal motion and no-JS exposure. Artifacts: ${out}`);
} finally {
  await browser?.close();
  server?.kill();
}
