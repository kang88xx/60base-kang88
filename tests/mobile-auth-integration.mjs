import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createService } from '../server/app.mjs';

const origin = 'http://localhost:4497';
const directory = await mkdtemp(path.join(os.tmpdir(), '60base-mobile-auth-'));
let captures = 0;
const identity = { uid: 'verified-apple-uid', email: 'private@privaterelay.appleid.com', name: '', appleSubject: 'apple-subject', registration: { provider: 'apple.com', displayName: 'Apple 회원' } };
const service = createService({ directory, origin, allowRegistration: false,
  verifyFirebase: async value => { assert.equal(value, 'verified-id-token'); return identity; },
  appleTokens: { capture: async value => {
    captures++;
    assert.equal(value.identity, identity);
    if (value.authorizationCode !== 'one-use-code' || value.rawNonce !== 'nonce') throw Object.assign(Error('Apple proof required'), { status: 503 });
  } },
});
await new Promise(resolve => service.server.listen(4497, '127.0.0.1', resolve));
let cookie = '', csrf = '';
async function call(route, { method = 'GET', body, status = 200 } = {}) {
  const response = await fetch(origin + '/api' + route, { method, headers: { Origin: origin, Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const value = await response.json(); assert.equal(response.status, status, JSON.stringify(value));
  if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
  if (value.csrf) csrf = value.csrf;
  return value;
}
try {
  await call('/auth/firebase', { method: 'POST', body: { idToken: 'verified-id-token' }, status: 503 });
  assert.equal(service.store.one('SELECT count(*) n FROM users').n, 0);
  const login = await call('/auth/firebase', { method: 'POST', body: { idToken: 'verified-id-token', appleAuthorization: { authorizationCode: 'one-use-code', rawNonce: 'nonce', identity: { uid: 'attacker' } } } });
  assert.equal(login.authMethod, 'apple'); assert.equal(login.user.name, 'Apple 회원');
  assert.equal((await call('/session')).authMethod, 'apple');
  const linked = service.store.one('SELECT * FROM auth_identities'); assert.equal(linked.uid, identity.uid);
  await call('/account', { method: 'PATCH', body: { name: '변경 이름' } });
  assert.equal((await call('/session')).user.name, '변경 이름');
  await call('/auth/logout', { method: 'POST', body: {} });
  assert.equal((await call('/session')).user, null);
  assert.equal(captures, 2);
  console.log('PASS native Apple bridge: proof failure creates no account, verified UID cannot be overridden, consent-name fallback, provider session persistence, profile and logout.');
} finally { await service.close(); await rm(directory, { recursive: true, force: true }); }
