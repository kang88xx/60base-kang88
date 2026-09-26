import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';

const playwrightPath = process.env.PLAYWRIGHT_MODULE || resolve(homedir(), '.claude/skills/gstack/node_modules/playwright/index.mjs');
const {chromium} = await import(pathToFileURL(playwrightPath));
const base = process.env.STUDIO_TEST_URL || 'http://127.0.0.1:4358';
const out = resolve(process.env.STUDIO_COLLECTION_REVIEW_DIR || '../.omx/reviews/collection-20260913');
const server = process.env.STUDIO_TEST_URL ? null : spawn(process.execPath, ['dev-server.mjs'], {
  cwd: new URL('../', import.meta.url),
  env: {...process.env, PORT: '4358'},
  stdio: 'ignore',
});

const examples = [
  {key: 'dishwashing-2', title: /식기 헹구기|Rinsing dishes/i},
  {key: 'folding-towels', title: /수건 접기|Folding towels/i},
  {key: 'vacuuming', title: /바닥 청소|Vacuuming/i},
  {key: 'dishwashing', title: /설거지|Washing dishes/i},
  {key: 'folding-clothes', title: /빨래 개기|Folding clothes/i},
  {key: 'cutting-vegetables', title: /채소 손질|Cutting vegetables/i},
];
const checks = [];
let browser;

async function waitForServer() {
  for (let index = 0; index < 60; index++) {
    try {
      if ((await fetch(`${base}/studio/`)).ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error(`Server did not respond: ${base}/studio/`);
}

function recordErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function resetStudioStorage(page) {
  await page.goto(`${base}/studio/`, {waitUntil: 'domcontentloaded'});
  await page.evaluate(() => localStorage.clear());
}

async function assertCollectionCampaign(page) {
  await page.goto(`${base}/studio/#guide`, {waitUntil: 'networkidle'});
  const campaignRegion = page.locator('#workspace');
  await campaignRegion.waitFor();
  const campaign = await campaignRegion.textContent();
  assert.match(campaign, /1건\s*3,000P|3,000P/, 'campaign states the reviewed per-video reward');
  assert.match(campaign, /약\s*5분|5분/, 'campaign states the expected recording length');
  assert.match(campaign, /가로|Landscape/i, 'campaign states landscape recording');
  assert.match(campaign, /검수.{0,12}통과|review/i, 'campaign says reward depends on review approval');
  assert.match(campaign, /주방|설거지|채소|빨래|의류|정원|침대|식탁|자동차/, 'campaign lists household task categories');
  assert.doesNotMatch(campaign, /서버로 제출 완료|지급 완료|출금 가능/, 'local Studio copy does not imply real payout or server submission');
}

async function assertExampleVideos(page) {
  await page.locator('[data-action="guide-section"][data-guide-target="examples"]').click();
  assert.equal(new URL(page.url()).hash, '#guide', 'example shortcut stays on the education route');
  const video = page.locator('[data-collection-video], .collection-examples:not(.compact) .example-frame video').first();
  assert.equal(await video.count(), 1, 'guide has one collection example video player');
  assert.equal(await page.locator('.collection-examples:not(.compact) [data-action="collection-example"]').count(), examples.length, 'education exposes all six real examples');
  for (const example of examples) {
    const button = page.locator(`[data-collection-example="${example.key}"], [data-action="collection-example"][data-example="${example.key}"]`).first();
    assert.equal(await button.count(), 1, `${example.key} example selector exists`);
    assert.match(await button.innerText(), example.title, `${example.key} selector exposes the task title`);
    await button.focus();
    await button.press('Enter');
    assert.equal(await button.getAttribute('aria-pressed'), 'true', `${example.key} exposes keyboard selection`);
    assert.equal(await button.evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(10, 10, 10)', 'selected example retains the current neutral Studio selection color');
    await page.waitForFunction(key => {
      const node = document.querySelector('[data-collection-video], .collection-examples:not(.compact) .example-frame video');
      return node?.getAttribute('src')?.includes(`/collection/${key}.mp4`) &&
        node?.getAttribute('poster')?.includes(`/collection/${key}.jpg`);
    }, example.key);
    const state = await video.evaluate(node => ({
      src: node.getAttribute('src') || '',
      poster: node.getAttribute('poster') || '',
      label: node.getAttribute('aria-label') || '',
      controls: node.controls,
      paused: node.paused,
      autoplay: node.autoplay,
    }));
    assert.ok(state.src.includes(`assets/videos/collection/${example.key}.mp4`), `${example.key} uses collection mp4`);
    assert.ok(state.poster.includes(`assets/videos/collection/${example.key}.jpg`), `${example.key} uses collection poster`);
    assert.match(state.label || await page.locator('.collection-examples:not(.compact), [data-collection-examples]').first().innerText(), /60BASE|촬영 예시|filming example|일부 구간/i, `${example.key} has collection provenance visible`);
    assert.equal(state.autoplay, false, `${example.key} does not autoplay`);
    assert.equal(state.paused, true, `${example.key} stays paused before an explicit play`);
    await video.evaluate(async node => { await node.play(); });
    await page.waitForFunction(() => document.querySelector('.collection-examples video')?.currentTime > 0);
    const decoded = await video.evaluate(node => ({duration:node.duration,width:node.videoWidth,height:node.videoHeight}));
    assert.ok(decoded.width > decoded.height && Math.abs(decoded.duration - 20) < .1, `${example.key} decodes as a landscape 20-second excerpt`);
    await video.evaluate(node => node.pause());
    const responses = await page.evaluate(async ({src, poster}) => Promise.all([src, poster].map(async path => {
      const response = await fetch(new URL(path, location.href), {method: 'HEAD'});
      return {ok: response.ok, type: response.headers.get('content-type') || ''};
    })), {src: state.src, poster: state.poster});
    assert.deepEqual(responses.map(item => item.ok), [true, true], `${example.key} mp4 and poster are served`);
    assert.match(responses[0].type, /video\/mp4/, `${example.key} mp4 content type`);
    assert.match(responses[1].type, /image\/jpeg/, `${example.key} poster content type`);
  }
}

async function chooseTrainingAnswers(page, mode) {
  const values = mode === 'correct'
    ? {q1: 'landscape', q2: 'privacy', q3: 'natural'}
    : {q1: 'portrait', q2: 'tools', q3: 'acting'};
  for (const [question, answer] of Object.entries(values)) {
    const option = page.locator(`[data-action="training-answer"][data-question="${question}"][data-answer="${answer}"]`);
    assert.equal(await option.count(), 1, `${mode} answer exists for ${question}`);
    await option.click();
    await page.waitForFunction(({question: currentQuestion, answer: currentAnswer}) =>
      document.querySelector(`[data-action="training-answer"][data-question="${currentQuestion}"][data-answer="${currentAnswer}"]`)?.getAttribute('aria-pressed') === 'true',
      {question, answer});
  }
  await page.locator('[data-action="complete-training"]').click();
}

async function assertTrainingFlow(page) {
  await page.goto(`${base}/studio/#guide`, {waitUntil: 'networkidle'});
  await page.locator('.training-path').waitFor();
  assert.match(await page.locator('.training-state').innerText(), /교육 확인 전/, 'training starts incomplete');
  await chooseTrainingAnswers(page, 'wrong');
  assert.match(await page.locator('#training-message').innerText(), /정답이 아닌|다시 확인/, 'wrong answers do not complete training');
  assert.match(await page.locator('.training-state').innerText(), /교육 확인 전/, 'wrong answers keep training incomplete');
  await chooseTrainingAnswers(page, 'correct');
  assert.match(await page.locator('#training-message').innerText(), /촬영 전 점검/, 'correct answers complete training');
  assert.match(await page.locator('.training-state').innerText(), /교육 확인 완료/, 'training exposes completed state');
  await page.reload({waitUntil: 'networkidle'});
  await page.locator('.training-path').waitFor();
  assert.match(await page.locator('.training-state').innerText(), /교육 확인 완료/, 'training completion survives reload');
}

async function assertSubmissionProcess(page) {
  await page.goto(`${base}/studio/#guide`, {waitUntil: 'networkidle'});
  const processRegion = page.locator('.submission-preflight');
  await processRegion.waitFor();
  const text = await processRegion.innerText();
  assert.match(text, /가로|Landscape/i, 'process keeps landscape requirement visible');
  assert.match(text, /5분|약 5/i, 'process keeps recording length visible');
  assert.match(text, /검수|제출|신청|안내|초안|로컬|브라우저/, 'process explains review/submission or local-practice boundary');
  const checksToMark = processRegion.locator('input[data-preflight]');
  const count = await checksToMark.count();
  assert.equal(count, 4, 'process has four submission readiness checks');
  for (let index = 0; index < count; index++) await checksToMark.nth(index).check();
  assert.match(await processRegion.locator('p').first().innerText(), /4\/4개 확인됨/, 'process acknowledges completed checks');
  await page.reload({waitUntil: 'networkidle'});
  assert.equal(await page.locator('.submission-preflight input[data-preflight]:checked').count(), 4, 'submission readiness checks survive reload');
  await page.locator('[data-action="reset-preflight"]').click();
  assert.equal(await page.locator('.submission-preflight input[data-preflight]:checked').count(), 0, 'new recording clears previous preflight checks');
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.locator('.submission-preflight input[data-preflight]:checked').count(), 0, 'reset persists');
  assert.match(await page.locator('.training-state').innerText(), /교육 확인 완료/, 'new recording retains training completion');
  await page.locator('[data-action="collection-submit"]').click();
  const instructions=page.locator('#collection-instructions');
  assert.match(await instructions.innerText(),/심사 제출하기.*동의 내용을 확인/, 'submission explains local recording followed by explicit consent and review submission');
  const contactLinks=await instructions.locator('a[href^="mailto:"]').evaluateAll(links=>links.map(link=>link.getAttribute('href')));
  assert.ok(contactLinks.length>0 && contactLinks.every(href=>href.split('?')[0]==='mailto:60base.ai@gmail.com'),'contact links use the confirmed operations email');
  assert.equal(await instructions.locator('#collection-message').inputValue(),'참여 희망','reuses the confirmed participation message');
  await instructions.locator('[data-detail-close]').click();
}

async function assertStorageFailureIsRecoverable() {
  const context = await browser.newContext({viewport: {width: 390, height: 900}, reducedMotion: 'reduce'});
  await context.addInitScript(() => {
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function blockedTrainingWrite(key, value) {
      if (String(key).includes('training')) throw new DOMException('Denied by test', 'SecurityError');
      return originalSet.call(this, key, value);
    };
  });
  const page = await context.newPage();
  const errors = recordErrors(page);
  await page.goto(`${base}/studio/#guide`, {waitUntil: 'networkidle'});
  await page.locator('.training-path').waitFor();
  await chooseTrainingAnswers(page, 'correct');
  assert.match(await page.locator('.training-quiz p').first().innerText(), /저장소에 접근할 수 없어|현재 화면에서만/, 'blocked training storage is announced');
  assert.deepEqual(errors, [], 'blocked training storage does not throw runtime errors');
  await context.close();
}

async function assertKeyboardAndMobileRoute() {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({viewport: {width, height: 920}, reducedMotion: 'reduce'});
    const page = await context.newPage();
    const errors = recordErrors(page);
    await resetStudioStorage(page);
    await page.locator('[data-nav="guide"]').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('[data-nav="guide"]')?.getAttribute('aria-current') === 'page');
    await page.locator('.capture-guide-context').waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px collection guide has no horizontal overflow`);
    await page.screenshot({path: `${out}/studio-collection-${width}.png`, fullPage: true});
    assert.deepEqual(errors, [], `${width}px collection guide has no runtime errors`);
    await context.close();
  }
}

try {
  await waitForServer();
  await mkdir(out, {recursive: true});
  browser = await chromium.launch({headless: true});

  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, reducedMotion: 'reduce'});
  const page = await context.newPage();
  const errors = recordErrors(page);
  await resetStudioStorage(page);
  await assertCollectionCampaign(page);
  await assertExampleVideos(page);
  await assertTrainingFlow(page);
  await assertSubmissionProcess(page);
  assert.deepEqual(errors, [], 'desktop collection guide has no runtime errors');
  await context.close();
  checks.push('collection campaign copy, example media, training wrong/correct states, reload persistence and submission/readiness process passed');

  await assertStorageFailureIsRecoverable();
  checks.push('training storage failure announces a recoverable local limitation without runtime errors');

  await assertKeyboardAndMobileRoute();
  checks.push('guide route keyboard access and mobile/desktop overflow passed');

  await writeFile(`${out}/studio-collection-report.json`, JSON.stringify({status: 'passed', base, playwrightPath, checks}, null, 2));
  console.log(`PASS studio collection training contract. Artifacts: ${out}`);
} finally {
  await browser?.close();
  server?.kill();
}
