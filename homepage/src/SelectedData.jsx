import { useEffect, useRef, useState } from 'react';
import './selected-data.css';
import './selected-data-editorial.css';
import './selected-data-preview.css';

export function createSamplePreview(video, { source, isReduced, isHidden, onPlaying, onReset }) {
  let active = false;
  let destroyed = false;
  let suspended = false;
  let generation = 0;
  const reset = () => {
    active = false;
    suspended = false;
    generation += 1;
    video.pause();
    try { video.currentTime = 0; } catch { /* An unloaded video may not be seekable yet. */ }
    if (!destroyed) onReset();
  };
  const playCurrent = () => {
    const attempt = generation;
    try {
      Promise.resolve(video.play()).catch(() => { if (!destroyed && attempt === generation) reset(); });
    } catch { if (!destroyed && attempt === generation) reset(); }
  };
  const playing = () => { if (active && !destroyed) onPlaying(); };
  video.addEventListener('playing', playing);
  video.addEventListener('ended', reset);
  video.addEventListener('error', reset);
  return {
    start() {
      if (destroyed || active || isReduced() || isHidden()) return false;
      active = true;
      suspended = false;
      generation += 1;
      // No source is attached before the first interaction: four thumbnails
      // do not eagerly request four full filming excerpts.
      if (!video.getAttribute('src')) video.src = source;
      video.muted = true;
      try { video.currentTime = 0; } catch { /* Playback begins at the unloaded source's start. */ }
      playCurrent();
      return true;
    },
    reset,
    suspend() { if (active) { suspended = true; video.pause(); } },
    resume() {
      if (active && suspended && !isReduced() && !isHidden()) { suspended = false; playCurrent(); }
    },
    destroy() {
      destroyed = true;
      active = false;
      generation += 1;
      video.pause();
      video.removeEventListener('playing', playing);
      video.removeEventListener('ended', reset);
      video.removeEventListener('error', reset);
      video.removeAttribute('src');
      video.load();
    },
  };
}

function SampleThumbnail({ sample, title, watch, onOpenFilm }) {
  const video = useRef(null);
  const playback = useRef(null);
  const [previewing, setPreviewing] = useState(false);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const isReduced = () => reduced.matches || document.documentElement.dataset.reducedMotion === 'true' || Boolean(window.__FIGMA_CAPTURE__);
    const controller = createSamplePreview(video.current, {
      source: `/assets/media/${sample.id}.mp4`, isReduced, isHidden: () => document.hidden,
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

  return <button className={`sample-image catalog-thumbnail${previewing ? ' is-previewing' : ''}`} type="button" aria-label={`${watch}: ${title}`} onPointerEnter={() => playback.current?.start()} onFocus={() => playback.current?.start()} onClick={event => onOpenFilm(sample.id, title, event)}>
    <img src={`/assets/media/${sample.id}.jpg`} alt={title} loading="lazy" width="720" height="405" />
    <video ref={video} className="catalog-preview-video" preload="none" muted playsInline aria-hidden="true" tabIndex={-1} />
  </button>;
}

export function SelectedData({ t, samples, localeIndex, onOpenFilm }) {
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
                  <SampleThumbnail sample={sample} title={title} watch={t.watch} onOpenFilm={onOpenFilm} />
                  <div className="catalog-tags">{sample.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
                  <h3 className="catalog-card-title">{title}</h3>
                  <p className="catalog-card-description">{localized(sample.desc)}</p>
                  <div className="catalog-card-actions">
                    <button className="catalog-action editorial-film" type="button" onClick={event => onOpenFilm(sample.id, title, event)}><span className="editorial-play" aria-hidden="true" />{t.watch}</button>
                    <a className="catalog-action editorial-hf" href="https://huggingface.co/datasets/60base/korea-household-egocentric-samples" target="_blank" rel="noopener noreferrer"><img src="/assets/brand/huggingface-logo.svg" className="editorial-hf-logo" alt="" aria-hidden="true" width="16" height="16" /><span>SAMPLE ON HUGGING FACE</span><img src="/assets/icons/selected-data-arrow-up-right.svg" className="editorial-arrow" alt="" aria-hidden="true" width="16" height="16" /></a>
                  </div>
                </article>
              );
            })}
          </div>

        </div>
      </div>
      </div>
    </section>
  );
}
