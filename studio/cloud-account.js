import { firebaseConfig } from './firebase-config.js';

// This account is deliberately independent of the operations API session.
const SDK_ROOT = 'https://www.gstatic.com/firebasejs/12.18.0';
const consentVersion = provider => provider === 'apple.com' ? '2026-09-18-apple-v1' : '2026-09-14-google-v1';
// The current code-exchange/revocation contract is supported by iOS native auth.
// Android/web do not expose an Apple authorization code through this plugin.
export const appleSignInEnabled = firebaseConfig?.appleEnabled === true &&
  globalThis.Capacitor?.isNativePlatform?.() === true && globalThis.Capacitor?.getPlatform?.() === 'ios';
const listeners = new Set();
let state = Object.freeze({ availability: 'loading', phase: 'signedOut', user: null, registration: null, busy: false, error: null });
let sdk, auth, db, provider, unsubscribeAuth, initialization;
let generation = 0;
let pendingAppleAuthorization = null;
export function getCloudAppleAuthorization() {
  const pending = pendingAppleAuthorization;
  if (!pending || pending.uid !== state.user?.uid || Date.now() - pending.createdAt > 300000) return null;
  return { authorizationCode: pending.authorizationCode, rawNonce: pending.rawNonce };
}
export function clearCloudAppleAuthorization() { pendingAppleAuthorization = null; }

export const getCloudAccount = () => state;
export function subscribeCloudAccount(listener) {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}
function publish(patch) {
  state = Object.freeze({ ...state, ...patch });
  for (const listener of listeners) {
    try { listener(state); } catch (error) { console.error('Account listener failed', error); }
  }
  return state;
}
function failure(code, message) { return Object.assign(new Error(message), { code }); }
function report(error, patch = {}) {
  return publish({ ...patch, busy: false, error: Object.freeze({ code: error.code || 'cloud/unavailable', message: error.message || 'Account service unavailable' }) });
}
function normalizedUser(user) {
  if (!user || !user.uid || !user.email || user.emailVerified !== true ||
      !user.providerData?.length || !['google.com', 'apple.com'].includes(user.providerData[0].providerId) ||
      user.providerData.some(item => item.providerId !== user.providerData[0].providerId)) {
    throw failure('cloud/google-identity-required', 'A verified Google or Apple account is required.');
  }
  return Object.freeze({ uid: user.uid, email: user.email, emailVerified: true,
    displayName: (user.displayName || '').slice(0, 60), provider: user.providerData[0].providerId });
}
const profileKeys = ['schemaVersion', 'provider', 'email', 'emailVerified', 'displayName', 'adultDeclared',
  'termsVersion', 'privacyVersion', 'termsAcceptedAt', 'privacyAcknowledgedAt', 'createdAt', 'updatedAt', 'source'];
function normalizedRegistration(data, user) {
  const timestamps = ['termsAcceptedAt', 'privacyAcknowledgedAt', 'createdAt', 'updatedAt'];
  if (!data || Object.keys(data).length !== profileKeys.length || profileKeys.some(key => !(key in data)) ||
      data.schemaVersion !== 1 || data.provider !== user.provider || data.email !== user.email ||
      data.emailVerified !== true || data.adultDeclared !== true || data.termsVersion !== consentVersion(user.provider) ||
      data.privacyVersion !== consentVersion(user.provider) || data.source !== 'studio-web' ||
      typeof data.displayName !== 'string' || !data.displayName.trim() || data.displayName.length > 60 ||
      timestamps.some(key => typeof data[key]?.toMillis !== 'function' || !Number.isFinite(data[key].toMillis()))) {
    throw failure('cloud/invalid-registration', 'The saved registration needs review.');
  }
  return Object.freeze({ ...data, ...Object.fromEntries(timestamps.map(key => [key, data[key].toMillis()])) });
}
function current(token, uid) { return token === generation && auth?.currentUser?.uid === uid; }
async function readRegistration(user, token) {
  try {
    const identity = normalizedUser(user);
    const document = await sdk.getDocFromServer(sdk.doc(db, 'registrations', identity.uid));
    if (!current(token, identity.uid)) return state;
    const registration = document.exists() ? normalizedRegistration(document.data(), identity) : null;
    return publish({ availability: 'ready', user: identity, registration,
      phase: registration ? 'registered' : 'registrationRequired', busy: false, error: null });
  } catch (error) {
    if (current(token, user.uid)) report(error, { phase: 'authenticated', registration: null });
    return state;
  }
}
async function handleAuth(user) {
  const token = ++generation;
  if (!user) return publish({ availability: 'ready', phase: 'signedOut', user: null, registration: null, busy: false, error: null });
  try {
    const identity = normalizedUser(user);
    if (pendingAppleAuthorization) {
      if (identity.provider !== 'apple.com' || (pendingAppleAuthorization.uid && pendingAppleAuthorization.uid !== identity.uid)) pendingAppleAuthorization = null;
      else pendingAppleAuthorization.uid = identity.uid;
    }
    publish({ availability: 'ready', phase: 'authenticated', user: identity, registration: null, busy: true, error: null });
    return await readRegistration(user, token);
  } catch (error) {
    if (token === generation) report(error, { availability: 'ready', phase: 'authenticated', user: null, registration: null });
    return state;
  }
}
function validateConfig() {
  for (const key of ['apiKey', 'authDomain', 'projectId', 'appId']) {
    if (typeof firebaseConfig[key] !== 'string' || !firebaseConfig[key].trim()) {
      throw failure('cloud/invalid-config', 'Firebase configuration is incomplete.');
    }
  }
  const emulator = firebaseConfig.emulator;
  if (emulator && (!['localhost', '127.0.0.1'].includes(globalThis.location?.hostname) ||
      !firebaseConfig.projectId.startsWith('demo-'))) {
    throw failure('cloud/unsafe-emulator', 'Emulators require a local demo project.');
  }
  if (emulator) {
    const url = new URL(emulator.authUrl);
    if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname) ||
        !['localhost', '127.0.0.1'].includes(emulator.firestoreHost) ||
        !Number.isInteger(emulator.firestorePort) || emulator.firestorePort < 1 || emulator.firestorePort > 65535) {
      throw failure('cloud/unsafe-emulator', 'Emulators must use local endpoints.');
    }
  }
}
async function initialize() {
  if (!firebaseConfig) return publish({ availability: 'unconfigured', busy: false });
  publish({ availability: 'loading', error: null, busy: true });
  try {
    validateConfig();
    if (!sdk) {
      const modules = await Promise.all([
        import(`${SDK_ROOT}/firebase-app.js`),
        import(`${SDK_ROOT}/firebase-auth.js`),
        import(`${SDK_ROOT}/firebase-firestore.js`),
      ]);
      sdk = Object.assign({}, ...modules);
    }
    if (!auth) {
      const { emulator, appleEnabled, ...config } = firebaseConfig;
      const app = sdk.initializeApp(config, 'dongjakso-signup');
      auth = sdk.getAuth(app);
      db = sdk.getFirestore(app);
      if (emulator) {
        sdk.connectAuthEmulator(auth, emulator.authUrl);
        sdk.connectFirestoreEmulator(db, emulator.firestoreHost, emulator.firestorePort);
      }
      provider = new sdk.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
    }
    await sdk.setPersistence(auth, sdk.browserLocalPersistence);
    unsubscribeAuth?.();
    return await new Promise(resolve => {
      let initial = true;
      unsubscribeAuth = sdk.onAuthStateChanged(auth, user => {
        const update = handleAuth(user);
        if (initial) { initial = false; update.then(resolve); }
      }, error => {
        report(error, { availability: 'error' });
        if (initial) { initial = false; resolve(state); }
      });
    });
  } catch (error) { return report(error, { availability: 'error' }); }
}
function startInitialization() {
  if (!initialization) initialization = initialize().finally(() => { initialization = null; });
  return initialization;
}
export const cloudAccountReady = startInitialization();

export function continueWithGoogle() { return continueWithProvider('google.com'); }
export function continueWithApple() {
  if (!appleSignInEnabled) return Promise.reject(failure('cloud/apple-unconfigured', 'Apple sign-in is not configured.'));
  return continueWithProvider('apple.com');
}
function continueWithProvider(providerId) {
  clearCloudAppleAuthorization();
  if (state.availability !== 'ready' || state.busy) return Promise.reject(failure('cloud/not-ready', 'Account service is not ready.'));
  // Keep this call synchronous with the user's click so browsers permit the popup.
  let popup;
  try {
    const selected = providerId === 'google.com' ? provider : new sdk.OAuthProvider('apple.com');
    if (providerId === 'apple.com') { selected.addScope('email'); selected.addScope('name'); }
    if (globalThis.Capacitor?.isNativePlatform?.()) {
      popup = import('../app/native.js').then(async ({ signInNative }) => {
        const result = await signInNative(providerId);
        if (!result?.idToken) throw failure('cloud/native-auth-unavailable', 'Native sign-in is not configured.');
        const credential = providerId === 'google.com'
          ? sdk.GoogleAuthProvider.credential(result.idToken, result.accessToken)
          : selected.credential({ idToken: result.idToken, rawNonce: result.rawNonce });
        if (providerId === 'apple.com' && result.authorizationCode && result.rawNonce) {
          pendingAppleAuthorization = { authorizationCode: result.authorizationCode, rawNonce: result.rawNonce, uid: null, createdAt: Date.now() };
        }
        return sdk.signInWithCredential(auth, credential);
      });
    } else popup = sdk.signInWithPopup(auth, selected);
  }
  catch (error) { report(error); return Promise.reject(error); }
  const token = generation;
  publish({ busy: true, error: null });
  return popup.then(result => token === generation ? handleAuth(result.user) : state).catch(error => {
    if (token === generation) report(error);
    throw error;
  });
}
export async function completeRegistration({ adult, terms, privacy, displayName } = {}) {
  if (state.availability !== 'ready' || state.phase !== 'registrationRequired' || state.busy) {
    throw failure('cloud/not-ready', 'Registration is not ready.');
  }
  if (adult !== true || terms !== true || privacy !== true) {
    throw failure('cloud/consent-required', 'All registration confirmations are required.');
  }
  const user = normalizedUser(auth.currentUser);
  if (displayName !== undefined && typeof displayName !== 'string') throw failure('cloud/invalid-name', 'Enter a valid name.');
  const name = (displayName ?? user.displayName).trim();
  if (!name || name.length > 60) throw failure('cloud/invalid-name', 'Enter a name of 1–60 characters.');
  const token = generation;
  publish({ busy: true, error: null });
  try {
    // Check the current token's sign-in method; never link identities by email.
    const tokenResult = await sdk.getIdTokenResult(auth.currentUser);
    if (!current(token, user.uid)) throw failure('cloud/account-changed', 'The account changed.');
    if (tokenResult.claims.firebase?.sign_in_provider !== user.provider ||
        tokenResult.claims.email_verified !== true || tokenResult.claims.email !== user.email) {
      throw failure('cloud/google-identity-required', 'A verified Google or Apple sign-in is required.');
    }
    const reference = sdk.doc(db, 'registrations', user.uid);
    await sdk.runTransaction(db, async transaction => {
      const existing = await transaction.get(reference);
      if (!current(token, user.uid)) throw failure('cloud/account-changed', 'The account changed.');
      if (existing.exists()) { normalizedRegistration(existing.data(), user); return; }
      transaction.set(reference, {
        schemaVersion: 1, provider: user.provider, email: user.email, emailVerified: true,
        displayName: name, adultDeclared: true, termsVersion: consentVersion(user.provider), privacyVersion: consentVersion(user.provider),
        termsAcceptedAt: sdk.serverTimestamp(), privacyAcknowledgedAt: sdk.serverTimestamp(),
        createdAt: sdk.serverTimestamp(), updatedAt: sdk.serverTimestamp(), source: 'studio-web',
      });
    });
    if (!current(token, user.uid)) throw failure('cloud/account-changed', 'The account changed.');
    await readRegistration(auth.currentUser, token);
    if (current(token, user.uid) && state.phase !== 'registered') {
      throw failure(state.error?.code || 'cloud/registration-unconfirmed', state.error?.message || 'Registration could not be confirmed.');
    }
    return state;
  } catch (error) {
    if (current(token, user.uid)) report(error);
    throw error;
  }
}
export async function signOutCloudAccount() {
  if (!auth) return state;
  ++generation;
  clearCloudAppleAuthorization();
  publish({ busy: true, registration: null, phase: 'authenticated', error: null });
  try {
    await sdk.signOut(auth);
    if (globalThis.Capacitor?.isNativePlatform?.()) {
      const { nativeSignOut } = await import('../app/native.js');
      await nativeSignOut();
    }
    return state;
  }
  catch (error) { report(error); throw error; }
}
export async function getCloudIdToken() {
  if (state.availability !== 'ready' || state.phase !== 'registered' || state.busy) {
    throw failure('cloud/not-ready', 'Account service is not ready.');
  }
  const user = auth?.currentUser;
  const identity = normalizedUser(user);
  const token = generation;
  const idToken = await sdk.getIdToken(user);
  if (!current(token, identity.uid) || state.phase !== 'registered') {
    throw failure('cloud/account-changed', 'The account changed.');
  }
  return idToken;
}
export function retryCloudAccount() {
  if (initialization) return initialization;
  if (!auth || state.availability !== 'ready') return startInitialization();
  if (state.busy) return Promise.resolve(state);
  return handleAuth(auth.currentUser);
}
