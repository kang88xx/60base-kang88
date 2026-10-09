import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Timings and triggers follow the supplied LOCO source-motion.js. Each effect
// owns its animations, so React updates and media-query changes can revert them.
export function useReferenceMotion({ language, menuOpen, filmOpen, hasDraft }) {
  const [ready, setReady] = useState(false);
  const smoother = useRef(null);
  const refresh = useRef(() => {});
  const menuHeight = useRef(60);

  // Keep the looping hero's decoder idle when its footage cannot be seen.
  // Playback owns its lifecycle independently of GSAP's responsive timelines.
  useEffect(() => {
    const video = document.querySelector('.showreel-card video');
    if (!video) return;
    const autoplay = video.autoplay;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const listeners = new AbortController();
    const { signal } = listeners;
    let visible = !('IntersectionObserver' in window);
    let suspended = false;
    const sync = () => {
      const blocked = !visible || suspended || document.hidden || filmOpen || reduced.matches
        || document.documentElement.dataset.reducedMotion === 'true' || Boolean(window.__FIGMA_CAPTURE__);
      video.autoplay = autoplay && !blocked;
      if (blocked) video.pause();
      else if (autoplay && video.paused) {
        try { Promise.resolve(video.play()).catch(() => {}); } catch { /* Keep the poster when autoplay is unavailable. */ }
      }
    };
    const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      sync();
    }) : null;
    observer?.observe(video);
    const mutation = new MutationObserver(sync);
    mutation.observe(document.documentElement, { attributes: true, attributeFilter: ['data-reduced-motion'] });
    reduced.addEventListener('change', sync, { signal });
    document.addEventListener('visibilitychange', sync, { signal });
    window.addEventListener('pagehide', () => { suspended = true; sync(); }, { signal });
    window.addEventListener('pageshow', () => { suspended = false; sync(); }, { signal });
    sync();
    return () => {
      observer?.disconnect();
      mutation.disconnect();
      listeners.abort();
      video.pause();
      video.autoplay = autoplay;
    };
  }, [filmOpen]);

  useEffect(() => {
    const gsap = window.gsap;
    const ScrollTrigger = window.ScrollTrigger;
    const root = document.getElementById('root');
    if (window.__FIGMA_CAPTURE__) {
      root?.querySelectorAll('[data-reveal]').forEach(node => node.classList.add('is-visible'));
      return;
    }
    if (!gsap || !ScrollTrigger || !root) {
      root?.querySelectorAll('[data-reveal]').forEach(node => node.classList.add('is-visible'));
      return;
    }
    gsap.registerPlugin(ScrollTrigger);
    let cancelled = false;
    let media;
    let resizeObserver;
    let refreshFrame;
    let hashFrame;
    let initialized = false;
    const hashTarget = hash => {
      if (!hash || hash === '#') return null;
      try { return document.getElementById(decodeURIComponent(hash.slice(1))); }
      catch { return null; }
    };
    const scrollToHash = (hash, immediate = false) => {
      const target = hashTarget(hash);
      if (!target) return;
      const top = target.id === 'hero' || target.id === 'main';
      const offset = window.innerWidth <= 980 ? 90 : 130;
      const instant = immediate || matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (smoother.current) smoother.current.scrollTo(top ? 0 : target, { offset: top ? 0 : -offset, duration: 1, immediate: instant, force: true });
      else window.scrollTo({ top: top ? 0 : target.getBoundingClientRect().top + window.scrollY - offset, behavior: instant ? 'instant' : 'smooth' });
    };
    const navigateCurrentHash = () => {
      // Leave ordinary no-hash history restoration to the browser. Language
      // updates only refresh geometry; they must not jump back to this anchor.
      if (!initialized || !window.location.hash) return;
      cancelAnimationFrame(hashFrame);
      hashFrame = requestAnimationFrame(() => {
        if (cancelled) return;
        ScrollTrigger.refresh();
        smoother.current?.resize();
        scrollToHash(window.location.hash, true);
      });
    };
    const scheduleRefresh = () => {
      cancelAnimationFrame(refreshFrame);
      refreshFrame = requestAnimationFrame(() => {
        if (cancelled) return;
        ScrollTrigger.refresh();
        smoother.current?.resize();
      });
    };
    refresh.current = scheduleRefresh;

    const initialize = () => {
      if (cancelled) return;
      document.documentElement.classList.add('motion-ready');
      media = gsap.matchMedia();
      media.add({ desktop: '(min-width: 1025px)', small: '(max-width: 1024px)', reduced: '(prefers-reduced-motion: reduce)' }, context => {
        const { desktop, reduced } = context.conditions;
        const hero = root.querySelector('.section-hero');
        const card = root.querySelector('.showreel-card');
        const body = root.querySelector('.hero-body');
        const video = card?.querySelector('video');
        if (reduced) {
          root.querySelectorAll('[data-reveal]').forEach(node => node.classList.add('is-visible'));
          return;
        }

        let lenis;
        let tick;
        if (window.Lenis) {
          lenis = new window.Lenis({ duration: 1, easing: t => 1 - Math.pow(1 - t, 3), smoothWheel: true, wheelMultiplier: 1, touchMultiplier: 2 });
          smoother.current = lenis;
          lenis.on('scroll', ScrollTrigger.update);
          tick = time => lenis.raf(time * 1000);
          gsap.ticker.add(tick);
          gsap.ticker.lagSmoothing(0);
          document.documentElement.classList.add('smooth-motion');
        }

        gsap.fromTo(root.querySelectorAll('.headline-inner'), { yPercent: 105 }, { yPercent: 0, duration: 1, delay: .2, stagger: .12, ease: 'power3.out' });
        gsap.fromTo(root.querySelector('.hero-label'), { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: .8, delay: .1, ease: 'power2.out' });
        gsap.fromTo(root.querySelector('.site-nav'), { y: -170, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 1, delay: .2, ease: 'power3.out' });

        if (desktop && hero && card) {
          const cardRight = 44;
          const cardTop = 40;
          const cardWidth = 600;
          const cardHeight = 338;
          gsap.set(card, { transformOrigin: 'left top' });
          if (video) gsap.set(video, { transformOrigin: '50% 50%' });
          const expansion = gsap.timeline({
            scrollTrigger: {
              id: '60base-showreel', trigger: hero, start: 'top top',
              end: '+=50%',
              pin: true, pinSpacing: true, scrub: 1.5, anticipatePin: 1,
              invalidateOnRefresh: true,
            },
          });
          // Match the verified live LOCO transform timeline. The frame keeps
          // its 600×338 layout box; the nested video's opposite-axis scaling
          // provides the source's exact crop and expansion/reversal path.
          expansion.to(card, {
            x: () => -(window.innerWidth - cardRight - cardWidth), y: -cardTop,
            scaleX: () => window.innerWidth / cardWidth,
            scaleY: () => window.innerHeight / cardHeight, borderRadius: 0,
            duration: .5, ease: 'none',
          }, 0);
          if (video) expansion.to(video, {
            scaleX: () => Math.max(1, (window.innerHeight * cardWidth / cardHeight) / window.innerWidth),
            scaleY: () => Math.max(1, (window.innerWidth * cardHeight / cardWidth) / window.innerHeight),
            duration: .5, ease: 'none',
          }, 0);
          expansion.to(body, { opacity: 0, duration: .5, ease: 'none' }, 0);
          expansion.to({}, { duration: .5 });
        }

        // One entrance treatment per heading/content unit. Wrapper markers
        // containing headings stay visible, so children never fade twice.
        const revealUnits = new Set(root.querySelectorAll([
          '.section-pad h2', '.about-bottom', '.works-item', '.catalog-footer',
          '.service-feature', '.process-step', '.quality-item', '.faq-list details',
          '.contact-heading>p', '.contact-form>label', '.contact-form>.form-actions',
          '.contact-form>.form-note', '.site-footer>a', '.site-footer>span', '.site-footer>div',
        ].join(',')));
        root.querySelectorAll('[data-reveal]').forEach(node => {
          if (!node.querySelector('h2')) revealUnits.add(node);
        });
        const units = [...revealUnits].filter(node =>
          ![...revealUnits].some(parent => parent !== node && parent.contains(node))
        );
        units.forEach(node => {
          gsap.fromTo(node, { y: 24, autoAlpha: 0 }, {
            y: 0, autoAlpha: 1, duration: 1, ease: 'power2.out',
            scrollTrigger: { trigger: node, start: 'clamp(top 80%)', once: true },
          });
        });
        return () => {
          if (tick) gsap.ticker.remove(tick);
          lenis?.destroy();
          if (smoother.current === lenis) smoother.current = null;
          document.documentElement.classList.remove('smooth-motion');
        };
      });
      setReady(true);
      if ('ResizeObserver' in window) {
        resizeObserver = new ResizeObserver(scheduleRefresh);
        root.querySelectorAll('.section-pad').forEach(node => resizeObserver.observe(node));
      }
      scheduleRefresh();
      initialized = true;
      navigateCurrentHash();
    };
    document.fonts.ready.then(initialize);

    const anchorClick = event => {
      const anchor = event.target.closest('a[href^="#"]');
      if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const hash = anchor.getAttribute('href');
      const target = hashTarget(hash);
      if (!target) return;
      event.preventDefault();
      cancelAnimationFrame(hashFrame);
      history.pushState(null, '', hash);
      scrollToHash(hash);
      if (anchor.classList.contains('skip-link')) { target.tabIndex = -1; target.focus({ preventScroll: true }); }
    };
    root.addEventListener('click', anchorClick);
    root.addEventListener('toggle', scheduleRefresh, true);
    // Hover/nav/color transitions do not change the document geometry. Avoid
    // invalidating a running scrub; real section resizing is observed above.
    window.addEventListener('load', scheduleRefresh);
    window.addEventListener('resize', scheduleRefresh);
    window.addEventListener('hashchange', navigateCurrentHash);
    window.addEventListener('popstate', navigateCurrentHash);
    return () => {
      cancelled = true;
      cancelAnimationFrame(refreshFrame);
      cancelAnimationFrame(hashFrame);
      resizeObserver?.disconnect();
      root.removeEventListener('click', anchorClick);
      root.removeEventListener('toggle', scheduleRefresh, true);
      window.removeEventListener('load', scheduleRefresh);
      window.removeEventListener('resize', scheduleRefresh);
      window.removeEventListener('hashchange', navigateCurrentHash);
      window.removeEventListener('popstate', navigateCurrentHash);
      media?.revert();
      document.documentElement.classList.remove('motion-ready', 'smooth-motion');
      refresh.current = () => {};
    };
  }, []);

  useLayoutEffect(() => {
    if (!ready || !window.gsap || window.innerWidth > 980 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const nav = document.querySelector('.site-nav');
    const toHeight = menuOpen ? nav.scrollHeight : 60;
    const fromHeight = menuOpen ? 60 : menuHeight.current;
    if (menuOpen) menuHeight.current = toHeight;
    const tween = window.gsap.fromTo(nav, { height: fromHeight }, { height: toHeight, duration: menuOpen ? .4 : .3, ease: menuOpen ? 'power2.out' : 'power2.in', onComplete: () => window.gsap.set(nav, { clearProps: 'height' }) });
    return () => { tween.kill(); window.gsap.set(nav, { clearProps: 'height' }); };
  }, [ready, menuOpen]);

  useEffect(() => { if (filmOpen) smoother.current?.stop(); else smoother.current?.start(); }, [filmOpen, ready]);
  useLayoutEffect(() => { refresh.current(); }, [language, hasDraft, ready]);
}
