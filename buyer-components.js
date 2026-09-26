(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  // Additional previews load only near their visible cards; inactive panels never play.
  const serviceDialog = document.getElementById('service-film-dialog');
  const previews = [...document.querySelectorAll('[data-preview-video]')];
  const mediaState = new Map(previews.map(video => [video, {visible:false,wanted:!reduced.matches,loading:false,epoch:0}]));
  const visiblePreview = video => mediaState.get(video).visible && !document.hidden && !serviceDialog.open && !video.closest('[hidden]');
  function loadPreview(video) {
    if (video.getAttribute('src')) return;
    mediaState.get(video).loading = true;
    video.src = video.dataset.src;
    video.preload = 'metadata';
    video.load();
  }
  function suspendPreview(video) {
    mediaState.get(video).epoch += 1;
    video.pause();
  }
  async function playPreview(video, explicit = false) {
    const state = mediaState.get(video);
    if (explicit) state.wanted = true;
    if (!visiblePreview(video) || !state.wanted) return;
    loadPreview(video);
    const epoch = ++state.epoch;
    try { await video.play(); }
    catch (error) {
      if (epoch !== state.epoch || ['AbortError','NotAllowedError'].includes(error.name)) return;
      video.parentElement.querySelector('.preview-error').hidden = false;
    }
  }
  const mediaObserver = new IntersectionObserver(entries => entries.forEach(entry => {
    const video = entry.target, state = mediaState.get(video);
    state.visible = entry.isIntersecting && !video.closest('[hidden]');
    if (state.visible) { loadPreview(video); playPreview(video); }
    else suspendPreview(video);
  }), {threshold:0.15});
  previews.forEach(video => {
    video.muted = true;
    mediaObserver.observe(video);
    video.addEventListener('loadedmetadata', () => { mediaState.get(video).loading = false; });
    video.addEventListener('play', () => {
      if (!visiblePreview(video)) { suspendPreview(video); return; }
      mediaState.get(video).wanted = true;
      video.parentElement.querySelector('.preview-error').hidden = true;
    });
    video.addEventListener('pause', () => {
      if (video.paused && visiblePreview(video) && !mediaState.get(video).loading) mediaState.get(video).wanted = false;
    });
    video.addEventListener('error', () => { video.parentElement.querySelector('.preview-error').hidden = false; });
  });
  document.addEventListener('visibilitychange', () => previews.forEach(video => {
    if (document.hidden) suspendPreview(video); else playPreview(video);
  }));
  addEventListener('pagehide', () => previews.forEach(suspendPreview));
  reduced.addEventListener('change', () => previews.forEach(video => {
    mediaState.get(video).wanted = !reduced.matches;
    if (reduced.matches) suspendPreview(video); else playPreview(video);
  }));


  // The expanded player exposes real files; closing restores focus and in-view previews.
  const detailVideo = document.getElementById('service-detail-video');
  const filmNotes = {
    capture:'Owner-provided first-person filming sample.',
    tracking:'Model-estimated hand landmarks from our filming sample.',
    review:'A recording of the review screen: compare source footage and AI estimates, then mark frames for review.'
  };
  let filmTrigger, filmCard, detailEpoch=0;
  function updateFilmCopy() {
    if (!filmCard) return;
    document.getElementById('service-film-title').textContent = filmCard.querySelector('h3').textContent;
    document.getElementById('film-detail-note').textContent = window.siteI18n.t(filmNotes[filmCard.dataset.serviceFilm]);
    detailVideo.setAttribute('aria-label', filmCard.querySelector('video').getAttribute('aria-label'));
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-film-open]');
    if (!button) return;
    const target = button.dataset.filmTarget;
    filmCard = target && /^#service-(capture|tracking|review)$/.test(target) ? document.querySelector(target) : button.closest('.service-film');
    if (!filmCard) return;
    event.preventDefault();
    filmTrigger = button;
    const source = filmCard.querySelector('video'), time = source.currentTime, epoch = ++detailEpoch;
    serviceDialog.showModal(); previews.forEach(suspendPreview);
    detailVideo.src = source.dataset.src; detailVideo.poster = source.poster; detailVideo.load(); updateFilmCopy();
    detailVideo.addEventListener('loadedmetadata', () => {
      if (epoch !== detailEpoch || !serviceDialog.open) return;
      detailVideo.currentTime = Math.min(time, detailVideo.duration || 0);
      if (!reduced.matches && !document.hidden) detailVideo.play().catch(() => {});
    }, {once:true});
  });
  detailVideo.addEventListener('error', () => {
    if (serviceDialog.open) document.getElementById('film-detail-note').textContent = window.siteI18n.t('Video could not load. Play again or choose another example.');
  });
  document.getElementById('service-film-close').addEventListener('click', () => serviceDialog.close());
  serviceDialog.addEventListener('click', event => {
    if (event.target !== serviceDialog) return;
    const bounds=serviceDialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) serviceDialog.close();
  });
  serviceDialog.addEventListener('close', () => {
    detailEpoch += 1; detailVideo.pause(); detailVideo.removeAttribute('src'); detailVideo.load();
    filmTrigger?.focus({preventScroll:true}); previews.forEach(video => playPreview(video));
  });
  addEventListener('languagechange', updateFilmCopy);
  document.addEventListener('visibilitychange', () => { if (document.hidden) detailVideo.pause(); });
  reduced.addEventListener('change', () => { if (reduced.matches) detailVideo.pause(); });
  addEventListener('pagehide', () => detailVideo.pause());

})();
