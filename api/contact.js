import { createHash } from 'node:crypto';

const TO = '60base.ai@gmail.com';
const MAX_BYTES = 24_576;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const limits = new Map();
const completed = new Map();
const inflight = new Map();

function respond(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.statusCode = status;
  res.end(JSON.stringify(body));
}
function bad(code = 'invalid_request') { return Object.assign(new Error(code), { code }); }
async function readBody(req) {
  if (Number(req.headers['content-length']) > MAX_BYTES) throw bad('too_large');
  let value = req.body;
  if (value === undefined) {
    const chunks = []; let length = 0;
    for await (const chunk of req) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      length += bytes.length;
      if (length > MAX_BYTES) throw bad('too_large');
      chunks.push(bytes);
    }
    value = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  if (typeof value === 'string') {
    if (Buffer.byteLength(value) > MAX_BYTES) throw bad('too_large');
    value = JSON.parse(value);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw bad();
  if (Buffer.byteLength(JSON.stringify(value)) > MAX_BYTES) throw bad('too_large');
  return value;
}
export function validateContact(body) {
  const fields = {};
  for (const [key, max, required] of [['name',100,true],['email',254,true],['message',5000,true],['dataType',180,false]]) {
    const value = body[key] ?? '';
    if (typeof value !== 'string') throw bad();
    fields[key] = value.trim();
    if ((required && !fields[key]) || fields[key].length > max || /\0/.test(value)) throw bad();
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email) || /[\r\n]/.test(fields.name + fields.email + fields.dataType)) throw bad();
  if (!UUID.test(body.requestId ?? '') || (body.website !== undefined && body.website !== '')) throw bad();
  return { ...fields, requestId:body.requestId };
}
function allowedOrigin(req) {
  const origin = req.headers.origin;
  if (origin === 'https://60base.ai' || origin === 'https://60base.kr') return true;
  if (process.env.VERCEL_URL && origin === `https://${process.env.VERCEL_URL}`) return true;
  if (!process.env.VERCEL && typeof origin === 'string') {
    try { const parsed = new URL(origin); return ['localhost','127.0.0.1'].includes(parsed.hostname) && parsed.origin === `http://${req.headers.host}`; } catch { return false; }
  }
  return false;
}
function takeSlot(req, now) {
  // Warm-instance bound; configure edge limits separately for global protection.
  for (const [key, entry] of limits) if (entry.until <= now) limits.delete(key);
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const key = createHash('sha256').update(ip).digest('hex');
  const entry = limits.get(key) || { count:0, until:now + 15 * 60_000 };
  if (entry.count >= 5 || (!limits.has(key) && limits.size >= 5000)) return false;
  entry.count++; limits.set(key,entry); return true;
}
export default async function contact(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return respond(res,405,{ok:false,error:'method_not_allowed'}); }
  if (!allowedOrigin(req)) return respond(res,403,{ok:false,error:'origin_not_allowed'});
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return respond(res,415,{ok:false,error:'json_required'});
  let fields;
  try { fields = validateContact(await readBody(req)); }
  catch (error) { return respond(res,error.code === 'too_large' ? 413 : 400,{ok:false,error:'invalid_request'}); }
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CONTACT_FROM;
  if (!apiKey || !from || /[\r\n]/.test(from)) return respond(res,503,{ok:false,error:'mail_unavailable'});
  const payload = {
    from, to:[TO], reply_to:fields.email,
    subject:'[60BASE] 홈페이지 데이터 문의',
    text:`이름 또는 회사명: ${fields.name}\n회신 이메일: ${fields.email}\n수집 데이터 타입: ${fields.dataType || '미입력'}\n\n문의 내용\n${fields.message}`,
  };
  const key = createHash('sha256').update(JSON.stringify({requestId:fields.requestId,...payload})).digest('hex');
  const now = Date.now();
  for (const [id, until] of completed) if (until <= now) completed.delete(id);
  if (completed.has(key)) return respond(res,200,{ok:true});
  if (inflight.has(key)) { const ok = await inflight.get(key); return respond(res,ok ? 200 : 502,{ok,error:ok ? undefined : 'send_unconfirmed'}); }
  if (!takeSlot(req, now)) { res.setHeader('Retry-After','900'); return respond(res,429,{ok:false,error:'rate_limited'}); }
  const send = (async () => {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method:'POST', headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':`contact-${key}`},
        body:JSON.stringify(payload), signal:AbortSignal.timeout(10_000),
      });
      if (!response.ok) return false;
      const result = await response.json();
      if (typeof result.id !== 'string' || !result.id) return false;
      if (completed.size >= 1000) completed.delete(completed.keys().next().value);
      completed.set(key,Date.now() + 24 * 60 * 60_000);
      return true;
    } catch { return false; }
  })();
  inflight.set(key,send);
  const ok = await send;
  inflight.delete(key);
  return respond(res,ok ? 200 : 502,{ok,error:ok ? undefined : 'send_unconfirmed'});
}
