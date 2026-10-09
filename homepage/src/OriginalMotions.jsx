import { useEffect, useId, useRef } from 'react';
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
// (back and forth). Coordinates, speeds, trail and artwork crop match main.js.
const qualityDefinitions = [
  { name: 'sample', mode: 1, duration: 1.8, paths: [176, 256, 336].map(x => `M ${x} 157 L ${x} 385`) },
  { name: 'review', mode: 1, duration: 3.2, paths: ['M 136 337 H 331 C 386 337 386 253 331 253 H 207 C 146 253 146 167 207 167 H 369'] },
  { name: 'rights', mode: 3, duration: 1.5, paths: [[125, 140], [385, 140], [385, 372], [125, 372]].map(([x, y]) => `M 256 256 L ${x} ${y}`) },
  { name: 'delivery', mode: 3, duration: 3.8, paths: ['M 256 111 A 142 142 0 1 1 255.99 111'] },
];

export function QualityMotion({ index = 0, language = 'en' }) {
  const art = useRef(null);
  const svg = useRef(null);
  const instanceId = useId().replace(/:/g, '');
  const backgroundFilterId = `original-quality-background-${instanceId}`;
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
    const clipId = `original-quality-dot-${instanceId}`;
    const defs = create('defs', {}), clip = create('clipPath', { id: clipId });
    clip.append(create('circle', { cx: 256, cy: 253, r: 12.2 })); defs.append(clip); root.append(defs);
    const paths = item.paths.map(d => { const path = create('path', { d, fill: 'none', stroke: 'none' }); root.append(path); return path; });
    const trail = create('path', { class: 'original-quality-trail' });
    const ring = create('circle', { class: 'original-quality-ring', r: 24 });
    const marker = create('g', { 'data-quality-marker': '' });
    const crop = create('g', { transform: 'scale(1.45) translate(-256 -253)' });
    crop.append(create('image', { href: '/assets/media/quality-review.webp', width: 512, height: 512, 'clip-path': `url(#${clipId})`, filter: `url(#${backgroundFilterId})` }));
    marker.append(crop); root.append(trail, ring, marker);
    const tracks = paths.map(path => { const length = path.getTotalLength(); return { path, length, end: path.getPointAtLength(length) }; });
    const render = elapsed => {
      const time = elapsed / 1000 / item.duration;
      const sequential = item.mode === 1;
      const track = tracks[Math.floor(sequential ? time : time / 2) % tracks.length];
      const progress = sequential ? time % 1 : (1 - Math.cos(time * Math.PI)) / 2;
      const distance = progress * track.length;
      const point = track.path.getPointAtLength(distance);
      marker.setAttribute('transform', `translate(${point.x} ${point.y})`);
      let tail = '';
      for (let step = 0; step <= 16; step++) {
        const p = track.path.getPointAtLength(Math.max(0, distance - 90 + 90 * step / 16));
        tail += `${step ? 'L' : 'M'} ${p.x} ${p.y} `;
      }
      trail.setAttribute('d', tail); ring.setAttribute('cx', track.end.x); ring.setAttribute('cy', track.end.y);
      ring.setAttribute('r', String(22 + progress * 14)); ring.style.opacity = String(progress > .76 ? (1 - progress) * 3.5 : 0);
    };
    return animateWhenVisible(art.current, render, { maxDelta: 70, threshold: .05, overlay: root });
  }, [item, instanceId, backgroundFilterId]);
  return <span ref={art} className="original-quality-motion" data-diagram={item.name} data-quality-motion={item.mode} aria-hidden="true">
    <svg className="original-quality-filter-definitions" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        {/* Keep the original pixels; key only the pale paper/grid into transparency.
            A 222–236 luminance ramp preserves the dark artwork's soft edges. */}
        <filter id={backgroundFilterId} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.2126 0.7152 0.0722 0 0" result="paper-luminance" />
          <feComponentTransfer in="paper-luminance" result="artwork-mask">
            <feFuncA type="linear" slope="-18.2142857143" intercept="16.8571428571" />
          </feComponentTransfer>
          <feComposite in="SourceGraphic" in2="artwork-mask" operator="in" />
        </filter>
      </defs>
    </svg>
    <img src={`/assets/media/quality-${item.name}.webp`} alt="" width="512" height="512" loading="lazy" decoding="async" style={{ filter: `url(#${backgroundFilterId})` }} />
    <svg ref={svg} className="original-quality-overlay" viewBox="0 0 512 512" aria-hidden="true" focusable="false" />
  </span>;
}
