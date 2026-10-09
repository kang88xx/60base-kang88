import { useState, useSyncExternalStore } from 'react';

export const CONTACT_DRAFT_KEY = 'koreo:inquiry-draft';
export const CONTACT_TIMEOUT = 20_000;
const fields = ['name', 'email', 'message', 'dataType'];
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = {
  en: {
    send: 'SEND INQUIRY', sendingLabel: 'SENDING…', sentLabel: 'INQUIRY SENT',
    sending: 'Sending your inquiry…', sent: 'Your inquiry has been sent. We will reply to your email.',
    validation: 'Check your name (100 characters), email (254), brief (5000) and data type (180).',
    rateLimited: 'Too many attempts. Please wait a few minutes before trying again.',
    unavailable: 'Sending is temporarily unavailable. Please try again later or email 60base.ai@gmail.com.',
    invalid: 'Please check your details and try again. Your inquiry has been kept.',
    unconfirmed: 'We could not confirm sending. Your inquiry has been kept. Please retry or email 60base.ai@gmail.com.',
    storage: 'Local browser storage is unavailable. You can still edit the draft on this page.',
    errors: {
      name: 'Enter your name or company (up to 100 characters).',
      email: 'Enter a valid email address (up to 254 characters).',
      message: 'Describe the data you need (up to 5,000 characters).',
      dataType: 'Use up to 180 characters for the data type.',
    },
  },
  ko: {
    send: '문의 보내기', sendingLabel: '보내는 중…', sentLabel: '발송 완료',
    sending: '문의를 보내고 있습니다…', sent: '문의가 발송되었습니다. 입력하신 이메일로 답변드리겠습니다.',
    validation: '이름(100자), 이메일(254자), 문의 내용(5,000자), 수집 데이터 타입(180자)을 확인해주세요.',
    rateLimited: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
    unavailable: '현재 문의를 보낼 수 없습니다. 잠시 후 다시 시도하거나 60base.ai@gmail.com으로 연락해주세요.',
    invalid: '입력 내용을 확인하고 다시 시도해주세요. 문의 내용은 보관되어 있습니다.',
    unconfirmed: '발송 여부를 확인하지 못했습니다. 문의 내용은 보관되어 있습니다. 다시 시도하거나 60base.ai@gmail.com으로 연락해주세요.',
    storage: '브라우저 저장소를 사용할 수 없습니다. 이 페이지에서 문의 내용을 계속 편집할 수 있습니다.',
    errors: {
      name: '이름 또는 회사명을 100자 이내로 입력해주세요.',
      email: '올바른 이메일 주소를 254자 이내로 입력해주세요.',
      message: '필요한 데이터를 5,000자 이내로 입력해주세요.',
      dataType: '수집 데이터 타입을 180자 이내로 입력해주세요.',
    },
  },
};

export function inquiryData(values) {
  return Object.fromEntries(fields.map(name => [name, typeof values[name] === 'string' ? values[name].trim() : '']));
}

export function validateInquiry(values) {
  const data = inquiryData(values);
  return {
    name: !data.name || data.name.length > 100 || /[\0\r\n]/.test(data.name),
    email: data.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) || /\0/.test(data.email),
    message: !data.message || data.message.length > 5000 || /\0/.test(data.message),
    dataType: data.dataType.length > 180 || /[\0\r\n]/.test(data.dataType),
  };
}

// The controller keeps the original production request/draft semantics testable
// without submitting a real inquiry or depending on a browser test environment.
export function createContactFormController(options = {}) {
  const storage = options.storage || (() => globalThis.localStorage);
  const request = options.fetch || ((...args) => globalThis.fetch(...args));
  const makeId = options.uuid || (() => globalThis.crypto.randomUUID());
  const schedule = options.setTimeout || globalThis.setTimeout;
  const unschedule = options.clearTimeout || globalThis.clearTimeout;
  const fingerprint = values => JSON.stringify(inquiryData(values));
  let restored = {};
  try {
    const candidate = JSON.parse(storage().getItem(CONTACT_DRAFT_KEY) || '{}');
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) restored = candidate;
  } catch { /* Draft storage is optional; sending still works without it. */ }
  const values = Object.fromEntries(fields.map(name => [name, typeof restored[name] === 'string' ? restored[name] : '']));
  let attempt = null;
  let sentFingerprint = '';
  const delivery = restored.delivery;
  if (delivery && uuidV4.test(delivery.requestId) && delivery.fingerprint === fingerprint(values) && typeof delivery.sent === 'boolean') {
    attempt = { requestId: delivery.requestId, fingerprint: delivery.fingerprint };
    if (delivery.sent) sentFingerprint = delivery.fingerprint;
  }
  let state = { values, errors: {}, sending: false, sent: Boolean(sentFingerprint), status: sentFingerprint ? 'sent' : '' };
  const listeners = new Set();
  const publish = update => {
    state = { ...state, ...update };
    state.sent = sentFingerprint === fingerprint(state.values);
    listeners.forEach(listener => listener());
  };
  const save = () => {
    try {
      const data = inquiryData(state.values);
      const current = fingerprint(data);
      const delivery = attempt?.fingerprint === current ? { ...attempt, sent: sentFingerprint === current } : undefined;
      storage().setItem(CONTACT_DRAFT_KEY, JSON.stringify({ ...data, delivery, updatedAt: new Date().toISOString() }));
      return true;
    } catch {
      publish({ status: 'storage' });
      return false;
    }
  };

  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    change(name, value) {
      if (state.sending || !fields.includes(name)) return;
      const values = { ...state.values, [name]: value };
      if (attempt?.fingerprint !== fingerprint(values)) { attempt = null; sentFingerprint = ''; }
      publish({ values, errors: { ...state.errors, [name]: false } });
      if (save()) publish({ status: '' });
    },
    async submit(website = '') {
      const data = inquiryData(state.values);
      const current = fingerprint(data);
      if (state.sending || sentFingerprint === current) return { kind: 'ignored' };
      const errors = validateInquiry(data);
      const invalidField = fields.find(name => errors[name]);
      if (invalidField) {
        publish({ errors, status: 'validation' });
        return { kind: 'invalid', field: invalidField };
      }
      publish({ sending: true, errors: {}, status: 'sending' });
      const controller = new AbortController();
      const timeout = schedule(() => controller.abort(), CONTACT_TIMEOUT);
      try {
        if (!attempt || attempt.fingerprint !== current) attempt = { fingerprint: current, requestId: makeId() };
        save();
        const response = await request('/api/contact', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...data, requestId: attempt.requestId, website }), signal: controller.signal,
        });
        const result = await response.json().catch(() => null);
        if (response.ok && result?.ok === true) {
          sentFingerprint = current;
          save();
          publish({ status: 'sent' });
        } else {
          publish({ status: response.status === 429 ? 'rateLimited' : response.status === 503 ? 'unavailable' : response.status === 400 ? 'invalid' : 'unconfirmed' });
        }
      } catch {
        publish({ status: 'unconfirmed' });
      } finally {
        unschedule(timeout);
        publish({ sending: false });
      }
      return { kind: state.sent ? 'sent' : 'error' };
    },
  };
}

export function useContactForm(language = 'en') {
  const [controller] = useState(() => createContactFormController());
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const labels = text[language === 'ko' ? 'ko' : 'en'];
  return {
    ...state,
    statusText: labels[state.status] || '',
    buttonLabel: state.sending ? labels.sendingLabel : state.sent ? labels.sentLabel : labels.send,
    errorText: labels.errors,
    change: event => controller.change(event.target.name, event.target.value),
    async submit(event) {
      event.preventDefault();
      const form = event.currentTarget;
      const result = await controller.submit(String(new FormData(form).get('website') || ''));
      if (result.kind === 'invalid') form.elements.namedItem(result.field)?.focus();
    },
  };
}
