import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import { VIDEO_TARGET_SECONDS, videoDurationError, assertVideoDuration } from '../shared/video-policy.js';

const roots = [
  ['public', new URL('../', import.meta.url), new URL('../', import.meta.url)],
];
for (const [name, root, app] of roots) {
  const source = (await readFile(new URL('studio/camera.js', root), 'utf8')).replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  function camera() {
    const context = vm.createContext({ VIDEO_TARGET_SECONDS, videoDurationError, assertVideoDuration, saveClip: () => { throw Error('must not persist footage'); } });
    vm.runInContext(source + '\nglobalThis.Controller = StudioCamera;', context);
    const c = Object.create(context.Controller.prototype);
    Object.assign(c, { reviewBlob: new Blob(['video'], { type: 'video/webm' }), reviewMeta: { duration: 60 }, metadataValid: true,
      activity: { id: 'dishwashing', title: 'Dishwashing' }, isCurrent: () => true, dialog: { open: true }, saveButton: {},
      setSaveStatus(value) { this.message = value; }, close() { this.closed = true; } });
    return c;
  }
  test(`${name}: camera hands original blob to consent without saving`, async () => {
    const c = camera(), blob = c.reviewBlob;
    c.onSubmit = async (clip, { isCurrent }) => { assert.equal(clip.blob, blob); assert.equal(clip.activityId, 'dishwashing'); assert.equal(isCurrent(), true); return true; };
    await c.submitReview(); assert.equal(c.closed, true); assert.equal(c.submitting, false);
  });
  test(`${name}: failed handoff retains footage and permits retry`, async () => {
    const c = camera(), blob = c.reviewBlob;
    c.onSubmit = async () => { throw Error('offline'); };
    await c.submitReview(); assert.equal(c.closed, undefined); assert.equal(c.reviewBlob, blob); assert.equal(c.saveButton.disabled, false);
    c.onSubmit = async () => true; await c.submitReview(); assert.equal(c.closed, true);
  });
  test(`${name}: duration and account guards reject before submission`, async () => {
    for (const duration of [59, 91]) { const c = camera(); c.reviewMeta.duration = duration; c.onSubmit = () => assert.fail('invalid duration'); await c.submitReview(); assert.ok(c.message); }
    const c = camera(); c.isCurrent = () => false; c.onSubmit = () => assert.fail('stale account'); await c.submitReview(); assert.equal(c.closed, undefined);
  });
  test(`${name}: concurrent clicks and account changes cannot close a stale camera`, async () => {
    const c = camera(); let finish, calls = 0;
    c.onSubmit = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
    const pending = c.submitReview(); await c.submitReview(); assert.equal(calls, 1);
    c.isCurrent = () => false; finish(true); await pending; assert.equal(c.closed, undefined);
  });

  const online = await readFile(new URL('studio/online.js', app), 'utf8');
  const upload = online.slice(online.indexOf('async function uploadDialog('), online.indexOf('export async function viewVideo('));
  function uploadFixture() {
    const nodes = new Map();
    const node = () => ({ value: '', files: [], disabled: false, hidden: false, textContent: '', addEventListener() {}, focus() {}, querySelector: select, classList: { add() {} } });
    function select(key) { if (!nodes.has(key)) nodes.set(key, node()); return nodes.get(key); }
    const elements = Object.fromEntries(['local', 'file', 'title', 'taskId'].map(key => [key, node()]));
    const form = { elements, querySelector: select, querySelectorAll: () => [] };
    const d = { open: true, isConnected: true, querySelector: key => key === 'form' ? form : select(key), addEventListener() {}, classList: { add() {} }, close() { this.open = false; } };
    const calls = []; let consent = false, fail = true, duration = 60, markup;
    const session = { online: true, user: { id: 'member' } };
    const context = vm.createContext({
      document: { querySelector: () => ({}) }, session, sessionEpoch: 1, AbortController, DOMException, crypto,
      getClips: () => assert.fail('direct submission must not read local library'),
      dialog: (_title, html) => { markup = html; return d; }, esc: String, points: String, size: String,
      icon: () => '', uploadMark: '', VIDEO_DURATION_HELP: '', consentFields: '', statusLine: '', bindConsentValidation() {}, busy() {},
      readConsent: () => { if (!consent) throw Error('consent required'); return { filming: true }; },
      FormData: class { get(key) { return elements[key]?.value; } }, metadata: async () => ({ duration, width: 64, height: 48 }),
      assertVideoDuration, uploadFileInfo: async file => ({ mime: file.type, filename: 'video.webm' }),
      api: async (path, options) => { calls.push([path, options]); if (fail) throw Error('offline'); if (path === '/uploads') return { id: 'upload', chunkSize: 100 }; throw Error('stop after upload starts'); },
    });
    vm.runInContext(upload + '\nglobalThis.openUpload = uploadDialog;', context);
    return { context, form, calls, d, session, nodes, get markup() { return markup; }, consent: () => { consent = true; }, connect: () => { fail = false; }, duration: value => { duration = value; } };
  }
  test(`${name}: direct import preserves activity and bypasses local storage`, async () => {
    const f = uploadFixture();
    assert.equal(await f.context.openUpload({ tasks: [{ id: 'dishwashing', title: 'Wash', reward: 1000 }], settings: { maxVideoBytes: 100 } }, () => {}, { activity: { id: 'dishwashing', title: 'Wash' } }), true);
    assert.equal(f.form.elements.taskId.value, 'dishwashing'); assert.equal(f.form.elements.title.value, 'Wash'); assert.match(f.markup, /data-local-records hidden/); assert.equal(f.calls.length, 0);
  });
  test(`${name}: camera blob requires consent and duration validation; failed upload retries same blob`, async () => {
    const f = uploadFixture(), blob = new Blob(['video'], { type: 'video/webm' });
    await f.context.openUpload({ tasks: [{ id: 'dishwashing', title: 'Wash', reward: 1000 }], settings: { maxVideoBytes: 100 } }, () => {}, { clip: { id: 'camera-pending', activityId: 'dishwashing', title: 'Wash', blob } });
    assert.equal(f.form.elements.local.value, 'camera-pending');
    const submit = () => f.form.onsubmit({ preventDefault() {} });
    await submit(); assert.equal(f.calls.length, 0);
    f.consent(); f.duration(59); await submit(); assert.equal(f.calls.length, 0);
    f.duration(60); await submit(); assert.equal(f.calls.length, 1); assert.equal(f.calls[0][1].body.size, blob.size);
    await submit(); assert.equal(f.calls.length, 2); assert.equal(f.calls[1][1].body.taskId, 'dishwashing');
  });
}
