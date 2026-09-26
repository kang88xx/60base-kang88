import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { EventEmitter } from 'node:events';
import handler, { buildUpstreamUrl, csrfValid, parseSpaceUrl } from '../api/operations.js';

const checks = [];

class MockReq extends Readable {
  constructor({ method = 'GET', url = '/api/operations?path=session', headers = {}, body = Buffer.alloc(0) } = {}) {
    super();
    this.method = method;
    this.url = url;
    this.headers = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    this._body = Buffer.from(body);
    this.socket = { remoteAddress: '127.0.0.1' };
  }
  _read() {
    this.push(this._body);
    this._body = Buffer.alloc(0);
    this.push(null);
  }
}

class MockRes extends Writable {
  constructor() {
    super();
    this.statusCode = 200;
    this.headers = {};
    this.chunks = [];
  }
  setHeader(name, value) { this.headers[name.toLowerCase()] = value; }
  getHeader(name) { return this.headers[name.toLowerCase()]; }
  writeHead(status, headers = {}) { this.statusCode = status; for (const [k, v] of Object.entries(headers)) this.setHeader(k, v); }
  _write(chunk, encoding, callback) { this.chunks.push(Buffer.from(chunk)); callback(); }
  end(chunk) { if (chunk) this.chunks.push(Buffer.from(chunk)); this.emit('finish'); return this; }
  destroy(error) { if (error) this.error = error; this.emit('close'); }
  text() { return Buffer.concat(this.chunks).toString('utf8'); }
  json() { return JSON.parse(this.text()); }
}

const privateSpaceEnv = { DONGJAKSO_HF_SPACE_URL: 'https://dongjakso-ops.hf.space', DONGJAKSO_GATEWAY_KEY: 'server-secret', HF_TOKEN: 'hf_server-only-token' };

async function call(options, { env = privateSpaceEnv, fetchImpl } = {}) {
  const req = new MockReq(options);
  const res = new MockRes();
  await handler(req, res, { env, fetchImpl: fetchImpl || (async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })) });
  return res;
}

{
  for (const origin of ['https://60base.ai', 'https://60base.kr']) {
    const headers = { Origin: origin, Cookie: 'dongjakso_csrf=valid', 'X-CSRF-Token': 'valid' };
    assert.equal((await call({ method: 'POST', headers })).statusCode, 200);
    assert.equal((await call({ method: 'POST', headers: { ...headers, 'X-CSRF-Token': 'wrong' } })).statusCode, 403);
  }
  for (const origin of ['http://60base.ai', 'http://60base.kr', 'https://60base.ai.evil.test', 'https://60base.kr.evil.test', 'https://60base.ai:444', 'null', undefined]) {
    assert.equal((await call({ method: 'POST', headers: { Origin: origin, 'X-CSRF-Token': 'valid' } })).statusCode, 403);
  }
  checks.push('exact new and legacy HTTPS origins allowed; CSRF and hostile origin rejection preserved');
}

{
  const forged = { 'X-Dongjakso-Client-IP': '203.0.113.99', 'X-Forwarded-For': '203.0.113.98', 'X-Real-IP': '203.0.113.97', 'CF-Connecting-IP': '203.0.113.96', 'X-Forwarded-Host': 'forged.test', 'X-Vercel-Forged': 'forged' };
  for (const clientIp of ['198.51.100.10', '2001:db8::10', ' 198.51.100.10 ', undefined, '', 'bad', '198.51.100.10, 198.51.100.11', '198.51.100.10:1234', ['198.51.100.10']]) {
    let forwarded = false;
    await call({ headers: { ...forged, ...(clientIp !== undefined ? { 'X-Vercel-Forwarded-For': clientIp } : {}) } }, {
      env: { ...privateSpaceEnv, VERCEL: '1' },
      fetchImpl: async (_url, init) => {
        forwarded = true;
        const expected = typeof clientIp === 'string' && ['198.51.100.10', '2001:db8::10'].includes(clientIp.trim()) ? clientIp.trim() : null;
        assert.equal(init.headers.get('X-Dongjakso-Client-IP'), expected);
        assert.equal(init.headers.get('X-Real-IP'), null);
        assert.equal(init.headers.get('CF-Connecting-IP'), null);
        assert.ok([...init.headers.keys()].every(name => !name.startsWith('x-vercel-') && !name.startsWith('x-forwarded-')));
        return Response.json({ online: true });
      },
    });
    assert.equal(forwarded, true);
  }
  await call({ headers: { ...forged, 'X-Vercel-Forwarded-For': '198.51.100.10' } }, {
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.get('X-Dongjakso-Client-IP'), '127.0.0.1');
      return Response.json({ online: true });
    },
  });
  checks.push('gateway client IP uses only validated Vercel scalar or local socket and replaces all spoofed forwarding headers');
}

{
  assert.equal(parseSpaceUrl('https://owner-space.hf.space')?.hostname, 'owner-space.hf.space');
  assert.equal(parseSpaceUrl('http://owner-space.hf.space'), null);
  assert.equal(parseSpaceUrl('https://hf.space.evil.test'), null);
  assert.equal(buildUpstreamUrl(new URL('https://owner-space.hf.space'), '/api/session', '?x=1').href, 'https://owner-space.hf.space/api/session?x=1');
  checks.push('HF Space target is env-only HTTPS *.hf.space and cannot be supplied by query');
}

{
  const seen = [];
  const res = await call({
    method: 'POST',
    url: '/api/operations?path=uploads&target=https://evil.test/steal',
    headers: { Origin: 'https://60base.kr', Cookie: 'dongjakso_csrf=csrf-1; dongjakso_session=s', 'X-CSRF-Token': 'csrf-1', Authorization: 'Bearer browser', 'X-Dongjakso-Gateway-Key': 'client', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true }),
  }, {
    fetchImpl: async (url, init) => {
      seen.push({ url: new URL(url), headers: Object.fromEntries(init.headers.entries()), init });
      return new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'dongjakso_session=next; Domain=evil.test; SameSite=None' } });
    },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(seen[0].url.href, 'https://dongjakso-ops.hf.space/api/uploads?target=https%3A%2F%2Fevil.test%2Fsteal');
  assert.equal(seen[0].headers.authorization, `Bearer ${privateSpaceEnv.HF_TOKEN}`);
  assert.equal(seen[0].init.redirect, 'manual');
  assert.equal(seen[0].headers['x-dongjakso-gateway-key'], 'server-secret');
  assert.match(String(res.getHeader('set-cookie')), /HttpOnly/);
  assert.match(String(res.getHeader('set-cookie')), /Secure/);
  assert.match(String(res.getHeader('set-cookie')), /SameSite=Strict/);
  assert.doesNotMatch(String(res.getHeader('set-cookie')), /Domain=evil/);
  assert.equal(JSON.stringify({ headers: res.headers, body: res.text() }).includes(privateSpaceEnv.HF_TOKEN), false);
  checks.push('proxy replaces client auth/gateway headers with server HF token and gateway key and hardens Set-Cookie');
}

{
  const tooLarge = await call({ method: 'POST', url: '/api/operations?path=uploads', headers: { Origin: 'https://60base.kr', 'X-CSRF-Token': 'x', 'Content-Length': String(2_097_153) } });
  assert.equal(tooLarge.statusCode, 413);
  const badOrigin = await call({ method: 'PATCH', url: '/api/operations?path=admin/settings', headers: { Origin: 'https://evil.test', 'X-CSRF-Token': 'x' } });
  assert.equal(badOrigin.statusCode, 403);
  const badCsrf = await call({ method: 'DELETE', url: '/api/operations?path=videos/vid', headers: { Origin: 'https://60base.kr' } });
  assert.equal(badCsrf.statusCode, 403);
  checks.push('unsafe methods require allowed Origin, CSRF token and stay under 2 MiB chunks');
}

{
  const guestSession = await call({}, { fetchImpl: async () => Response.json({ online: true, user: null, csrf: null }) });
  assert.equal(guestSession.json().csrf, null);
  for (const auth of ['login', 'firebase', 'register']) {
    const body = auth === 'firebase' ? { idToken: 'firebase-id-token' } : { email: 'guest@example.test', password: 'test-password' };
    let forwarded = false;
    const res = await call({ method: 'POST', url: `/api/operations?path=auth/${auth}`, headers: { Origin: 'https://60base.kr', 'X-CSRF-Token': guestSession.json().csrf || '', 'Content-Type': 'application/json', Cookie: 'language=ko' }, body: JSON.stringify(body) }, {
      fetchImpl: async (url, init) => {
        forwarded = true;
        assert.equal(new URL(url).pathname, `/api/auth/${auth}`);
        assert.equal(init.headers.get('X-CSRF-Token'), '');
        assert.equal(init.headers.get('Origin'), 'https://60base.kr');
        assert.equal(init.headers.get('Authorization'), `Bearer ${privateSpaceEnv.HF_TOKEN}`);
        assert.deepEqual(await new Response(init.body).json(), body);
        return Response.json({ user: { id: 'usr-test' }, csrf: 'csrf-after-login' }, { headers: { 'Set-Cookie': 'dongjakso_session=authenticated; Path=/; HttpOnly' } });
      },
    });
    assert.equal(forwarded, true);
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().csrf, 'csrf-after-login');
    assert.match(String(res.getHeader('set-cookie')), /dongjakso_session=authenticated/);
  }
  checks.push('guest csrf:null can establish login, Firebase and registration sessions through same-origin POST');
}

{
  const noFetch = async () => assert.fail('rejected authentication request must not reach upstream');
  for (const auth of ['login', 'firebase', 'register']) {
    for (const headers of [
      {},
      { Origin: 'https://evil.test' },
      { Origin: 'https://evil.test', Cookie: 'dongjakso_session=existing', 'X-CSRF-Token': 'correct' },
    ]) {
      const res = await call({ method: 'POST', url: `/api/operations?path=auth/${auth}`, headers }, { fetchImpl: noFetch });
      assert.equal(res.statusCode, 403);
    }
  }
  for (const [method, path] of [['PATCH', 'auth/login'], ['POST', 'auth/logout'], ['POST', 'auth/login/extra'], ['POST', 'uploads'], ['DELETE', 'videos/vid']]) {
    const res = await call({ method, url: `/api/operations?path=${path}`, headers: { Origin: 'https://60base.kr' } }, { fetchImpl: noFetch });
    assert.equal(res.statusCode, 403);
  }
  checks.push('authentication entry rejects foreign/missing origins and unrelated mutations still require proxy CSRF');
}

{
  for (const auth of ['login', 'firebase', 'register']) {
    for (const cookie of ['dongjakso_session=stale', 'dongjakso_session=']) {
      let calls = 0;
      const backend = async (url, init) => {
        calls++;
        assert.equal(init.headers.get('Cookie'), cookie);
        if (new URL(url).pathname === '/api/session') return Response.json({ online: true, user: null, csrf: null });
        assert.equal(new URL(url).pathname, `/api/auth/${auth}`);
        assert.equal(init.headers.get('X-CSRF-Token'), '');
        return Response.json({ user: { id: 'new-session-user' }, csrf: 'fresh-csrf' }, { headers: { 'Set-Cookie': 'dongjakso_session=fresh; Path=/; HttpOnly' } });
      };
      const session = await call({ headers: { Cookie: cookie } }, { fetchImpl: backend });
      assert.equal(session.json().user, null);
      const login = await call({ method: 'POST', url: `/api/operations?path=auth/${auth}`, headers: { Origin: 'https://60base.kr', Cookie: cookie, 'X-CSRF-Token': session.json().csrf || '' } }, { fetchImpl: backend });
      assert.equal(calls, 2);
      assert.equal(login.statusCode, 200);
      assert.equal(login.json().csrf, 'fresh-csrf');
      assert.match(String(login.getHeader('set-cookie')), /dongjakso_session=fresh/);
    }
    for (const csrf of [undefined, '', 'wrong', 'active-session-csrf']) {
      let validated = false;
      const result = await call({ method: 'POST', url: `/api/operations?path=auth/${auth}`, headers: { Origin: 'https://60base.kr', Cookie: 'dongjakso_session=active; dongjakso_csrf=active-session-csrf', ...(csrf !== undefined ? { 'X-CSRF-Token': csrf } : {}) } }, {
        fetchImpl: async (_url, init) => {
          validated = true;
          assert.equal(init.headers.get('Cookie'), 'dongjakso_session=active; dongjakso_csrf=active-session-csrf');
          assert.equal(init.headers.get('X-CSRF-Token'), csrf ?? null);
          // Mirrors backend csrf(): a resolved active session requires its exact CSRF value.
          if (init.headers.get('X-CSRF-Token') !== 'active-session-csrf') return new Response('backend CSRF rejection', { status: 403 });
          return Response.json({ user: { id: 'active-user' }, csrf: 'new-session-csrf' });
        },
      });
      assert.equal(validated, true, 'active cookie must reach backend session validation');
      assert.equal(result.statusCode, csrf === 'active-session-csrf' ? 200 : 403);
      if (result.statusCode === 403) assert.deepEqual(result.json(), { ok: false, error: '요청을 처리할 수 없습니다. 로그인 상태와 접근 권한을 확인해주세요.', code: 'forbidden' });
    }
  }
  checks.push('stale cookies permit reauthentication while active-session missing/wrong CSRF remains rejected by backend');
}

{
  for (const cookie of ['dongjakso_session=%E0%A4%A', 'dongjakso_csrf=%', 'other=%FF', 'dongjakso_session', '=invalid']) {
    for (const path of ['auth/login', 'uploads']) {
      const headers = { Origin: 'https://60base.kr', Cookie: cookie, 'X-CSRF-Token': 'csrf' };
      assert.equal(csrfValid(new MockReq({ headers })), false);
      const res = await call({ method: 'POST', url: `/api/operations?path=${path}`, headers }, { fetchImpl: async () => assert.fail('malformed cookies must not reach upstream') });
      assert.equal(res.statusCode, 403);
      assert.deepEqual(res.json(), { ok: false, error: 'forbidden' });
    }
  }
  let forwarded = false;
  const authenticated = await call({ method: 'POST', url: '/api/operations?path=auth/firebase', headers: { Origin: 'https://60base.kr', Cookie: 'dongjakso_session=existing', 'X-CSRF-Token': 'server-session-csrf' } }, {
    fetchImpl: async (_url, init) => {
      forwarded = true;
      assert.equal(init.headers.get('X-CSRF-Token'), 'server-session-csrf');
      return new Response('backend rejects wrong session CSRF', { status: 403 });
    },
  });
  assert.equal(forwarded, true);
  assert.equal(authenticated.statusCode, 403);
  checks.push('malformed cookies fail safely and authenticated requests preserve backend session-CSRF validation');
}

{
  const session = await call({ method: 'GET', url: '/api/operations?path=session' }, { env: {} });
  assert.equal(session.statusCode, 200);
  assert.deepEqual(session.json(), { online: false, storage: 'huggingface', configured: false });
  const other = await call({ method: 'POST', url: '/api/operations?path=uploads', headers: { Origin: 'https://60base.kr', 'X-CSRF-Token': 'x' } }, { env: {} });
  assert.equal(other.statusCode, 503);
  checks.push('missing HF config preserves offline /session and rejects mutating operations');
}

{
  let fetchCount = 0;
  for (const HF_TOKEN of [undefined, '']) {
    const dependencies = { env: { ...privateSpaceEnv, HF_TOKEN }, fetchImpl: async () => { fetchCount++; throw new Error('unexpected upstream call'); } };
    for (const path of ['session', 'health']) {
      const res = await call({ url: `/api/operations?path=${path}` }, dependencies);
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.json(), { online: false, storage: 'huggingface', configured: false });
    }
    const mutation = await call({ method: 'POST', url: '/api/operations?path=uploads', headers: { Origin: 'https://60base.kr', 'X-CSRF-Token': 'x', Authorization: 'Bearer browser-token' } }, dependencies);
    assert.equal(mutation.statusCode, 503);
    assert.deepEqual(mutation.json(), { ok: false, error: 'operations_unavailable' });
  }
  assert.equal(fetchCount, 0);
  checks.push('private Space requires server HF_TOKEN; client Authorization cannot restore missing configuration');
}

{
  const res = await call({
    method: 'GET',
    url: '/api/operations?path=videos/vid/file',
    headers: { Range: 'bytes=0-9' },
  }, {
    fetchImpl: async (url, init) => {
      assert.equal(init.headers.get('Range'), 'bytes=0-9');
      assert.equal(init.headers.get('Authorization'), `Bearer ${privateSpaceEnv.HF_TOKEN}`);
      return new Response(Readable.toWeb(Readable.from([Buffer.from('0123456789')])) , { status: 206, headers: { 'Content-Type': 'video/mp4', 'Content-Range': 'bytes 0-9/100', 'Content-Length': '10', 'Accept-Ranges': 'bytes', 'X-Secret': 'hidden', Authorization: `Bearer ${privateSpaceEnv.HF_TOKEN}` } });
    },
  });
  assert.equal(res.statusCode, 206);
  assert.equal(res.getHeader('content-range'), 'bytes 0-9/100');
  assert.equal(res.getHeader('x-secret'), undefined);
  assert.equal(res.getHeader('authorization'), undefined);
  assert.equal(res.text(), '0123456789');
  checks.push('range video responses stream through with only safe response headers');
}

{
  const redirect = await call({ method: 'GET', url: '/api/operations?path=session' }, { fetchImpl: async () => new Response('', { status: 302, headers: { Location: 'https://secret.example.test' } }) });
  assert.equal(redirect.statusCode, 502);
  assert.equal(redirect.text().includes('secret.example'), false);
  const rejected = await call({ method: 'GET', url: '/api/operations?path=session' }, { fetchImpl: async () => new Response('token server-secret', { status: 500, headers: { 'Content-Type': 'text/plain' } }) });
  assert.equal(rejected.statusCode, 500);
  assert.equal(rejected.text().includes('server-secret'), false);
  checks.push('redirect and upstream error bodies are replaced with sanitized JSON');
}

{
  const secret = privateSpaceEnv.HF_TOKEN;
  const upstreamResponses = [
    async () => new Response(secret, { status: 302, headers: { Location: `https://example.test/${secret}`, Authorization: `Bearer ${secret}` } }),
    ...[401, 403, 500].map(status => async () => new Response(secret, { status, headers: { 'X-Error': secret, 'Set-Cookie': `debug=${secret}` } })),
    async () => { throw new Error(`upstream request failed with Bearer ${secret}`); },
  ];
  for (const fetchImpl of upstreamResponses) {
    const res = await call({}, { fetchImpl });
    assert.ok(res.statusCode >= 400);
    assert.equal(JSON.stringify({ headers: res.headers, body: res.text(), error: res.error?.message }).includes(secret), false);
  }
  checks.push('HF credentials in redirect, rejection and fetch error details never reach the browser');
}

{
  for (const status of [400, 401, 403, 404, 409, 413, 429, 500, 503]) {
    const res = await call({ method: 'POST', url: '/api/operations?path=auth/firebase', headers: { Origin: 'https://60base.kr' } }, {
      fetchImpl: async () => new Response(`private backend details ${privateSpaceEnv.HF_TOKEN}`, { status }),
    });
    assert.equal(res.statusCode, status);
    assert.match(res.json().error, /[가-힣]/);
    assert.equal(res.json().code, status === 401 ? 'unauthorized' : status === 403 ? 'forbidden' : 'upstream_rejected');
    if (status === 409) assert.equal(res.json().error, '기존 운영 계정이 있습니다. 계정 연결을 운영자에게 요청해주세요.');
    assert.equal(res.text().includes('private backend details'), false);
    assert.equal(res.text().includes(privateSpaceEnv.HF_TOKEN), false);
  }
  checks.push('upstream rejections provide static Korean messages and stable machine codes without backend details');
}

console.log(JSON.stringify({ status: 'passed', checks }, null, 2));
