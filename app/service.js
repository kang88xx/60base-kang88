import { getClips, subscribe as subscribeClips } from '../shared/store.js';
import { getStudioAccess, studioAccountKey, subscribeStudioAccess } from '../studio/access.js';
import { openStudioCamera, closeStudioCamera } from '../studio/camera.js';
import { openLocalImport, openLocalClip } from '../studio/local-records.js';
import { getCloudAccount, subscribeCloudAccount } from '../studio/cloud-account.js';
import { cloudDisplayName, showCloudAccount } from '../studio/cloud-account-ui.js';
import {
  mountOnline,
  showAccountEntry,
  signOutAccount,
  submitLocalRecording,
  viewVideo,
  resubmit,
  getAccountConnectionState,
} from '../studio/online.js';
import { api, session, sessionEpoch, sessionReady, refreshSession } from '../studio/online-api.js';

const listeners = new Set();
let requestToken = 0;
let privateKey = '';
let appReadyResolve;
let refreshScheduled = false;
let refreshOptions = null;
let activeRefresh = null;
let catalogCache = { value: null, at: 0, promise: null, generation: 0 };
let clipsCache = { accountKey: '', value: null, promise: null, dirty: true };
let meCache = { key: '', value: null, at: 0, promise: null };
let clipsGeneration = 0;
let catalogGeneration = 0;
const CATALOG_CACHE_MS = 30000;
const ME_CACHE_MS = 10000;
// Revalidate on foreground return and after 45s before entering a member screen
// or starting a private action. No timer/polling interrupts active recording.
const SESSION_FRESH_MS = 45000;
const SESSION_RESUME_DEBOUNCE_MS = 1000;
let sessionVerifiedAt = 0;
let sessionCheck = null;

const emptyState = () => ({
  access: 'checking',
  user: null,
  online: false,
  accountKey: '',
  catalog: null,
  catalogError: '',
  me: null,
  clips: [],
  loading: true,
  error: '',
  localError: '',
  accountConnecting: false,
  accountConnectionError: '',
  sessionChecking: false,
});

let state = emptyState();

export const appReady = new Promise(resolve => { appReadyResolve = resolve; });

function publicUser() {
  if (session.online && session.user) {
    return {
      id: session.user.id,
      name: session.user.name || '',
      email: session.user.email || '',
      role: session.user.role || '',
      provider: session.authMethod || session.authProvider || 'operations',
      operations: true,
    };
  }

  const cloud = getCloudAccount();
  if (cloud.phase === 'registered' && cloud.user) {
    return {
      id: cloud.user.uid,
      name: cloudDisplayName(),
      email: cloud.user.email || '',
      role: '',
      provider: cloud.user.provider === 'apple.com' ? 'apple' : 'google',
      operations: false,
    };
  }

  return null;
}

function publish(patch = {}) {
  state = Object.freeze({ ...state, ...patch });
  for (const listener of listeners) {
    try { listener(state); } catch (error) { console.error('App state listener failed', error); }
  }
  return state;
}

function appHash() {
  return typeof location === 'undefined' ? '#home' : location.hash || '#home';
}

function addWindowListener(type, listener) {
  if (typeof window !== 'undefined') window.addEventListener(type, listener);
}

function clearPrivateDialogs({ preserveCamera = false } = {}) {
  closeStudioCamera({ preserve: preserveCamera });
  if (typeof document === 'undefined') return;
  document.querySelectorAll('dialog[data-studio-private], dialog.online-dialog:not(#cloud-account-dialog)').forEach(dialog => {
    try { dialog.close(); } catch {}
  });
}

function syncPrivateBoundary() {
  const nextKey = `${getStudioAccess()}|${studioAccountKey()}|${sessionEpoch}`;
  if (nextKey === privateKey) return false;
  const hadPrivateKey = Boolean(privateKey);
  privateKey = nextKey;
  meCache = { key: '', value: null, at: 0, promise: null };
  publish({ me: null, clips: [], localError: '' });
  if (hadPrivateKey) clearPrivateDialogs({ preserveCamera: false });
  return true;
}

function stale(token, accountKey, epoch) {
  return token !== requestToken || accountKey !== studioAccountKey() || epoch !== sessionEpoch;
}

function scheduleRefresh(options) {
  refreshOptions = { ...refreshOptions, ...options };
  if (refreshScheduled) return;
  refreshScheduled = true;
  queueMicrotask(() => {
    const nextOptions = refreshOptions || {};
    refreshOptions = null;
    refreshScheduled = false;
    void refreshApp(nextOptions);
  });
}

function refreshIdentity() {
  const cloud = getCloudAccount();
  return [
    getStudioAccess(),
    studioAccountKey(),
    sessionEpoch,
    session.online,
    session.user?.id || '',
    cloud.phase,
    cloud.user?.uid || '',
  ].join('|');
}

async function readCatalog({ reuse, signal }) {
  const now = Date.now();
  if (reuse && catalogCache.value && now - catalogCache.at < CATALOG_CACHE_MS) return catalogCache.value;
  if (reuse && catalogCache.promise) return catalogCache.promise;
  const generation = ++catalogGeneration;
  const promise = api('/catalog', { signal: reuse ? undefined : signal }).then(catalog => {
    if (generation === catalogGeneration) {
      catalogCache = { value: catalog, at: Date.now(), promise: null, generation };
    }
    return catalog;
  });
  if (reuse) catalogCache = { ...catalogCache, promise, generation };
  try { return await promise; }
  finally {
    if (catalogCache.promise === promise) catalogCache = { ...catalogCache, promise: null };
  }
}

async function loadCatalog(token, signal, { reuse = false } = {}) {
  try {
    const catalog = await readCatalog({ reuse, signal });
    if (token !== requestToken) return;
    publish({ catalog, catalogError: '' });
  } catch (error) {
    if (token !== requestToken) return;
    publish({ catalog: null, catalogError: error.message || '활동 목록을 불러오지 못했습니다.' });
  }
}

async function readLocalClips(accountKey, { reuse = false } = {}) {
  if (reuse && !clipsCache.dirty && clipsCache.accountKey === accountKey && clipsCache.value) return clipsCache.value;
  if (reuse && clipsCache.accountKey === accountKey && clipsCache.promise) return clipsCache.promise;
  const generation = clipsGeneration;
  const promise = getClips().then(clips => clips.filter(clip => !clip.example));
  if (reuse) clipsCache = { ...clipsCache, accountKey, promise };
  try {
    const clips = await promise;
    if (generation === clipsGeneration && accountKey === studioAccountKey()) {
      clipsCache = { accountKey, value: clips, promise: null, dirty: false };
    }
    return clips;
  } finally {
    if (clipsCache.promise === promise) clipsCache = { ...clipsCache, promise: null };
  }
}

function meCacheKey(accountKey, epoch) {
  return [accountKey, epoch, session.user?.id || ''].join('|');
}

async function readMe({ accountKey, epoch, reuse = false, signal }) {
  const key = meCacheKey(accountKey, epoch);
  const now = Date.now();
  if (reuse && meCache.key === key && meCache.value && now - meCache.at < ME_CACHE_MS) return meCache.value;
  if (reuse && meCache.key === key && meCache.promise) return meCache.promise;
  const promise = api('/me', { signal }).then(me => {
    if (accountKey === studioAccountKey() && epoch === sessionEpoch && key === meCacheKey(accountKey, epoch)) {
      meCache = { key, value: me, at: Date.now(), promise: null };
    }
    return me;
  });
  if (reuse) meCache = { ...meCache, key, promise };
  try { return await promise; }
  finally {
    if (meCache.promise === promise) meCache = { ...meCache, promise: null };
  }
}

async function loadPrivate({ token, access, accountKey, epoch, signal, reuse = false }) {
  if (access !== 'allowed') {
    if (!stale(token, accountKey, epoch)) publish({ clips: [], me: null, localError: '' });
    return;
  }

  const clipsPromise = readLocalClips(accountKey, { reuse });
  const mePromise = session.online && session.user
    ? readMe({ accountKey, epoch, reuse, signal }).then(
      value => ({ ok: true, value }),
      error => ({ ok: false, error }),
    )
    : null;

  try {
    const clips = await clipsPromise;
    if (!stale(token, accountKey, epoch)) publish({ clips, localError: '' });
  } catch (error) {
    if (!stale(token, accountKey, epoch)) publish({ clips: [], localError: error.message || '보관한 영상을 불러오지 못했습니다.' });
  }

  if (!mePromise) {
    if (!stale(token, accountKey, epoch)) publish({ me: null });
    return;
  }

  try {
    const result = await mePromise;
    if (!result.ok) throw result.error;
    if (!stale(token, accountKey, epoch)) publish({ me: result.value });
  } catch (error) {
    if (!stale(token, accountKey, epoch)) publish({ me: null, error: error.message || '내 제출 내역을 불러오지 못했습니다.' });
  }
}

export function getAppState() {
  return state;
}

export function subscribeApp(listener) {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function revalidateAppSession({ force = false } = {}) {
  if (sessionCheck) return sessionCheck;
  const maxAge = force ? SESSION_RESUME_DEBOUNCE_MS : SESSION_FRESH_MS;
  if (Date.now() - sessionVerifiedAt < maxAge) return Promise.resolve(session);
  publish({ sessionChecking: true });
  sessionCheck = (async () => {
    try {
      await sessionReady;
      // Startup or another auth operation may have just verified the session.
      if (Date.now() - sessionVerifiedAt >= maxAge) await refreshSession();
      return session;
    } finally {
      sessionCheck = null;
      publish({ sessionChecking: false, access: getStudioAccess(), accountKey: studioAccountKey(), online: Boolean(session.online), user: publicUser() });
    }
  })();
  return sessionCheck;
}

// Synchronous so a valid camera click retains its browser user activation.
// A stale click starts verification; the user retries after it finishes.
export function requireFreshAppSession() {
  if (state.sessionChecking) return false;
  if (Date.now() - sessionVerifiedAt >= SESSION_FRESH_MS) {
    void revalidateAppSession();
    return false;
  }
  return true;
}

export async function refreshApp({ refreshSession: shouldRefreshSession = false, reuse = false } = {}) {
  await sessionReady;
  if (shouldRefreshSession) await revalidateAppSession({ force: true });

  // Session notifications must join an explicit refresh for the same account.
  const identity = refreshIdentity();
  if (reuse && activeRefresh?.identity === identity) return activeRefresh.promise;

  const token = ++requestToken;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  activeRefresh?.controller?.abort();
  publish({ loading: true, catalogError: '', error: '', localError: '' });

  const refresh = (async () => {
    try {
      if (token !== requestToken) return state;
      syncPrivateBoundary();
      const access = getStudioAccess();
      const accountKey = studioAccountKey();
      const epoch = sessionEpoch;
      publish({
        access,
        accountKey,
        online: Boolean(session.online),
        user: publicUser(),
      });

      await Promise.all([
        loadCatalog(token, controller?.signal, { reuse }),
        loadPrivate({ token, access, accountKey, epoch, signal: controller?.signal, reuse }),
      ]);
    } catch (error) {
      if (token === requestToken && error.name !== 'AbortError') publish({ error: error.message || '앱 상태를 새로고침하지 못했습니다.' });
    } finally {
      if (token === requestToken) {
        publish({
          loading: false,
          access: getStudioAccess(),
          accountKey: studioAccountKey(),
          online: Boolean(session.online),
          user: publicUser(),
        });
        appReadyResolve?.(state);
        appReadyResolve = null;
      }
      if (activeRefresh?.token === token) activeRefresh = null;
    }

    return state;
  })();

  activeRefresh = { token, identity, controller, promise: refresh };
  return refresh;
}

export function login(returnTo = appHash()) {
  return showAccountEntry({ returnTo });
}

export function logout() {
  return signOutAccount();
}

export function manageAccount() {
  if ((!session.online || !session.user) && getCloudAccount().phase === 'registered') {
    return showCloudAccount();
  }
  return showAccountEntry({ returnTo: appHash() });
}

function assertMember() {
  if (getStudioAccess() !== 'allowed' || !session.online || !session.user) {
    void login(appHash());
    return false;
  }
  return requireFreshAppSession();
}

export function record(activity = {}) {
  if (!assertMember()) return;
  const accountKey = studioAccountKey();
  const epoch = sessionEpoch;
  openStudioCamera({
    activity,
    isCurrent: () => getStudioAccess() === 'allowed' && studioAccountKey() === accountKey && sessionEpoch === epoch,
    onSaved: () => { void refreshApp(); },
    onSubmit: session.online && session.user ? clip => submitClip(clip.id) : undefined,
  });
}

export function importVideo(activity = {}) {
  if (!assertMember()) return;
  openLocalImport({ missionId: activity.id || activity.missionId });
}

export function openClip(id) {
  if (!assertMember()) return;
  return openLocalClip(id);
}

export async function submitClip(id) {
  if (!assertMember()) return;
  if (!session.online || !session.user) {
    await login('#reviews');
    return;
  }
  await submitLocalRecording(id);
  await refreshApp();
}

export function viewSubmission(id) {
  if (!assertMember()) return;
  return viewVideo(id);
}

export function resubmitSubmission(id) {
  if (!assertMember()) return;
  return resubmit(id, () => { void refreshApp(); });
}

export function mountSupport(container) {
  if (!container) return () => {};
  void mountOnline('support', container);
  return () => {
    if (container.isConnected) container.replaceChildren();
  };
}

subscribeStudioAccess(() => {
  syncPrivateBoundary();
  scheduleRefresh({ reuse: true });
});
subscribeCloudAccount(() => {
  publish({ user: publicUser(), accountKey: studioAccountKey(), access: getStudioAccess() });
});
subscribeClips(() => {
  clipsGeneration++;
  clipsCache = { ...clipsCache, dirty: true };
  if (getStudioAccess() === 'allowed') scheduleRefresh();
});
addWindowListener('service-session', () => {
  sessionVerifiedAt = Date.now();
  syncPrivateBoundary();
  scheduleRefresh({ reuse: true });
});
function syncAccountConnection() {
  const connection = getAccountConnectionState();
  publish({ accountConnecting: connection.busy, accountConnectionError: connection.error });
}
addWindowListener('service-account-connection', syncAccountConnection);
syncAccountConnection();
addWindowListener('hashchange', () => {
  closeStudioCamera({ preserve: true });
});
const revalidateOnResume = () => {
  if (typeof document !== 'undefined' && document.hidden) return;
  void revalidateAppSession({ force: true });
};
addWindowListener('focus', revalidateOnResume);
addWindowListener('pageshow', revalidateOnResume);
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', revalidateOnResume);
sessionReady.then(() => { sessionVerifiedAt ||= Date.now(); });

scheduleRefresh({ reuse: true });
