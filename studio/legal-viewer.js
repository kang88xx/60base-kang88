import { icon } from '../shared/ui.js';

const sheetStyle = new URL('./legal-viewer.css', import.meta.url).href;
function ensureStyle() {
  if (document.querySelector('link[data-legal-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = sheetStyle; link.dataset.legalStyle = '';
  document.head.append(link);
}
function closeButton(close) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'legal-close'; button.setAttribute('aria-label', '닫기');
  button.innerHTML = icon('close', 24); button.addEventListener('click', close);
  return button;
}
function frame(title, close, returnLabel) {
  const header = document.createElement('header'); header.className = 'legal-header';
  const heading = document.createElement('h1'); heading.id = 'legal-viewer-title'; heading.textContent = title;
  header.append(heading, closeButton(close));
  const body = document.createElement('div'); body.className = 'legal-body'; body.tabIndex = 0;
  const footer = document.createElement('footer'); footer.className = 'legal-footer';
  const button = document.createElement('button'); button.type = 'button'; button.textContent = '닫기'; button.addEventListener('click', close);
  const note = document.createElement('p'); note.textContent = returnLabel;
  footer.append(button, note);
  return {header, body, footer};
}

// Bind to the signup dialog, ahead of the document-level native external-link handler.
// Opening/closing a legal sheet never rebuilds or submits the registration form.
export function bindSignupLegalViewer(signup) {
  ensureStyle();
  let active;
  signup.addEventListener('close', () => { if (active?.open) active.close(); });
  signup.addEventListener('click', event => {
    const anchor = event.target.closest?.('a[href]');
    if (!anchor) return;
    const url = new URL(anchor.href, location.href), shell = new URL(location.href);
    if (url.protocol !== shell.protocol || url.host !== shell.host || url.username || url.password ||
        !['/studio/terms.html', '/studio/privacy.html'].includes(url.pathname)) return;
    event.preventDefault(); event.stopPropagation();
    if (active?.isConnected) return;
    const sheet = document.createElement('dialog'); active = sheet;
    sheet.className = 'legal-sheet'; sheet.setAttribute('aria-labelledby', 'legal-viewer-title');
    const close = () => sheet.close();
    const parts = frame(url.pathname.endsWith('/terms.html') ? '서비스 이용 안내' : '개인정보와 영상 이용 안내', close, '가입 화면으로 돌아가요');
    const status = document.createElement('p'); status.role = 'status'; status.textContent = '안내를 불러오고 있습니다.';
    parts.body.append(status); sheet.append(parts.header, parts.body, parts.footer);
    signup.append(sheet); sheet.showModal();
    const controller = new AbortController();
    sheet.addEventListener('close', () => { controller.abort(); sheet.remove(); active = null; if (anchor.isConnected) anchor.focus({preventScroll:true}); }, {once:true});
    fetch(url.href, {signal:controller.signal}).then(response => {
      if (!response.ok) throw Error('legal-unavailable');
      return response.text();
    }).then(html => {
      if (!sheet.open) return;
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const content = parsed.querySelector('[data-legal-content]');
      if (!content) throw Error('legal-content-missing');
      // Only reviewed same-shell documents are loaded; retain absolute destinations for inner links.
      content.querySelectorAll('a[href]').forEach(link => { link.href = new URL(link.getAttribute('href'), url).href; });
      parts.body.replaceChildren(document.importNode(content, true));
    }).catch(error => {
      if (error.name === 'AbortError' || !sheet.open) return;
      status.textContent = '안내를 불러오지 못했습니다. 다시 열거나 원문을 확인해주세요.';
      const fallback = document.createElement('a'); fallback.href = url.href; fallback.target = '_blank'; fallback.rel = 'noopener'; fallback.textContent = '원문 열기';
      parts.body.append(fallback);
    });
  });
}

if (document.body.classList.contains('legal-page')) {
  ensureStyle();
  const content = document.querySelector('[data-legal-content]');
  const close = () => {
    const referrer = document.referrer && new URL(document.referrer);
    if (history.length > 1 && referrer && referrer.origin === location.origin) history.back();
    else location.assign('../app/');
  };
  const parts = frame(document.body.dataset.legalTitle, close, '이전 화면으로 돌아가요');
  parts.body.append(content); document.body.append(parts.header, parts.body, parts.footer);
}
