import { api } from '../studio/online-api.js';
import { getAppState, subscribeApp } from './service.js';
import { canEnterApp } from './access-boundary.js';

let snapshot = { data: null, loading: false, error: '' }, identity = '', controller, loadedAt = 0;
const listeners = new Set();
const publish = patch => { snapshot = { ...snapshot, ...patch }; for (const listener of listeners) listener(snapshot); };
export const getCommunity = () => snapshot;
export const subscribeCommunity = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export async function refreshCommunity({ force = false } = {}) {
  const state = getAppState();
  if (!canEnterApp(state)) return;
  const account = state.accountKey + '|' + state.user.id;
  if (account === identity && (snapshot.loading || (!force && loadedAt && Date.now() - loadedAt < 30000))) return;
  controller?.abort(); controller = new AbortController(); const request = controller;
  identity = account; publish({ loading: true, error: '' });
  try {
    const data = await api('/community/summary', { signal: request.signal });
    if (request !== controller || identity !== account || !canEnterApp(getAppState())) return;
    loadedAt = Date.now(); publish({ data, loading: false, error: '' });
  } catch (error) {
    if (request !== controller || request.signal.aborted) return;
    loadedAt = 0; publish({ data: null, loading: false, error: error.message || '기여 현황을 불러오지 못했어요.' });
  }
}
subscribeApp(state => {
  const next = canEnterApp(state) ? state.accountKey + '|' + state.user.id : '';
  if (next === identity) return;
  controller?.abort(); controller = null; identity = ''; loadedAt = 0;
  publish({ data: null, loading: false, error: '' });
  if (next) void refreshCommunity();
});
