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
const out = resolve(process.env.COMPANY_REVIEW_DIR || new URL('../../.omx/reviews/homepage-scroll-20260913', import.meta.url).pathname);
const server = process.env.COMPANY_TEST_URL ? null : spawn(process.execPath, ['dev-server.mjs'], {
  cwd: new URL('../', import.meta.url),
  env: {...process.env, PORT: '4317'},
  stdio: 'ignore',
});

const sections = [
  {id: 'data', hash: '#data'},
  {id: 'services', hash: '#services'},
  {id: 'standards', hash: '#standards'},
  {id: 'about', hash: '#about'},
];
const samples = ['cutting-vegetables', 'dishwashing', 'folding-clothes', 'vacuuming', 'folding-towels', 'dishwashing-2'];
const expectedTitles = {
  'dishwashing-2': {ko: '식기 헹구기', en: 'Rinsing dishes'},
  'folding-towels': {ko: '수건 접기', en: 'Folding towels'},
  vacuuming: {ko: '바닥 청소', en: 'Vacuuming'},
  dishwashing: {ko: '설거지', en: 'Washing dishes'},
  'folding-clothes': {ko: '빨래 개기', en: 'Folding clothes'},
  'cutting-vegetables': {ko: '채소 손질', en: 'Cutting vegetables'},
};
const expectedLabels = {
  'dishwashing-2': {environment: {ko: /주방/, en: /kitchen/i}, action: {ko: /헹구기|식기/, en: /rinsing|dishes/i}},
  'folding-towels': {environment: {ko: /거실/, en: /living room/i}, action: {ko: /수건|접고/, en: /fold|towels/i}},
  vacuuming: {environment: {ko: /거실/, en: /living room/i}, action: {ko: /청소기|바닥/, en: /vacuum|floor/i}},
  dishwashing: {
    environment: {ko: /주방/, en: /kitchen/i},
    action: {ko: /설거지|식기|물/, en: /dish|washing|sink/i},
  },
  'folding-clothes': {
    environment: {ko: /세탁|의류/, en: /laundry|clothing/i},
    action: {ko: /빨래|옷|개기/, en: /fold|clothes|laundry/i},
  },
  'cutting-vegetables': {
    environment: {ko: /주방/, en: /kitchen/i},
    action: {ko: /채소|손질|썰기/, en: /vegetable|cut|prep/i},
  },
};
const collectionPath = 'assets/videos/collection/';
const viewports = [
  {name: 'mobile-320', width: 320, height: 844},
  {name: 'mobile-390', width: 390, height: 844},
  {name: 'tablet-768', width: 768, height: 1000},
  {name: 'desktop-1024', width: 1024, height: 900},
  {name: 'desktop-1440', width: 1440, height: 1000},
  {name: 'wide-1920', width: 1920, height: 1080},
];

let browser;
const results = [];

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
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

async function mustFit(page, width, label) {
  const overflow = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll('body *')]
      .filter(element => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && element.scrollWidth > element.clientWidth + 2;
      })
      .slice(0, 20)
      .map(element => ({
        tag: element.tagName,
        id: element.id,
        className: String(element.className),
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      })),
  }));
  assert.ok(overflow.documentWidth <= width + 1, `${label} has no page-level horizontal overflow: documentWidth=${overflow.documentWidth}, viewport=${width}, offenders=${JSON.stringify(overflow.offenders)}`);
}

async function assertSectionVisible(page, section, reason) {
  const locator = page.locator(`#${section.id}`);
  assert.ok(await locator.isVisible(), `${section.id} section visible: ${reason}`);
  const labelId = await locator.getAttribute('aria-labelledby');
  assert.ok(labelId, `${section.id} exposes aria-labelledby`);
  const heading = await locator.evaluate((sectionElement, id) => {
    const target = document.getElementById(id);
    return {
      inside: !!target && sectionElement.contains(target),
      tag: target?.tagName || '',
      text: target?.textContent.trim() || '',
    };
  }, labelId);
  assert.equal(heading.inside, true, `${section.id} aria-labelledby points to an element inside the section`);
  assert.match(heading.tag, /^H[1-6]$/, `${section.id} label target is a heading`);
  assert.ok(heading.text.length > 0, `${section.id} heading has text`);
}

async function assertSectionNavAndHistory(page) {
  assert.equal(await page.locator('nav.section-nav').count(), 1, 'single ordinary section nav');
  assert.equal(await page.locator('[data-tab]').count(), 0, 'global data-tab contract is removed');
  assert.equal(await page.locator('[role="tab"],[role="tablist"],[role="tabpanel"]').evaluateAll(nodes => nodes.filter(node => !node.closest('#standards')).length), 0, 'tab semantics are scoped to the quality standards navigator');
  const order = await page.locator('.page-section').evaluateAll(nodes => nodes.map(node => node.id));
  assert.deepEqual(order, sections.map(section => section.id), 'page sections remain in DOM order');
  for (const section of sections) {
    const link = page.locator(`.section-nav a[href="${section.hash}"]`);
    assert.equal(await link.count(), 1, `${section.hash} nav link exists`);
    await assertSectionVisible(page, section, 'initial document');
    await link.click();
    assert.equal(new URL(page.url()).hash, section.hash, `${section.hash} link writes hash`);
    await page.waitForFunction(id => {
      const box = document.getElementById(id)?.getBoundingClientRect();
      return box && box.bottom > 0 && box.top < innerHeight;
    }, section.id);
  }
  await page.goto(`${url}/#services`, {waitUntil: 'networkidle'});
  await page.waitForFunction(() => {
    const box = document.getElementById('services')?.getBoundingClientRect();
    return box && box.bottom > 0 && box.top < innerHeight;
  });
  await assertSectionVisible(page, sections[1], 'deep link');
  await page.locator('.section-nav a[href="#standards"]').click();
  await page.goBack({waitUntil: 'networkidle'});
  assert.equal(new URL(page.url()).hash, '#services', 'browser back restores section hash');
  await page.goForward({waitUntil: 'networkidle'});
  assert.equal(new URL(page.url()).hash, '#standards', 'browser forward restores section hash');
}

async function assertResponsiveLayout(page, viewport) {
  await page.setViewportSize({width: viewport.width, height: viewport.height});
  await page.goto(url, {waitUntil: 'networkidle'});
  await page.waitForLoadState('networkidle');
  await delay(150);
  await mustFit(page, viewport.width, viewport.name);
  const metrics = await page.evaluate(() => {
    const header = document.querySelector('.site-header')?.getBoundingClientRect().toJSON();
    const navBox = document.querySelector('.section-nav')?.getBoundingClientRect().toJSON();
    const heroVideo = document.querySelector('#sample-video')?.getBoundingClientRect().toJSON();
    const videoFacts = document.querySelector('.video-facts')?.getBoundingClientRect().toJSON();
    const videoFactFontSizes = [...document.querySelectorAll('.video-facts > span')].map(node => parseFloat(getComputedStyle(node).fontSize));
    const style = getComputedStyle(document.body);
    return {
      scrollHeight: document.documentElement.scrollHeight,
      background: style.backgroundColor,
      header,
      navBox,
      heroVideo,
      videoFacts,
      videoFactFontSizes,
    };
  });
  assert.match(metrics.background, /^rgb\(25[0-5], 25[0-5], 25[0-5]\)|^rgba\(25[0-5], 25[0-5], 25[0-5], 1\)/, `${viewport.name} body background is white or near-white`);
  assert.ok(metrics.header?.width > 0, `${viewport.name} header visible`);
  assert.ok(metrics.navBox?.width > 0 && metrics.navBox.y < viewport.height, `${viewport.name} section nav visible in viewport`);
  assert.ok(metrics.heroVideo?.width > 0, `${viewport.name} hero video exists`);
  if (viewport.width >= 1024) {
    assert.ok(metrics.heroVideo.y < viewport.height && metrics.heroVideo.y + Math.min(metrics.heroVideo.height, 80) <= viewport.height, `${viewport.name} video appears in first viewport`);
  }
  const expectedRange = viewport.width > 760 ? [15, 17] : [12, 14];
  assert.ok(metrics.videoFactFontSizes.every(size => size >= expectedRange[0] && size <= expectedRange[1]), `${viewport.name} environment/viewpoint badge scale: ${JSON.stringify(metrics.videoFactFontSizes)}`);
  if (metrics.videoFacts && metrics.heroVideo) {
    assert.ok(metrics.videoFacts.x >= metrics.heroVideo.x - 1 && metrics.videoFacts.x <= metrics.heroVideo.x + 24, `${viewport.name} video facts stay at the left edge`);
    assert.ok(metrics.videoFacts.y >= metrics.heroVideo.y - 1 && metrics.videoFacts.y <= metrics.heroVideo.y + 24, `${viewport.name} video facts stay at the top edge`);
  }
  for (const section of sections) {
    await page.locator(`#${section.id}`).scrollIntoViewIfNeeded();
    await page.locator(`#${section.id}`).screenshot({path: `${out}/${viewport.name}-${section.id}.png`});
  }
  results.push({viewport: viewport.name, width: viewport.width, height: metrics.scrollHeight, overflow: 'none'});
}

async function assertSamples(page) {
  assert.equal(await page.locator('#data video').count(), 1, 'hero keeps one video player');
  assert.equal(await page.locator('#sample-video').count(), 1, 'sample video has stable id');
  assert.equal(await page.locator('#sample-play').count(), 0, 'sample play button is removed; video starts directly');
  assert.equal(await page.locator('#sample-video').evaluate(video => video.autoplay === !matchMedia('(prefers-reduced-motion: reduce)').matches && video.muted && video.loop && video.playsInline && video.controls), true, 'sample video is muted, looping, inline, autoplaying with native controls');
  assert.equal(await page.locator('[data-filter]').count(), 0, 'sample category filters are removed; only video switching remains');
  assert.equal(await page.locator('.video-selector').count(), 1, 'selected media A uses one compact playlist rail');
  assert.equal(await page.locator('.sample-choice[data-sample]').count(), samples.length, 'selected media A exposes all six playlist choices');
  assert.equal(await page.locator('.sample-choice .sample-thumb img').count(), samples.length, 'selected media A shows a thumbnail for each playlist choice');
  assert.equal(await page.locator('#sample-counter').count(), 0, 'sample counter is removed from the simplified hero video UI');
  assert.equal(await page.locator('#sample-source').count(), 0, 'sample-source overlay is removed from the simplified hero video UI');
  assert.equal(await page.locator('.sample-selected,.selected-badge,.video-selected-badge').count(), 0, 'selected-video badges are removed');
  assert.equal(await page.locator('.video-labels').count(), 1, 'video has one overlay label group');
  assert.equal(await page.locator('.video-facts').count(), 1, 'video has one top-left facts badge group');
  for (const selector of ['#sample-title', '#sample-environment', '#sample-action']) {
    assert.equal(await page.locator(`.video-labels ${selector}`).count(), 1, `${selector} appears inside video overlay labels`);
  }
  assert.equal(await page.locator('.video-facts > span').count(), 2, 'environment and viewpoint facts render as two badges');
  const labelMetrics = await page.locator('.video-facts').evaluate(facts => {
    const video = document.querySelector('#sample-video').getBoundingClientRect();
    const box = facts.getBoundingClientRect();
    const fontSizes = [...facts.querySelectorAll(':scope > span')].map(node => parseFloat(getComputedStyle(node).fontSize));
    return {left: box.left - video.left, top: box.top - video.top, fontSizes};
  });
  assert.ok(labelMetrics.left <= 24 && labelMetrics.top <= 24, `environment/viewpoint facts sit top-left over the video: ${JSON.stringify(labelMetrics)}`);
  assert.ok(labelMetrics.fontSizes.every(size => size >= 15 && size <= 17), `desktop environment/viewpoint badges scale to about 16px: ${JSON.stringify(labelMetrics)}`);
  const initialSample = samples[0];
  const initialState = await page.evaluate(() => {
    const video = document.querySelector('#sample-video');
    const active = document.querySelector('button[data-sample][aria-pressed="true"]');
    return {
      activeSample: active?.dataset.sample || '',
      source: video?.getAttribute('src') || video?.querySelector('source')?.getAttribute('src') || '',
      poster: video?.getAttribute('poster') || '',
    };
  });
  assert.equal(initialState.activeSample, initialSample, 'initial active sample follows the first sample button');
  assert.ok(initialState.source.includes(`${collectionPath}${initialSample}.mp4`), `initial video source follows ${initialSample}`);
  assert.ok(initialState.poster.includes(`${collectionPath}${initialSample}.jpg`), `initial poster follows ${initialSample}`);
  const initialLabel = await page.locator('#sample-video').evaluate(video => {
    const key = JSON.parse(video.dataset.i18nAttrs || '{}')['aria-label'];
    return {
      key,
      attr: video.getAttribute('aria-label'),
      translated: key ? window.siteI18n?.t?.(key) : '',
    };
  });
  assert.ok(initialLabel.key, 'initial video aria-label is backed by a data-i18n-attrs key');
  assert.equal(initialLabel.attr, initialLabel.translated, 'initial video accessible name agrees with siteI18n');
  assert.match(initialLabel.attr, /60BASE 촬영 예시/, 'initial Korean video accessible name includes provenance');
  for (const sample of samples) {
    const button = page.locator(`button[data-sample="${sample}"]`);
    assert.equal(await button.count(), 1, `sample selector exists: ${sample}`);
    await button.click();
    await page.waitForFunction(value => {
      const video = document.querySelector('#sample-video');
      const source = video?.getAttribute('src') || video?.querySelector('source')?.getAttribute('src') || '';
      return source.includes(value) && video?.getAttribute('poster')?.includes(value);
    }, sample);
    const state = await page.evaluate(value => {
      const video = document.querySelector('#sample-video');
      const source = video?.getAttribute('src') || video?.querySelector('source')?.getAttribute('src') || video?.currentSrc || '';
      return {
        active: document.querySelector(`[data-sample="${value}"]`)?.getAttribute('aria-pressed'),
        source,
        poster: video?.getAttribute('poster') || '',
        title: document.querySelector('#sample-title')?.textContent.trim() || '',
        environment: document.querySelector('#sample-environment')?.textContent.trim() || '',
        action: document.querySelector('#sample-action')?.textContent.trim() || '',
        videoLabel: video?.getAttribute('aria-label') || '',
        videoLabelKey: JSON.parse(video?.dataset.i18nAttrs || '{}')['aria-label'] || '',
        titleKey: JSON.parse(document.querySelector('#sample-title')?.dataset.i18nText || '[]')[0] || '',
      };
    }, sample);
    assert.equal(state.active, 'true', `${sample} selector becomes active`);
    assert.ok(state.source.includes(`${collectionPath}${sample}.mp4`), `${sample} updates video source: ${state.source}`);
    assert.ok(state.poster.includes(`${collectionPath}${sample}.jpg`), `${sample} updates poster: ${state.poster}`);
    assert.equal(state.title, expectedTitles[sample].ko, `${sample} updates Korean sample title`);
    assert.match(state.environment, expectedLabels[sample].environment.ko, `${sample} updates Korean environment label`);
    assert.match(state.action, expectedLabels[sample].action.ko, `${sample} updates Korean action label`);
    assert.ok(state.videoLabelKey, `${sample} video aria-label keeps i18n key`);
    assert.ok(state.titleKey, `${sample} title keeps i18n key`);
    assert.match(state.videoLabel, /60BASE 촬영 예시/, `${sample} Korean video accessible name includes provenance`);
    assert.ok(state.videoLabel.includes(state.title), `${sample} Korean video accessible name includes action title`);
    const mediaResponses = await page.evaluate(async ({source, poster}) => Promise.all([source, poster].map(async path => {
      const response = await fetch(new URL(path, location.href), {method: 'HEAD'});
      return {path, ok: response.ok, type: response.headers.get('content-type') || ''};
    })), {source: state.source, poster: state.poster});
    assert.deepEqual(mediaResponses.map(item => item.ok), [true, true], `${sample} mp4 and poster are served`);
    assert.match(mediaResponses[0].type, /video\/mp4/, `${sample} mp4 is served as video/mp4`);
    assert.match(mediaResponses[1].type, /image\/jpeg/, `${sample} poster is served as jpeg`);
    await page.locator('#language-toggle').click();
    const english = await page.evaluate(() => {
      const video = document.querySelector('#sample-video');
      const title = document.querySelector('#sample-title');
      return {
        lang: document.documentElement.lang,
        label: video?.getAttribute('aria-label') || '',
        title: title?.textContent.trim() || '',
        environment: document.querySelector('#sample-environment')?.textContent.trim() || '',
        action: document.querySelector('#sample-action')?.textContent.trim() || '',
        translated: window.siteI18n?.t?.(JSON.parse(video?.dataset.i18nAttrs || '{}')['aria-label']),
      };
    });
    assert.equal(english.lang, 'en', `${sample} switches to English for accessible-name check`);
    assert.equal(english.label, english.translated, `${sample} English video accessible name agrees with siteI18n`);
    assert.equal(english.title, expectedTitles[sample].en, `${sample} switches title to English`);
    assert.match(english.environment, expectedLabels[sample].environment.en, `${sample} switches environment label to English`);
    assert.match(english.action, expectedLabels[sample].action.en, `${sample} switches action label to English`);
    assert.match(english.label, /60BASE filming example/, `${sample} English video accessible name includes provenance`);
    assert.ok(english.label.includes(english.title), `${sample} English video accessible name includes action title`);
    await page.locator('#language-toggle').click();
    assert.equal(await page.locator('html').getAttribute('lang'), 'ko', `${sample} returns to Korean after accessible-name check`);
  }
  await page.locator('#sample-video').evaluate(video => new Promise((resolve, reject) => {
    if (!video.paused || video.currentTime > 0.05) return resolve();
    const timeout = setTimeout(() => reject(new Error('sample video did not autoplay')), 8000);
    video.addEventListener('timeupdate', () => {
      if (video.currentTime > 0.05) {
        clearTimeout(timeout);
        resolve();
      }
    }, {once: true});
    video.addEventListener('play', () => {
      clearTimeout(timeout);
      resolve();
    }, {once: true});
  }));
}

async function assertPurchaseProcessB(page) {
  const group = page.locator('[data-process-group="B"]');
  assert.equal(await group.count(), 1, 'purchase process uses selected process B group');
  const steps = group.locator('[data-step]');
  assert.equal(await steps.count(), 4, 'process B exposes four purchase stages');
  assert.equal(await group.locator('.step-index').count(), 0, 'visual ordinal step indexes are removed');
  const connectors = group.locator('.process-connector');
  assert.ok(await connectors.count() >= 3, 'process connectors convey sequence visually between steps');
  assert.equal(await connectors.evaluateAll(items => items.every(item => item.getAttribute('aria-hidden') === 'true')), true, 'process connectors are decorative for assistive tech');
  assert.deepEqual(await steps.evaluateAll(items => items.map(item => item.getAttribute('aria-expanded'))), ['true', 'false', 'false', 'false'], 'process B starts with the first stage expanded');
  assert.deepEqual(await steps.evaluateAll(items => items.map(item => item.querySelector('.step-title')?.textContent.trim() || item.textContent.trim()).map(text => text.replace(/\s+/g, ' '))), [
    '요구사항 전달',
    '샘플·견적 확인',
    '계약·제작 진행',
    '검수·납품',
  ], 'process B keeps the four B2B purchase stages in order');
  for (const step of await steps.all()) {
    assert.equal(await step.locator('img.step-icon, svg.step-icon').count(), 1, 'each process B stage has one visible icon asset');
    assert.ok((await step.locator('.panel-extra').innerText()).trim().length > 0, 'each process B stage includes expanded explanatory copy');
  }
}

async function assertQualityStandardsC(page) {
  const tablist = page.locator('#standards [role="tablist"].quality-nav');
  assert.equal(await tablist.count(), 1, 'quality C uses one tablist navigator');
  const tabs = tablist.locator('[role="tab"].quality-nav-button');
  assert.equal(await tabs.count(), 4, 'quality C exposes four standard tabs');
  const panel = page.locator('#standards [role="tabpanel"].quality-panel:not([hidden])');
  assert.equal(await panel.count(), 1, 'quality C has one active detail panel');
  const panelId = await panel.getAttribute('id');
  assert.ok(panelId, 'quality C panel has a stable id');
  const wiring = await tabs.evaluateAll(items => items.map((item, index) => {
    const target = document.getElementById(item.getAttribute('aria-controls'));
    return {
      selected:item.getAttribute('aria-selected'),
      tabindex:item.getAttribute('tabindex'),
      iconCount:item.querySelectorAll('img').length,
      validTarget:target?.getAttribute('role') === 'tabpanel' && target.getAttribute('aria-labelledby') === item.id,
      hidden:target?.hidden,
    };
  }));
  assert.deepEqual(wiring, [0,1,2,3].map(index => ({selected:String(index === 0),tabindex:index === 0 ? '0' : '-1',iconCount:1,validTarget:true,hidden:index !== 0})), 'quality C tabs control corresponding panels with roving tabindex');
  const labelledBy = await panel.getAttribute('aria-labelledby');
  assert.ok(labelledBy, 'quality C panel is labelled by the active tab');
  assert.equal(await page.locator(`#${labelledBy}`).getAttribute('aria-selected'), 'true', 'quality C panel aria-labelledby points at the selected tab');
  assert.match(await panel.innerText(), /샘플 승인|촬영·라벨 품질|동의·이용 권리|납품·품질 보증/, 'quality C panel exposes standard detail copy');
  assert.equal(await panel.locator('.sample-criteria li').count(), 3, 'sample approval shows three concrete capture checks');

  const rightsTab = tabs.nth(2);
  await rightsTab.click();
  await page.waitForFunction(() => document.querySelectorAll('#standards [role="tab"].quality-nav-button')[2]?.getAttribute('aria-selected') === 'true');
  const rightsPanel = page.locator('#standards [role="tabpanel"].quality-panel:not([hidden])');
  assert.equal(await rightsPanel.locator('#consent-example,[data-consent-field]').count(), 0, 'rights panel no longer presents a mock signed document or field highlights');
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
  })), 'rights controls are three buttons wired to three condition details');
  assert.equal(await rightsPanel.locator('article.rights-detail').count(), 3, 'rights panel renders three detail articles');
  assert.equal(await rightsPanel.locator('article.rights-detail:not([hidden])').count(), 1, 'rights panel shows one detail article at a time');
  assert.match(await rightsPanel.locator('article.rights-detail:not([hidden])').innerText(), /동의|이용|사용|보호|consent|usage|privacy/i, 'rights detail describes consent, usage or privacy conditions');
}

async function assertLanguagePreservesState(page) {
  await page.locator('.section-nav a[href="#services"]').click();
  await page.locator('#f-name').fill('테스트 담당자');
  await page.locator('#f-email').fill('test@example.com');
  await page.locator('#f-msg').fill('샘플 데이터 문의');
  await page.locator('#language-toggle').click();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en', 'language toggle switches to English');
  assert.equal(new URL(page.url()).hash, '#services', 'language toggle preserves current section hash');
  await assertSectionVisible(page, sections[1], 'language toggle preserves section content');
  assert.equal(await page.locator('#f-name').inputValue(), '테스트 담당자', 'language toggle preserves name');
  assert.equal(await page.locator('#f-email').inputValue(), 'test@example.com', 'language toggle preserves email');
  assert.equal(await page.locator('#f-msg').inputValue(), '샘플 데이터 문의', 'language toggle preserves message');
  await page.locator('#language-toggle').click();
  assert.equal(await page.locator('html').getAttribute('lang'), 'ko', 'language toggle switches back to Korean');
}

async function assertContact(page, context) {
  void context;
  assert.equal(await page.locator('details#contact').count(), 0, 'contact is not a collapsed details element');
  assert.equal(await page.locator('#contact-summary').count(), 0, 'contact has no disclosure summary');
  assert.equal(await page.locator('section#contact.contact-area').count(), 1, 'contact is an always-visible section');
  assert.equal(await page.locator('#contact > .contact-heading').count(), 1, 'contact has a direct heading block');
  assert.equal(await page.locator('#contact > .contact-heading > .contact-email').count(), 1, 'contact exposes a direct email link inside the heading');
  assert.equal(await page.locator('#contact .contact-body,#contact .contact-info').count(), 0, 'old contact body/info wrappers are removed');
  assert.equal(await page.locator('#contact-form').isVisible(), true, 'contact form is visible without opening anything');
  assert.equal(await page.locator('#contact-form input, #contact-form textarea').count(), 4, 'contact keeps four old-compatible fields');
  assert.equal(await page.locator('#draft-copy,#draft-clear,#copy-email,.toast').count(), 0, 'copy, clear, copy-email and toast controls are removed');
  assert.equal(await page.locator('a[href="#contact"]').count() > 0, true, 'at least one CTA links to contact');
  await page.locator('a[href="#contact"]').first().click();
  assert.equal(new URL(page.url()).hash, '#contact', 'contact CTA writes hash');
  await page.waitForFunction(() => {
    const box = document.querySelector('#contact-title')?.getBoundingClientRect();
    return box && box.bottom > 0 && box.top < innerHeight;
  });
  assert.ok(await page.locator('#contact-title').evaluate(title => {
    const box = title.getBoundingClientRect();
    return box.bottom > 0 && box.top < innerHeight;
  }), 'contact CTA scrolls toward the visible inquiry section');

  const network = [];
  page.on('request', request => {
    if (request.method() !== 'GET' && request.method() !== 'HEAD') network.push(`${request.method()} ${request.url()}`);
  });
  await page.evaluate(() => {
    window.__mailtoAttempts = [];
    const originalCreateElement = Document.prototype.createElement;
    Document.prototype.createElement = function captureCreatedElement(tagName, options) {
      const element = originalCreateElement.call(this, tagName, options);
      if (String(tagName).toLowerCase() === 'a') {
        const originalClick = element.click;
        element.click = function captureAnchorClick(...args) {
          if (String(element.href).startsWith('mailto:')) window.__mailtoAttempts.push(String(element.href));
          return originalClick.apply(element, args);
        };
      }
      return element;
    };
    const originalOpen = window.open;
    window.open = function captureMailto(url, ...args) {
      if (String(url).startsWith('mailto:')) {
        window.__mailtoAttempts.push(String(url));
        return null;
      }
      return originalOpen.call(window, url, ...args);
    };
    document.addEventListener('click', event => {
      const link = event.target?.closest?.('a[href^="mailto:"]');
      if (link?.href) window.__mailtoAttempts.push(link.href);
    }, true);
  });
  await page.locator('#f-name').fill('데이터 구매팀');
  await page.locator('#f-email').fill('buyer@example.com');
  if (await page.locator('#f-type').count()) await page.locator('#f-type').fill('1인칭 RGB 영상 / 작업 구간 라벨');
  await page.locator('#f-msg').fill('주방 작업 1인칭 영상과 구간 라벨을 요청합니다.');
  await page.locator('#contact-form button[type="submit"],#contact-form [type="submit"]').first().click();
  await delay(150);
  assert.deepEqual(network, [], 'contact submit does not send network requests');
  assert.equal(await page.evaluate(() => localStorage.getItem('koreo:inquiry-draft') !== null), true, 'contact submit saves under unchanged draft key');
  const mailtoAttempts = await page.evaluate(() => window.__mailtoAttempts || []);
  const mailtoSource = mailtoAttempts.at(-1)
    || await page.locator('a[href^="mailto:60base.ai@gmail.com"]').last().getAttribute('href').catch(() => '')
    || page.url();
  assert.match(mailtoSource, /^mailto:60base\.ai@gmail\.com\?/i, `submit opens or prepares 60base.ai@gmail.com mailto: ${mailtoSource}`);
  const decodedMailto = decodeURIComponent(mailtoSource.replace(/\+/g, ' '));
  assert.match(decodedMailto, /subject=/i, 'mailto includes a subject');
  assert.match(decodedMailto, /body=/i, 'mailto includes a body');
  assert.ok(decodedMailto.includes('데이터 구매팀') && decodedMailto.includes('buyer@example.com') && decodedMailto.includes('주방 작업 1인칭 영상'), 'mailto body includes the validated inquiry fields');
  assert.match(await page.locator('#contact-form button[type="submit"],#contact-form [type="submit"]').first().innerText(), /이메일로 문의|Email your inquiry/i, 'contact has one mailto submit label');
  assert.match(await page.locator('#form-status').innerText(), /Review and send your inquiry in your email app\.|이메일 앱에서 (?:문의 )?내용을 확인한 뒤 보내주세요/, 'submit status truthfully asks user to review and send in email app');
  assert.doesNotMatch(await page.locator('#form-status').innerText(), /발송 완료|sent successfully|submitted successfully/i, 'submit status does not claim the inquiry was sent');

  await page.reload({waitUntil: 'networkidle'});
  assert.equal(await page.locator('#f-name').inputValue(), '데이터 구매팀', 'name draft persists after reload');
  assert.equal(await page.locator('#f-email').inputValue(), 'buyer@example.com', 'email draft persists after reload');
  if (await page.locator('#f-type').count()) assert.equal(await page.locator('#f-type').inputValue(), '1인칭 RGB 영상 / 작업 구간 라벨', 'type draft persists after reload');
  assert.equal(await page.locator('#f-msg').inputValue(), '주방 작업 1인칭 영상과 구간 라벨을 요청합니다.', 'message draft persists after reload');
  assert.doesNotMatch(await page.locator('#form-status').innerText(), /불러왔|Restored/i, 'restored draft status banner is removed');

  await page.evaluate(() => {
    localStorage.setItem('koreo:inquiry-draft', '{malformed');
  });
  await page.reload({waitUntil: 'networkidle'});
  assert.equal(await page.locator('#f-name').inputValue(), '', 'malformed draft does not populate name');
  assert.equal(await page.locator('#f-email').inputValue(), '', 'malformed draft does not populate email');
  assert.equal(await page.locator('#f-msg').inputValue(), '', 'malformed draft does not populate message');

  await page.evaluate(() => {
    Storage.prototype.setItem = function blockedSetItem() {
      throw new Error('localStorage blocked by test');
    };
  });
  await page.locator('#f-name').fill('저장 차단');
  await page.locator('#f-email').fill('blocked@example.com');
  await page.locator('#f-msg').fill('저장이 막힌 환경');
  await page.locator('#contact-form button[type="submit"],#contact-form [type="submit"]').first().click();
  assert.match(await page.locator('#form-status').innerText(), /저장|storage|browser|브라우저|blocked|차단|failed|실패|email|이메일/i, 'blocked storage reports status without throwing');

  await page.reload({waitUntil: 'networkidle'});
  await page.locator('#f-email').fill('invalid-email');
  await page.locator('#f-name').fill('메일 검증');
  await page.locator('#f-msg').fill('올바르지 않은 이메일 검증');
  await page.locator('#contact-form button[type="submit"],#contact-form [type="submit"]').first().click();
  assert.equal(await page.locator('#f-email').getAttribute('aria-invalid'), 'true', 'invalid email is marked invalid');
  assert.match(await page.locator('#form-status').innerText(), /valid|올바른|email|이메일/i, 'invalid email reports an actionable status');
}

async function assertStructureAndCopy(page) {
  assert.equal(await page.locator('.site-header').count(), 1, 'single site header');
  assert.equal(await page.locator('.brand').count(), 1, 'single brand element');
  assert.equal(await page.locator('main#main').count(), 1, 'main landmark keeps stable id');
  assert.equal(await page.locator('nav.section-nav').count(), 1, 'ordinary section nav uses a nav landmark');
  assert.equal(await page.locator('.page-section').count(), 4, 'four continuous page sections exist');
  assert.equal(await page.locator('.hero-actions a[href="#contact"]').count(), 1, 'hero exposes one combined inquiry/request CTA');
  assert.equal(await page.locator('.section-heading a[href="#purchase-process"]').count(), 0, 'service heading no longer shows a purchase-process jump link');
  assert.equal(await page.locator('footer a[href*="videos"], footer a').filter({hasText: /Video sources|영상 출처/i}).count(), 0, 'footer video sources link is removed');
  assert.deepEqual(await page.locator('#language-toggle span').evaluateAll(nodes => nodes.map(node => node.textContent.trim())), ['KR', 'EN'], 'language switch shows both KR and EN labels');
  assert.equal(await page.locator('#language-toggle span').evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().width > 0 && getComputedStyle(node).display !== 'none')), true, 'both KR and EN are visible');
  const eyebrowState = await page.locator('.eyebrow').evaluateAll(nodes => nodes.map(node => ({
    text: node.textContent.trim(),
    fontSize: getComputedStyle(node).fontSize,
    beforeContent: getComputedStyle(node, '::before').content,
  })));
  assert.ok(eyebrowState.every(item => item.text === item.text.toUpperCase() && !/[가-힣]/.test(item.text) && item.fontSize === '15px' && ['none', 'normal'].includes(item.beforeContent)), `eyebrow labels are English, 15px, and have no dot: ${JSON.stringify(eyebrowState)}`);
  assert.equal(await page.locator('a[href="https://huggingface.co/60base"]').count(), 2, 'Hugging Face is linked in About and footer');
  assert.equal(await page.locator('a[href="https://huggingface.co/60base"] img[src="assets/brand/huggingface-logo.svg"]').count(), 2, 'each Hugging Face link includes its symbol');
  assert.equal(await page.locator('h1').count(), 1, 'homepage has one h1');
  assert.ok(await page.locator('#data h1').count() >= 1, 'data section owns the hero h1');
  for (const section of sections.slice(1)) {
    assert.equal(await page.locator(`#${section.id} h1`).count(), 0, `${section.id} does not introduce another h1`);
    assert.ok(await page.locator(`#${section.id} h2`).count() >= 1, `${section.id} starts with h2-level content`);
  }
  const text = await page.locator('body').innerText();
  for (const forbidden of ['AI-powered', 'AI driven', 'world-class', 'cutting-edge', 'revolutionary', 'guaranteed accuracy', '업계 최고', '혁신적인 AI', '최첨단 AI', '3,000원', '참여 희망', '재택알바', '모집합니다', '돈벌', '브라우저에 기록을 저장하는 시연', '서버 업로드와 실제 보상', 'Selected video', '선택된 영상']) {
    assert.ok(!text.toLowerCase().includes(forbidden.toLowerCase()), `avoid fake or AI-sounding claim: ${forbidden}`);
  }
  for (const required of ['데이터 구매', '맞춤 제작', '가공', '검수']) {
    assert.ok(text.includes(required), `B2B homepage copy includes ${required}`);
  }
  const externalAssets = await page.evaluate(() => performance.getEntriesByType('resource')
    .map(entry => entry.name)
    .filter(name => !name.startsWith(location.origin) && !name.startsWith('data:') && !name.startsWith('blob:')));
  assert.deepEqual(externalAssets, [], `all loaded assets are local: ${JSON.stringify(externalAssets)}`);
}

async function assertNoJs() {
  const context = await browser.newContext({javaScriptEnabled: false, viewport: {width: 390, height: 844}});
  const page = await context.newPage();
  await page.goto(url, {waitUntil: 'domcontentloaded'});
  assert.match(await page.locator('html').getAttribute('lang'), /^ko/, 'static HTML defaults to Korean');
  assert.match(await page.locator('body').innerText(), /[가-힣]/, 'Korean content is usable without JavaScript');
  assert.ok(await page.locator('main#main').isVisible(), 'main content remains visible without JavaScript');
  assert.ok(await page.locator('#sample-video').count() <= 1, 'no-JS page does not duplicate video players');
  assert.equal(await page.locator('#standards article.rights-detail').count(), 3, 'no-JS exposes all three rights details');
  assert.equal(await page.locator('#standards article.rights-detail').evaluateAll(nodes => nodes.every(node => {
    const style = getComputedStyle(node);
    return !!node.offsetParent && style.display !== 'none' && style.visibility !== 'hidden';
  })), true, 'no-JS rights details are visible without tab scripting');
  await mustFit(page, 390, 'no-js mobile');
  await page.screenshot({path: `${out}/no-js-mobile-ko.png`, fullPage: true});
  await context.close();
}

try {
  await waitForServer();
  await mkdir(out, {recursive: true});
  browser = await chromium.launch({headless: true});

  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, reducedMotion: 'reduce'});
  const page = await context.newPage();
  const errors = recordPageErrors(page);
  await page.goto(url, {waitUntil: 'networkidle'});
  await page.waitForLoadState('networkidle');
  await delay(150);

  await assertStructureAndCopy(page);
  await assertSectionNavAndHistory(page);
  await assertSamples(page);
  await assertPurchaseProcessB(page);
  await assertQualityStandardsC(page);
  await assertLanguagePreservesState(page);
  await assertContact(page, context);
  assert.deepEqual(errors, [], 'desktop interaction run has no console or page errors');
  await context.close();

  for (const viewport of viewports) {
    const responsiveContext = await browser.newContext({
      viewport: {width: viewport.width, height: viewport.height},
      reducedMotion: 'reduce',
    });
    const responsivePage = await responsiveContext.newPage();
    const responsiveErrors = recordPageErrors(responsivePage);
    await assertResponsiveLayout(responsivePage, viewport);
    assert.equal(await responsivePage.locator('.section-nav').isVisible(), true, `${viewport.name} section nav visible`);
    assert.deepEqual(responsiveErrors, [], `${viewport.name} has no console or page errors`);
    await responsiveContext.close();
  }

  const motionContext = await browser.newContext({viewport: {width: 1440, height: 1000}, reducedMotion: 'reduce'});
  const motionPage = await motionContext.newPage();
  await motionPage.goto(url, {waitUntil: 'networkidle'});
  assert.equal(await motionPage.locator('#sample-video').evaluate(video => video.paused), true, 'reduced motion does not autoplay sample video');
  await motionContext.close();

  await assertNoJs();
  await writeFile(`${out}/company-renewal-report.json`, JSON.stringify({
    url,
    playrightModule: playwrightPath,
    screenshots: 'all four continuous sections captured at mobile and desktop breakpoints',
    results,
  }, null, 2));
  console.log(`PASS homepage renewal contract: section nav/history, sample video labels, contact mailto draft, language persistence, responsive screenshots, no-JS Korean content. Artifacts: ${out}`);
} finally {
  await browser?.close();
  server?.kill();
}
