import test from 'node:test';
import assert from 'node:assert/strict';
import { createSamplePreview } from '../homepage/src/sample-preview.js';

class Video extends EventTarget {
  currentTime = 0;
  paused = true;
  playCalls = 0;
  loadCalls = 0;
  nextPlay = null;
  getAttribute(name) { return this[name] || null; }
  removeAttribute(name) { delete this[name]; }
  play() { this.playCalls++; this.paused = false; return this.nextPlay || Promise.resolve(); }
  pause() { this.paused = true; }
  load() { this.loadCalls++; }
  emit(type) { this.dispatchEvent(new Event(type)); }
}

function setup() {
  const video = new Video();
  const state = { reduced: false, hidden: false, playing: 0, resets: 0 };
  const controller = createSamplePreview(video, {
    source: '/assets/media/cutting-vegetables.mp4',
    isReduced: () => state.reduced,
    isHidden: () => state.hidden,
    onPlaying: () => state.playing++,
    onReset: () => state.resets++,
  });
  return { video, state, controller };
}

test('preview loads on interaction, ignores re-entry and returns to the poster after one cycle', () => {
  const { video, state, controller } = setup();
  assert.equal(video.getAttribute('src'), null);
  assert.equal(controller.start(), true);
  video.currentTime = 7;
  assert.equal(controller.start(), false);
  assert.equal(video.currentTime, 7);
  video.emit('playing');
  assert.equal(state.playing, 1);
  video.emit('ended');
  assert.equal(video.paused, true);
  assert.equal(video.currentTime, 0);
  assert.equal(state.resets, 1);
  assert.equal(controller.start(), true);
  controller.destroy();
});

test('an interrupted pending play does not reset the cycle before visibility resumes', async () => {
  const { video, state, controller } = setup();
  let rejectPlay;
  video.nextPlay = new Promise((_, reject) => { rejectPlay = reject; });
  controller.start();
  video.currentTime = 7;
  controller.suspend();
  rejectPlay(new DOMException('Interrupted by pause()', 'AbortError'));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(state.resets, 0);
  video.nextPlay = null;
  controller.resume();
  assert.equal(video.playCalls, 2);
  assert.equal(video.currentTime, 7);
  controller.destroy();
});

test('a film dialog blocks new previews and suspends an existing cycle at the same time', () => {
  const { video, state, controller } = setup();
  state.hidden = true;
  assert.equal(controller.start(), false);
  state.hidden = false;
  controller.start();
  video.currentTime = 9;
  state.hidden = true;
  controller.suspend();
  video.emit('playing');
  controller.resume();
  assert.equal(state.playing, 0);
  assert.equal(video.paused, true);
  assert.equal(video.playCalls, 1);
  state.hidden = false;
  controller.resume();
  assert.equal(video.playCalls, 2);
  assert.equal(video.currentTime, 9);
  controller.destroy();
});

test('reduced motion prevents playback and cleanup ignores late events and play rejections', async () => {
  const { video, state, controller } = setup();
  state.reduced = true;
  assert.equal(controller.start(), false);
  state.reduced = false;
  let rejectPlay;
  video.nextPlay = new Promise((_, reject) => { rejectPlay = reject; });
  controller.start();
  controller.destroy();
  video.emit('playing');
  video.emit('ended');
  rejectPlay(new DOMException('Detached source', 'AbortError'));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(state.resets, 0);
  assert.equal(state.playing, 0);
  assert.equal(video.getAttribute('src'), null);
  assert.equal(video.loadCalls, 1);
  assert.equal(controller.start(), false);
});
