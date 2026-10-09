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
  const playing = () => { if (active && !destroyed && !suspended && !isReduced() && !isHidden()) onPlaying(); };
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
    suspend() {
      if (active) {
        suspended = true;
        // pause() rejects an unresolved play() with AbortError. Keep that stale
        // rejection from resetting the cycle that will resume on visibility.
        generation += 1;
        video.pause();
      }
    },
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
