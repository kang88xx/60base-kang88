import { isIP } from 'node:net';

const MAX_BODY_BYTES = 2_097_152;
const COMPLETE_TIMEOUT_MS = 285_000;
const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']);
const AUTH_ENTRY_PATHS = new Set(['/api/auth/login', '/api/auth/firebase', '/api/auth/register']);
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);
const STRIP_REQUEST = new Set(['host', 'authorization', 'proxy-authorization', 'x-dongjakso-gateway-key', 'x-dongjakso-client-ip', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip', 'cf-connecting-ip']);
const COPY_RESPONSE = new Set(['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified', 'cache-control', 'referrer-policy', 'cross-origin-resource-policy']);

export const config = { api: { bodyParser: false }, maxDuration: 300 };

export function parseSpaceUrl(value) {
  if (!value) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || !hostname.endsWith('.hf.space') || hostname === '.hf.space' || url.username || url.password || url.search || url.hash) return null;
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url;
}

export function resolveOperationPath(req) {
  const base = new URL('https://local.invalid' + (req.url || '/api/operations'));
  const raw = base.searchParams.get('path') || base.searchParams.get('opPath') || '';
  base.searchParams.delete('path');
  base.searchParams.delete('opPath');
  const cleaned = normalizePath(raw || base.pathname.replace(/^\/api\/operations\/?/, ''));
  return { path: cleaned, search: base.search };
}

export function buildUpstreamUrl(spaceUrl, operationPath, search = '') {
  const path = normalizePath(operationPath);
  const url = new URL(spaceUrl.href);
  const prefix = url.pathname.replace(/\/+$/, '');
  url.pathname = `${prefix}${path}`.replace(/\/{2,}/g, '/');
  url.search = search;
  return url;
}

export function isAllowedOrigin(req) {
  const origin = req.headers.origin;
  if (origin === 'https://60base.ai' || origin === 'https://60base.kr') return true;
  if (process.env.DONGJAKSO_ALLOWED_ORIGIN && origin === process.env.DONGJAKSO_ALLOWED_ORIGIN) return true;
  if (!process.env.VERCEL && typeof origin === 'string') {
    try {
      const parsed = new URL(origin);
      return ['localhost', '127.0.0.1'].includes(parsed.hostname);
    } catch { return false; }
  }
  return false;
}

export function csrfValid(req, cookies = parseCookies(req.headers.cookie || '')) {
  const token = String(req.headers['x-csrf-token'] || '');
  if (!token || /[\0\r\n]/.test(token) || token.length > 256) return false;
  if (!cookies) return false;
  return !cookies.dongjakso_csrf || cookies.dongjakso_csrf === token;
}

export async function proxyOperations(req, res, { fetchImpl = globalThis.fetch, env = process.env } = {}) {
  if (!ALLOWED_METHODS.has(req.method || '')) {
    res.setHeader('Allow', [...ALLOWED_METHODS].join(', '));
    return json(res, 405, { ok: false, error: 'method_not_allowed' });
  }
  const { path: operationPath, search } = resolveOperationPath(req);
  const spaceUrl = parseSpaceUrl(env.DONGJAKSO_HF_SPACE_URL);
  const gatewayKey = env.DONGJAKSO_GATEWAY_KEY;
  const hfToken = env.HF_TOKEN;
  if (!spaceUrl || !gatewayKey || !hfToken) {
    if (req.method === 'GET' && (operationPath === '/api/session' || operationPath === '/api/health')) {
      return json(res, 200, { online: false, storage: 'huggingface', configured: false });
    }
    return json(res, 503, { ok: false, error: 'operations_unavailable' });
  }
  if (!['GET', 'HEAD'].includes(req.method || '')) {
    const cookies = parseCookies(req.headers.cookie || '');
    // Only the backend can distinguish an active session from a stale HttpOnly cookie.
    // Auth entry routes delegate session-CSRF validation to its existing csrf() guard.
    const authEntry = req.method === 'POST' && AUTH_ENTRY_PATHS.has(operationPath);
    if (!isAllowedOrigin(req) || !cookies || (!authEntry && !csrfValid(req, cookies))) return json(res, 403, { ok: false, error: 'forbidden' });
  }
  const upstreamUrl = buildUpstreamUrl(spaceUrl, operationPath, search);
  const headers = requestHeaders(req.headers, gatewayKey, hfToken);
  const clientIp = env.VERCEL ? req.headers['x-vercel-forwarded-for'] : req.socket?.remoteAddress;
  if (typeof clientIp === 'string' && isIP(clientIp.trim())) headers.set('X-Dongjakso-Client-IP', clientIp.trim());
  let body;
  try { body = ['GET', 'HEAD'].includes(req.method || '') ? undefined : limitRequestBody(req, MAX_BODY_BYTES); }
  catch { return json(res, 413, { ok: false, error: 'request_too_large' }); }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), COMPLETE_TIMEOUT_MS);
  req.on?.('aborted', () => controller.abort());
  res.on?.('close', () => controller.abort());
  try {
    const response = await fetchImpl(upstreamUrl, { method: req.method, headers, body, duplex: body ? 'half' : undefined, redirect: 'manual', signal: controller.signal });
    if (response.status >= 300 && response.status < 400) {
      clearTimeout(timeout);
      return json(res, 502, { ok: false, error: 'upstream_redirect' });
    }
    if (response.status >= 400) {
      clearTimeout(timeout);
      const code = response.status === 401 ? 'unauthorized' : response.status === 403 ? 'forbidden' : 'upstream_rejected';
      const error = response.status === 409 && operationPath === '/api/auth/firebase'
        ? '기존 운영 계정이 있습니다. 계정 연결을 운영자에게 요청해주세요.'
        : ({ 400: '입력한 내용을 확인해주세요.', 401: '로그인 정보를 확인하고 다시 시도해주세요.', 403: '요청을 처리할 수 없습니다. 로그인 상태와 접근 권한을 확인해주세요.', 404: '요청한 항목을 찾을 수 없습니다.', 409: '현재 상태에서 요청을 처리할 수 없습니다. 화면을 새로고침해주세요.', 413: '전송할 파일이나 내용이 너무 큽니다.', 429: '요청이 많습니다. 잠시 후 다시 시도해주세요.' }[response.status] || '서비스 연결이 원활하지 않습니다. 잠시 후 다시 시도해주세요.');
      return json(res, response.status, { ok: false, error, code });
    }
    copyResponseHeaders(response.headers, res);
    rewriteSetCookie(response.headers, res);
    res.statusCode = response.status;
    if (req.method === 'HEAD' || !response.body) {
      clearTimeout(timeout);
      return res.end();
    }
    await pipeWebBody(response.body, res, controller);
    clearTimeout(timeout);
  } catch (error) {
    clearTimeout(timeout);
    if (!res.headersSent) return json(res, error?.name === 'AbortError' ? 504 : 502, { ok: false, error: error?.name === 'AbortError' ? 'upstream_timeout' : 'upstream_unavailable' });
    res.destroy?.();
  }
}

export default proxyOperations;

function normalizePath(value) {
  let decoded = String(value || '').replace(/^\/+/, '');
  try { decoded = decodeURIComponent(decoded); } catch {}
  if (!decoded || decoded === 'api' || decoded === 'api/') return '/api/session';
  if (decoded.startsWith('api/')) decoded = decoded.slice(4);
  const parts = decoded.split('/').filter(Boolean);
  if (!parts.length || parts.some(part => part === '.' || part === '..' || /[\0\r\n\\]/.test(part))) return '/api/session';
  return '/api/' + parts.map(encodeURIComponent).join('/');
}

function parseCookies(header) {
  const result = Object.create(null);
  for (const part of String(header || '').split(';')) {
    if (!part.trim()) continue;
    const index = part.indexOf('=');
    if (index <= 0 || !part.slice(0, index).trim()) return null;
    try { result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim()); }
    catch { return null; }
  }
  return result;
}

function requestHeaders(source, gatewayKey, hfToken) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(source || {})) {
    const key = name.toLowerCase();
    if (HOP_BY_HOP.has(key) || STRIP_REQUEST.has(key) || key.startsWith('x-vercel-') || key.startsWith('x-forwarded-')) continue;
    if (value === undefined) continue;
    headers.set(name, Array.isArray(value) ? value.join(', ') : String(value));
  }
  headers.set('X-Dongjakso-Gateway-Key', gatewayKey);
  headers.set('Authorization', `Bearer ${hfToken}`);
  return headers;
}

function limitRequestBody(req, maxBytes) {
  const length = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(length) && length > maxBytes) throw new Error('too_large');
  let total = 0;
  return new ReadableStream({
    start(controller) {
      req.on('data', chunk => {
        total += chunk.length;
        if (total > maxBytes) {
          controller.error(new Error('too_large'));
          req.destroy?.();
          return;
        }
        controller.enqueue(chunk);
      });
      req.on('end', () => controller.close());
      req.on('error', error => controller.error(error));
    },
    cancel() { req.destroy?.(); },
  });
}

function copyResponseHeaders(headers, res) {
  for (const [name, value] of headers.entries()) {
    const key = name.toLowerCase();
    if (COPY_RESPONSE.has(key)) res.setHeader(name, value);
  }
}

function rewriteSetCookie(headers, res) {
  const cookies = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : splitSetCookie(headers.get('set-cookie'));
  if (!cookies.length) return;
  res.setHeader('Set-Cookie', cookies.map(cookie => {
    const parts = cookie.split(';').map(part => part.trim()).filter(Boolean);
    const first = parts.shift();
    const kept = parts.filter(part => !/^(domain=|secure$|httponly$|samesite=)/i.test(part));
    return [first, ...kept, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Strict'].join('; ');
  }));
}

function splitSetCookie(value) {
  if (!value) return [];
  return String(value).split(/,(?=\s*[^;,]+=)/g).map(v => v.trim()).filter(Boolean);
}

async function pipeWebBody(body, res, controller) {
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(Buffer.from(value))) await new Promise(resolve => res.once('drain', resolve));
    }
    res.end();
  } catch (error) {
    controller.abort();
    res.destroy?.(error);
  } finally {
    reader.releaseLock();
  }
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}
