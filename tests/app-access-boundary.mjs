import test from 'node:test';
import assert from 'node:assert/strict';
import { canEnterApp, checkingAppAccess } from '../app/access-boundary.js';

test('only an authorized application-server session opens the app', () => {
  const allowed = { access: 'allowed', online: true, user: { operations: true } };
  assert.equal(canEnterApp(allowed), true);
  for (const state of [undefined, {}, { ...allowed, online: false }, { ...allowed, user: null }, { ...allowed, sessionChecking: true },
    { ...allowed, user: { operations: false } }, { ...allowed, user: { registered: true } },
    ...['checking', 'guest', 'registrationRequired', 'blocked', 'error'].map(access => ({ ...allowed, access }))]) {
    assert.equal(canEnterApp(state), false, JSON.stringify(state));
  }
});

test('provider connection and startup stay on the welcome screen', () => {
  assert.equal(checkingAppAccess({ access: 'checking' }), true);
  assert.equal(checkingAppAccess({ access: 'allowed', online: false, accountConnecting: true }), true);
  assert.equal(checkingAppAccess({ access: 'allowed', online: true, user: { operations: true }, sessionChecking: true }), true);
  assert.equal(checkingAppAccess({ access: 'guest', accountConnecting: false }), false);
  assert.equal(checkingAppAccess({ access: 'allowed', online: true, user: { operations: true } }), false);
});
