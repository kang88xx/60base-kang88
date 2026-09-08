import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const REPO_ROOT = resolve(ROOT, '..');
const REVIEW_DIR = resolve(REPO_ROOT, process.env.KOREO_REVIEW_DIR || '.omx/reviews/base60-2026-09-08');
const PORT = Number(process.env.KOREO_TEST_PORT || 4317);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const PLAYWRIGHT_MODULE = process.env.PLAYWRIGHT_MODULE || resolve(homedir(), '.claude/skills/gstack/node_modules/playwright/index.mjs');
const MAX_UPLOAD_SIZE = 250 * 1024 * 1024;
const TEST_FILTER = process.env.KOREO_TEST_FILTER || '';
const REUSE_SERVER_ONLY = process.env.KOREO_REUSE_SERVER_ONLY === '1';

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.png', 'image/png'],
  ['.webm', 'video/webm'],
]);

const results = [];

class BlockedTest extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'BlockedTest';
    this.reason = reason;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function test(name, fn) {
  results.push({ name, fn, status: 'pending' });
}

function mimeType(path) {
  return contentTypes.get(extname(path).toLowerCase()) || 'application/octet-stream';
}

function servePath(requestUrl) {
  const url = new URL(requestUrl, BASE_URL);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';
  const candidate = normalize(join(ROOT, pathname));
  if (!candidate.startsWith(ROOT)) return null;
  return candidate;
}

async function startServer() {
  await mkdir(REVIEW_DIR, { recursive: true });
  if (REUSE_SERVER_ONLY) {
    const response = await fetch(`${BASE_URL}/app/`);
    if (!response.ok) throw new Error(`Existing server at ${BASE_URL}/app/ returned ${response.status}`);
    return null;
  }
  const server = createServer(async (req, res) => {
    try {
      const target = servePath(req.url || '/');
      if (!target || !existsSync(target)) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      const info = await stat(target);
      if (!info.isFile()) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      res.writeHead(200, {
        'content-type': mimeType(target),
        'content-length': info.size,
        'cache-control': 'no-store',
      });
      createReadStream(target).pipe(res);
    } catch (error) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(error?.stack || String(error));
    }
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', async (error) => {
      if (error?.code !== 'EADDRINUSE') {
        rejectListen(error);
        return;
      }
      try {
        const response = await fetch(`${BASE_URL}/app/`);
        if (!response.ok) throw new Error(`existing server returned ${response.status}`);
        resolveListen();
      } catch (probeError) {
        rejectListen(new Error(`Port ${PORT} is in use and ${BASE_URL}/app/ did not respond: ${probeError.message}`));
      }
    });
    server.listen(PORT, '127.0.0.1', () => {
      resolveListen();
    });
  });
  return server.listening ? server : null;
}

async function importPlaywright() {
  if (!existsSync(PLAYWRIGHT_MODULE)) {
    throw new Error(`Playwright module not found: ${PLAYWRIGHT_MODULE}`);
  }
  return import(pathToFileURL(PLAYWRIGHT_MODULE).href);
}

async function resetStorage(page, path = '/app/') {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    await new Promise((resolveDelete, rejectDelete) => {
      const request = indexedDB.deleteDatabase('momjit-local-v1');
      request.onsuccess = request.onblocked = () => resolveDelete();
      request.onerror = () => rejectDelete(request.error);
    });
  });
}

async function expectNoConsoleErrors(page, label) {
  const entries = [];
  page.on('console', (msg) => {
    const text = msg.text();
    const missingSw = !existsSync(resolve(ROOT, 'sw.js'));
    if (msg.type() === 'error' && !(missingSw && text.includes('404') && text.includes('fetching the script'))) {
      entries.push(text);
    }
  });
  page.on('pageerror', (error) => entries.push(error.message));
  return async () => {
    assert(entries.length === 0, `${label} console errors: ${entries.join(' | ')}`);
  };
}

async function openUploadDialog(page, path = '/app/') {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /영상 가져오기/ }).first().click();
  await page.locator('dialog.capture-dialog').waitFor({ state: 'visible' });
  await page.locator('#capture-upload').waitFor({ state: 'visible' });
}

async function generateValidVideoBuffer(page) {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(15);
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      .find((type) => MediaRecorder.isTypeSupported(type)) || '';
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.start(20);
    const start = performance.now();
    let frame = 0;
    while (performance.now() - start < 700) {
      ctx.fillStyle = frame % 2 ? '#254cf2' : '#dcf79c';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#172026';
      ctx.fillRect(20 + (frame % 50), 28, 60, 50);
      frame += 1;
      await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
    }
    await new Promise((resolveStop) => {
      recorder.onstop = resolveStop;
      recorder.stop();
    });
    stream.getTracks().forEach((track) => track.stop());
    const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
    const buffer = await blob.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  });
  const buffer = Buffer.from(base64, 'base64');
  assert(buffer.length > 1000, `generated video fixture too small: ${buffer.length} bytes`);
  return buffer;
}

async function uploadVideoAndSave(page, title, state = 'ready', path = '/app/') {
  await openUploadDialog(page, path);
  const buffer = await generateValidVideoBuffer(page);
  await page.locator('#video-file').setInputFiles({
    name: 'momjit-valid.webm',
    mimeType: 'video/webm',
    buffer,
  });
  await page.locator('#capture-preview').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('#clip-title').fill(title);
  await page.locator('#clip-notes').fill('playwright upload fixture');
  await page.locator('#capture-consent').check();
  await page.locator(state === 'ready' ? '#save-ready' : '#save-draft').click();
  await page.getByRole('heading', { name: '기록이 저장됐어요' }).waitFor({ timeout: 15000 });
  await page.locator('.save-success [data-done]').click();
  await page.locator('dialog.capture-dialog').waitFor({ state: 'detached' });
}

async function clipByTitle(page, title) {
  return page.evaluate(async (clipTitle) => {
    const { getClips } = await import('/shared/store.js');
    return (await getClips()).find((clip) => clip.title === clipTitle) || null;
  }, title);
}

async function expectLibraryClip(page, title) {
  await page.locator('#library-list .clip-card', { hasText: title }).waitFor();
}

async function expectStudioRecord(page, title) {
  await page.locator('.record-table .record-row', { hasText: title }).waitFor();
}

async function screenshot(page, name) {
  await page.screenshot({
    path: resolve(REVIEW_DIR, `test-${name}.png`),
    fullPage: true,
  });
}

async function dispatchOversizedDrop(page) {
  await page.locator('#upload-zone').evaluate((zone, maxSize) => {
      const file = new File(['not a real video'], 'oversized.webm', { type: 'video/webm' });
      Object.defineProperty(file, 'size', { value: maxSize + 1 });
      const event = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', { value: { files: [file] } });
      zone.dispatchEvent(event);
    }, MAX_UPLOAD_SIZE);
}

async function horizontalOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return Math.max(0, doc.scrollWidth - doc.clientWidth);
  });
}

test('upload dialog validates empty, invalid, oversized, and saves a generated playable video', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await resetStorage(page);
  const noErrors = await expectNoConsoleErrors(page, 'upload validation');
  await openUploadDialog(page);

  await page.locator('#video-file').setInputFiles({
    name: 'empty.webm',
    mimeType: 'video/webm',
    buffer: Buffer.alloc(0),
  });
  await expectText(page, '#capture-status', /비어 있는 파일/);

  await page.locator('#video-file').setInputFiles({
    name: 'not-video.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('plain text is not a playable video'),
  });
  await expectText(page, '#capture-status', /재생할 수 없는 영상|화면이 없는 파일|읽는 데 시간이/);

  await dispatchOversizedDrop(page);
  await expectText(page, '#capture-status', /250 MB 이하/);

  await page.locator('[data-close]').click();
  await uploadVideoAndSave(page, '업로드 검증 기록', 'ready');
  await page.goto(`${BASE_URL}/app/#library`, { waitUntil: 'domcontentloaded' });
  await expectLibraryClip(page, '업로드 검증 기록');
  await page.locator('#library-list').getByText('준비 완료').first().waitFor();
  const saved = await clipByTitle(page, '업로드 검증 기록');
  assert(saved, 'saved upload clip was not found in IndexedDB');
  assert(Number.isFinite(saved.duration) && saved.duration > 0, `expected uploaded generated WebM duration > 0, got ${saved.duration}`);
  await noErrors();
  await context.close();
});

test('clip quota failure keeps preview, restores controls, retries save, and downloads saved video', async ({ browser }) => {
  const context = await browser.newContext({ acceptDownloads: true });
  await context.addInitScript(() => {
    window.__failClipPut = true;
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function patchedPut(value, key) {
      if (window.__failClipPut && this.name === 'clips') {
        throw new DOMException('Quota exceeded by test', 'QuotaExceededError');
      }
      return originalPut.call(this, value, key);
    };
  });
  const page = await context.newPage();
  const noErrors = await expectNoConsoleErrors(page, 'quota recovery');
  await resetStorage(page);
  await openUploadDialog(page);
  const buffer = await generateValidVideoBuffer(page);
  await page.locator('#video-file').setInputFiles({
    name: 'quota-recovery.webm',
    mimeType: 'video/webm',
    buffer,
  });
  await page.locator('#capture-preview').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('#clip-title').fill('저장 공간 복구 기록');
  await page.locator('#capture-consent').check();

  await page.locator('#save-ready').click();
  await expectText(page, '#capture-status', /저장 공간이 부족해요/);
  await page.locator('#capture-preview').waitFor({ state: 'visible' });
  assert(!(await page.locator('#save-ready').isDisabled()), 'ready save button was not restored after quota failure');
  assert(!(await page.locator('#save-draft').isDisabled()), 'draft save button was not restored after quota failure');
  assert(await page.locator('#preview-video').getAttribute('src'), 'preview video src was lost after quota failure');

  await page.evaluate(() => {
    window.__failClipPut = false;
  });
  await page.locator('#save-ready').click();
  await page.getByRole('heading', { name: '기록이 저장됐어요' }).waitFor({ timeout: 15000 });
  await page.locator('.save-success [data-open]').click();
  await page.locator('#download-clip').waitFor({ state: 'visible', timeout: 15000 });
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#download-clip').click();
  const download = await downloadPromise;
  const downloadedPath = await download.path();
  assert(downloadedPath, 'download did not produce a local file path');
  const downloaded = await stat(downloadedPath);
  assert(downloaded.size > 0, `downloaded video was empty: ${downloaded.size} bytes`);
  assert(/\.(webm|mp4|mov)$/i.test(download.suggestedFilename()), `download filename lacks video extension: ${download.suggestedFilename()}`);
  await noErrors();
  await context.close();
});

test('camera permission denied can recover to upload mode', async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const denied = new DOMException('Permission denied by test', 'NotAllowedError');
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => Promise.reject(denied) },
    });
  });
  const page = await context.newPage();
  const noErrors = await expectNoConsoleErrors(page, 'permission denied recovery');
  await page.goto(`${BASE_URL}/app/#capture`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /카메라로 촬영/ }).first().click();
  await page.locator('#enable-camera').click();
  await expectText(page, '#capture-status', /카메라 권한이 허용되지 않았어요/);
  await page.getByLabel('영상 추가 방법').getByRole('button', { name: /영상 가져오기/ }).click();
  await page.locator('#capture-upload').waitFor({ state: 'visible' });
  await expectText(page, '#capture-status', /^$/);
  await noErrors();
  await context.close();
});

test('fake camera records video and releases tracks after stop', async ({ chromium }) => {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--no-sandbox',
    ],
  });
  try {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      window.__stoppedTracks = 0;
      const originalStop = MediaStreamTrack.prototype.stop;
      MediaStreamTrack.prototype.stop = function patchedStop() {
        window.__stoppedTracks += 1;
        return originalStop.call(this);
      };
    });
    const page = await context.newPage();
    const noErrors = await expectNoConsoleErrors(page, 'fake camera');
    await page.goto(`${BASE_URL}/app/#capture`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /카메라로 촬영/ }).first().click();
    await page.locator('#enable-camera').click();
    await page.locator('#start-record').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('#start-record').click();
    await page.waitForTimeout(900);
    await page.locator('#stop-record').click();
    await page.locator('#capture-preview').waitFor({ state: 'visible', timeout: 15000 });
    const stoppedTracks = await page.evaluate(() => window.__stoppedTracks);
    assert(stoppedTracks >= 1, `expected at least one stopped media track, got ${stoppedTracks}`);
    await expectText(page, '#video-meta', /160|320|640|1280|×|KB|MB/);
    await noErrors();
  } finally {
    await browser.close();
  }
});

test('fake camera can retry recording inside the same capture dialog', async ({ chromium }) => {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--no-sandbox',
    ],
  });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const noErrors = await expectNoConsoleErrors(page, 'fake camera retry');
    await page.goto(`${BASE_URL}/app/#capture`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /카메라로 촬영/ }).first().click();
    await page.locator('#enable-camera').click();
    await page.locator('#start-record').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('#start-record').click();
    await page.waitForTimeout(600);
    await page.locator('#stop-record').click();
    await page.locator('#capture-preview').waitFor({ state: 'visible', timeout: 15000 });

    await page.locator('#retry-video').click();
    await page.locator('#enable-camera').click();
    await page.locator('#start-record').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('#start-record').click();
    await page.waitForTimeout(600);
    const disabledBeforeStop = await page.locator('#stop-record').isDisabled();
    assert(!disabledBeforeStop, 'stop record button stayed disabled before retry stop');
    await page.locator('#stop-record').click();
    await page.locator('#capture-preview').waitFor({ state: 'visible', timeout: 15000 });
    await noErrors();
  } finally {
    await browser.close();
  }
});

test('pending camera permission releases late streams on mode switch and close', async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.__pendingStreams = [];
    window.__stopCount = 0;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => new Promise((resolveStream) => {
          window.__pendingStreams.push(() => {
            const canvas = document.createElement('canvas');
            canvas.width = 80;
            canvas.height = 60;
            canvas.getContext('2d').fillRect(0, 0, 80, 60);
            const stream = canvas.captureStream(5);
            stream.getTracks().forEach((track) => {
              const original = track.stop.bind(track);
              track.stop = () => {
                window.__stopCount += 1;
                original();
              };
            });
            resolveStream(stream);
          });
        }),
      },
    });
  });
  const page = await context.newPage();
  const noErrors = await expectNoConsoleErrors(page, 'late stream release');

  await page.goto(`${BASE_URL}/app/#capture`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /카메라로 촬영/ }).first().click();
  await page.locator('#enable-camera').click();
  await page.getByLabel('영상 추가 방법').getByRole('button', { name: /영상 가져오기/ }).click();
  await page.evaluate(() => window.__pendingStreams.shift()());
  await page.waitForFunction(() => window.__stopCount >= 1);

  await page.getByLabel('영상 추가 방법').getByRole('button', { name: /카메라로 촬영/ }).click();
  await page.locator('#enable-camera').click();
  await page.locator('[data-close]').click();
  await page.evaluate(() => window.__pendingStreams.shift()());
  await page.waitForFunction(() => window.__stopCount >= 2);
  await noErrors();
  await context.close();
});

test('app and studio share dashboard/library profile, edit, delete, reload, and cross-tab IndexedDB state', async ({ browser }) => {
  const context = await browser.newContext();
  const app = await context.newPage();
  const studio = await context.newPage();
  const noAppErrors = await expectNoConsoleErrors(app, 'cross-tab app');
  const noStudioErrors = await expectNoConsoleErrors(studio, 'cross-tab studio');
  await resetStorage(app);

  await app.goto(`${BASE_URL}/app/#profile`, { waitUntil: 'domcontentloaded' });
  await app.locator('#profile-name').fill('테스터');
  await app.locator('#profile-goal').fill('7');
  await app.getByRole('button', { name: /^저장$/ }).click();
  await expectText(app, '#profile-status', /프로필을 저장했습니다/);
  await app.goto(`${BASE_URL}/app/`, { waitUntil: 'domcontentloaded' });
  await app.getByText('테스터님,').waitFor();
  await studio.goto(`${BASE_URL}/studio/#profile`, { waitUntil: 'domcontentloaded' });
  await studio.locator('#profile-name').waitFor();
  await studio.locator('#profile-name').fill('작성 중 이름');

  await app.goto(`${BASE_URL}/app/#profile`, { waitUntil: 'domcontentloaded' });
  await app.locator('#profile-name').fill('다른 탭 저장');
  await app.getByRole('button', { name: /^저장$/ }).click();
  await expectText(app, '#profile-status', /프로필을 저장했습니다/);
  await studio.bringToFront();
  await studio.waitForTimeout(300);
  await expectInputValue(studio, '#profile-name', '작성 중 이름');

  await studio.goto(`${BASE_URL}/studio/#library`, { waitUntil: 'domcontentloaded' });
  await expectText(studio, '#library-results', /첫 번째 기록을 기다리고 있어요|첫 기록 만들기/);
  await uploadVideoAndSave(app, '교차 탭 원본', 'draft');
  await studio.bringToFront();
  await studio.reload({ waitUntil: 'domcontentloaded' });
  await studio.goto(`${BASE_URL}/studio/#library`, { waitUntil: 'domcontentloaded' });
  await expectStudioRecord(studio, '교차 탭 원본');
  await studio.locator('#library-results').getByText('초안').first().waitFor();

  await app.reload({ waitUntil: 'domcontentloaded' });
  await app.goto(`${BASE_URL}/app/#library`, { waitUntil: 'domcontentloaded' });
  await expectLibraryClip(app, '교차 탭 원본');
  await studio.getByRole('button', { name: /교차 탭 원본/ }).first().click();
  await studio.locator('#detail-title').fill('교차 탭 수정됨');
  await studio.locator('#detail-state').selectOption('ready');
  await studio.getByRole('button', { name: '변경 저장' }).click();
  await expectText(studio, '#detail-status', /변경사항을 저장했어요/);
  await studio.locator('[data-close]').click();

  await app.reload({ waitUntil: 'domcontentloaded' });
  await app.goto(`${BASE_URL}/app/#library`, { waitUntil: 'domcontentloaded' });
  await expectLibraryClip(app, '교차 탭 수정됨');
  await app.locator('#library-list').getByText('준비 완료').first().waitFor();

  await studio.goto(`${BASE_URL}/studio/#library`, { waitUntil: 'domcontentloaded' });
  await studio.getByRole('button', { name: /교차 탭 수정됨/ }).first().click();
  await studio.getByRole('button', { name: /^삭제$/ }).click();
  await studio.getByRole('button', { name: '기록 삭제' }).click();
  await studio.locator('dialog.capture-dialog').waitFor({ state: 'detached' });
  await app.reload({ waitUntil: 'domcontentloaded' });
  await app.goto(`${BASE_URL}/app/#library`, { waitUntil: 'domcontentloaded' });
  await expectText(app, '#library-list', /저장된 기록이 없습니다|기록 만들기/);
  await noAppErrors();
  await noStudioErrors();
  await context.close();
});

test('studio dashboard and library create records through shared upload UI', async ({ browser }) => {
  const context = await browser.newContext();
  const studio = await context.newPage();
  const app = await context.newPage();
  const noStudioErrors = await expectNoConsoleErrors(studio, 'studio dashboard library');
  const noAppErrors = await expectNoConsoleErrors(app, 'studio to app update');
  await resetStorage(studio, '/studio/');

  await studio.goto(`${BASE_URL}/studio/`, { waitUntil: 'domcontentloaded' });
  await studio.getByRole('heading', { name: /반가워요/ }).waitFor();
  await studio.locator('.side-nav').getByRole('link', { name: /^내 기록$/ }).click();
  await expectText(studio, '#library-results', /첫 번째 기록을 기다리고 있어요|첫 기록 만들기/);
  await uploadVideoAndSave(studio, '스튜디오 업로드 기록', 'ready', '/studio/#library');
  await studio.goto(`${BASE_URL}/studio/#library`, { waitUntil: 'domcontentloaded' });
  await expectStudioRecord(studio, '스튜디오 업로드 기록');
  await studio.locator('#record-search').fill('스튜디오 업로드');
  await expectStudioRecord(studio, '스튜디오 업로드 기록');

  await app.goto(`${BASE_URL}/app/#library`, { waitUntil: 'domcontentloaded' });
  await expectLibraryClip(app, '스튜디오 업로드 기록');
  await noStudioErrors();
  await noAppErrors();
  await context.close();
});

test('company, app, and studio surfaces have no console errors, support keyboard focus, and avoid mobile overflow', async ({ browser }) => {
  const routes = [
    { label: 'company desktop', path: '/', width: 1440, height: 1000 },
    { label: 'company mobile', path: '/', width: 390, height: 844 },
    { label: 'app mobile', path: '/app/', width: 390, height: 844 },
    { label: 'app desktop', path: '/app/', width: 1440, height: 1000 },
    { label: 'studio mobile', path: '/studio/', width: 390, height: 844 },
    { label: 'studio desktop', path: '/studio/', width: 1440, height: 1000 },
  ];

  const context = await browser.newContext();
  for (const route of routes) {
    const page = await context.newPage();
    const noErrors = await expectNoConsoleErrors(page, route.label);
    await page.setViewportSize({ width: route.width, height: route.height });
    await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => null);
    await screenshot(page, route.label.replaceAll(' ', '-'));
    const overflow = await horizontalOverflow(page);
    assert(overflow <= 1, `${route.label} horizontal overflow ${overflow}px`);
    await page.keyboard.press('Tab');
    const active = await page.evaluate(() => {
      const el = document.activeElement;
      return { tag: el?.tagName, text: el?.textContent?.trim(), href: el?.getAttribute?.('href') };
    });
    assert(active.tag && active.tag !== 'BODY', `${route.label} did not move keyboard focus`);
    await noErrors();
    await page.close();
  }
  await context.close();
});

test('service worker provides app shell offline after initial load when sw.js exists', async ({ browser }) => {
  if (!existsSync(resolve(ROOT, 'sw.js'))) {
    throw new BlockedTest('koreo-site/sw.js is not present yet');
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  const noErrors = await expectNoConsoleErrors(page, 'service worker offline');
  await page.goto(`${BASE_URL}/app/`, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.goto(`${BASE_URL}/app/`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: /짧고 선명하게/ }).waitFor();
  await noErrors();
  await context.close();
});

async function expectText(page, selector, pattern) {
  await page.waitForFunction(
    ({ selector: targetSelector, source, flags }) => {
      const text = document.querySelector(targetSelector)?.textContent || '';
      return new RegExp(source, flags).test(text);
    },
    { selector, source: pattern.source, flags: pattern.flags },
    { timeout: 15000 },
  );
}

async function expectInputValue(page, selector, value) {
  await page.waitForFunction(
    ({ selector: targetSelector, value: expected }) => document.querySelector(targetSelector)?.value === expected,
    { selector, value },
    { timeout: 15000 },
  );
}

async function run() {
  const startedAt = new Date().toISOString();
  const server = await startServer();
  let browser;
  try {
    const { chromium } = await importPlaywright();
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const selected = TEST_FILTER
      ? results.filter((entry) => entry.name.toLowerCase().includes(TEST_FILTER.toLowerCase()))
      : results;
    if (!selected.length) throw new Error(`No tests matched KOREO_TEST_FILTER=${TEST_FILTER}`);
    for (const entry of [...selected]) {
      if (typeof entry.fn !== 'function') continue;
      const start = Date.now();
      try {
        await entry.fn({ browser, chromium });
        entry.status = entry.status === 'blocked' ? 'blocked' : 'passed';
      } catch (error) {
        if (error instanceof BlockedTest) {
          entry.status = 'blocked';
          entry.reason = error.reason;
        } else {
          entry.status = 'failed';
          entry.error = error?.stack || String(error);
        }
      } finally {
        entry.durationMs = Date.now() - start;
        delete entry.fn;
      }
    }
  } finally {
    if (browser) await browser.close().catch(() => null);
    if (server) await new Promise((resolveClose) => server.close(resolveClose));
  }

  const completedAt = new Date().toISOString();
  const summary = {
    passed: results.filter((result) => result.status === 'passed').length,
    failed: results.filter((result) => result.status === 'failed').length,
    blocked: results.filter((result) => result.status === 'blocked').length,
  };
  const report = {
    startedAt,
    completedAt,
    baseUrl: BASE_URL,
    playwrightModule: PLAYWRIGHT_MODULE,
    filter: TEST_FILTER || null,
    summary,
    results: results.filter((result) => result.status !== 'pending').map(({ fn, ...result }) => result),
  };
  await writeFile(resolve(REVIEW_DIR, 'test-playwright-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (summary.failed) process.exitCode = 1;
}

run().catch(async (error) => {
  const report = {
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    playwrightModule: PLAYWRIGHT_MODULE,
    summary: { passed: 0, failed: 1, blocked: 0 },
    results: [{ name: 'runner startup', status: 'failed', error: error?.stack || String(error) }],
  };
  await writeFile(resolve(REVIEW_DIR, 'test-playwright-report.json'), `${JSON.stringify(report, null, 2)}\n`).catch(() => null);
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
});
