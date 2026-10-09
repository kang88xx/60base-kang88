import { useEffect, useRef } from 'react';
import { createScene } from './service-reference/thesis-variation-scenes.js';
import './service-motion.css';

// The selected source studies map to service rows in the requested2,1,4 order.
const sourceScenes = [2, 1, 4];
const descriptions = {
  en: ['Six everyday tasks align into one collection grid.', 'Three frames unfold into observation, repetition and learning.', 'Video, depth and annotation synchronize into a dataset package.'],
  ko: ['여섯 가지 일상 작업이 하나의 수집 그리드로 정렬되는 모션', '세 프레임이 관찰·반복·학습 순서로 펼쳐지는 모션', '영상·깊이·주석이 동기화된 데이터 패키지로 합쳐지는 모션'],
};

export function ServiceMotion({ index = 0, language = 'en' }) {
  const host = useRef(null);
  const board = useRef(null);
  const canvas = useRef(null);
  const service = Math.max(0, Math.min(2, Math.trunc(Number(index) || 0)));
  const sceneId = sourceScenes[service];
  const locale = language === 'ko' ? 'ko' : 'en';

  useEffect(() => {
    const element = host.current;
    const surface = board.current;
    const drawing = canvas.current;
    if (!element || !surface || !drawing) return;
    drawing.replaceChildren();
    drawing.className = 'service-motion-canvas';
    const scene = createScene(sceneId, drawing);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const listeners = new AbortController();
    const { signal } = listeners;
    let visible = false;
    let suspended = false;
    let destroyed = false;
    let frame = 0;
    let previous = 0;
    let elapsed = 0;
    const isStatic = () => reduced.matches || document.documentElement.dataset.reducedMotion === 'true' || Boolean(window.__FIGMA_CAPTURE__);
    const allowed = () => !destroyed && visible && !document.hidden && !suspended && !isStatic();

    const render = () => {
      const time = isStatic() ? 7200 : elapsed;
      scene.animations.forEach(animation => { animation.currentTime = time; });
      element.dataset.time = String(Math.round(time));
    };
    const stop = () => { cancelAnimationFrame(frame); frame = 0; previous = 0; };
    const tick = now => {
      frame = 0;
      if (!allowed()) { previous = 0; return; }
      const delta = previous ? Math.min(Math.max(0, now - previous), 100) : 0;
      previous = now;
      elapsed = (elapsed + delta) % scene.duration;
      render();
      frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      if (destroyed) return;
      stop();
      const still = isStatic();
      render();
      element.dataset.motion = still ? 'static' : allowed() ? 'running' : 'paused';
      if (allowed()) { previous = performance.now(); frame = requestAnimationFrame(tick); }
    };
    const scale = () => {
      const width = parseFloat(getComputedStyle(surface).width) || surface.clientWidth;
      const ratio = width / 640;
      // Paint text, borders and masks at the final layout scale instead of
      // compositing another scaled bitmap of the complete 640px scene.
      // The source coordinate system and uniform 16:9 proportions stay intact.
      if (window.CSS?.supports('zoom', '1')) {
        drawing.style.zoom = String(ratio);
        drawing.style.transform = 'none';
        element.dataset.renderMode = 'layout-zoom';
      } else {
        drawing.style.zoom = '1';
        drawing.style.transform = `scale(${ratio})`;
        element.dataset.renderMode = 'transform-fallback';
      }
    };
    const resize = 'ResizeObserver' in window ? new ResizeObserver(scale) : null;
    resize?.observe(surface);
    window.addEventListener('resize', scale, { signal });
    const visibility = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      sync();
    }, { threshold: .12 }) : null;
    if (visibility) visibility.observe(surface);
    else visible = true;
    const mutation = new MutationObserver(sync);
    mutation.observe(document.documentElement, { attributes: true, attributeFilter: ['data-reduced-motion'] });
    reduced.addEventListener('change', sync, { signal });
    document.addEventListener('visibilitychange', sync, { signal });
    window.addEventListener('pagehide', () => { suspended = true; sync(); }, { signal });
    window.addEventListener('pageshow', () => { suspended = false; sync(); }, { signal });
    scale();
    sync();

    return () => {
      destroyed = true;
      stop();
      visibility?.disconnect();
      resize?.disconnect();
      mutation.disconnect();
      listeners.abort();
      scene.animations.forEach(animation => animation.cancel());
      drawing.replaceChildren();
    };
  }, [sceneId]);

  return <div ref={host} className="service-motion" data-service-index={service} data-source-scene={sceneId} data-motion="paused">
    <div ref={board} className="service-motion-board" role="img" aria-label={descriptions[locale][service]}><div ref={canvas} className="service-motion-canvas" aria-hidden="true" /></div>
  </div>;
}
