import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

let reduced = false, chromium = true, playbackFails = false, Constructor;
class FakeVideo {
  canPlayType() { return 'probably'; }
  setAttribute() {}
  addEventListener(name, fn) { this[name] = fn; }
  play() { return playbackFails ? Promise.reject(new Error('autoplay denied')) : Promise.resolve(); }
  pause() { this.paused = true; }
  remove() { this.art.video = null; }
}
class FakeRoot {
  set innerHTML(value) {
    if (this.art) this.art.isConnected = false;
    this.html = value;
    this.img = { src:'/app/icons/mascot-purple-3d-20261019.png', className:'static', hidden:false };
    this.art = { isConnected:true, video:null, querySelector:() => this.art.video, appendChild:v => { this.art.video=v; v.art=this.art; } };
  }
  querySelector(s) { return s === '.art' ? this.art : s === 'img' ? this.img : this.art?.video; }
}
globalThis.HTMLElement = class {
  isConnected = true;
  getAttribute() { return this.variant || 'welcome'; }
  attachShadow() { return this.shadowRoot = new FakeRoot(); }
};
globalThis.customElements = { get:() => null, define:(_, c) => { Constructor=c; } };
globalThis.matchMedia = () => ({ matches:reduced, addEventListener(){}, removeEventListener(){ this.removed=true; } });
Object.defineProperty(globalThis,'navigator',{configurable:true,get:()=>({userAgent:chromium?'Chrome/130':'Safari/605'})});
globalThis.document = { createElement:() => new FakeVideo() };
const { mascotMotion } = await import('../app/mascot-motion.js');
assert.match(mascotMotion('processing'), /variant="processing"/);
assert.match(mascotMotion('invalid'), /variant="welcome"/);
reduced=true;
const still=new Constructor(); still.connectedCallback();
assert.equal(still.shadowRoot.art.video,null);
assert.match(still.shadowRoot.img.src,/\.png$/);
reduced=false; chromium=false;
const safari=new Constructor(); safari.variant='processing'; safari.connectedCallback();
assert.match(safari.shadowRoot.img.src,/mascot-processing-loop-20261019\.gif$/);
safari.shadowRoot.img.onerror(); assert.match(safari.shadowRoot.img.src,/\.png$/);
chromium=true;
const chrome=new Constructor(); chrome.connectedCallback();
const video=chrome.shadowRoot.art.video;
for (const flag of ['autoplay','muted','loop','playsInline']) assert.equal(video[flag],true);
video.playing(); assert.equal(video.hidden,false); assert.equal(chrome.shadowRoot.img.hidden,true);
chrome.disconnectedCallback(); assert.equal(video.paused,true); assert.equal(chrome.preference.removed,true);
playbackFails=true;
const blocked=new Constructor(); blocked.connectedCallback();
await Promise.resolve(); await Promise.resolve();
assert.equal(blocked.shadowRoot.art.video,null);
assert.match(blocked.shadowRoot.img.src,/\.gif$/);
blocked.preference.matches=true; blocked.onPreference();
assert.match(blocked.shadowRoot.img.src,/\.png$/); assert.equal(blocked.shadowRoot.art.video,null);
const camera=await readFile(new URL('../studio/camera.js',import.meta.url),'utf8');
assert.match(camera,/processing\.hidden = state !== 'finalizing'/);
assert.match(camera,/state !== 'finalizing'\) mascot\.replaceChildren/);
const css=await readFile(new URL('../studio/camera.css',import.meta.url),'utf8');
assert.match(css,/--processing-heading-height:76px/);
assert.match(css,/height:calc\(100% - var\(--processing-heading-height, 120px\)/);
console.log('PASS: reduced motion, alpha GIF fallback, GIF failure poster, Chromium video flags, playback failure, disconnect cleanup, processing-only lifecycle, compact landscape heading');

if (process.argv.includes('--built')) {
  const { createHash } = await import('node:crypto');
  for (const variant of ['welcome','processing']) {
    for (const extension of ['gif','webm']) {
      const path = `app/icons/mascot-${variant}-loop-20261019.${extension}`;
      const source = await readFile(new URL(`../${path}`, import.meta.url));
      const built = await readFile(new URL(`../dist/${path}`, import.meta.url));
      const sha = bytes => createHash('sha256').update(bytes).digest('hex');
      assert.equal(sha(built), sha(source), `Build must preserve ${path}`);
    }
  }
  console.log('PASS: all four built motion assets exist and SHA-256 matches source');
}
