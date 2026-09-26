// Adapted from assets/opalhaus-requested/faq-motion.js; homepage source preserved.
export function bindSupportFaq(root) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  // Opalhaus FAQ: stiffness 400, damping 40, mass 1, delay 0.
  // The critically damped spring settles within 0.01% at 600ms.
  const duration = 600;
  const spring = Array.from({length: 61}, (_, index) => {
    const time = index / 100;
    return {offset: index / 60, value: index === 60 ? 1 : 1 - (1 + 20 * time) * Math.exp(-20 * time)};
  });
  const items = [...root.querySelectorAll('.online-support-faq details,.guide-faq details')].map(item => {
    const summary = item.querySelector('summary');
    const answer = item.querySelector(':scope > p');
    let target = item.open;
    let heightAnimation, fadeAnimation;
    const finish = () => {
      heightAnimation?.cancel();
      fadeAnimation?.cancel();
      heightAnimation = fadeAnimation = null;
      item.open = target;
      item.style.removeProperty('overflow');
      summary.setAttribute('aria-expanded', String(target));
    };
    summary.addEventListener('click', event => {
      event.preventDefault();
      const fromHeight = item.getBoundingClientRect().height;
      const fromOpacity = item.open ? Number(getComputedStyle(answer).opacity) : 0;
      target = heightAnimation ? !target : !item.open;
      heightAnimation?.cancel();
      fadeAnimation?.cancel();
      if (reduced.matches) { finish(); return; }
      item.open = true;
      summary.setAttribute('aria-expanded', String(target));
      const toHeight = target ? item.getBoundingClientRect().height : summary.getBoundingClientRect().height;
      item.style.overflow = 'hidden';
      heightAnimation = item.animate(spring.map(({offset, value}) => ({offset, height: `${fromHeight + (toHeight - fromHeight) * value}px`})), {duration, easing: 'linear'});
      fadeAnimation = answer.animate(spring.map(({offset, value}) => ({offset, opacity: fromOpacity + ((target ? .62 : 0) - fromOpacity) * value})), {duration, easing: 'linear'});
      heightAnimation.onfinish = finish;
    });
    // A changed translation, font or viewport releases any in-flight fixed height.
    let {width, height} = summary.getBoundingClientRect();
    const observer = new ResizeObserver(() => {
      const next = summary.getBoundingClientRect();
      if (heightAnimation && (next.width !== width || next.height !== height)) finish();
      width = next.width;
      height = next.height;
    });
    observer.observe(summary);
    item.addEventListener('toggle', () => {
      if (!heightAnimation) {
        target = item.open;
        summary.setAttribute('aria-expanded', String(target));
      }
    });
    return {finish, observer};
  });
  const settle = () => items.forEach(item => item.finish());
  reduced.addEventListener('change', settle);
  return () => {
    reduced.removeEventListener('change', settle);
    items.forEach(item => { item.finish(); item.observer.disconnect(); });
  };
}
