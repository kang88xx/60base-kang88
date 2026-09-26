import { session, sessionReady } from './online-api.js';
import { getCloudAccount, subscribeCloudAccount } from './cloud-account.js';

// Membership opens Studio screens; it never authenticates operations API calls.
let operationsReady = false;
const listeners = new Set();

export function getStudioAccess() {
  if (!operationsReady) return 'checking';
  if (session.online) return session.user ? 'allowed' : 'signedOut';
  const account = getCloudAccount();
  if (account.availability === 'loading' || (account.phase === 'authenticated' && account.busy)) return 'checking';
  if (account.availability !== 'ready') return 'unavailable';
  if (account.phase === 'registered' && account.user) return 'allowed';
  if (account.phase === 'registrationRequired' && account.user) return 'registrationRequired';
  if (account.phase === 'authenticated') return 'unavailable';
  return 'signedOut';
}

export function requiresStudioAccount(route) {
  return ['library', 'profile', 'wallet', 'shop'].includes(route) ||
    (route === 'reviews' && (!operationsReady || session.online));
}

function notify() { for (const listener of listeners) listener(); }
subscribeCloudAccount(notify);
window.addEventListener('service-session', () => { operationsReady = true; notify(); });
sessionReady.then(() => { operationsReady = true; notify(); });

export function subscribeStudioAccess(listener) {
  listeners.add(listener);
  listener();
  return () => listeners.delete(listener);
}

export function studioAccountKey() {
  const cloud = getCloudAccount();
  return [getStudioAccess(), session.online, session.online ? session.user?.id : cloud.user?.uid].join(':');
}
