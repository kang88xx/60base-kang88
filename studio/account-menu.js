import { icon, escapeHTML as esc } from '../shared/ui.js';

let account = null;
const root = document.querySelector('[data-account-menu]');
const trigger = root?.querySelector('[data-online-account]');
const panel = root?.querySelector('#studio-account-menu');

export function closeAccountMenu(restoreFocus = false) {
  if (!panel || panel.hidden) return;
  panel.hidden = true;
  trigger.setAttribute('aria-expanded', 'false');
  if (restoreFocus) trigger.focus();
}

export function updateAccountMenu(next) {
  account = next;
  if (!root) return;
  trigger.innerHTML = `${icon('user',20)}<span class="account-menu-name">${esc(next.name || (next.pending ? '가입 완료하기' : '로그인 / 가입'))}</span><span class="account-menu-chevron">${icon('chevron',16)}</span>`;
  trigger.setAttribute('aria-label', `${next.name || '게스트'} 계정 메뉴`);
  trigger.disabled = next.busy;
  const focusedAction = panel.contains(document.activeElement) ? document.activeElement.dataset.accountAction : null;
  panel.innerHTML = `<div class="account-menu-identity">${next.isGoogle ? '<img src="../assets/brand/google-signin-g.png" width="20" height="20" alt="Google">' : icon('user',20)}<span>${esc(next.email || '로그인하고 참여를 시작하세요.')}</span></div><a class="account-menu-item" href="#profile" data-account-action="settings" ${location.hash === '#profile' ? 'aria-current="page"' : ''}>${icon('settings',20)}<span>계정 및 설정</span></a>${next.pending ? `<button type="button" class="account-menu-item" data-account-action="login" ${next.busy ? 'disabled' : ''}>${icon('user',20)}<span>가입 완료하기</span></button>` : ''}${next.signedIn ? `<button type="button" class="account-menu-item" data-account-action="signout" ${next.busy ? 'disabled' : ''}>${icon('arrow',20)}<span>로그아웃</span></button>` : `<button type="button" class="account-menu-item" data-account-action="login" ${next.busy ? 'disabled' : ''}>${icon('user',20)}<span>${next.pending ? '가입 완료하기' : '로그인 / 가입'}</span></button>`}`;
  if (focusedAction) panel.querySelector(`[data-account-action="${focusedAction}"]`)?.focus();
}

trigger?.addEventListener('click', () => {
  if (!panel.hidden) { closeAccountMenu(); return; }
  panel.hidden = false;
  trigger.setAttribute('aria-expanded','true');
});
panel?.addEventListener('click', event => {
  const action = event.target.closest('[data-account-action]')?.dataset.accountAction;
  if (!action) return;
  closeAccountMenu(true);
  if (action === 'login') account?.onLogin();
  if (action === 'signout') account?.onSignOut();
});
document.addEventListener('click', event => { if (root && !root.contains(event.target)) closeAccountMenu(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && panel && !panel.hidden) { event.preventDefault(); closeAccountMenu(true); }
});
root?.addEventListener('focusout', event => { if (!root.contains(event.relatedTarget)) closeAccountMenu(); });
window.addEventListener('hashchange', () => closeAccountMenu());
