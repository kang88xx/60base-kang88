// Footer-only selected artwork. Canonical icons elsewhere remain untouched.
// Set --footer-fill to 0..1 on a tab or track to blend outline and filled states.
const SVG_NS = 'http://www.w3.org/2000/svg';
const outlines = Object.freeze({
  "home": "<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M219.31,108.68l-80-80a16,16,0,0,0-22.62,0l-80,80A15.87,15.87,0,0,0,32,120v96a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V160h32v56a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V120A15.87,15.87,0,0,0,219.31,108.68ZM208,208H160V152a8,8,0,0,0-8-8H104a8,8,0,0,0-8,8v56H48V120l80-80,80,80Z\"/>",
  "missions": "<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M208,56H180.28L166.65,35.56A8,8,0,0,0,160,32H96a8,8,0,0,0-6.65,3.56L75.71,56H48A24,24,0,0,0,24,80V192a24,24,0,0,0,24,24H208a24,24,0,0,0,24-24V80A24,24,0,0,0,208,56Zm8,136a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V80a8,8,0,0,1,8-8H80a8,8,0,0,0,6.66-3.56L100.28,48h55.43l13.63,20.44A8,8,0,0,0,176,72h32a8,8,0,0,1,8,8ZM128,88a44,44,0,1,0,44,44A44.05,44.05,0,0,0,128,88Zm0,72a28,28,0,1,1,28-28A28,28,0,0,1,128,160Z\"/>",
  "wallet": "<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M216,64H56a8,8,0,0,1,0-16H192a8,8,0,0,0,0-16H56A24,24,0,0,0,32,56V184a24,24,0,0,0,24,24H216a16,16,0,0,0,16-16V80A16,16,0,0,0,216,64Zm0,128H56a8,8,0,0,1-8-8V78.63A23.84,23.84,0,0,0,56,80H216Zm-48-60a12,12,0,1,1,12,12A12,12,0,0,1,168,132Z\"/>",
  "profile": "<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M230.92,212c-15.23-26.33-38.7-45.21-66.09-54.16a72,72,0,1,0-73.66,0C63.78,166.78,40.31,185.66,25.08,212a8,8,0,1,0,13.85,8c18.84-32.56,52.14-52,89.07-52s70.23,19.44,89.07,52a8,8,0,1,0,13.85-8ZM72,96a56,56,0,1,1,56,56A56.06,56.06,0,0,1,72,96Z\"/>"
});
const filled = Object.freeze({
  "home": "<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M219.31,108.68l-80-80a16,16,0,0,0-22.62,0l-80,80A15.87,15.87,0,0,0,32,120v96a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V160h32v56a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V120A15.87,15.87,0,0,0,219.31,108.68Z\"/>",
  "missions": "<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M208,56H180.28L166.65,35.56A8,8,0,0,0,160,32H96a8,8,0,0,0-6.65,3.56L75.71,56H48A24,24,0,0,0,24,80V192a24,24,0,0,0,24,24H208a24,24,0,0,0,24-24V80A24,24,0,0,0,208,56ZM100 132a28 28 0 1 0 56 0a28 28 0 1 0 -56 0Z\"/>",
  "wallet": "<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M216,64H56a8,8,0,0,1,0-16H192a8,8,0,0,0,0-16H56A24,24,0,0,0,32,56V184a24,24,0,0,0,24,24H216a16,16,0,0,0,16-16V80A16,16,0,0,0,216,64ZM168 132a12 12 0 1 0 24 0a12 12 0 1 0 -24 0Z\"/>",
  "profile": "<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M230.92,212c-15.23-26.33-38.7-45.21-66.09-54.16a72,72,0,1,0-73.66,0C63.78,166.78,40.31,185.66,25.08,212a8,8,0,1,0,13.85,8c18.84-32.56,52.14-52,89.07-52s70.23,19.44,89.07,52a8,8,0,1,0,13.85-8Z\"/><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M38.93 220C57.77 187.44 91.07 168 128 168S198.23 187.44 217.07 220L217.07 224H38.93Z\"/>"
});

/** Augment a cloned footer tab; data-footer-tab (or data-tab) identifies its route. */
export function applyFooterFill(element) {
  const id = element?.getAttribute('data-footer-tab') || element?.getAttribute('data-tab');
  const artwork = filled[id];
  const icon = element?.querySelector('.app-icon');
  if (!artwork || !icon || icon.hasAttribute('data-footer-artwork')) return false;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 256 256');
  svg.setAttribute('class', icon.getAttribute('class') || 'app-icon');
  svg.innerHTML = outlines[id];
  icon.replaceWith(svg);
  svg.setAttribute('data-footer-artwork', id);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.style.background = 'none';
  svg.style.mask = 'none';
  svg.style.webkitMask = 'none';
  svg.classList.add('ego-footer-icon');
  const outline = document.createElementNS(SVG_NS, 'g');
  outline.setAttribute('data-footer-outline', '');
  outline.style.opacity = 'calc(1 - var(--footer-fill, 0))';
  outline.setAttribute('fill', 'currentColor');
  outline.append(...Array.from(svg.childNodes));
  const solid = document.createElementNS(SVG_NS, 'g');
  solid.setAttribute('data-footer-fill', '');
  solid.setAttribute('fill', 'currentColor');
  solid.style.opacity = 'var(--footer-fill, 0)';
  solid.innerHTML = artwork;
  svg.append(outline, solid);
  return true;
}
