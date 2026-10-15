import { applyFooterFill } from './ego-footer-icons.js';

// Four real links own navigation; inert render tracks provide the optical treatment.
const nav = document.querySelector('#app-shell .app-bottom-nav');
const shell = document.querySelector('#app-shell');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

if (nav && shell) {
  nav.classList.add('ego-glass-nav');
  const backdrop = document.createElement('div');
  backdrop.className = 'ego-nav-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');
  backdrop.hidden = true;
  nav.before(backdrop);
  let lens, baseTrack, copyTrack, optics, displacement, fieldImage, rimImage, filterNode, violetDisplacement, cyanDisplacement;
  let frame = 0, lastTime = 0, visualCenter = null, centerVelocity = 0, progress = 0, progressVelocity = 0;
  let press = null, suppressClickUntil = 0, relaxTimer = 0, fieldKey = '';
  let copiedTabs = [], copiedMarkup = [];
  const tabs = () => [...nav.querySelectorAll(':scope > a[data-tab]')];
  const fieldCache = new Map();
  const svgNS = 'http://www.w3.org/2000/svg';

  function createTracks() {
    lens = document.createElement('span');
    lens.className = 'ego-glass-lens';
    lens.setAttribute('aria-hidden', 'true'); lens.inert = true;
    lens.innerHTML = `<svg class="ego-glass-viewport" xmlns="${svgNS}" aria-hidden="true"><defs>
      <filter id="ego-footer-refraction" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
        <feImage data-field preserveAspectRatio="none" result="field"/>
        <feImage data-rim preserveAspectRatio="none" result="rim"/>
        <feDisplacementMap data-core in="SourceGraphic" in2="field" xChannelSelector="R" yChannelSelector="G" scale="0" result="refracted"/>
        <feGaussianBlur in="refracted" stdDeviation=".18" result="smoothRefracted"/>
        <feDisplacementMap data-violet in="SourceGraphic" in2="field" xChannelSelector="R" yChannelSelector="G" scale="0" result="violetBent"/>
        <feColorMatrix in="violetBent" type="matrix" values="0 0 0 0 .8  0 0 0 0 .04  0 0 0 0 1  0 0 0 .9 0" result="violet"/>
        <feComposite in="violet" in2="rim" operator="in" result="violetRim"/>
        <feDisplacementMap data-cyan in="SourceGraphic" in2="field" xChannelSelector="R" yChannelSelector="G" scale="0" result="cyanBent"/>
        <feColorMatrix in="cyanBent" type="matrix" values="0 0 0 0 0  0 0 0 0 .85  0 0 0 0 1  0 0 0 .85 0" result="cyan"/>
        <feComposite in="cyan" in2="rim" operator="in" result="cyanRim"/>
        <feMerge><feMergeNode in="cyanRim"/><feMergeNode in="violetRim"/><feMergeNode in="smoothRefracted"/></feMerge>
      </filter></defs></svg>`;
    filterNode = lens.querySelector('filter'); displacement = lens.querySelector('[data-core]');
    fieldImage = lens.querySelector('[data-field]'); rimImage = lens.querySelector('[data-rim]');
    violetDisplacement = lens.querySelector('[data-violet]'); cyanDisplacement = lens.querySelector('[data-cyan]');
    optics = document.createElementNS(svgNS, 'g'); optics.setAttribute('class', 'ego-glass-optics');
    copyTrack = document.createElementNS(svgNS, 'g'); copyTrack.setAttribute('class', 'ego-glass-copy-track');
    optics.append(copyTrack); lens.querySelector('svg').append(optics);
    baseTrack = document.createElement('span'); baseTrack.className = 'ego-glass-base-track';
    baseTrack.setAttribute('aria-hidden', 'true'); baseTrack.inert = true;
    nav.prepend(baseTrack, lens);
    copiedTabs = []; fieldKey = '';
  }

  function updateField(width, height) {
    // Sample surrounding glyphs before the outer lens clips the result. The rim
    // peaks then turns back, stretching/folding strokes along the capsule curve.
    // This foreground field does not claim to refract arbitrary page pixels.
    const guard = 32, regionWidth = width + guard * 2, regionHeight = height + guard * 2;
    const key = `${Math.round(width)}:${Math.round(height)}`;
    if (fieldKey !== key && !fieldCache.has(key)) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(512, Math.ceil(regionWidth * 2));
      canvas.height = Math.min(360, Math.ceil(regionHeight * 2));
      const context = canvas.getContext('2d');
      const field = context.createImageData(canvas.width, canvas.height);
      const rim = context.createImageData(canvas.width, canvas.height);
      const radius = height / 2, straight = Math.max(0, (width - height) / 2);
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        const px = (x + .5) / canvas.width * regionWidth - guard - width / 2;
        const py = (y + .5) / canvas.height * regionHeight - guard - radius;
        const dx = px - Math.max(-straight, Math.min(straight, px)), distance = Math.hypot(dx, py);
        const t = Math.max(0, Math.min(1, (distance / radius - .58) / .44));
        const bend = Math.sin(Math.PI * t), offset = height * .23 * bend;
        const i = (y * canvas.width + x) * 4;
        field.data[i] = Math.round(255 * (.5 + dx / Math.max(1, distance) * offset / 64));
        field.data[i + 1] = Math.round(255 * (.5 + py / Math.max(1, distance) * offset / 64));
        field.data[i + 2] = 128; field.data[i + 3] = 255;
        rim.data[i] = rim.data[i + 1] = rim.data[i + 2] = 255;
        rim.data[i + 3] = Math.round(255 * Math.min(1, bend * 2));
      }
      context.putImageData(field, 0, 0); const fieldURL = canvas.toDataURL();
      context.putImageData(rim, 0, 0); const rimURL = canvas.toDataURL();
      fieldCache.set(key, [fieldURL, rimURL]);
      if (fieldCache.size > 32) fieldCache.delete(fieldCache.keys().next().value);
    }
    if (fieldKey !== key) {
      const [fieldURL, rimURL] = fieldCache.get(key);
      fieldImage.setAttribute('href', fieldURL); rimImage.setAttribute('href', rimURL);
      fieldKey = key;
    }
    for (const node of [filterNode, fieldImage, rimImage]) {
      node.setAttribute('x', String(-guard)); node.setAttribute('y', String(-guard));
      node.setAttribute('width', String(regionWidth)); node.setAttribute('height', String(regionHeight));
    }
    displacement.setAttribute('scale', String(progress * 64));
    violetDisplacement.setAttribute('scale', String(progress * 72));
    cyanDisplacement.setAttribute('scale', String(progress * 56));
  }

  function syncCopies(bounds, x, width, height) {
    const originals = tabs();
    if (originals.some((tab, i) => copiedTabs[i] !== tab || copiedMarkup[i] !== tab.innerHTML) || copiedTabs.length !== originals.length) {
      copiedTabs = originals; copiedMarkup = originals.map(tab => tab.innerHTML);
      const copies = originals.map(tab => {
        const copy = document.createElement('span'); copy.className = 'ego-glass-copy-tab';
        copy.append(...[...tab.childNodes].map(child => child.cloneNode(true)));
        copy.dataset.footerTab = tab.dataset.tab;
        applyFooterFill(copy);
        copy.querySelectorAll('[id], [tabindex], [data-tab]').forEach(node => {
          node.removeAttribute('id'); node.removeAttribute('data-tab'); node.removeAttribute('tabindex');
        });
        return copy;
      });
      baseTrack.replaceChildren(...copies);
      copyTrack.replaceChildren(...copies.map(copy => {
        // Pure SVG content uses WebKit's SVG filter pipeline. HTML/foreignObject
        // source filters can silently omit displacement on iOS.
        const group = document.createElementNS(svgNS, 'g');
        group.setAttribute('class', 'ego-glass-copy-tab');
        group.dataset.footerTab = copy.dataset.footerTab;
        const glyph = copy.querySelector('.app-icon');
        if (glyph) group.append(glyph.cloneNode(true));
        const label = document.createElementNS(svgNS, 'text');
        label.setAttribute('data-glass-label', ''); label.setAttribute('text-anchor', 'middle');
        label.setAttribute('dominant-baseline', 'central'); label.setAttribute('fill', 'currentColor');
        label.textContent = copy.querySelector('span:not(.app-icon)')?.textContent || '';
        group.append(label);
        return group;
      }));
    }
    const navHeight = nav.clientHeight, magnification = 1 + progress * .2;
    // Read layout once, before updating either render track.
    const measurements = originals.map(tab => {
      const glyph = tab.querySelector('.app-icon'), label = tab.querySelector('span:not(.app-icon)');
      return { rect: tab.getBoundingClientRect(), iconRect: glyph?.getBoundingClientRect(),
        labelRect: label?.getBoundingClientRect(), font: label ? getComputedStyle(label) : null };
    });
    for (const track of [baseTrack, copyTrack]) {
      track.style.width = nav.clientWidth + 'px'; track.style.height = navHeight + 'px';
      originals.forEach((tab, i) => {
        const { rect, iconRect, labelRect, font } = measurements[i], copy = track.children[i];
        const left = rect.left - bounds.left - nav.clientLeft, top = rect.top - bounds.top - nav.clientTop;
        if (track === baseTrack) {
          copy.style.left = left + 'px'; copy.style.top = top + 'px';
          copy.style.width = rect.width + 'px'; copy.style.height = rect.height + 'px';
        } else {
          copy.setAttribute('transform', `translate(${left} ${top})`);
          const glyph = copy.querySelector('.app-icon');
          if (glyph && iconRect) {
            glyph.setAttribute('x', String(iconRect.left - rect.left)); glyph.setAttribute('y', String(iconRect.top - rect.top));
            glyph.setAttribute('width', String(iconRect.width)); glyph.setAttribute('height', String(iconRect.height));
          }
          const label = copy.querySelector('[data-glass-label]');
          if (labelRect && font) {
            label.setAttribute('x', String(rect.width / 2)); label.setAttribute('y', String(labelRect.top - rect.top + labelRect.height / 2));
            label.style.fontFamily = font.fontFamily; label.style.fontSize = font.fontSize;
            label.style.fontWeight = font.fontWeight; label.style.letterSpacing = font.letterSpacing;
          }
        }
        copy.toggleAttribute('data-current', tab.hasAttribute('aria-current'));
      });
    }
    const center = x + width / 2;
    lens.querySelector('.ego-glass-viewport').setAttribute('viewBox', `0 0 ${width} ${height}`);
    copyTrack.style.transform = `translate3d(${width / 2 - center * magnification}px,${(height - navHeight * magnification) / 2}px,0) scale(${magnification})`;
    if (progress > .001) {
      // Exclude the unwarped base under the lens: one content image at every pixel.
      const top = (navHeight - height) / 2, right = x + width, bottom = top + height, radius = height / 2;
      const hole = `M${x + radius},${top} H${right - radius} A${radius},${radius} 0 0 1 ${right},${top + radius} A${radius},${radius} 0 0 1 ${right - radius},${bottom} H${x + radius} A${radius},${radius} 0 0 1 ${x},${top + radius} A${radius},${radius} 0 0 1 ${x + radius},${top} Z`;
      baseTrack.style.clipPath = `path(evenodd, "M0,0 H${nav.clientWidth} V${navHeight} H0 Z ${hole}")`;
    } else baseTrack.style.clipPath = 'none';
    updateField(width, height);
  }

  function sync(time = performance.now()) {
    frame = 0;
    const selected = nav.querySelector(':scope > a[data-tab][aria-current="page"]');
    if (nav.hidden || !selected || nav.getBoundingClientRect().width === 0) {
      backdrop.hidden = true; endPress(); nav.removeAttribute('data-glass-ready');
      visualCenter = null; progress = progressVelocity = centerVelocity = 0; lastTime = 0;
      return;
    }
    backdrop.hidden = false;
    if (!lens?.isConnected) createTracks();
    const bounds = nav.getBoundingClientRect(), tab = (press?.tab || selected).getBoundingClientRect();
    let targetCenter = tab.left + tab.width / 2 - bounds.left - nav.clientLeft;
    if (press) {
      const links = tabs(), first = links[0].getBoundingClientRect(), last = links.at(-1).getBoundingClientRect();
      targetCenter = Math.min(last.left + last.width / 2, Math.max(first.left + first.width / 2, press.center + press.x - press.startX)) - bounds.left - nav.clientLeft;
    }
    const elapsed = time - (lastTime || time - 16);
    // An idle held lens can stop requesting frames; restart with one normal step.
    const dt = Math.min(.024, Math.max(.001, (elapsed > 50 ? 16 : elapsed) / 1000)); lastTime = time;
    if (visualCenter === null || reducedMotion.matches) visualCenter = targetCenter;
    if (reducedMotion.matches) { progress = progressVelocity = centerVelocity = 0; }
    else {
      progressVelocity += ((press ? 1 : 0) - progress) * 620 * dt - progressVelocity * 42 * dt;
      progress = Math.max(0, Math.min(1, progress + progressVelocity * dt));
      if (press) { centerVelocity = (targetCenter - visualCenter) / dt; visualCenter = targetCenter; }
      else {
        centerVelocity += ((targetCenter - visualCenter) * 620 - centerVelocity * 39) * dt;
        visualCenter += centerVelocity * dt;
      }
    }
    if (Math.abs(progress - (press && !reducedMotion.matches ? 1 : 0)) < .001 && Math.abs(progressVelocity) < .02) { progress = press && !reducedMotion.matches ? 1 : 0; progressVelocity = 0; }
    const height = 56 + progress * 20, width = (tab.width + 2) * (1 + progress * .25) * (press && !reducedMotion.matches ? press.stretch : 1);
    const x = visualCenter - width / 2;
    lens.style.width = width + 'px'; lens.style.height = height + 'px';
    lens.style.transform = `translate3d(${x}px,-50%,0)`;
    nav.style.setProperty('--glass-progress', String(progress));
    nav.toggleAttribute('data-glass-optical', progress > .001);
    syncCopies(bounds, x, width, height);
    nav.setAttribute('data-glass-ready', '');
    if (progressVelocity || Math.abs(visualCenter - targetCenter) > .1 || Math.abs(centerVelocity) > .1) schedule();
  }
  function tabAt(x, y) {
    const bounds = nav.getBoundingClientRect();
    if (nav.hidden || x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return null;
    return tabs().reduce((nearest, tab) => {
      const rect = tab.getBoundingClientRect();
      const distance = Math.abs(x - rect.left - rect.width / 2);
      return !nearest || distance < nearest.distance ? { tab, distance } : nearest;
    }, null)?.tab || null;
  }

  function preview(tab) {
    nav.querySelectorAll('[data-glass-preview]').forEach(item => item.removeAttribute('data-glass-preview'));
    if (tab) tab.setAttribute('data-glass-preview', '');
    press.tab = tab;
    schedule();
  }

  function endPress() {
    if (!press) return;
    clearTimeout(relaxTimer);
    const pointerId = press.id;
    suppressClickUntil = performance.now() + 600;
    press = null;
    nav.removeAttribute('data-glass-pressed');
    nav.querySelectorAll('[data-glass-preview]').forEach(item => item.removeAttribute('data-glass-preview'));
    if (nav.hasPointerCapture(pointerId)) nav.releasePointerCapture(pointerId);
    schedule();
  }

  nav.addEventListener('pointerdown', event => {
    if (press || !event.isPrimary || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const tab = event.target.closest('a[data-tab]') || tabAt(event.clientX, event.clientY);
    if (!tab || !nav.contains(tab)) return;
    const rect = tab.getBoundingClientRect();
    press = { id: event.pointerId, type: event.pointerType, tab, center: rect.left + rect.width / 2, startX: event.clientX, x: event.clientX, time: event.timeStamp, stretch: 1, skew: 0 };
    nav.setAttribute('data-glass-pressed', '');
    nav.setPointerCapture(event.pointerId);
    preview(tab);
  });
  nav.addEventListener('pointermove', event => {
    if (press?.id !== event.pointerId) return;
    const speed = (event.clientX - press.x) / Math.max(8, event.timeStamp - press.time);
    press.stretch = 1 + Math.min(.035, Math.abs(speed) * .015);
    press.skew = Math.max(-2, Math.min(2, speed));
    press.x = event.clientX;
    press.time = event.timeStamp;
    clearTimeout(relaxTimer);
    relaxTimer = setTimeout(() => {
      if (!press) return;
      press.stretch = 1;
      press.skew = 0;
      schedule();
    }, 90);
    preview(tabAt(event.clientX, event.clientY));
  });
  nav.addEventListener('pointerup', event => {
    if (press?.id !== event.pointerId) return;
    const tab = tabAt(event.clientX, event.clientY);
    // Pointer capture retargets the browser click to the nav. Activate the final
    // anchor once, and suppress only the physical click that follows release.
    endPress();
    if (tab && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) tab.click();
  });
  nav.addEventListener('pointercancel', event => {
    if (press?.id !== event.pointerId) return;
    endPress();
  });
  nav.addEventListener('lostpointercapture', event => {
    if (press?.id !== event.pointerId) return;
    endPress();
  });
  nav.addEventListener('click', event => {
    if (event.detail > 0 && performance.now() < suppressClickUntil && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  nav.addEventListener('dragstart', event => event.preventDefault());
  nav.addEventListener('contextmenu', event => {
    if (event.pointerType === 'touch' || event.pointerType === 'pen' || press?.type === 'touch' || press?.type === 'pen') event.preventDefault();
  });
  document.addEventListener('pointerdown', event => {
    if (press && event.pointerId !== press.id) endPress();
  }, true);
  window.addEventListener('blur', endPress);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) endPress();
  });

  function schedule() {
    if (!frame) frame = requestAnimationFrame(sync);
  }
  // Deliberately exclude style/class so positioning the lens cannot observe itself.
  const observer = new MutationObserver(records => {
    if (records.some(record => !lens?.contains(record.target) && !baseTrack?.contains(record.target))) schedule();
  });
  observer.observe(nav, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-current', 'hidden'] });
  observer.observe(shell, { attributes: true, attributeFilter: ['data-screen'] });
  const resize = new ResizeObserver(schedule);
  resize.observe(nav);
  window.addEventListener('resize', schedule);
  reducedMotion.addEventListener('change', schedule);
  schedule();
}
