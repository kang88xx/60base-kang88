// Selected D intro: each cold document entry, at least 3s after artwork/font
// readiness. Routing and account refresh never restart it or grant member access.
const launch = document.querySelector('#app-launch');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const previousInert = new Map();
const eyes = launch?.querySelector('.app-launch-eyes');
let dismissed = true, fallback, dialogs;

// One menu-strength impact per actual blink cycle; no wall-clock haptic timers.
function blinkHaptic(event) {
  if (event.target !== eyes || event.animationName !== 'ego-intro-blink' ||
      dismissed || launch.hidden || document.hidden || reduced.matches ||
      !launch.classList.contains('is-playing')) return;
  const capacitor = window.Capacitor;
  try {
    if (!capacitor?.isNativePlatform?.() || !capacitor.isPluginAvailable?.('EgoTabHaptics')) return;
    Promise.resolve(capacitor.registerPlugin('EgoTabHaptics').impact()).catch(() => {});
  } catch { /* Optional native feedback must never interrupt startup. */ }
}

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
  eyes?.removeEventListener('animationstart', blinkHaptic);
  eyes?.removeEventListener('animationiteration', blinkHaptic);
  dialogs?.disconnect();
  const restoreFocus = launch.contains(document.activeElement);
  launch.hidden = true;
  launch.classList.remove('is-playing');
  for (const [node, inert] of previousInert) node.inert = inert;
  document.removeEventListener('visibilitychange', hiddenPage);
  window.removeEventListener('hashchange', dismissLaunch);
  window.removeEventListener('pagehide', dismissLaunch);
  window.removeEventListener('resize', fitFlood);
  reduced.removeEventListener('change', dismissLaunch);
  if (restoreFocus) document.querySelector('#app-main')?.focus({ preventScroll: true });
}

function hiddenPage() { if (document.hidden) dismissLaunch(); }

export function updateLaunch(state) {
  if (document.querySelector('dialog[open]')) dismissLaunch();
}

if (launch) {
  const homeEntry = !location.hash || location.hash === '#home';
  const restored = performance.getEntriesByType('navigation')[0]?.type === 'back_forward';
  const callback = ['code', 'state', 'error', 'oauth_callback'].some(key => new URLSearchParams(location.search).has(key));
  if (!callback && !restored && homeEntry && !document.hidden && !document.querySelector('dialog[open]')) {
    dismissed = false;
    for (const node of [...launch.parentElement.children, ...document.querySelectorAll('.skip-link')]) {
      if (node === launch) continue;
      previousInert.set(node, node.inert); node.inert = true;
    }
    eyes?.addEventListener('animationstart', blinkHaptic);
    eyes?.addEventListener('animationiteration', blinkHaptic);
    launch.hidden = false;
    fitFlood();
    launch.querySelector('.app-launch-continue').addEventListener('click', dismissLaunch, { once: true });
    document.addEventListener('visibilitychange', hiddenPage);
    window.addEventListener('hashchange', dismissLaunch);
    window.addEventListener('pagehide', dismissLaunch);
    window.addEventListener('resize', fitFlood);
    reduced.addEventListener('change', dismissLaunch);
    dialogs = new MutationObserver(() => { if (document.querySelector('dialog[open]')) dismissLaunch(); });
    dialogs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
    const assets = Promise.allSettled([
      document.fonts.load('800 46px "Ego Intro Inter Tight"'),
      document.fonts.ready,
      ...[...launch.querySelectorAll('img')].map(image => image.decode()),
    ]);
    // Failed/stalled downloads cannot trap startup; the skip remains available.
    const readyLimit = new Promise(resolve => { fallback = setTimeout(resolve, 8000); });
    Promise.race([assets, readyLimit]).then(() => {
      if (dismissed) return;
      clearTimeout(fallback);
      fitFlood();
      launch.classList.add('is-playing');
      // Start the visible minimum on a painted frame, including reduced motion.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!dismissed) fallback = setTimeout(dismissLaunch, 3000);
      }));
    });
  }
}
