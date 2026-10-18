import { useEffect, useId, useRef, useState } from 'react';
import { createProcessRenderer, PROCESS_DURATION } from './process-reference-renderer.js';
import './process-motion.css';

const scenes = ['measure', 'compare', 'align', 'check'];
const labels = {
  en: ['Measure', 'Compare', 'Align', 'Check'],
  ko: ['측정', '대조', '정렬', '확인'],
};
const descriptions = {
  en: [
    'A scope rectangle is drawn and dimension lines measure the recording requirements.',
    'A reference frame and a sample frame sit side by side; a divider compares them and the sample is approved.',
    'Footage, annotation and review-record tracks slide in and their markers align to one point.',
    'A review line ticks the checklist from top to bottom and the delivery is closed with a blue outline.',
  ],
  ko: [
    '범위 사각형이 그려지고 치수선이 촬영 요구사항을 잽니다.',
    '기준 프레임과 샘플 프레임을 나란히 놓고 구분선으로 대조한 뒤 샘플을 승인합니다.',
    '영상·주석·검수 기록 세 줄이 들어오고 표식이 한 지점으로 정렬됩니다.',
    '검수선이 체크리스트를 위에서 아래로 확인하고 파란 테두리로 납품을 닫습니다.',
  ],
};

export function ProcessMotion({ activeStep = 0, language = 'en', restartKey = 0, theme = 'dark', controls = true, paused = false, loop = false }) {
  const host = useRef(null);
  const drawing = useRef(null);
  const synchronize = useRef(() => {});
  const externalPause = useRef(paused);
  const looping = useRef(loop);
  const [motionState, setMotionState] = useState('paused');
  const instanceId = useId().replace(/:/g, '');
  const step = Math.max(0, Math.min(3, Math.trunc(Number(activeStep) || 0)));
  const locale = language === 'ko' ? 'ko' : 'en';
  const selectedTheme = theme === 'light' ? 'light' : 'dark';

  // A shared pause changes scheduling without rebuilding/resetting the artwork.
  useEffect(() => {
    externalPause.current = paused;
    synchronize.current();
  }, [paused]);

  // Hover changes repetition without resetting a cycle already in progress.
  useEffect(() => {
    looping.current = loop;
    if (loop) synchronize.current('loop');
  }, [loop]);

  useEffect(() => {
    const element = host.current;
    const group = drawing.current;
    if (!element || !group) return;
    group.replaceChildren();
    const render = createProcessRenderer(group, step, selectedTheme);
    const svg = group.ownerSVGElement;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const listeners = new AbortController();
    const { signal } = listeners;
    const isStatic = () => reduced.matches || document.documentElement.dataset.reducedMotion === 'true' || Boolean(window.__FIGMA_CAPTURE__);
    let staticFrame = isStatic();
    // Each stage plays once on first visibility, then repeats only while hovered.
    let elapsed = staticFrame ? PROCESS_DURATION : 0;
    let previous = 0;
    let raf = 0;
    let frame = 0;
    let visible = false;
    let suspended = false;
    let destroyed = false;
    let manualPause = false;
    const allowed = () => !destroyed && !externalPause.current && !manualPause && visible && !document.hidden && !suspended && !isStatic();
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      previous = 0;
    };
    const updateState = state => {
      svg.dataset.state = state;
      setMotionState(state);
    };
    const paint = () => {
      render(elapsed);
      svg.dataset.frame = String(frame);
      svg.dataset.time = String(elapsed);
    };

    function tick(now) {
      raf = 0;
      if (!allowed()) { previous = 0; return; }
      if (previous) elapsed = Math.min(PROCESS_DURATION, elapsed + Math.max(0, now - previous));
      previous = now;
      frame += 1;
      paint();
      if (elapsed < PROCESS_DURATION) raf = requestAnimationFrame(tick);
      else if (looping.current) {
        elapsed = 0;
        frame = 0;
        raf = requestAnimationFrame(tick);
      } else { previous = 0; updateState('finished'); }
    }

    function sync() {
      if (destroyed) return;
      stop();
      const nextStatic = isStatic();
      if (nextStatic !== staticFrame) {
        staticFrame = nextStatic;
        elapsed = staticFrame ? PROCESS_DURATION : 0;
        frame = 0;
        paint();
      }
      if (allowed() && looping.current && elapsed >= PROCESS_DURATION) {
        elapsed = 0;
        frame = 0;
        paint();
      }
      const active = allowed() && elapsed < PROCESS_DURATION;
      updateState(staticFrame ? 'static' : elapsed >= PROCESS_DURATION ? 'finished' : active ? 'running' : 'paused');
      if (active) raf = requestAnimationFrame(tick);
    }

    synchronize.current = (toggle = false) => {
      if (toggle === 'loop') {
        if (elapsed >= PROCESS_DURATION) sync();
        return;
      }
      if (toggle) {
        if (elapsed >= PROCESS_DURATION) { elapsed = 0; frame = 0; manualPause = false; paint(); }
        else manualPause = !manualPause;
      }
      sync();
    };
    const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      sync();
    }, { threshold: 0 }) : null;
    if (observer) observer.observe(element);
    else visible = true;
    const mutation = new MutationObserver(sync);
    mutation.observe(document.documentElement, { attributes: true, attributeFilter: ['data-reduced-motion'] });
    reduced.addEventListener('change', sync, { signal });
    document.addEventListener('visibilitychange', sync, { signal });
    window.addEventListener('pagehide', () => { suspended = true; sync(); }, { signal });
    window.addEventListener('pageshow', () => { suspended = false; sync(); }, { signal });
    paint();
    sync();

    return () => {
      destroyed = true;
      stop();
      synchronize.current = () => {};
      observer?.disconnect();
      mutation.disconnect();
      listeners.abort();
      group.replaceChildren();
    };
  }, [step, selectedTheme, restartKey]);

  const playing = motionState === 'running';
  const controlLabel = playing ? (locale === 'ko' ? '일시정지' : 'PAUSE') : motionState === 'finished' ? (locale === 'ko' ? '다시 재생' : 'REPLAY') : (locale === 'ko' ? '재생' : 'PLAY');

  return <div ref={host} className="original-process-motion reference-process-motion" data-active-step={step} data-process-scene={scenes[step]} data-process-theme={selectedTheme} data-motion={motionState}>
    <svg className="reference-process-svg" viewBox="0 0 500 440" role="img" aria-labelledby={`${instanceId}-title ${instanceId}-description`} data-stage={step}>
      <title id={`${instanceId}-title`}>{labels[locale][step]}</title>
      <desc id={`${instanceId}-description`}>{descriptions[locale][step]}</desc>
      <g ref={drawing} transform="translate(0 -10)" />
    </svg>
    {controls && motionState !== 'static' && <button className="reference-process-control" type="button" onClick={() => synchronize.current(true)} aria-label={`${controlLabel} — ${labels[locale][step]}`}>
      <span>{controlLabel}</span><span aria-hidden="true">{playing ? 'Ⅱ' : '▷'}</span>
    </button>}
  </div>;
}
