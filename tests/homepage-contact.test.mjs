import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTACT_DRAFT_KEY, CONTACT_TIMEOUT, createContactFormController, validateInquiry } from '../homepage/src/useContactForm.js';

const firstId = '12a45678-1234-4234-8234-123456789abc';
const secondId = '12a45678-1234-4234-8234-123456789abd';
const valid = { name: 'Example Company', email: 'review@example.com', message: 'First-person kitchen recordings.', dataType: '' };
const response = (status, body = { ok: status === 200 }) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
function memoryStorage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
function setup(fetch, options = {}) {
  const store = options.store || memoryStorage();
  const controller = createContactFormController({ storage: () => store, uuid: () => firstId, fetch, ...options });
  return { controller, store, fill(values = valid) { for (const [key, value] of Object.entries(values)) controller.change(key, value); } };
}

test('validates required fields and exact backend limits before requesting', async () => {
  let requests = 0;
  const { controller, fill } = setup(async () => { requests++; return response(200); });
  assert.deepEqual(await controller.submit(), { kind: 'invalid', field: 'name' });
  fill({ ...valid, email: 'invalid' });
  assert.equal((await controller.submit()).field, 'email');
  assert.equal(requests, 0);
  assert.equal(validateInquiry({ ...valid, name: 'x'.repeat(100), message: 'x'.repeat(5000), dataType: 'x'.repeat(180) }).message, false);
  for (const [key, value] of [['name', 'x'.repeat(101)], ['email', 'a'.repeat(250) + '@b.co'], ['message', 'x'.repeat(5001)], ['dataType', 'x'.repeat(181)], ['name', 'A\nB'], ['message', 'A\0B']]) {
    assert.equal(validateInquiry({ ...valid, [key]: value })[key], true, key);
  }
});

test('sends the production JSON contract and preserves a confirmed delivery across reload', async () => {
  const calls = [];
  const fixture = setup(async (...args) => { calls.push(args); return response(200); });
  fixture.fill({ ...valid, name: ' Example Company ', dataType: ' hands ' });
  assert.deepEqual(await fixture.controller.submit(''), { kind: 'sent' });
  const [url, init] = calls[0];
  assert.equal(url, '/api/contact');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(init.body), { ...valid, dataType: 'hands', requestId: firstId, website: '' });
  assert.equal(fixture.controller.getSnapshot().sent, true);
  assert.equal(JSON.parse(fixture.store.getItem(CONTACT_DRAFT_KEY)).delivery.sent, true);
  assert.equal((await fixture.controller.submit()).kind, 'ignored');
  const reloaded = setup(async () => { throw Error('must not resend'); }, { store: fixture.store });
  assert.equal(reloaded.controller.getSnapshot().status, 'sent');
  assert.equal((await reloaded.controller.submit()).kind, 'ignored');
  assert.equal(calls.length, 1);
});

test('unconfirmed retries reuse the same request ID, including after browser draft restoration', async () => {
  const sent = [];
  const fixture = setup(async (_, init) => { sent.push(JSON.parse(init.body)); throw Error('network lost'); });
  fixture.fill();
  await fixture.controller.submit();
  await fixture.controller.submit();
  const reloaded = setup(async (_, init) => { sent.push(JSON.parse(init.body)); return response(200); }, { store: fixture.store, uuid: () => secondId });
  await reloaded.controller.submit();
  assert.deepEqual(sent.map(data => data.requestId), [firstId, firstId, firstId]);
  assert.equal(reloaded.controller.getSnapshot().sent, true);
});

test('editing the payload after success re-enables sending with a new request ID', async () => {
  let count = 0;
  const ids = [];
  const fixture = setup(async (_, init) => { ids.push(JSON.parse(init.body).requestId); return response(200); }, { uuid: () => count++ ? secondId : firstId });
  fixture.fill();
  await fixture.controller.submit();
  fixture.controller.change('message', 'A different collection request.');
  assert.equal(fixture.controller.getSnapshot().sent, false);
  await fixture.controller.submit();
  assert.deepEqual(ids, [firstId, secondId]);
});

test('blocks duplicate submits and field changes while sending', async () => {
  let complete;
  let requests = 0;
  const fixture = setup(() => { requests++; return new Promise(resolve => { complete = resolve; }); });
  fixture.fill();
  const sending = fixture.controller.submit();
  assert.equal(fixture.controller.getSnapshot().sending, true);
  fixture.controller.change('name', 'Unexpected replacement');
  assert.equal(fixture.controller.getSnapshot().values.name, valid.name);
  assert.equal((await fixture.controller.submit()).kind, 'ignored');
  complete(response(200));
  await sending;
  assert.equal(requests, 1);
  assert.equal(fixture.controller.getSnapshot().sending, false);
});

test('keeps the draft and exposes correct statuses for rate limits and delivery errors', async () => {
  for (const [code, status] of [[429, 'rateLimited'], [503, 'unavailable'], [400, 'invalid'], [502, 'unconfirmed']]) {
    const fixture = setup(async () => response(code));
    fixture.fill();
    assert.equal((await fixture.controller.submit()).kind, 'error');
    assert.equal(fixture.controller.getSnapshot().status, status);
    assert.equal(fixture.controller.getSnapshot().sending, false);
    assert.equal(JSON.parse(fixture.store.getItem(CONTACT_DRAFT_KEY)).message, valid.message);
  }
});

test('aborts at twenty seconds and retains the retryable request ID', async () => {
  let scheduled;
  let cleared;
  const fixture = setup((_, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
  }), {
    setTimeout(callback, delay) { scheduled = delay; queueMicrotask(callback); return 7; },
    clearTimeout(token) { cleared = token; },
  });
  fixture.fill();
  await fixture.controller.submit();
  assert.equal(scheduled, CONTACT_TIMEOUT);
  assert.equal(scheduled, 20_000);
  assert.equal(cleared, 7);
  assert.equal(fixture.controller.getSnapshot().status, 'unconfirmed');
  assert.equal(JSON.parse(fixture.store.getItem(CONTACT_DRAFT_KEY)).delivery.requestId, firstId);
});

test('unavailable browser storage does not prevent successful sending', async () => {
  const fixture = setup(async () => response(200), { storage: () => { throw Error('denied'); } });
  fixture.fill();
  assert.equal(fixture.controller.getSnapshot().status, 'storage');
  assert.equal((await fixture.controller.submit()).kind, 'sent');
  assert.equal(fixture.controller.getSnapshot().status, 'sent');
});

test('malformed or mismatched saved delivery metadata never locks the form as sent', () => {
  for (const raw of ['not JSON', '[]', JSON.stringify({ ...valid, delivery: { requestId: firstId, fingerprint: 'different', sent: true } })]) {
    const store = memoryStorage();
    store.setItem(CONTACT_DRAFT_KEY, raw);
    const fixture = setup(async () => response(200), { store });
    assert.equal(fixture.controller.getSnapshot().sent, false);
  }
});

test('HTTP success without explicit JSON confirmation remains retryable', async () => {
  for (const body of [null, {}, { ok: false }]) {
    const fixture = setup(async () => response(200, body));
    fixture.fill();
    await fixture.controller.submit();
    assert.equal(fixture.controller.getSnapshot().sent, false);
    assert.equal(fixture.controller.getSnapshot().status, 'unconfirmed');
  }
});
