/* Footer source: two 25px/s tracks, opposite directions, no hover slowdown. */
(() => {
  const root = document.querySelector('.contact-marquee');
  if (!root) return;
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  let visible = false, animations = [], resizeFrame;
  const paused = () => !visible || document.hidden || preference.matches;
  function sync() {
    animations.forEach(animation => paused() ? animation.pause() : animation.play());
    root.dataset.paused = String(paused());
    window.SixtyBasePromo?.pause(preference.matches);
  }
  function build() {
    animations.forEach(animation => animation.cancel());
    animations = [];
    root.querySelectorAll('.marquee-row').forEach(row => {
      const track = row.querySelector('.marquee-track');
      const first = track.querySelector('.marquee-group');
      const unit = first.querySelector('.marquee-unit');
      first.replaceChildren(unit);
      while (first.getBoundingClientRect().width < row.clientWidth + unit.getBoundingClientRect().width) {
        first.append(unit.cloneNode(true));
      }
      const distance = first.getBoundingClientRect().width + 10;
      track.replaceChildren(first, first.cloneNode(true));
      const frames = [{transform:'translateX(0)'},{transform:`translateX(-${distance}px)`}];
      if (row.dataset.direction === 'right') frames.reverse();
      const animation = track.animate(frames, {duration:distance / 25 * 1000,iterations:Infinity,easing:'linear'});
      animations.push(animation);
    });
    root.dataset.marqueeReady = 'true';
    sync();
  }
  function scheduleBuild() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(build);
  }
  new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); },{threshold:0}).observe(root);
  document.addEventListener('visibilitychange', sync);
  preference.addEventListener('change', sync);
  window.addEventListener('pagehide', () => animations.forEach(animation => animation.pause()));
  new ResizeObserver(scheduleBuild).observe(root);
  document.fonts.ready.then(scheduleBuild);

})();
