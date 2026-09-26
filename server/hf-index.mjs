import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { createService } from './app.mjs';
import { mobileServicesFromEnv } from './mobile-services.mjs';
import { createHfCopiesEraser } from './hf-erasure.mjs';
import { createHfStorage } from './hf-storage.mjs';
import { createHfState } from './hf-state.mjs';
import { createHfMedia } from './hf-media.mjs';
import { createFirebaseVerifier } from './firebase-identity.mjs';
import { email, password, hashPassword, id } from './security.mjs';

function required(key) {
  if (!process.env[key]) throw new Error(`Missing ${key}`);
  return process.env[key];
}
const origin = required('DONGJAKSO_ORIGIN');
if (new URL(origin).origin !== origin || !origin.startsWith('https://')) throw new Error('A canonical HTTPS origin is required.');
const gatewayKey = required('DONGJAKSO_GATEWAY_KEY');
if (gatewayKey.length < 32) throw new Error('Gateway key must contain at least 32 characters.');
const storage = createHfStorage({ bucket: required('HF_BUCKET_ID'),
  accessKeyId: required('HF_S3_ACCESS_KEY_ID'), secretAccessKey: required('HF_S3_SECRET_ACCESS_KEY'), timeoutMs: 240000 });
const directory = await mkdtemp(path.join(os.tmpdir(), 'dongjakso-hf-'));
const persistence = createHfState({ storage, directory, encryptionKey: required('HF_STATE_KEY'),
  allowInitialize: process.env.HF_INITIALIZE === '1' });
const restored = await persistence.restore();
const media = createHfMedia({ storage, checkpoint: store => persistence.checkpoint(store), assertCurrent: () => persistence.assertCurrent() });
const projectId = required('PUBLIC_FIREBASE_PROJECT_ID');
const service = createService({ directory, origin, allowRegistration: false, persistence, media, gatewayKey,
  verifyFirebase: createFirebaseVerifier({ projectId }), mobileServicesFactory: store => mobileServicesFromEnv({ store, copiesEraser: createHfCopiesEraser({ storage, directory }) }) });
try {
  if (!restored) {
    // Explicit first-install only. Restored users/passwords are never replaced.
    const mail = email(required('DONGJAKSO_ADMIN_EMAIL'));
    const encoded = await hashPassword(password(required('DONGJAKSO_ADMIN_PASSWORD')));
    const uid = id('usr'), at = service.store.now();
    service.store.run("INSERT INTO users(id,email,password,name,role,createdAt,updatedAt,forcePassword) VALUES(?,?,?,?,?,?,?,1)",
      uid, mail, encoded, '운영 관리자', 'admin', at, at);
    service.store.audit({ id: uid }, 'admin.bootstrap', uid);
  }
  await persistence.checkpoint(service.store);
  await service.maintenance();
  service.server.listen(Number(process.env.PORT || 7860), '0.0.0.0', () => console.log('HF operations ready'));
} catch (error) {
  service.store.db.close();
  throw error;
}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => service.close().then(() => process.exit(0)));
