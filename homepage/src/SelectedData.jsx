import { useEffect, useRef, useState } from 'react';
import './selected-data.css';
import './selected-data-editorial.css';
import './selected-data-preview.css';
import './selected-data-mobile.css';

import { createSamplePreview } from './sample-preview.js';
export { createSamplePreview } from './sample-preview.js';

function SampleThumbnail({ sample, title, watch, onOpenFilm, filmOpen }) {
  const video = useRef(null);
  const playback = useRef(null);
  const filmBlocked = useRef(filmOpen);
  const [previewing, setPreviewing] = useState(false);
  useEffect(() => {
    filmBlocked.current = filmOpen;
    if (filmOpen) playback.current?.suspend();
    else playback.current?.resume();
  }, [filmOpen]);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const isReduced = () => reduced.matches || document.documentElement.dataset.reducedMotion === 'true' || Boolean(window.__FIGMA_CAPTURE__);
    const controller = createSamplePreview(video.current, {
      source: `/assets/media/${sample.id}.mp4`, isReduced, isHidden: () => document.hidden || filmBlocked.current,
      onPlaying: () => setPreviewing(true), onReset: () => setPreviewing(false),
    });
    playback.current = controller;
    const preference = () => { if (isReduced()) controller.reset(); };
    const visibility = () => { if (document.hidden) controller.suspend(); else controller.resume(); };
    const pagehide = () => controller.suspend();
    const pageshow = () => controller.resume();
    const mutation = new MutationObserver(preference);
    mutation.observe(document.documentElement, { attributes: true, attributeFilter: ['data-reduced-motion'] });
    reduced.addEventListener('change', preference);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', pagehide);
    window.addEventListener('pageshow', pageshow);
    return () => {
      playback.current = null;
      controller.destroy();
      mutation.disconnect();
      reduced.removeEventListener('change', preference);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', pagehide);
      window.removeEventListener('pageshow', pageshow);
    };
  }, [sample.id]);

  return <button className={`sample-image catalog-thumbnail${previewing ? ' is-previewing' : ''}`} type="button" aria-label={`${watch}: ${title}`} onPointerEnter={event => { if (event.pointerType !== 'touch') playback.current?.start(); }} onFocus={event => { if (event.currentTarget.matches(':focus-visible')) playback.current?.start(); }} onClick={event => onOpenFilm(sample.id, title, event)}>
    <img src={`/assets/media/${sample.id}.jpg`} alt={title} loading="lazy" width="720" height="405" />
    <video ref={video} className="catalog-preview-video" preload="none" muted playsInline aria-hidden="true" tabIndex={-1} />
  </button>;
}

export function SelectedData({ t, samples, localeIndex, onOpenFilm, filmOpen = false }) {
  const catalogSamples = samples.slice(0, 4);
  const localized = value => Array.isArray(value) ? value[localeIndex] : value;

  return (
    <section className="section-data data-catalog data-editorial section-pad" id="data" aria-labelledby="data-title">
      <div className="section-label"><span>{t.dataLabel}</span></div>
      <div className="data-content">
        <h2 id="data-title" data-reveal>{t.dataTitle}</h2>
      <div className="catalog-layout">
        <div className="section-intro catalog-intro">
          <p data-reveal>{t.dataCopy}</p>
        </div>

        <div className="catalog-main">
          <div className="works-grid catalog-grid">
            {catalogSamples.map(sample => {
              const title = localized(sample.title);
              return (
                <article className="works-item catalog-card" key={sample.id}>
                  <SampleThumbnail sample={sample} title={title} watch={t.watch} onOpenFilm={onOpenFilm} filmOpen={filmOpen} />
                  <div className="catalog-tags">{sample.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
                  <h3 className="catalog-card-title">{title}</h3>
                  <p className="catalog-card-description">{localized(sample.desc)}</p>
                  <div className="catalog-card-actions">
                    <button className="catalog-action editorial-film" type="button" aria-label={`${t.watch}: ${title}`} onClick={event => onOpenFilm(sample.id, title, event)}><span className="editorial-play" aria-hidden="true" />{t.watch}</button>
                    <a className="catalog-action editorial-hf" href="https://huggingface.co/datasets/60base/korea-household-egocentric-samples" target="_blank" rel="noopener noreferrer"><img src="/assets/brand/huggingface-logo.svg" className="editorial-hf-logo" alt="" aria-hidden="true" width="16" height="16" /><span>SAMPLE ON HUGGING FACE</span><img src="/assets/icons/selected-data-arrow-up-right.svg" className="editorial-arrow" alt="" aria-hidden="true" width="16" height="16" /></a>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="catalog-mobile-summary">
            <p className="catalog-mobile-hint">{localeIndex === 1 ? '샘플을 눌러 영상과 전체 설명을 확인하세요.' : 'Select a sample to view the film and full description.'}</p>
            <div className="catalog-mobile-hf">
              <a className="catalog-action editorial-hf" href="https://huggingface.co/datasets/60base/korea-household-egocentric-samples" target="_blank" rel="noopener noreferrer"><img src="/assets/brand/huggingface-logo.svg" className="editorial-hf-logo" alt="" aria-hidden="true" width="16" height="16" /><span>SAMPLE ON HUGGING FACE</span><img src="/assets/icons/selected-data-arrow-up-right.svg" className="editorial-arrow" alt="" aria-hidden="true" width="16" height="16" /></a>
            </div>
          </div>
        </div>
      </div>
      </div>
    </section>
  );
}
