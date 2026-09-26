// The selected intro only accompanies startup; ready content never waits for it.
const launch = document.querySelector('#app-launch');
const content = launch ? [...launch.parentElement.children, ...document.querySelectorAll('.skip-link')].filter(node => node !== launch) : [];
const previousInert = new Map(content.map(node => [node, node.inert]));
let dismissed = !launch;
let fallback;

function dismissLaunch() {
  if (dismissed) return;
  dismissed = true;
  clearTimeout(fallback);
  const restoreFocus = launch.contains(document.activeElement);
  launch.hidden = true;
  for (const node of content) node.inert = previousInert.get(node);
  document.removeEventListener('visibilitychange', syncVisibility);
  window.removeEventListener('hashchange', dismissLaunch);
  window.removeEventListener('offline', dismissLaunch);
  if (restoreFocus) document.querySelector('#app-main')?.focus({ preventScroll: true });
}

function syncVisibility() {
  launch?.classList.toggle('is-paused', document.hidden);
}

export function updateLaunch(state) {
  if (!state.loading || state.catalog || state.catalogError || !navigator.onLine || document.querySelector('dialog[open]')) dismissLaunch();
}

if (launch) {
  const homeEntry = !location.hash || location.hash === '#home';
  if (!homeEntry || !navigator.onLine) dismissLaunch();
  else {
    for (const node of content) node.inert = true;
    launch.querySelector('.app-launch-continue').addEventListener('click', dismissLaunch);
    document.addEventListener('visibilitychange', syncVisibility);
    window.addEventListener('hashchange', dismissLaunch);
    window.addEventListener('offline', dismissLaunch);
    syncVisibility();
    // Slow or unavailable APIs continue in the app's existing retry/loading UI.
    fallback = setTimeout(dismissLaunch, 4000);
  }
}
