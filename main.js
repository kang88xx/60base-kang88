(() => {
  const $ = id => document.getElementById(id);
  const t = key => window.siteI18n.t(key);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const serviceCards = $('service-cards');
  const serviceNavigation = document.querySelector('#services .service-navigation');
  const servicePrevious = serviceNavigation.querySelector('.service-previous');
  const serviceNext = serviceNavigation.querySelector('.service-next');
  function updateServiceNavigation() {
    const max = serviceCards.scrollWidth - serviceCards.clientWidth;
    serviceNavigation.hidden = max <= 1;
    servicePrevious.disabled = serviceCards.scrollLeft <= 1;
    serviceNext.disabled = serviceCards.scrollLeft >= max - 1;
  }
  function moveService(direction) {
    const cards = [...serviceCards.children];
    const start = cards[0].getBoundingClientRect().left;
    const positions = cards.map(card => card.getBoundingClientRect().left - start);
    const current = serviceCards.scrollLeft;
    const target = direction > 0 ? positions.find(left => left > current + 2) : positions.findLast(left => left < current - 2);
    serviceCards.scrollTo({left:target ?? (direction > 0 ? serviceCards.scrollWidth : 0),behavior:reduced.matches ? 'instant' : 'smooth'});
  }
  servicePrevious.addEventListener('click', () => moveService(-1));
  serviceNext.addEventListener('click', () => moveService(1));
  serviceCards.addEventListener('scroll', updateServiceNavigation, {passive:true});
  serviceCards.addEventListener('keydown', event => {
    if (event.target !== serviceCards || !['ArrowLeft','ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    moveService(event.key === 'ArrowRight' ? 1 : -1);
  });
  new ResizeObserver(updateServiceNavigation).observe(serviceCards);
  updateServiceNavigation();
  const video = $('sample-video');
  video.autoplay = !reduced.matches;
  const contact = $('contact');
  const aliases = {products:'services',domains:'data',company:'about',participants:'about',pilot:'services',roadmap:'about',top:'hero'};

  function scrollToContact({focus = false} = {}) {
    requestAnimationFrame(() => {
      const formStart = $('contact-form');
      if (focus) formStart.focus({preventScroll:true});
      const headerHeight = innerWidth < 1200 ? 96 : 0;
      const top = formStart.getBoundingClientRect().top + scrollY - headerHeight - 24;
      scrollTo({top:Math.max(0, top), behavior:reduced.matches ? 'instant' : 'smooth'});
    });
  }
  function applyHash() {
    const key = location.hash.slice(1);
    if (key === 'contact') scrollToContact();
    else if (aliases[key]) {
      const url = new URL(location.href);
      url.hash = aliases[key];
      history.replaceState(null, '', url);
      $(aliases[key]).scrollIntoView({behavior:reduced.matches ? 'instant' : 'smooth',block:'start'});
    }
  }
  // The inquiry stays visible; its links preserve scroll position and history.
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href="#contact"]');
    if (!link) return;
    event.preventDefault();
    if (location.hash !== '#contact') history.pushState(null, '', '#contact');
    if (header.dataset.menuOpen === 'true') setMenu(false);
    scrollToContact({focus:true});
  });
  addEventListener('hashchange', applyHash);
  applyHash();
  // A direct form URL must settle after native anchor restoration and font layout.
  if (location.hash === '#contact') addEventListener('load', () => {
    document.fonts.ready.then(() => {
      if (location.hash === '#contact' && !contact.contains(document.activeElement)) scrollToContact();
    });
  }, {once:true});
  document.documentElement.classList.replace('no-js','js');

  // Native details grouping also works without JavaScript. Close an animated
  // peer through its summary so its spring target cannot reopen it on finish.
  const faqItems = [...document.querySelectorAll('#faq .faq-item')];
  document.querySelector('#faq .faq-list').addEventListener('click', event => {
    const summary = event.target.closest('summary');
    if (!summary) return;
    for (const item of faqItems) {
      const peer = item.querySelector('summary');
      if (peer !== summary && item.open && peer.getAttribute('aria-expanded') !== 'false') peer.click();
    }
  }, true);

  // Native motion uses the supplied Opalhaus spring parameters, without its runtime.
  const motionAnimations = new Set();
  function springFrames(from, to, {mass, stiffness, damping, duration = 600}) {
    const frames = [];
    let x = from, velocity = 0;
    const dt = 1 / 60;
    const steps = Math.max(2, Math.round(duration / 1000 / dt));
    for (let index = 0; index <= steps; index++) {
      frames.push({offset:index / steps,value:x});
      velocity += (-stiffness * (x - to) - damping * velocity) / mass * dt;
      x += velocity * dt;
    }
    frames.at(-1).value = to;
    return frames;
  }
  function animate(node, frames, options) {
    if (reduced.matches || !node.animate) return null;
    const animation = node.animate(frames, options);
    motionAnimations.add(animation);
    animation.finished.then(() => motionAnimations.delete(animation), () => motionAnimations.delete(animation));
    return animation;
  }
  const cardSpring = {mass:1,stiffness:235,damping:30,duration:620};
  let videoTransition;
  function settleVideo() {
    videoTransition?.cancel();
    const frames = springFrames(.985, 1, cardSpring).map(({offset,value}) => ({offset,transform:`scale(${value})`}));
    videoTransition = animate(document.querySelector('.video-frame'), frames, {duration:cardSpring.duration});
  }

  // Ordinary section links track location; the compact menu shares those links.
  const header = document.querySelector('.header-shell');
  const nav = document.querySelector('.section-nav');
  const sectionLinks = [...nav.querySelectorAll('a')];
  const sections = sectionLinks.map(link => $(link.hash.slice(1)));
  const menu = document.querySelector('.menu-toggle');
  // Sample the reference's physical springs into native CSS easing curves.
  function headerSpring({damping, stiffness, mass = 1, duration}) {
    const omega = Math.sqrt(stiffness / mass), zeta = damping / (2 * Math.sqrt(stiffness * mass));
    const count = Math.ceil(duration / 8);
    const values = Array.from({length:count + 1}, (_, index) => {
      const time = index / count * duration / 1000;
      let value;
      if (zeta < 1) {
        const damped = omega * Math.sqrt(1 - zeta * zeta);
        value = 1 - Math.exp(-zeta * omega * time) * (Math.cos(damped * time) + zeta * omega / damped * Math.sin(damped * time));
      } else if (zeta === 1) value = 1 - Math.exp(-omega * time) * (1 + omega * time);
      else {
        const root = Math.sqrt(zeta * zeta - 1), first = -omega * (zeta - root), second = -omega * (zeta + root);
        value = 1 - (second * Math.exp(first * time) - first * Math.exp(second * time)) / (second - first);
      }
      return index === count ? 1 : Number(value.toFixed(5));
    });
    return `linear(${values.join(',')})`;
  }
  // Motion's zero-velocity duration/bounce envelope, solved directly.
  // Upstream: motion-dom/src/animation/generators/spring.ts (findSpring).
  const headerDampingRatio = 1 - .2;
  const headerFrequency = Math.log(headerDampingRatio / (.001 * Math.sqrt(1 - headerDampingRatio ** 2))) / (headerDampingRatio * .4);
  const headerEase = headerSpring({mass:1,stiffness:headerFrequency ** 2,damping:2 * headerDampingRatio * headerFrequency,duration:400});
  const navEase = headerSpring({mass:1,stiffness:400,damping:80,duration:1200});
  const appearEase = headerSpring({mass:1,stiffness:400,damping:46,duration:900});
  header.style.setProperty('--header-spring', headerEase);
  header.style.setProperty('--header-nav-spring', navEase);
  const languageSwitch = document.getElementById('language-toggle');
  const languageThumb = languageSwitch.querySelector('.language-thumb');
  let languageAnimation, previousLanguage = window.siteI18n.language;
  addEventListener('languagechange', () => {
    const width = languageSwitch.clientWidth;
    const wasEnglish = previousLanguage === 'en';
    const english = window.siteI18n.language === 'en';
    const style = getComputedStyle(languageThumb);
    const running = languageAnimation?.playState === 'running';
    const from = running ? {left:parseFloat(style.left),width:parseFloat(style.width)} :
      {left:wasEnglish ? width * .58 - 5 : 5,width:width * (wasEnglish ? .42 : .5)};
    languageAnimation?.cancel();
    const frame = (left, size, offset) => ({left:`${left}px`,width:`${size}px`,offset});
    const frames = english ? [
      frame(from.left,from.width,0),frame(5,width*.78,.22),
      frame(width*.14,width*.76,.4),frame(width*.39,width*.55,.6),
      frame(width*.52,width*.43,.8),frame(width*.58-5,width*.42,1),
    ] : [
      frame(from.left,from.width,0),frame(width*.22,width*.74,.22),
      frame(5,width*.84,.4),frame(5,width*.63,.6),
      frame(5,width*.52,.8),frame(5,width*.5,1),
    ];
    languageAnimation = animate(languageThumb,frames,{duration:800,easing:'linear'});
    previousLanguage = window.siteI18n.language;
  });
  new ResizeObserver(() => languageAnimation?.cancel()).observe(languageSwitch);
  const headerContact = header.querySelector('.header-contact');
  const firstArrow = headerContact.querySelector('.header-arrow-track svg:first-child');
  const caretPath = firstArrow.querySelector('path').getAttribute('d');
  const arrowPath = headerContact.querySelector('.header-arrow-track svg:last-child path').getAttribute('d');
  function syncHeaderArrow() {
    firstArrow.querySelector('path').setAttribute('d', headerContact.matches(':hover,:focus-visible') ? arrowPath : caretPath);
  }
  ['pointerenter','pointerleave','focus','blur'].forEach(event => headerContact.addEventListener(event, () => requestAnimationFrame(syncHeaderArrow)));
  function revealHeader(node, delay = 600, easing = appearEase) {
    return animate(node, [{opacity:.001},{opacity:1}], {duration:900,delay,easing,fill:'backwards'});
  }
  if (innerWidth >= 1200) {
    revealHeader(header.querySelector('.header-middle'));
    revealHeader(header.querySelector('.header-actions'));
  }
  let menuAnimation;
  const menuReveals = [];
  function setMenu(open) {
    if ((header.dataset.menuOpen === 'true') === open) return;
    const before = header.getBoundingClientRect().height;
    menuAnimation?.cancel();
    menuReveals.splice(0).forEach(animation => animation?.cancel());
    header.dataset.menuOpen = String(open);
    menu.setAttribute('aria-expanded', String(open));
    const label = open ? 'Close menu' : 'Open menu';
    menu.setAttribute('aria-label', t(label));
    menu.dataset.i18nAttrs = JSON.stringify({'aria-label':label});
    if (innerWidth < 1200) {
      const after = header.getBoundingClientRect().height;
      menuAnimation = animate(header, [{height:`${before}px`,overflow:'hidden'},{height:`${after}px`,overflow:'hidden'}], {duration:400,easing:headerEase});
      if (open) {
        menuReveals.push(revealHeader(nav), revealHeader(headerContact, 200, headerSpring({damping:65,stiffness:400,duration:900})));
      }
    }
  }
  let navFrame, currentSection;
  function closeMenu({focus = false} = {}) {
    setMenu(false);
    if (focus) menu.focus();
  }
  menu.addEventListener('click', () => {
    setMenu(header.dataset.menuOpen !== 'true');
  });
  header.querySelector('.header-contact').addEventListener('click', () => closeMenu());
  header.querySelector('.brand').addEventListener('click', () => closeMenu());
  addEventListener('languagechange', () => menu.setAttribute('aria-label', t(header.dataset.menuOpen === 'true' ? 'Close menu' : 'Open menu')));
  nav.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && header.dataset.menuOpen === 'true') closeMenu({focus:true});
  });
  document.addEventListener('click', event => {
    if (!header.contains(event.target)) closeMenu();
  });
  matchMedia('(min-width:1200px)').addEventListener('change', event => { if (event.matches) closeMenu(); });
  function updateNavigation() {
    navFrame = null;
    header.dataset.scrolled = String(scrollY > 16);
    const threshold = 160;
    const atBottom = Math.ceil(scrollY + innerHeight) >= document.documentElement.scrollHeight - 2;
    const current = atBottom ? sections.at(-1) : sections.filter(section => section.getBoundingClientRect().top <= threshold).sort((a,b) => b.offsetTop - a.offsetTop)[0] || sections[0];
    const link = sectionLinks[sections.indexOf(current)];
    if (currentSection !== current.id) {
      sectionLinks.forEach(item => item.removeAttribute('aria-current'));
      link.setAttribute('aria-current', 'location');
      currentSection = current.id;
    }
  }
  function scheduleNavigation() {
    if (!navFrame) navFrame = requestAnimationFrame(updateNavigation);
  }
  function measureHeader() {
    document.documentElement.style.scrollPaddingTop = innerWidth < 1200 ? '120px' : '24px';
    scheduleNavigation();
  }
  addEventListener('scroll', scheduleNavigation, {passive:true});
  new ResizeObserver(measureHeader).observe(header);
  document.fonts.ready.then(measureHeader);
  measureHeader();

  addEventListener('languagechange', measureHeader);

  // Opalhaus scroll entrance: 150px, damping100/stiffness400/mass1, 50% viewport.
  // Prepare a paused backwards fill so content does not flash and jump when triggered.
  const revealFrames = [{opacity:0, transform:'translateY(150px)'}, {opacity:1, transform:'translateY(0)'}];
  const revealEase = headerSpring({damping:100, stiffness:400, mass:1, duration:2000});
  const revealAnimations = new Map();
  const revealTargets = [...document.querySelectorAll('[data-reveal]')];
  function prepareReveal(element, delay = 0) {
    if (reduced.matches || innerWidth < 810) return;
    const animation = element.animate(revealFrames, {duration:2000, delay, easing:revealEase, fill:'both'});
    animation.pause();
    motionAnimations.add(animation);
    animation.finished.then(() => { motionAnimations.delete(animation); animation.cancel(); }).catch(() => {});
    revealAnimations.set(element, animation);
  }
  const projectGrid = document.querySelector('.project-grid');
  revealTargets.forEach(element => {
    const index = element.parentElement === projectGrid ? [...projectGrid.children].indexOf(element) : 0;
    prepareReveal(element, index * 200);
  });
  const reveals = new IntersectionObserver(entries => entries.forEach(entry => {
    // Cap the visible portion for short windows / unusually tall translated content.
    const required = Math.min(.5, innerHeight * .5 / entry.boundingClientRect.height);
    if (!entry.isIntersecting || entry.intersectionRatio + .01 < required) return;
    const targets = entry.target === projectGrid ? [...projectGrid.children] : [entry.target];
    targets.forEach(target => revealAnimations.get(target)?.play());
    reveals.unobserve(entry.target);
  }), {threshold:Array.from({length:101}, (_, i) => i / 100)});
  revealTargets.filter(element => element.parentElement !== projectGrid).forEach(element => reveals.observe(element));
  if (projectGrid) reveals.observe(projectGrid);
  addEventListener('resize', () => {
    if (innerWidth < 810) revealAnimations.forEach(animation => animation.cancel());
  });
  document.addEventListener('focusin', event => {
    const target = event.target.closest('[data-reveal]');
    const animation = revealAnimations.get(target);
    if (animation?.playState === 'paused') animation.finish();
  });
  document.documentElement.style.setProperty('--project-hover-ease', headerSpring({damping:60, stiffness:400, mass:1, duration:1500}));
  reduced.addEventListener('change', () => {
    if (!reduced.matches) return;
    [...motionAnimations].forEach(animation => animation.finish());
    updateNavigation();
  });

  // Muted samples use only a centered playback button and a seek bar.
  const samples = {
    'folding-towels':{title:'Folding towels',environment:'Living room',action:'Folding and arranging towels',ariaLabel:'60BASE filming example: Folding towels'},
    'dishwashing-2':{title:'Rinsing dishes',environment:'Kitchen',action:'Rinsing dishes under running water',ariaLabel:'60BASE filming example: Rinsing dishes'},
    vacuuming:{title:'Vacuuming',environment:'Living room',action:'Vacuuming the floor',ariaLabel:'60BASE filming example: Vacuuming'},
    dishwashing:{title:'Washing dishes',environment:'Kitchen',action:'Washing and rinsing dishes',ariaLabel:'60BASE filming example: Washing dishes'},
    'folding-clothes':{title:'Folding clothes',environment:'Laundry',action:'Folding and stacking clothes',ariaLabel:'60BASE filming example: Folding clothes'},
    'cutting-vegetables':{title:'Cutting vegetables',environment:'Kitchen',action:'Preparing and cutting vegetables',ariaLabel:'60BASE filming example: Cutting vegetables'},
  };
  let selectedSample = 'cutting-vegetables';
  let videoVisible = false;
  let playbackWanted = !reduced.matches;
  let changingSource = false;
  let playbackEpoch = 0;
  const choices = [...document.querySelectorAll('[data-sample]')];
  const playlist = document.querySelector('.video-selector');
  const videoMount = video.closest('.video-mount');
  const sampleControls = document.querySelector('.sample-controls');
  const playToggle = $('sample-play-toggle');
  const seek = $('sample-seek');
  let scrubbing = false;
  function updateSampleControls() {
    const key = video.paused ? 'Play video' : 'Pause video';
    playToggle.setAttribute('aria-label', t(key));
    playToggle.dataset.i18nAttrs = JSON.stringify({'aria-label':key});
    playToggle.dataset.playing = String(!video.paused);
    const duration = video.duration;
    const ready = !video.error && Number.isFinite(duration) && duration > 0;
    seek.disabled = !ready;
    if (!scrubbing) seek.value = ready ? String(video.currentTime / duration * 100) : '0';
    seek.style.setProperty('--seek-progress', `${seek.value}%`);
    const clock = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2,'0')}`;
    seek.setAttribute('aria-valuetext', ready ? `${clock(video.currentTime)} / ${clock(duration)}` : '0:00');
  }
  playToggle.addEventListener('click', () => {
    playbackWanted = video.paused;
    if (playbackWanted) {
      if (video.error) { changingSource = true; video.load(); }
      playPreview();
    } else pausePreview();
    updateSampleControls();
  });
  seek.addEventListener('pointerdown', () => { scrubbing = true; });
  function endScrub() { scrubbing = false; updateSampleControls(); }
  seek.addEventListener('pointerup', endScrub);
  seek.addEventListener('pointercancel', endScrub);
  seek.addEventListener('lostpointercapture', endScrub);
  seek.addEventListener('blur', endScrub);
  seek.addEventListener('input', () => {
    if (!Number.isFinite(video.duration) || video.duration <= 0 || video.error) return;
    video.currentTime = Number(seek.value) / 100 * video.duration;
    updateSampleControls();
  });
  for (const event of ['play','pause','ended','timeupdate','loadedmetadata','durationchange','emptied','error']) video.addEventListener(event, updateSampleControls);
  function sizePlaylist() {
    const height = Math.ceil(videoMount.getBoundingClientRect().height + 4);
    const value = `${height}px`;
    if (playlist.style.getPropertyValue('--playlist-height') !== value) playlist.style.setProperty('--playlist-height', value);
  }
  // Match the player area, including the playlist's two-pixel focus-ring padding.
  const playlistResize = new ResizeObserver(sizePlaylist);
  playlistResize.observe(videoMount);
  sizePlaylist();
  function updateVideoCopy() {
    const sample = samples[selectedSample];
    for (const [id, key] of [['sample-title',sample.title],['sample-environment',sample.environment],['sample-action',sample.action]]) {
      $(id).textContent = t(key);
      $(id).dataset.i18nText = JSON.stringify([key]);
    }
    video.closest('.video-frame').dataset.controls = String(video.controls);
    video.setAttribute('aria-label', t(sample.ariaLabel));
    video.dataset.i18nAttrs = JSON.stringify({'aria-label':sample.ariaLabel});
    if (!$('video-error').hidden) $('video-error').textContent = t('Video could not load. Choose another example or try again.');
  }
  function pausePreview() {
    playbackEpoch += 1;
    video.pause();
  }
  async function playPreview() {
    if (!playbackWanted || !videoVisible || document.hidden) return;
    const epoch = ++playbackEpoch;
    try {
      await video.play();
      if (epoch !== playbackEpoch) return;
      if (!videoVisible || document.hidden) video.pause();
    } catch (error) {
      // The center button can retry blocked autoplay; switching may abort a pending play.
      if (epoch !== playbackEpoch || ['AbortError','NotAllowedError'].includes(error.name)) return;
      $('video-error').hidden = false;
      updateVideoCopy();
    }
  }
  function chooseSample(key, {scroll = false} = {}) {
    if (!samples[key]) return;
    changingSource = true;
    scrubbing = false;
    pausePreview();
    playbackWanted = true;
    selectedSample = key;
    video.src = `assets/videos/collection/${key}.mp4`;
    video.poster = `assets/videos/collection/${key}.jpg`;
    video.load();
    $('video-error').hidden = true;
    choices.forEach(choice => choice.setAttribute('aria-pressed',String(choice.dataset.sample === key)));
    updateVideoCopy();
    settleVideo();
    playPreview();
    if (scroll && video.getBoundingClientRect().bottom < 90) video.scrollIntoView({behavior:reduced.matches ? 'instant' : 'smooth',block:'center'});
  }
  choices.forEach(choice => choice.addEventListener('click', () => chooseSample(choice.dataset.sample,{scroll:true})));
  video.addEventListener('play', () => {
    if (!videoVisible || document.hidden) { pausePreview(); return; }
    playbackWanted = true;
    changingSource = false;
    $('video-error').hidden = true;
  });
  video.addEventListener('pause', () => {
    if (video.paused && videoVisible && !document.hidden && !changingSource) playbackWanted = false;
  });
  video.addEventListener('loadedmetadata', () => { changingSource = false; });
  video.addEventListener('error', () => { $('video-error').hidden = false; updateVideoCopy(); });
  new IntersectionObserver(entries => {
    videoVisible = entries[0].isIntersecting;
    if (videoVisible) playPreview();
    else pausePreview();
  },{threshold:0}).observe(video);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pausePreview();
    else playPreview();
  });
  reduced.addEventListener('change', () => {
    video.autoplay = !reduced.matches;
    playbackWanted = !reduced.matches;
    if (reduced.matches) pausePreview();
    else playPreview();
  });
  addEventListener('pagehide', pausePreview);
  video.controls = false;
  sampleControls.hidden = false;
  video.closest('.video-frame').dataset.customControls = 'true';
  updateSampleControls();
  updateVideoCopy();

  // Decorative owner footage loops while visible, unless reduced motion is requested.
  const heroVideo = $('hero-video');
  heroVideo.autoplay = !reduced.matches;
  let heroVisible = false, heroEpoch = 0;
  function pauseHero() { heroEpoch++; heroVideo.pause(); }
  async function playHero() {
    if (!heroVisible || reduced.matches || document.hidden || $('service-film-dialog').open) return;
    if (!heroVideo.getAttribute('src')) { heroVideo.src = heroVideo.dataset.src; heroVideo.load(); }
    const epoch = ++heroEpoch;
    try { await heroVideo.play(); if (epoch !== heroEpoch || !heroVisible || document.hidden) heroVideo.pause(); }
    catch { /* Keep the poster if autoplay is unavailable; retry on the next visibility change. */ }
  }
  new IntersectionObserver(entries => {
    heroVisible = entries[0].isIntersecting;
    if (heroVisible) playHero(); else pauseHero();
  },{threshold:.05}).observe(heroVideo);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseHero(); else playHero(); });
  reduced.addEventListener('change', () => { heroVideo.autoplay = !reduced.matches; if (reduced.matches) pauseHero(); else playHero(); });
  new MutationObserver(() => { if ($('service-film-dialog').open) pauseHero(); else playHero(); }).observe($('service-film-dialog'),{attributes:true,attributeFilter:['open']});
  addEventListener('pagehide', pauseHero);

  // Preserve browser-local drafts while sending inquiries directly to the team.
  const form = $('contact-form');
  const fields = ['name','email','message','dataType'].map(name => form.elements.namedItem(name));
  const draftKey = 'koreo:inquiry-draft';
  const inquiryButton = form.querySelector('.inquiry-submit');
  let sending = false;
  let sentFingerprint = '';
  let attempt = null;
  function inquiryData() {
    return Object.fromEntries(fields.map(field => [field.name, field.value.trim()]));
  }
  function updateInquiryButton() {
    const sent = sentFingerprint === JSON.stringify(inquiryData());
    inquiryButton.disabled = sending || sent;
    form.setAttribute('aria-busy', String(sending));
    fields.forEach(field => { field.readOnly = sending; });
    const key = sending ? 'Sending…' : sent ? 'Inquiry sent' : 'Send inquiry';
    inquiryButton.querySelectorAll('.inquiry-label > span').forEach(label => { label.textContent = t(key); });
  }
  function setStatus(key) {
    $('form-status').dataset.messageKey = key;
    $('form-status').textContent = t(key);
  }
  function readDraft() {
    try {
      const value = JSON.parse(localStorage.getItem(draftKey) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch {return {};}
  }
  function writeDraft() {
    try {
      const data = inquiryData();
      const fingerprint = JSON.stringify(data);
      const delivery = attempt?.fingerprint === fingerprint
        ? {...attempt, sent: sentFingerprint === fingerprint}
        : undefined;
      localStorage.setItem(draftKey,JSON.stringify({...data,delivery,updatedAt:new Date().toISOString()}));
      return true;
    } catch {
      setStatus('Local browser storage is unavailable. You can still edit the draft on this page.');
      return false;
    }
  }
  const restored = readDraft();
  fields.forEach(field => {if(typeof restored[field.name] === 'string') field.value = restored[field.name];});
  const delivery = restored.delivery;
  if (delivery && typeof delivery.requestId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(delivery.requestId)
    && delivery.fingerprint === JSON.stringify(inquiryData()) && typeof delivery.sent === 'boolean') {
    attempt = {requestId: delivery.requestId, fingerprint: delivery.fingerprint};
    if (delivery.sent) {
      sentFingerprint = delivery.fingerprint;
      setStatus('Your inquiry has been sent. We will reply to your email.');
    }
  }
  updateInquiryButton();
  form.addEventListener('input', event => {
    if (!fields.includes(event.target) || sending) return;
    if (attempt?.fingerprint !== JSON.stringify(inquiryData())) {
      attempt = null;
      sentFingerprint = '';
    }
    if (inquiryButton) inquiryButton.dataset.state = 'Default';
    event.target.setAttribute('aria-invalid','false');
    event.target.removeAttribute('aria-describedby');
    $(`${event.target.id}-error`).hidden = true;
    if (writeDraft()) { setStatus(''); delete $('form-status').dataset.messageKey; }
    updateInquiryButton();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const data = inquiryData();
    const fingerprint = JSON.stringify(data);
    if (sending || sentFingerprint === fingerprint) return;
    const invalid = [!data.name || data.name.length > 100, data.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email), !data.message || data.message.length > 5000, data.dataType.length > 180];
    fields.forEach((field,index) => {
      field.setAttribute('aria-invalid',String(invalid[index]));
      const error = $(`${field.id}-error`);
      error.hidden = !invalid[index];
      if (invalid[index]) field.setAttribute('aria-describedby',error.id);
      else field.removeAttribute('aria-describedby');
    });
    if (invalid.some(Boolean)) {
      if (inquiryButton) inquiryButton.dataset.state = 'Error';
      setStatus('Check your name (100 characters), email (254), brief (5000) and data type (180).');
      fields[invalid.indexOf(true)].focus();
      return;
    }
    sending = true;
    inquiryButton.dataset.state = 'Default';
    updateInquiryButton();
    setStatus('Sending your inquiry…');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      if (!attempt || attempt.fingerprint !== fingerprint) attempt = {fingerprint, requestId: crypto.randomUUID()};
      writeDraft();
      const response = await fetch('/api/contact', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...data, requestId: attempt.requestId, website: form.elements.namedItem('website').value}),
        signal: controller.signal
      });
      const result = await response.json().catch(() => null);
      if (response.ok && result?.ok === true) {
        sentFingerprint = fingerprint;
        writeDraft();
        setStatus('Your inquiry has been sent. We will reply to your email.');
      } else {
        inquiryButton.dataset.state = 'Error';
        setStatus(response.status === 429
          ? 'Too many attempts. Please wait a few minutes before trying again.'
          : response.status === 503
            ? 'Sending is temporarily unavailable. Please try again later or email 60base.ai@gmail.com.'
            : response.status === 400
              ? 'Please check your details and try again. Your inquiry has been kept.'
              : 'We could not confirm sending. Your inquiry has been kept. Please retry or email 60base.ai@gmail.com.');
      }
    } catch {
      inquiryButton.dataset.state = 'Error';
      setStatus('We could not confirm sending. Your inquiry has been kept. Please retry or email 60base.ai@gmail.com.');
    } finally {
      clearTimeout(timeout);
      sending = false;
      updateInquiryButton();
    }
  });
  addEventListener('languagechange', () => {
    updateVideoCopy();
    updateInquiryButton();
    if ($('form-status').dataset.messageKey) setStatus($('form-status').dataset.messageKey);
  });
})();

// Selected quality motion: Sample/Data 01, Consent/Delivery 03.
(() => {
  const section = document.querySelector('#standards.quality-summary');
  if (!section) return;

  const namespace = 'http://www.w3.org/2000/svg';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const definitions = [
    {name:'sample', mode:1, duration:1.8, paths:[176,256,336].map(x => `M ${x} 157 L ${x} 385`)},
    {name:'review', mode:1, duration:3.2, paths:['M 136 337 H 331 C 386 337 386 253 331 253 H 207 C 146 253 146 167 207 167 H 369']},
    {name:'rights', mode:3, duration:1.5, paths:[[125,140],[385,140],[385,372],[125,372]].map(([x,y]) => `M 256 256 L ${x} ${y}`)},
    {name:'delivery', mode:3, duration:3.8, paths:['M 256 111 A 142 142 0 1 1 255.99 111']},
  ];
  const create = (tag, attributes) => {
    const element = document.createElementNS(namespace, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    return element;
  };
  const diagrams = [];
  for (const definition of definitions) {
    const original = section.querySelector(`#quality-card-${definition.name} > img`);
    if (!original) continue;
    const art = document.createElement('span');
    art.className = 'quality-art';
    art.dataset.diagram = definition.name;
    art.dataset.qualityMotion = String(definition.mode);
    art.setAttribute('aria-hidden', 'true');
    original.replaceWith(art);
    art.append(original);

    const svg = create('svg', {viewBox:'0 0 512 512', 'aria-hidden':'true', focusable:'false'});
    const clipId = `quality-motion-dot-${definition.name}`;
    const defs = create('defs', {});
    const clip = create('clipPath', {id:clipId});
    clip.append(create('circle', {cx:256, cy:253, r:12.2}));
    defs.append(clip);
    svg.append(defs);
    const paths = definition.paths.map(d => {
      const path = create('path', {d, fill:'none', stroke:'none'});
      svg.append(path);
      return path;
    });
    const trail = create('path', {class:'quality-motion-trail'});
    const ring = create('circle', {class:'quality-motion-ring', r:24});
    const marker = create('g', {'data-quality-marker':''});
    const crop = create('g', {transform:'scale(1.45) translate(-256 -253)'});
    // Reuse the orange dot from the original artwork without changing any assets.
    crop.append(create('image', {href:'assets/images/quality-review.webp', width:512, height:512, 'clip-path':`url(#${clipId})`}));
    marker.append(crop);
    svg.append(trail, ring, marker);
    art.append(svg);
    const tracks = paths.map(path => {
      const length = path.getTotalLength();
      return {path, length, end:path.getPointAtLength(length)};
    });
    diagrams.push({...definition, art, svg, tracks, trail, ring, marker, elapsed:0, visible:false});
  }
  if (!diagrams.length) return;

  function render(diagram) {
    const time = diagram.elapsed / diagram.duration;
    const sequential = diagram.mode === 1;
    const track = diagram.tracks[Math.floor(sequential ? time : time / 2) % diagram.tracks.length];
    const progress = sequential ? time % 1 : (1 - Math.cos(time * Math.PI)) / 2;
    const distance = progress * track.length;
    const point = track.path.getPointAtLength(distance);
    diagram.marker.setAttribute('transform', `translate(${point.x} ${point.y})`);

    let tail = '';
    for (let step = 0; step <= 16; step++) {
      const p = track.path.getPointAtLength(Math.max(0, distance - 90 + 90 * step / 16));
      tail += `${step ? 'L' : 'M'} ${p.x} ${p.y} `;
    }
    diagram.trail.setAttribute('d', tail);
    diagram.ring.setAttribute('cx', track.end.x);
    diagram.ring.setAttribute('cy', track.end.y);
    diagram.ring.setAttribute('r', String(22 + progress * 14));
    diagram.ring.style.opacity = String(progress > .76 ? (1 - progress) * 3.5 : 0);
  }

  let frame = 0;
  let previous = 0;
  let suspended = false;
  const allowed = () => !reduced.matches && !document.hidden && !suspended;
  function tick(now) {
    frame = 0;
    if (!allowed() || !diagrams.some(diagram => diagram.visible)) {
      previous = 0;
      return;
    }
    const delta = previous ? Math.min((now - previous) / 1000, .07) : 0;
    previous = now;
    for (const diagram of diagrams) {
      if (!diagram.visible) continue;
      diagram.elapsed += delta;
      render(diagram);
    }
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    const enabled = allowed();
    for (const diagram of diagrams) {
      diagram.art.dataset.motion = enabled && diagram.visible ? 'running' : 'paused';
      diagram.svg.style.visibility = reduced.matches ? 'hidden' : 'visible';
    }
    if (enabled && diagrams.some(diagram => diagram.visible)) {
      if (!frame) frame = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(frame);
      frame = 0;
      previous = 0;
    }
  }
  diagrams.forEach(render);
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const diagram = diagrams.find(item => item.art === entry.target);
      diagram.visible = entry.isIntersecting;
    }
    sync();
  }, {threshold:.05});
  diagrams.forEach(diagram => observer.observe(diagram.art));
  reduced.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  addEventListener('pagehide', () => { suspended = true; sync(); });
  addEventListener('pageshow', () => { suspended = false; sync(); });
  sync();
})();
