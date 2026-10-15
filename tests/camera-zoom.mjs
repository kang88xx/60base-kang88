import { VIDEO_TARGET_SECONDS, videoDurationError, assertVideoDuration } from '../shared/video-policy.js';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = (await readFile(new URL('../studio/camera.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture({ capability = { min: 0.5, max: 4, step: 0.1 }, initial = 0.5, apply } = {}) {
  let zoom = initial;
  const calls = [];
  const constraintsSeen = [];
  const track = {
    readyState: 'live', addEventListener() {}, getCapabilities: () => ({ zoom: capability }), getSettings: () => ({ zoom }),
    stop() { this.readyState = 'ended'; },
    async applyConstraints(constraints) {
      const value = constraints.advanced[0].zoom;
      calls.push(value);
      constraintsSeen.push(constraints);
      if (apply) await apply(value);
      else zoom = value;
    },
  };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  const context = vm.createContext({
    VIDEO_TARGET_SECONDS, videoDurationError, assertVideoDuration,
    navigator: {}, document: { hidden: false, dispatchEvent() {} },
    window: { setTimeout, setInterval, addEventListener() {}, removeEventListener() {} },
    // Advance the verification poll without 300 ms of wall-clock delay.
    setTimeout: callback => setImmediate(callback), clearTimeout, clearInterval, performance,
    CustomEvent: class {}, MediaRecorder: class {
      constructor(input) { this.stream = input; this.state = 'inactive'; }
      start() { this.state = 'recording'; this.onstart?.(); } stop() { this.state = 'inactive'; }
    },
  });
  vm.runInContext(source + '\nglobalThis.Controller = StudioCamera;', context);
  const node = () => ({ hidden: false, disabled: false, textContent: '', classList: { toggle() {} } });
  const buttons = [0.5, 1, 2].map(value => ({ ...node(), dataset: { zoom: String(value) }, attrs: {}, setAttribute(key, value) { this.attrs[key] = value; } }));
  const camera = Object.create(context.Controller.prototype);
  Object.assign(camera, {
    stream, generation: 1, closed: false, state: 'ready', isCurrent: () => true,
    dialog: { open: true, dataset: {}, querySelector: () => node() },
    zoomNode: node(), zoomStatus: node(), zoomButtons: buttons,
    recordButton: node(), stopButton: node(), retryButton: node(), timerNode: { ...node(), querySelector: () => node() },
    reviewSheet: node(), flipButton: node(), guideButton: node(), statusNode: node(), errorNode: node(),
    liveVideo: { srcObject: stream }, devices: [{ deviceId: 'rear' }, { deviceId: 'front' }], deviceIndex: 0,
    updateTimer() {},
  });
  return { camera, track, stream, calls, constraintsSeen, buttons, context, setActual(value) { zoom = value; } };
}
const selected = buttons => buttons.filter(button => button.attrs['aria-pressed'] === 'true').map(button => button.dataset.zoom);

test('default and 0.5× / 2× apply directly to the same track recorded by MediaRecorder', async () => {
  const { camera, calls, buttons, stream } = fixture();
  await camera.prepareZoom(1);
  assert.deepEqual(calls, [1], 'WebKit default 0.5 must actually change to 1');
  assert.deepEqual(selected(buttons), ['1']);
  await camera.setZoom(0.5);
  assert.deepEqual(selected(buttons), ['0.5']);
  camera.startRecording();
  assert.equal(camera.recorder.stream, stream);
  await camera.setZoom(2);
  assert.deepEqual(calls, [1, 0.5, 2], 'Use returned range without lens normalization');
  assert.deepEqual(selected(buttons), ['2']);
  assert.equal(camera.recorder.stream.getVideoTracks()[0], stream.getVideoTracks()[0]);
  clearTimeout(camera.limitTimer); clearInterval(camera.recordTimer);
});

test('unsupported or malformed capabilities never pretend to apply zoom', async () => {
  for (const capability of [null, { min: 0, max: 2 }, { min: 0.5, max: Infinity }, { min: 0.5, max: 4, step: 0 }]) {
    const { camera, calls, buttons } = fixture({ capability, initial: undefined });
    await camera.prepareZoom(1);
    await camera.setZoom(2);
    assert.deepEqual(calls, []);
    assert.ok(buttons.every(button => button.disabled));
    assert.match(camera.zoomStatus.textContent, /지원하지/);
  }
});

test('range and step determine each preset availability', async () => {
  const { camera, buttons } = fixture({ capability: { min: 1, max: 3, step: 0.75 }, initial: 1 });
  await camera.prepareZoom(1);
  assert.deepEqual(buttons.map(button => button.disabled), [true, false, true]);
});

test('ignored or rejected constraints restore the actual selected zoom and explain failure', async () => {
  for (const apply of [async () => {}, async () => { throw new Error('device rejected'); }]) {
    const { camera, buttons, calls } = fixture({ initial: 1, apply });
    await camera.prepareZoom(1);
    await camera.setZoom(2);
    assert.deepEqual(calls, [1, 2]);
    assert.deepEqual(selected(buttons), ['1']);
    assert.match(camera.zoomStatus.textContent, /적용되지|변경하지 못/);
  }
});

test('rapid intents are serialized and the last applied preset is selected', async () => {
  let release;
  const { camera, calls, buttons, setActual } = fixture({ initial: 1, apply: async value => {
    if (value === 0.5) await new Promise(resolve => { release = resolve; });
    setActual(value);
  } });
  await camera.prepareZoom(1);
  const first = camera.setZoom(0.5);
  const second = camera.setZoom(2);
  await flush();
  assert.deepEqual(calls, [1, 0.5]);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(calls, [1, 0.5, 2]);
  assert.deepEqual(selected(buttons), ['2']);
});

test('close or replacement stream invalidates in-flight and queued zoom intents', async () => {
  for (const replace of [false, true]) {
    let release;
    const { camera, calls, setActual } = fixture({ initial: 1, apply: async value => {
      if (value === 0.5) await new Promise(resolve => { release = resolve; });
      setActual(value);
    } });
    await camera.prepareZoom(1);
    const first = camera.setZoom(0.5), second = camera.setZoom(2);
    await flush();
    const statusBefore = camera.zoomStatus.textContent;
    camera.generation++;
    if (replace) camera.stream = { getVideoTracks: () => [] };
    else camera.closed = true;
    release();
    await Promise.all([first, second]);
    assert.deepEqual(calls, [1, 0.5], 'Queued request never touches stale track');
    assert.equal(camera.zoomStatus.textContent, statusBefore, 'Late result cannot change UI');
  }
});

test('recording blocks device replacement but allows same-track zoom; stop invalidates queued changes', async () => {
  const { camera, calls, buttons, stream } = fixture({ initial: 1 });
  await camera.prepareZoom(1);
  camera.startRecording();
  camera.flipCamera();
  await camera.startCamera('front');
  assert.equal(camera.stream, stream);
  assert.equal(camera.deviceIndex, 0);
  await camera.setZoom(2);
  assert.deepEqual(selected(buttons), ['2']);
  camera.stopRecording();
  await camera.setZoom(0.5);
  assert.deepEqual(calls, [1, 2]);
  assert.equal(camera.stream, null);
  assert.equal(camera.zoomNode.hidden, true);
});


test('zoom preserves acquisition constraints and nonzoom advanced settings without conflicting old zoom', async () => {
  const { camera, track, constraintsSeen } = fixture({ initial: 1 });
  track.getConstraints = () => ({
    deviceId: { exact: 'rear' }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { max: 30 },
    zoom: { exact: 0.5 }, advanced: [{ zoom: 0.5, exposureMode: 'continuous' }, { torch: true }],
  });
  await camera.prepareZoom(1);
  const actual = JSON.parse(JSON.stringify(constraintsSeen[0]));
  assert.deepEqual(actual, {
    deviceId: { exact: 'rear' }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { max: 30 },
    advanced: [{ exposureMode: 'continuous' }, { torch: true }, { zoom: 1 }],
  });
});

test('hung default zoom cannot block capture; subsequent requests cannot overlap unresolved device work', async () => {
  let release;
  const { camera, stream, calls, buttons, context, setActual } = fixture({ apply: () => new Promise(resolve => { release = resolve; }) });
  camera.stream = null;
  camera.clearReview = () => {};
  camera.reviewStage = { hidden: true };
  camera.liveVideo.play = async () => {};
  camera.enumerateDevices = async () => {};
  context.navigator.mediaDevices = { getUserMedia: async () => stream };
  await camera.startCamera();
  assert.equal(camera.state, 'ready', 'Timeout reaches usable capture screen');
  assert.equal(camera.zoomSession.blocked, true);
  assert.ok(buttons.every(button => button.disabled));
  assert.deepEqual(selected(buttons), ['0.5'], 'Never claim default 1 applied');
  await camera.setZoom(2);
  assert.deepEqual(calls, [1], 'No overlapping device operation after timeout');
  camera.startRecording();
  assert.equal(camera.recorder.stream, stream);
  setActual(1);
  release();
  await flush();
  assert.deepEqual(selected(buttons), ['1'], 'Late settlement updates actual UI honestly');
  assert.ok(buttons.every(button => button.disabled), 'Reopen is required before new constraints');
  clearTimeout(camera.limitTimer); clearInterval(camera.recordTimer);
});


test('portrait capture waits for landscape without discarding the ready stream or zoom', async () => {
  const { camera, stream, context, buttons } = fixture({ initial: 1 });
  await camera.prepareZoom(1);
  context.window.matchMedia = () => ({ matches: true });
  camera.startRecording();
  assert.equal(camera.state, 'ready');
  assert.equal(camera.recorder, undefined);
  assert.equal(camera.stream, stream);
  assert.deepEqual(selected(buttons), ['1']);
  assert.match(camera.errorNode.textContent, /가로로/);
  context.window.matchMedia = () => ({ matches: false });
  camera.startRecording();
  assert.equal(camera.state, 'recording');
  assert.equal(camera.recorder.stream, stream);
  clearTimeout(camera.limitTimer); clearInterval(camera.recordTimer);
});
