import { appleTokenStoreFromEnv } from './apple-tokens.mjs';
import { createFirebaseEraser } from './firebase-erasure.mjs';

// Nothing is discovered from local login state or shipped to client bundles.
// Deploying without erasure configuration leaves existing Google login intact.
export function mobileServicesFromEnv({ store, env = process.env, copiesEraser = null } = {}) {
  const appleTokens = appleTokenStoreFromEnv({ store, env });
  let identityEraser = null;
  if (env.FIREBASE_ERASURE_SERVICE_ACCOUNT_JSON) {
    let serviceAccount;
    try { serviceAccount = JSON.parse(env.FIREBASE_ERASURE_SERVICE_ACCOUNT_JSON); }
    catch { throw new Error('Invalid Firebase erasure service-account configuration.'); }
    identityEraser = createFirebaseEraser({
      projectId: env.PUBLIC_FIREBASE_PROJECT_ID,
      serviceAccount,
      appleRevoker: appleTokens?.revoke,
    });
  }
  return { appleTokens, identityEraser, copiesEraser };
}
