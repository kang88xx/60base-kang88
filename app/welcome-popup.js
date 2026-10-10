import { api, session, sessionEpoch } from '../studio/online-api.js';

const APP_ROUTE = /^#(?:home|missions|ranking|education|estimate|announcements|library|reviews|wallet|profile|settings|support|activity\/[a-z0-9-]{1,100}|guide\/[a-z0-9-]{1,100}\/[1-3])$/;
function safeImage(value) {
  if (!value || typeof value !== 'string' || /[\u0000-\u0020\\]/.test(value) || value.startsWith('//')) return '';
  try {
    const address = new URL(value, location.origin);
    if (address.username || address.password || !/\.(png|jpe?g|webp|gif|svg)$/i.test(address.pathname)) return '';
    if (value.startsWith('/')) return /^\/(app|assets)\//.test(address.pathname) ? value : '';
    return address.protocol === 'https:' ? address.href : '';
  } catch { return ''; }
}

function popupDialog(config, { preview = false, onAction = () => {} } = {}) {
  const element = document.createElement('dialog');
  element.className = 'ego-welcome-dialog';
  if (preview) element.dataset.adminPrivate = '';
  const titleId = `ego-welcome-${crypto.randomUUID()}`;
  element.setAttribute('aria-labelledby', titleId);
  element.setAttribute('aria-describedby', titleId + '-body');
  element.innerHTML = '<div class="ego-welcome-card"><p class="ego-welcome-preview" hidden>미리보기 · 저장 전 화면</p><div class="ego-welcome-art" hidden><img alt=""></div><p class="ego-welcome-eyebrow">ego · 시작 안내</p><h2></h2><p class="ego-welcome-body"></p><div class="ego-welcome-actions"><button type="button" class="ego-welcome-close"></button><button type="button" class="ego-welcome-primary"></button></div></div>';
  const heading = element.querySelector('h2'), body = element.querySelector('.ego-welcome-body');
  heading.id = titleId; heading.textContent = config.title || '안내';
  body.id = titleId + '-body'; body.textContent = config.body || '';
  const image = element.querySelector('img'), art = element.querySelector('.ego-welcome-art'), address = safeImage(config.imageUrl);
  if (address) { image.alt = config.imageAlt || ''; image.src = address; art.hidden = false; image.onerror = () => { art.hidden = true; }; }
  element.querySelector('.ego-welcome-preview').hidden = !preview;
  const dismiss = element.querySelector('.ego-welcome-close'), action = element.querySelector('.ego-welcome-primary');
  dismiss.textContent = config.closeLabel || '닫기';
  action.textContent = config.ctaLabel || '확인';
  dismiss.onclick = () => element.close();
  action.onclick = () => { element.close(); if (!preview) onAction(APP_ROUTE.test(config.ctaPath) ? config.ctaPath : '#education'); };
  const trigger = document.activeElement;
  element.addEventListener('close', () => { element.remove(); if (trigger?.isConnected) trigger.focus({ preventScroll: true }); }, { once: true });
  element.addEventListener('click', event => { if (event.target === element) { const bounds = element.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) element.close(); } });
  document.body.append(element);
  element.showModal();
  dismiss.focus({ preventScroll: true });
  return element;
}

export function openWelcomePopupPreview(config) { return popupDialog(config, { preview: true }); }

let initialization;
export function initializeWelcomePopup() {
  if (initialization) return initialization;
  initialization = import('./service.js').then(({ subscribeApp, getAppState }) => {
    let owner = '', generation = 0, pending = null, dialog = null, timer = null, request = null, checked = false;
    const identity = () => {
      const state = getAppState();
      return state.online && session.online && session.user && state.access === 'allowed' && !state.sessionChecking ? `${session.user.id}|${sessionEpoch}|${session.csrf || ''}` : '';
    };
    const stop = () => { clearTimeout(timer); request?.abort(); request = null; pending = null; checked = false; dialog?.close(); dialog = null; };
    const show = () => {
      clearTimeout(timer);
      if (!pending || identity() !== owner || !owner) return;
      const launch = document.querySelector('#app-launch');
      if (document.hidden || document.querySelector('dialog[open]') || (launch && !launch.hidden)) { timer = setTimeout(show, 300); return; }
      const popup = pending; pending = null;
      dialog = popupDialog(popup, { onAction: route => { if (identity() === owner) location.hash = route.slice(1); } });
      // Mark only a dialog that actually opened; failed acknowledgements can retry
      // after the next login/load instead of claiming it was delivered.
      void api('/welcome-popup/seen', { method: 'POST', body: { version: popup.version } }).catch(() => {});
    };
    const sync = () => {
      const nextOwner = identity();
      if (nextOwner !== owner) { generation++; stop(); owner = nextOwner; }
      if (!owner || checked || getAppState().loading || getAppState().accountConnecting) return;
      checked = true;
      const current = generation;
      request = new AbortController();
      void api('/welcome-popup', { signal: request.signal }).then(result => {
        if (current !== generation || identity() !== owner || !owner) return;
        if (result.popup?.enabled) { pending = result.popup; show(); }
      }).catch(() => {}).finally(() => { if (current === generation) request = null; });
    };
    subscribeApp(sync);
    window.addEventListener('service-session', sync);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { sync(); show(); } });
    window.addEventListener('pagehide', stop);
    sync();
  });
  return initialization;
}
