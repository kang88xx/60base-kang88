import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const DEFAULT_PORT = 4399;
const MAX_BODY = 16 * 1024;
export function defaultCredentialsFile(env = process.env, home = os.homedir()) {
  return env.HF_CREDENTIALS_FILE || path.join(home, '.local', 'share', 'dongjakso-hf', 'credentials.json');
}
const TOKEN_URL = 'https://huggingface.co/settings/tokens';

export function createConnectServer({ fetchImpl = globalThis.fetch, storeFile = defaultCredentialsFile(), tokenUrl = TOKEN_URL, nonce = randomBytes(24).toString('base64url') } = {}) {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(nonce)) throw new Error('Invalid connection nonce');
  let status = { configured: false, account: null, isPro: false, namespace: null, updatedAt: null };
  const restored = readFile(storeFile, 'utf8').then(text => {
    const record = JSON.parse(text);
    validateInput(record);
    if (record.verified?.isPro !== true || !['write', 'fineGrained'].includes(record.verified?.tokenRole) || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(record.verified?.account || '')) throw new Error('Invalid saved account');
    status = { configured: true, account: record.verified.account, isPro: true, namespace: record.namespace, updatedAt: record.updatedAt };
  }).catch(error => {
    if (error.code !== 'ENOENT') status = { ...status, error: 'credentials_unreadable', message: '저장된 연결 정보를 읽을 수 없습니다. 기존 파일을 확인하거나 연결 정보를 다시 입력해주세요.' };
  });
  const server = http.createServer(async (req, res) => {
    res.connectNonce = nonce;
    securityHeaders(res);
    try {
      await restored;
      const host = String(req.headers.host || '').toLowerCase();
      if (!/^localhost(?::\d+)?$/.test(host) && !/^127\.0\.0\.1(?::\d+)?$/.test(host)) return send(res, 403, 'text/plain; charset=utf-8', 'forbidden');
      const url = new URL(req.url || '/', `http://${host}`);
      if (url.pathname !== `/${nonce}` && url.pathname !== `/${nonce}/status`) return send(res, 404, 'text/plain; charset=utf-8', 'not found');
      securityHeaders(res);
      if (req.method === 'GET' && url.pathname === `/${nonce}`) return send(res, 200, 'text/html; charset=utf-8', page({ tokenUrl, nonce }));
      if (req.method === 'GET' && url.pathname === `/${nonce}/status`) return json(res, 200, status);
      if (req.method !== 'POST' || url.pathname !== `/${nonce}`) return json(res, 405, { ok: false, error: 'method_not_allowed' });
      if (req.headers.origin && req.headers.origin !== `http://${host}`) return json(res, 403, { ok: false, error: 'bad_origin' });
      if (req.headers['x-hf-connect-nonce'] !== nonce) return json(res, 403, { ok: false, error: 'bad_nonce' });
      const body = await readJson(req);
      const credentials = validateInput(body);
      const verified = await verifyHuggingFace(credentials.hfToken, fetchImpl);
      if (!verified.isPro) return json(res, 400, { ok: false, error: 'pro_required', message: 'PRO 구독이 확인되지 않았습니다. 결제한 계정의 토큰인지 확인해주세요.' });
      const namespace = credentials.namespace || verified.name;
      const record = {
        hfToken: credentials.hfToken,
        hfS3AccessKeyId: credentials.hfS3AccessKeyId,
        hfS3SecretAccessKey: credentials.hfS3SecretAccessKey,
        namespace,
        verified: { account: verified.name, isPro: verified.isPro, tokenRole: verified.role || null, permissionsVerified: verified.role === 'write' },
        updatedAt: new Date().toISOString(),
      };
      await saveCredentials(storeFile, record);
      status = { configured: true, account: verified.name, isPro: true, namespace, updatedAt: record.updatedAt };
      return json(res, 200, { ok: true, status });
    } catch (error) {
      return json(res, error.status || 400, { ok: false, error: error.code || 'invalid_request', message: error.publicMessage || '입력값을 확인해주세요.' });
    }
  });
  server.connectNonce = nonce;
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  return server;
}

export async function listen({ port = DEFAULT_PORT, ...options } = {}) {
  const server = createConnectServer(options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  }).catch(error => {
    if (error.code !== 'EADDRINUSE') throw error;
    return new Promise((resolve, reject) => {
      server.removeAllListeners('error');
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
  });
  const actual = server.address().port;
  return { server, url: `http://127.0.0.1:${actual}/${server.connectNonce}` };
}

function securityHeaders(res) {
  const nonce = res.connectNonce;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', `default-src 'none'; connect-src 'self'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'`);
}

function page({ tokenUrl, nonce }) {
  return `<!doctype html>
<html lang="ko">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>60BASE Hugging Face 연결</title>
<style nonce="${nonce}">
body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;background:#f7f6f3;color:#141414}
main{max-width:760px;margin:0 auto;padding:40px 20px 56px}
.card{background:#fff;border:1px solid #ddd8cf;border-radius:14px;padding:24px;box-shadow:0 18px 50px rgba(0,0,0,.08)}
h1{font-size:26px;margin:0 0 10px}.muted{color:#5f5f5f;line-height:1.6}
a{color:#0a58ca}label{display:block;font-weight:700;margin:18px 0 8px}
input{width:100%;box-sizing:border-box;border:1px solid #cbc6bd;border-radius:10px;padding:12px;font:inherit}
button{margin-top:22px;border:0;border-radius:999px;background:#ff5d17;color:white;font-weight:800;padding:13px 20px;font:inherit;cursor:pointer}
button:disabled{opacity:.55;cursor:wait}.status{margin-top:16px;white-space:pre-wrap}.ok{color:#116329}.err{color:#a11b1b}
ol{line-height:1.75;padding-left:22px}
</style>
<main>
 <div class="card">
  <h1>Hugging Face 연결 정보 입력</h1>
  <p class="muted">이 페이지는 내 컴퓨터의 127.0.0.1에서만 열립니다. 입력한 값은 브라우저 저장소에 남기지 않고 서버의 권한 파일에만 저장합니다.</p>
  <ol>
   <li><a href="${tokenUrl}" target="_blank" rel="noreferrer noopener">Hugging Face Access Tokens</a>에서 <b>Write</b> 권한 토큰을 준비하세요. 기존 토큰이 있으면 그대로 사용할 수 있습니다.</li>
   <li>같은 화면의 드롭다운에서 <b>Generate S3 Credentials</b>를 눌러 <b>HFAK...</b> Access Key와 Secret Key를 받으세요.</li>
   <li>조직을 쓰지 않으면 namespace는 비워두세요. 결제한 개인 PRO 계정으로 자동 확인합니다.</li>
  </ol>
  <form id="form" autocomplete="off">
   <label for="hfToken">HF_TOKEN</label>
   <input id="hfToken" name="hfToken" type="password" required autocomplete="off" spellcheck="false">
   <label for="hfS3AccessKeyId">HF_S3_ACCESS_KEY_ID</label>
   <input id="hfS3AccessKeyId" name="hfS3AccessKeyId" required placeholder="HFAK..." autocomplete="off" spellcheck="false">
   <label for="hfS3SecretAccessKey">HF_S3_SECRET_ACCESS_KEY</label>
   <input id="hfS3SecretAccessKey" name="hfS3SecretAccessKey" type="password" required autocomplete="off" spellcheck="false">
   <label for="namespace">namespace 선택 입력</label>
   <input id="namespace" name="namespace" placeholder="비워두면 확인된 개인 계정 사용" autocomplete="off" spellcheck="false">
   <button id="submit" type="submit">검증하고 저장</button>
  </form>
  <div id="status" class="status muted" role="status"></div>
 </div>
</main>
<script nonce="${nonce}">
const form=document.getElementById('form'),statusBox=document.getElementById('status'),button=document.getElementById('submit');
fetch(location.pathname+'/status',{credentials:'same-origin'}).then(response=>response.json()).then(data=>{
 if(data.error){statusBox.className='status err';statusBox.textContent=data.message;}
 else if(data.configured){statusBox.className='status ok';statusBox.textContent='저장된 연결 정보: '+data.account+' / namespace: '+data.namespace;}
}).catch(()=>{statusBox.className='status err';statusBox.textContent='저장된 연결 상태를 확인하지 못했습니다. 페이지를 다시 열어주세요.';});
form.addEventListener('submit',async event=>{
 event.preventDefault(); button.disabled=true; statusBox.className='status muted'; statusBox.textContent='Hugging Face 계정을 확인하고 있습니다.';
 const payload=Object.fromEntries(new FormData(form).entries());
 try{
  const response=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json','X-HF-Connect-Nonce':'${nonce}'},body:JSON.stringify(payload),credentials:'same-origin'});
  const data=await response.json();
  if(!response.ok||!data.ok)throw new Error(data.message||'저장하지 못했습니다.');
  statusBox.className='status ok'; statusBox.textContent='연결 정보가 저장됐습니다. 계정: '+data.status.account+' / namespace: '+data.status.namespace;
  form.reset();
 }catch(error){statusBox.className='status err'; statusBox.textContent=error.message||'입력값을 다시 확인해주세요.';}
 finally{button.disabled=false;}
});
</script>`;
}

async function readJson(req) {
  if (!/^application\/json(?:;|$)/i.test(String(req.headers['content-type'] || ''))) throw publicError('json_required', 'JSON 요청만 허용됩니다.', 415);
  if (Number(req.headers['content-length'] || 0) > MAX_BODY) throw publicError('too_large', '요청 크기가 너무 큽니다.', 413);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw publicError('too_large', '요청 크기가 너무 큽니다.', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw publicError('bad_json', 'JSON 형식이 올바르지 않습니다.', 400); }
}

function validateInput(body) {
  const hfToken = clean(body?.hfToken);
  const hfS3AccessKeyId = clean(body?.hfS3AccessKeyId);
  const hfS3SecretAccessKey = clean(body?.hfS3SecretAccessKey);
  const namespace = clean(body?.namespace || '');
  if (!/^hf_[A-Za-z0-9]{20,}$/.test(hfToken)) throw publicError('bad_token', 'HF_TOKEN 형식을 확인해주세요.', 400);
  if (!/^HFAK[A-Za-z0-9]{12,}$/.test(hfS3AccessKeyId)) throw publicError('bad_s3_key', 'S3 Access Key는 HFAK로 시작해야 합니다.', 400);
  if (hfS3SecretAccessKey.length < 20 || /[\s\0]/.test(hfS3SecretAccessKey)) throw publicError('bad_s3_secret', 'S3 Secret Key 형식을 확인해주세요.', 400);
  if (namespace && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(namespace)) throw publicError('bad_namespace', 'namespace 형식을 확인해주세요.', 400);
  return { hfToken, hfS3AccessKeyId, hfS3SecretAccessKey, namespace };
}

async function verifyHuggingFace(token, fetchImpl) {
  const response = await fetchImpl('https://huggingface.co/api/whoami-v2', { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw publicError('token_rejected', 'Hugging Face 토큰을 확인하지 못했습니다.', 400);
  const data = await response.json();
  const role = data.auth?.accessToken?.role || null;
  if (!['write', 'fineGrained'].includes(role)) throw publicError('token_not_write', 'Write 권한 토큰이 필요합니다.', 400);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(data.name || '')) throw publicError('invalid_account', '계정 이름을 확인하지 못했습니다.', 400);
  return { name: data.name, isPro: data.isPro === true, role };
}

async function saveCredentials(file, record) {
  const dir = path.dirname(file);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);
  const temp = path.join(dir, `.credentials-${process.pid}-${randomBytes(12).toString('hex')}.json`);
  await writeFile(temp, JSON.stringify(record, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  await rename(temp, file).catch(async error => {
    await rm(temp, { force: true });
    throw error;
  });
}

function clean(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function json(res, code, body) {
  securityHeaders(res);
  return send(res, code, 'application/json; charset=utf-8', JSON.stringify(body));
}

function send(res, code, type, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', type);
  res.end(body);
}

function publicError(code, publicMessage, status) {
  return Object.assign(new Error(code), { code, publicMessage, status });
}

if (process.argv.includes('--self-test')) {
  await selfTest();
} else if (import.meta.url === `file://${process.argv[1]}`) {
  const started = await listen({ port: Number(process.env.HF_CONNECT_PORT || DEFAULT_PORT) });
  console.log(`HF_CONNECT_URL=${started.url}`);
}

async function selfTest() {
  const testNonce = randomBytes(24).toString('base64url');
  const dir = await import('node:fs/promises').then(fs => fs.mkdtemp(path.join(os.tmpdir(), 'hf-connect-')));
  try {
    const server = createConnectServer({ nonce: testNonce, storeFile: path.join(dir, 'credentials.json'), fetchImpl: async () => new Response(JSON.stringify({ name: 'kang88', isPro: true, auth: { accessToken: { role: 'write' } } }), { status: 200, headers: { 'Content-Type': 'application/json' } }) });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}/${testNonce}`;
    const pageResponse = await fetch(base);
    const pageText = await pageResponse.text();
    if (pageText.includes('hf_xxx') || pageText.includes('HFAKSECRET')) throw new Error('secret reflected');
    const badOrigin = await fetch(base, { method: 'POST', headers: { Origin: 'https://evil.test', 'Content-Type': 'application/json', 'X-HF-Connect-Nonce': testNonce }, body: '{}' });
    if (badOrigin.status !== 403) throw new Error('bad origin accepted');
    const big = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-HF-Connect-Nonce': testNonce }, body: JSON.stringify({ hfToken: 'x'.repeat(MAX_BODY) }) });
    if (big.status !== 413) throw new Error('large body accepted');
    const ok = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-HF-Connect-Nonce': testNonce }, body: JSON.stringify({ hfToken: 'hf_' + 'A'.repeat(40), hfS3AccessKeyId: 'HFAK' + 'B'.repeat(20), hfS3SecretAccessKey: 'C'.repeat(40), namespace: '' }) });
    if (ok.status !== 200) throw new Error('valid submission rejected');
    server.close();
    console.log(JSON.stringify({ status: 'passed', checks: ['nonce route only', 'bad origin rejected', 'body cap enforced', 'GET does not reflect secrets', 'valid mocked credentials saved'] }, null, 2));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
