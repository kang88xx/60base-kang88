// Selected D intro: once per tab session, 2.7s maximum, never replayed by routing
// or account refresh. It decorates startup; it does not grant member access.
const launch = document.querySelector('#app-launch');
const seenKey = 'ego.intro-d.20261011';
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const previousInert = new Map();
let dismissed = true, fallback, dialogs;

function fitFlood() {
  if (dismissed) return;
  const symbol = launch.querySelector('.app-launch-symbol').getBoundingClientRect();
  const frame = launch.getBoundingClientRect();
  launch.style.setProperty('--launch-cx', `${symbol.left + symbol.width / 2 - frame.left}px`);
  launch.style.setProperty('--launch-cy', `${symbol.top + symbol.height / 2 - frame.top}px`);
}

function dismissLaunch() {
  if (dismissed) return;
  dismissed = true;
  clearTimeout(fallback);
  dialogs?.disconnect();
  const restoreFocus = launch.contains(document.activeElement);
  launch.hidden = true;
  launch.classList.remove('is-playing');
  for (const [node, inert] of previousInert) node.inert = inert;
  document.removeEventListener('visibilitychange', hiddenPage);
  window.removeEventListener('hashchange', dismissLaunch);
  window.removeEventListener('offline', dismissLaunch);
  window.removeEventListener('pagehide', dismissLaunch);
  window.removeEventListener('resize', fitFlood);
  reduced.removeEventListener('change', dismissLaunch);
  if (restoreFocus) document.querySelector('#app-main')?.focus({ preventScroll: true });
}

function hiddenPage() { if (document.hidden) dismissLaunch(); }

export function updateLaunch(state) {
  if (state.error || state.catalogError || state.accountConnectionError || !navigator.onLine || document.querySelector('dialog[open]')) dismissLaunch();
}

if (launch) {
  let seen = false;
  try { seen = sessionStorage.getItem(seenKey) === 'seen'; sessionStorage.setItem(seenKey, 'seen'); } catch { /* Disabled storage still permits bounded startup. */ }
  const homeEntry = !location.hash || location.hash === '#home';
  const restored = performance.getEntriesByType('navigation')[0]?.type === 'back_forward';
  if (!seen && !restored && homeEntry && navigator.onLine && !document.hidden && !document.querySelector('dialog[open]')) {
    dismissed = false;
    for (const node of [...launch.parentElement.children, ...document.querySelectorAll('.skip-link')]) {
      if (node === launch) continue;
      previousInert.set(node, node.inert); node.inert = true;
    }
    launch.hidden = false;
    fitFlood();
    launch.classList.add('is-playing');
    launch.querySelector('.app-launch-continue').addEventListener('click', dismissLaunch, { once: true });
    document.addEventListener('visibilitychange', hiddenPage);
    window.addEventListener('hashchange', dismissLaunch);
    window.addEventListener('offline', dismissLaunch);
    window.addEventListener('pagehide', dismissLaunch);
    window.addEventListener('resize', fitFlood);
    reduced.addEventListener('change', dismissLaunch);
    dialogs = new MutationObserver(() => { if (document.querySelector('dialog[open]')) dismissLaunch(); });
    dialogs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
    document.fonts.ready.then(fitFlood);
    // Reduced motion shows the final static lockup briefly, without the flood.
    fallback = setTimeout(dismissLaunch, reduced.matches ? 450 : 2700);
  }
}
