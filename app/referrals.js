import { api, esc, points } from '../studio/online-api.js';
import { getAppState, subscribeApp } from './service.js';
import { canEnterApp } from './access-boundary.js';

const accountKey = state => canEnterApp(state) ? state.accountKey + '|' + state.user.id : '';
let identity = '', controller, sequence = 0, loadedAt = 0, hadAccount = false;
let snapshot = { data: null, loading: false, claiming: false, error: '', draft: new URLSearchParams(location.search).get('ref')?.slice(0, 64) || '' };
const listeners = new Set();
const publish = patch => { snapshot = { ...snapshot, ...patch }; for (const listener of listeners) listener(snapshot); };
export const getReferrals = () => snapshot;
export const subscribeReferrals = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export const setReferralDraft = value => { snapshot = { ...snapshot, draft: String(value).slice(0, 64) }; };
const current = (owner, request) => owner === identity && owner === accountKey(getAppState()) && request === sequence;
export async function refreshReferrals({ force = false } = {}) {
  const owner = accountKey(getAppState());
  if (!owner || snapshot.claiming) return;
  if (owner === identity && (snapshot.loading || (!force && loadedAt && Date.now() - loadedAt < 30000))) return;
  if (identity && identity !== owner) reset(owner);
  identity = owner; hadAccount = true;
  controller?.abort(); controller = new AbortController(); const signal = controller.signal, request = ++sequence;
  publish({ loading: true, error: '' });
  try {
    const data = await api('/referrals', { signal });
    if (!current(owner, request)) return;
    loadedAt = Date.now(); publish({ data, loading: false, error: '' });
  } catch (error) {
    if (!current(owner, request) || signal.aborted) return;
    loadedAt = 0; publish({ data: null, loading: false, error: error.message || '초대 정보를 불러오지 못했어요.' });
  }
}
export async function claimReferral() {
  const owner = accountKey(getAppState()), code = snapshot.draft.trim();
  if (!owner || owner !== identity || snapshot.claiming || !snapshot.data?.canClaim || !code) return false;
  controller?.abort(); const request = ++sequence;
  publish({ claiming: true, error: '' });
  try {
    const data = await api('/referrals/claim', { method: 'POST', body: { code } });
    if (!current(owner, request)) return false;
    loadedAt = Date.now(); publish({ data, claiming: false, draft: '', error: '' }); return true;
  } catch (error) {
    if (!current(owner, request)) return false;
    publish({ claiming: false, error: error.message || '초대 코드를 등록하지 못했어요.' }); return false;
  }
}
export async function shareReferral({ copy = false } = {}) {
  const owner = accountKey(getAppState()), data = snapshot.data;
  if (!owner || owner !== identity || !data?.shareUrl) return { kind: 'unavailable' };
  const share = { title: '에고 친구 초대', text: '에고에서 일상의 영상을 함께 기록해요. 초대 코드: ' + data.code, url: data.shareUrl };
  if (!copy && navigator.share) {
    try { await navigator.share(share); return { kind: 'shared' }; }
    catch (error) { if (error.name === 'AbortError') return { kind: 'cancelled' }; throw error; }
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(share.url);
    return owner === accountKey(getAppState()) ? { kind: 'copied' } : { kind: 'cancelled' };
  }
  return { kind: 'manual', url: share.url };
}
function reset(next) {
  controller?.abort(); controller = null; sequence++; loadedAt = 0; identity = next;
  const draft = hadAccount ? '' : snapshot.draft;
  if (next) hadAccount = true;
  publish({ data: null, loading: false, claiming: false, error: '', draft });
}
subscribeApp(state => {
  const next = accountKey(state);
  if (next !== identity) { reset(next); if (next) void refreshReferrals(); }
});
export function referralCard(state = snapshot) {
  const data = state.data;
  const intro = '<div class="section-row"><span class="contributor-badge">친구 초대 · 1,000P</span></div><h2>일상을 함께 나눠요.</h2><p>초대받은 친구의 첫 영상이 최종 승인되면<br>초대한 나에게 1,000P가 한 번 적립돼요.</p>';
  const error = state.error ? `<p class="app-alert" role="alert">${esc(state.error)}</p>` : '';
  if (!data) return `<section class="ego-share-card">${intro}${error}${state.loading ? '<p role="status">초대 정보를 불러오고 있어요.</p>' : '<p>연결 후 내 초대 코드와 혜택을 확인할 수 있어요.</p><button class="app-button secondary" data-app-action="refresh-referrals">다시 불러오기</button>'}</section>`;
  return `<section class="ego-share-card">${intro}<div class="referral-code"><span>내 초대 코드</span><strong>${esc(data.code)}</strong></div><div class="action-pair"><button type="button" class="app-button primary" data-app-action="share-referral">친구 초대하기</button><button type="button" class="app-button secondary" data-app-action="copy-referral">링크 복사</button></div><div class="profile-stat-grid"><div><strong>${esc(data.invitedCount)}</strong><span>초대한 친구</span></div><div><strong>${esc(data.rewardedCount)}</strong><span>보상 완료</span></div><div><strong>${points(data.earnedPoints)}</strong><span>초대 적립</span></div></div>${error}${data.attribution ? `<p role="status">${data.attribution.status === 'unavailable' ? '등록한 초대 정보를 더 이상 사용할 수 없어요. 초대 코드는 다시 등록할 수 없어요.' : data.attribution.status === 'rewarded' ? '첫 영상 승인으로 초대한 친구에게 보상이 지급됐어요.' : '초대 코드 등록 완료 · 내 첫 영상 최종 승인 시 초대한 친구에게 보상이 지급돼요.'}</p>` : data.canClaim ? `<form id="referral-claim-form" class="referral-claim"><label for="referral-code-input">친구에게 받은 초대 코드</label><input id="referral-code-input" name="code" maxlength="64" autocomplete="off" autocapitalize="characters" required value="${esc(state.draft)}" ${state.claiming ? 'disabled' : ''}><p>첫 영상 승인 전에 한 번만 등록할 수 있어요. 등록 후에는 변경할 수 없어요.</p><button class="app-button secondary" type="submit" ${state.claiming ? 'disabled aria-busy="true"' : ''}>${state.claiming ? '등록 중…' : '이 초대 코드 등록하기'}</button></form>` : data.claimUnavailableReason === 'account_unavailable' ? '<p>현재 계정 상태에서는 초대 코드를 등록할 수 없어요.</p>' : '<p>초대 코드는 첫 영상 최종 승인 전에 등록할 수 있어요.</p>'}</section>`;
}
