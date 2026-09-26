import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const playwrightPath = process.env.PLAYWRIGHT_MODULE || resolve(homedir(), '.claude/skills/gstack/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath));
const base = process.env.STUDIO_TEST_URL || 'http://127.0.0.1:4362';
const out = resolve(process.env.STUDIO_PHYSICAL_REVIEW_DIR || '../.omx/reviews/studio-physical-20260913/tests');
const server = process.env.STUDIO_TEST_URL ? null : spawn(process.execPath, ['dev-server.mjs'], {
  cwd: new URL('../', import.meta.url),
  env: { ...process.env, PORT: '4362' },
  stdio: 'ignore',
});

const activityIds = [
  'dishwashing',
  'cutting-vegetables',
  'folding-clothes',
  'simple-cooking',
  'plants',
  'bedroom',
  'dining',
  'car-interior',
];

const videoIds = ['dishwashing', 'cutting-vegetables', 'folding-clothes'];
const noVideoIds = ['simple-cooking', 'plants', 'bedroom', 'dining', 'car-interior'];
const capturePlanKey = 'momjit-studio-capture-plan-v1';
const trainingKey = 'momjit-studio-training-v1';
const checks = [];
let browser;

async function waitForServer() {
  for (let index = 0; index < 60; index += 1) {
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

async function resetStorage(page, hash = '#missions') {
  await page.goto(`${base}/studio/${hash}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
}

async function openMissions(page) {
  await page.goto(`${base}/studio/#missions`, { waitUntil: 'networkidle' });
  await page.locator('#capture-search').waitFor();
}

async function answerTraining(page) {
  const answers = { q1: 'landscape', q2: 'privacy', q3: 'natural' };
  for (const [question, answer] of Object.entries(answers)) {
    await page.locator(`[data-action="training-answer"][data-question="${question}"][data-answer="${answer}"]`).click();
  }
  await page.locator('[data-action="complete-training"]').click();
}

async function checkAllPreflight(page) {
  const inputs = page.locator('.submission-preflight input[data-preflight]');
  assert.equal(await inputs.count(), 4, 'preflight checklist exposes four confirmed recording checks');
  for (let index = 0; index < 4; index += 1) await inputs.nth(index).check();
}

async function assertPlan(page, expected) {
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), capturePlanKey), expected);
}

try {
  await waitForServer();
  await mkdir(out, { recursive: true });
  browser = await chromium.launch({ headless: true });

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 980 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = recordErrors(page);
    await resetStorage(page);
    await openMissions(page);

    const ids = await page.locator('.capture-task').evaluateAll(nodes => nodes.map(node => node.dataset.id));
    assert.deepEqual([...ids].sort(), [...activityIds].sort(), 'missions route exposes the eight physical AI household activities');
    assert.match(await page.locator('#capture-count').innerText(), /8개/, 'live count starts from all eight activities');
    assert.equal(await page.locator('.capture-task-thumb').count(), 3, 'the three existing activities retain their compatible primary example thumbnails');
    assert.equal(await page.locator('[data-nav="missions"] .nav-count').innerText(), '8', 'primary nav count follows the physical activity catalog');

    const missionIntro = await page.locator('#workspace').innerText();
    assert.match(missionIntro, /본인 자택 · 휴대폰·노트북 카메라 · 가로 영상 약 5분/, 'missions route keeps the global recording requirements once above the list');
    assert.match(missionIntro, /검수 통과 시 건당 3,000P/, 'missions route keeps accepted-review-only reward wording once above the list');
    for (const id of activityIds) {
      const cardText = await page.locator(`.capture-task[data-id="${id}"]`).innerText();
      assert.doesNotMatch(cardText, /본인 자택|휴대폰·노트북 카메라|약\s*5분|3,000P/, `${id} does not repeat global participation terms inside each activity card`);
      assert.match(cardText, /상세 보기/, `${id} keeps detail affordance`);
      assert.match(cardText, /촬영 준비/, `${id} keeps preparation affordance`);
      assert.equal(await page.locator(`.capture-task[data-id="${id}"] [data-action="camera"][data-id="${id}"]`).count(), 1, `${id} provides direct recording with the matching activity`);
    }

    await page.locator('#capture-search').fill('채소');
    assert.deepEqual(await page.locator('.capture-task').evaluateAll(nodes => nodes.map(node => node.dataset.id)), ['cutting-vegetables'], 'search narrows by activity text');
    assert.equal(await page.locator('#capture-search').evaluate(node => node === document.activeElement), true, 'search focus is preserved after live filtering');

    await page.locator('#capture-search').fill('');
    await page.locator('[data-capture-category="주방"]').click();
    await page.locator('#capture-example-filter').click();
    assert.deepEqual(await page.locator('.capture-task').evaluateAll(nodes => nodes.map(node => node.dataset.id)), ['dishwashing', 'cutting-vegetables'], 'category and real-example filters combine');

    await page.locator('[data-action="capture-save"][data-id="dishwashing"]').click();
    await page.locator('#capture-saved-filter').click();
    assert.deepEqual(await page.locator('.capture-task').evaluateAll(nodes => nodes.map(node => node.dataset.id)), ['dishwashing'], 'saved filter combines with category and example filters');
    await assertPlan(page, { version: 1, saved: ['dishwashing'], selected: '' });

    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('#capture-saved-filter').click();
    assert.deepEqual(await page.locator('.capture-task').evaluateAll(nodes => nodes.map(node => node.dataset.id)), ['dishwashing'], 'saved activities persist across reloads');

    await page.locator('#capture-search').fill('없는활동');
    assert.match(await page.locator('#capture-results').innerText(), /조건에 맞는 활동이 없어요/, 'empty catalog state explains the no-result condition');
    await page.locator('#capture-reset').click();
    assert.equal(await page.locator('#capture-search').inputValue(), '', 'reset clears capture search');
    assert.deepEqual([...(await page.locator('.capture-task').evaluateAll(nodes => nodes.map(node => node.dataset.id)))].sort(), [...activityIds].sort(), 'reset restores the full activity catalog');
    assert.equal(await page.locator('#capture-search').evaluate(node => node === document.activeElement), true, 'reset returns focus to capture search');
    await page.screenshot({ path: `${out}/capture-catalog-1440.png`, fullPage: true });
    assert.deepEqual(errors, [], 'capture catalog has no runtime errors');
    await context.close();
    checks.push('capture catalog, combined filters, persistence, no-result reset, focus and one-program copy passed');
  }

  {
    const context = await browser.newContext({ viewport: { width: 390, height: 920 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = recordErrors(page);
    await resetStorage(page);
    await openMissions(page);

    for (const id of videoIds) {
      const opener = page.locator(`[data-action="capture-detail"][data-id="${id}"]`).first();
      await opener.focus();
      await page.keyboard.press('Enter');
      await page.locator('#capture-detail-dialog[open]').waitFor();
      const dialog = page.locator('#capture-detail-dialog');
      assert.equal(await dialog.locator('.capture-detail-layout').count(), 1, `${id} opens the two-column activity detail`);
      if (id === 'dishwashing') {
        const dialogSave = dialog.locator('[data-action="capture-save"][data-id="dishwashing"]');
        await dialogSave.click();
        assert.equal(await dialogSave.getAttribute('aria-pressed'), 'true', 'modal save button refreshes to pressed after saving');
        assert.match(await dialogSave.innerText(), /저장 해제/, 'modal save button label refreshes after saving');
        assert.equal(await page.locator('.capture-task[data-id="dishwashing"] [data-action="capture-save"]').getAttribute('aria-pressed'), 'true', 'catalog save button stays in sync with modal save');
        await dialogSave.click();
        assert.equal(await dialogSave.getAttribute('aria-pressed'), 'false', 'modal save button refreshes to unpressed after removing');
        assert.equal(await page.locator('.capture-task[data-id="dishwashing"] [data-action="capture-save"]').getAttribute('aria-pressed'), 'false', 'catalog save button stays in sync with modal remove');
      }
      assert.ok((await dialog.locator('video').getAttribute('src')).includes(`/collection/${id}.mp4`), `${id} detail uses its real collection mp4`);
      assert.ok((await dialog.locator('video').getAttribute('poster')).includes(`/collection/${id}.jpg`), `${id} detail uses its real collection poster`);
      assert.match(await dialog.innerText(), /약\s*5분|가로 화면|휴대폰·노트북 카메라|검수 통과 시 1건 3,000P/, `${id} detail keeps common terms visible`);
      await dialog.locator('video').evaluate(async node => { await node.play(); });
      await page.waitForFunction(() => document.querySelector('#capture-detail-dialog video')?.currentTime > 0);
      await dialog.locator('[data-detail-close]').click();
      await page.locator('#capture-detail-dialog').waitFor({ state: 'detached' });
      assert.equal(await page.locator(`[data-action="capture-detail"][data-id="${id}"]`).first().evaluate(node => node === document.activeElement), true, `${id} restores focus to the activity opener`);
    }

    for (const id of noVideoIds) {
      await page.locator(`[data-action="capture-detail"][data-id="${id}"]`).first().click();
      const dialog = page.locator('#capture-detail-dialog');
      await dialog.waitFor();
      assert.equal(await dialog.locator('video').count(), 0, `${id} does not fabricate an unsupported preview video`);
      assert.equal(await dialog.locator('img').count(), 0, `${id} does not fabricate an unsupported preview image`);
      assert.match(await dialog.innerText(), /아직 공개 예시 영상이 없어요/, `${id} explains missing preview media`);
      await dialog.locator('[data-detail-close]').click();
    }

    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'mobile capture detail route has no horizontal overflow');
    await page.screenshot({ path: `${out}/capture-detail-390.png`, fullPage: true });
    assert.deepEqual(errors, [], 'capture detail interactions have no runtime errors');
    await context.close();
    checks.push('activity details use only real preview media, explain unsupported previews, pause/close, restore focus and fit mobile');
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 980 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = recordErrors(page);
    await resetStorage(page, '#guide');
    await page.goto(`${base}/studio/#guide`, { waitUntil: 'networkidle' });
    await answerTraining(page);
    await page.goto(`${base}/studio/#guide`, { waitUntil: 'networkidle' });
    await checkAllPreflight(page);
    assert.match(await page.locator('.training-state').innerText(), /교육 확인 완료/, 'training starts completed before selecting next activity');
    assert.equal(await page.locator('.submission-preflight input[data-preflight]:checked').count(), 4, 'preflight starts completed before selecting next activity');

    await openMissions(page);
    await page.locator('[data-action="capture-prepare"][data-id="plants"]').click();
    assert.equal(new URL(page.url()).hash, '#guide', 'selecting an activity sends the user to education/preflight');
    assert.match(await page.locator('.training-state').innerText(), /교육 확인 완료/, 'selecting a next activity keeps completed education');
    assert.equal(await page.locator('.submission-preflight input[data-preflight]:checked').count(), 0, 'selecting a next activity resets only preflight');
    await assertPlan(page, { version: 1, saved: [], selected: 'plants' });

    await page.goto(`${base}/studio/`, { waitUntil: 'networkidle' });
    await page.locator('.page-heading h1').waitFor();
    assert.match(await page.locator('#workspace').innerText(), /집안일|촬영|보상|촬영 활동 고르기/i, 'home remains a recording entry point after selecting the next activity');
    await page.goto(`${base}/studio/#guide`, { waitUntil: 'networkidle' });
    await checkAllPreflight(page);
    await page.goto(`${base}/studio/`, { waitUntil: 'networkidle' });
    assert.match(await page.locator('#workspace').innerText(), /참여 방법|촬영 활동 고르기|보관한 영상|촬영/, 'home exposes the public recording entry points once ready');
    assert.deepEqual(errors, [], 'select-next and dashboard state have no runtime errors');
    await context.close();
    checks.push('select-next stores the local plan, resets only preflight, preserves training, and returns to the redesigned home entry points');
  }

  {
    const context = await browser.newContext({ viewport: { width: 390, height: 920 }, reducedMotion: 'reduce' });
    await context.addInitScript(key => {
      localStorage.setItem(key, '{broken');
      window.capturePlanWrites = 0;
      const write = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItemProbe(itemKey, value) {
        if (itemKey === key) window.capturePlanWrites += 1;
        return write.call(this, itemKey, value);
      };
    }, capturePlanKey);
    const page = await context.newPage();
    const errors = recordErrors(page);
    await openMissions(page);
    assert.match(await page.locator('#studio-account-status, #capture-storage-status').evaluateAll(nodes => nodes.map(node => node.textContent).join(' ')), /읽지 못해|현재 화면에서만|기존 저장값은 변경하지 않아요/, 'malformed capture storage announces local-only fallback');
    await page.locator('[data-action="capture-save"][data-id="dishwashing"]').click();
    assert.equal(await page.evaluate(() => window.capturePlanWrites), 0, 'malformed stored capture plan is not overwritten by fallback actions');
    assert.equal(await page.evaluate(key => localStorage.getItem(key), capturePlanKey), '{broken', 'malformed stored capture plan remains untouched');
    assert.deepEqual(errors, [], 'malformed capture storage has no runtime errors');
    await context.close();

    const denied = await browser.newContext({ viewport: { width: 390, height: 920 }, reducedMotion: 'reduce' });
    await denied.addInitScript(key => {
      const originalGet = Storage.prototype.getItem;
      Storage.prototype.getItem = function getItemProbe(itemKey) {
        if (itemKey === key) throw new DOMException('Denied by test', 'SecurityError');
        return originalGet.call(this, itemKey);
      };
      Storage.prototype.setItem = function setItemProbe(itemKey) {
        if (itemKey === key) throw new DOMException('Denied by test', 'SecurityError');
      };
    }, capturePlanKey);
    const deniedPage = await denied.newPage();
    const deniedErrors = recordErrors(deniedPage);
    await openMissions(deniedPage);
    await deniedPage.locator('[data-action="capture-save"][data-id="dishwashing"]').click();
    await deniedPage.locator('#capture-saved-filter').click();
    assert.deepEqual(await deniedPage.locator('.capture-task').evaluateAll(nodes => nodes.map(node => node.dataset.id)), ['dishwashing'], 'capture plan remains usable in memory when storage is denied');
    assert.match(await deniedPage.locator('#studio-account-status, #capture-storage-status').evaluateAll(nodes => nodes.map(node => node.textContent).join(' ')), /현재 화면에서만|저장소에 접근할 수 없어/, 'storage denial is visible to the participant');
    assert.deepEqual(deniedErrors, [], 'capture storage denial has no runtime errors');
    await denied.close();
    checks.push('capture plan malformed and storage-denied states are recoverable and do not overwrite unread storage');
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 980 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = recordErrors(page);
    await resetStorage(page, '#guide');
    await page.goto(`${base}/studio/#guide`, { waitUntil: 'networkidle' });
    await page.locator('.capture-guide-context').waitFor();
    assert.equal(await page.locator('.capture-guide-nav [data-action="guide-section"]').count() >= 3, true, 'guide exposes shortcut navigation for education sections');
    await page.locator('[data-action="guide-section"]').first().click();
    assert.equal(new URL(page.url()).hash, '#guide', 'guide shortcuts do not create unknown hashes');
    await openMissions(page);
    assert.equal(await page.locator('#capture-practice').count(), 0, 'public launch removes the legacy practice gallery');
    assert.equal(await page.locator('#capture-results [data-action="capture-prepare"]').count() > 0, true, 'public filming activities remain available');
    assert.deepEqual(errors, [], 'guide shortcuts and public activity catalog have no runtime errors');
    await context.close();
    checks.push('guide context shortcuts and public activity catalog passed');
  }

  await writeFile(`${out}/studio-physical-report.json`, JSON.stringify({ status: 'passed', base, playwrightPath, checks }, null, 2));
  console.log(`PASS studio physical AI contract. Artifacts: ${out}`);
} finally {
  await browser?.close();
  server?.kill();
}
