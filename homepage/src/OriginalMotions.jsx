import { useEffect, useRef } from 'react';
import './original-motions.css';

// Pauses elapsed time offscreen, in a hidden page and under reduced motion.
// Each component owns its observer, animation frame and event cleanup.
function animateWhenVisible(host, render, options = {}) {
  const { duration = Infinity, maxDelta = Infinity, threshold = 0, overlay = null } = options;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let visible = false, suspended = false, elapsed = 0, previous = 0, raf = 0, destroyed = false;
  const isReduced = () => reduced.matches || document.documentElement.dataset.reducedMotion === 'true';
  const allowed = () => !destroyed && visible && !document.hidden && !suspended && !isReduced();
  const stop = () => { cancelAnimationFrame(raf); raf = 0; previous = 0; };
  function sync() {
    stop();
    const active = allowed() && elapsed < duration;
    host.dataset.motion = isReduced() ? 'static' : elapsed >= duration ? 'finished' : active ? 'running' : 'paused';
    if (overlay) overlay.style.visibility = isReduced() ? 'hidden' : 'visible';
    if (isReduced() && Number.isFinite(duration)) render(duration);
    if (active) raf = requestAnimationFrame(tick);
  }
  function tick(now) {
    raf = 0;
    if (!allowed()) { previous = 0; return; }
    if (previous) elapsed = Math.min(duration, elapsed + Math.min(Math.max(0, now - previous), maxDelta));
    previous = now;
    render(elapsed);
    if (elapsed < duration) raf = requestAnimationFrame(tick);
    else { host.dataset.motion = 'finished'; previous = 0; }
  }
  const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); }, { threshold });
  const changedReduced = () => { if (Number.isFinite(duration)) elapsed = isReduced() ? duration : 0; render(elapsed); sync(); };
  const pagehide = () => { suspended = true; sync(); };
  const pageshow = () => { suspended = false; sync(); };
  const mutation = new MutationObserver(changedReduced);
  observer.observe(host);
  mutation.observe(document.documentElement, { attributes: true, attributeFilter: ['data-reduced-motion'] });
  reduced.addEventListener('change', changedReduced);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', pagehide);
  window.addEventListener('pageshow', pageshow);
  render(isReduced() && Number.isFinite(duration) ? duration : 0);
  sync();
  return () => {
    destroyed = true; stop(); observer.disconnect(); mutation.disconnect();
    reduced.removeEventListener('change', changedReduced);
    document.removeEventListener('visibilitychange', sync);
    window.removeEventListener('pagehide', pagehide);
    window.removeEventListener('pageshow', pageshow);
  };
}

// Approved quality modes: Sample/Review = 01 (sequential), Rights/Delivery = 03
// (back and forth). Speeds, trail and ring match the original raster version.
// Artwork (2026-10-18): abstract SVG circles replace the four raster diagrams.
// Sample/Review/Rights use 시안 3B (dot ring, facing dotted arcs, S-curve);
// Delivery uses 시안 3C (tilted elliptical orbit).
const INK = '#303030';
const LINE = '#777';
const MUTED = '#8a8a8a';
const DASH = '4 5';
const pt = (cx, cy, r, deg) => [cx + r * Math.cos(deg * Math.PI / 180), cy + r * Math.sin(deg * Math.PI / 180)];
const f1 = n => Number(n).toFixed(1);

function artworkTools(create, parent) {
  const add = (tag, attrs) => { const node = create(tag, attrs); parent.append(node); return node; };
  return {
    hair: attrs => add('line', { stroke: LINE, class: 'original-quality-line', ...attrs }),
    stroke: (d, attrs = {}) => add('path', { d, fill: 'none', stroke: INK, class: 'original-quality-line', ...attrs }),
    circ: attrs => add('circle', { fill: 'none', stroke: INK, class: 'original-quality-line', ...attrs }),
    dot: (cx, cy, r = 5, fill = INK) => add('circle', { cx, cy, r, fill }),
  };
}

const qualityDefinitions = [
  {
    name: 'sample', mode: 1, duration: 1.8,
    // Ring of twelve dots around a center dot; the marker runs the ring.
    draw(t) {
      for (let i = 0; i < 12; i++) { const [x, y] = pt(256, 256, 84, i * 30 - 90); t.dot(x, y, 5, MUTED); }
      t.dot(256, 256, 7);
      return ['M 256 172 A 84 84 0 1 1 255.99 172'];
    },
  },
  {
    name: 'review', mode: 1, duration: 3.2,
    // Two facing dotted arcs, like parentheses; down the left one, up the right one.
    draw(t) {
      const R = 130, half = 50.3;
      for (let i = 0; i < 7; i++) {
        const a = -half + i * (half * 2 / 6);
        const [lx, ly] = pt(289, 256, R, 180 + a); t.dot(lx, ly, 5);
        const [rx, ry] = pt(223, 256, R, a); t.dot(rx, ry, 5, MUTED);
      }
      return ['M 206 156 A 130 130 0 0 0 206 356', 'M 306 356 A 130 130 0 0 0 306 156'];
    },
  },
  {
    name: 'rights', mode: 3, duration: 1.5,
    // S-curve between two haloed dots, back and forth.
    draw(t) {
      const d = 'M 140 320 C 230 320 282 192 372 192';
      t.stroke(d, { stroke: LINE });
      t.circ({ cx: 140, cy: 320, r: 26, stroke: LINE, 'stroke-dasharray': DASH });
      t.circ({ cx: 372, cy: 192, r: 26, stroke: LINE, 'stroke-dasharray': DASH });
      t.dot(140, 320, 7); t.dot(372, 192, 7);
      return [d];
    },
  },
  {
    name: 'delivery', mode: 3, duration: 3.8,
    // Tilted elliptical orbit around a center dot, back and forth.
    draw(t) {
      const d = 'M 382.9 196.8 A 140 60 -25 0 1 129.1 315.2 A 140 60 -25 0 1 382.9 196.8';
      t.stroke(d, { stroke: LINE });
      t.dot(256, 256, 10);
      return [d];
    },
  },
];

export function QualityMotion({ index = 0, language = 'en' }) {
  const art = useRef(null);
  const svg = useRef(null);
  const item = qualityDefinitions[Math.max(0, Math.min(3, Number(index) || 0))];
  useEffect(() => {
    const root = svg.current;
    const ns = 'http://www.w3.org/2000/svg';
    const create = (tag, attrs) => {
      const node = document.createElementNS(ns, tag);
      Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, value));
      return node;
    };
    root.replaceChildren();
    const artwork = create('g', { class: 'original-quality-artwork' });
    root.append(artwork);
    const pathData = item.draw(artworkTools(create, artwork));
    const paths = pathData.map(d => { const path = create('path', { d, fill: 'none', stroke: 'none' }); root.append(path); return path; });
    const trail = create('path', { class: 'original-quality-trail' });
    const ring = create('circle', { class: 'original-quality-ring', r: 24 });
    const marker = create('circle', { 'data-quality-marker': '', class: 'original-quality-marker', r: 12.2 });
    root.append(trail, ring, marker);
    const tracks = paths.map(path => { const length = path.getTotalLength(); return { path, length, end: path.getPointAtLength(length) }; });
    const render = elapsed => {
      const time = elapsed / 1000 / item.duration;
      const sequential = item.mode === 1;
      const track = tracks[Math.floor(sequential ? time : time / 2) % tracks.length];
      const progress = sequential ? time % 1 : (1 - Math.cos(time * Math.PI)) / 2;
      const distance = progress * track.length;
      const point = track.path.getPointAtLength(distance);
      marker.setAttribute('cx', f1(point.x)); marker.setAttribute('cy', f1(point.y));
      let tail = '';
      for (let step = 0; step <= 16; step++) {
        const p = track.path.getPointAtLength(Math.max(0, distance - 90 + 90 * step / 16));
        tail += `${step ? 'L' : 'M'} ${p.x} ${p.y} `;
      }
      trail.setAttribute('d', tail); ring.setAttribute('cx', track.end.x); ring.setAttribute('cy', track.end.y);
      ring.setAttribute('r', String(22 + progress * 14)); ring.style.opacity = String(progress > .76 ? (1 - progress) * 3.5 : 0);
    };
    // Static artwork stays visible under reduced motion; only the moving overlay hides.
    const overlay = { style: { set visibility(value) { [trail, ring, marker].forEach(node => { node.style.visibility = value; }); } } };
    return animateWhenVisible(art.current, render, { maxDelta: 70, threshold: .05, overlay });
  }, [item]);
  return <span ref={art} className="original-quality-motion" data-diagram={item.name} data-quality-motion={item.mode} aria-hidden="true">
    <svg ref={svg} className="original-quality-overlay" viewBox="0 0 512 512" aria-hidden="true" focusable="false" />
  </span>;
}
