import { dialog, esc, points } from '../studio/online-api.js';

export const MIN_EXCHANGE_POINTS = 30000;
export const couponProducts = Object.freeze([
  { id: 'shinsegae-10000', name: '신세계 상품권 10,000원', image: 'shinsegae-10000.png', brand: '신세계', cost: 10000 },
  { id: 'lotte-10000', name: '롯데 상품권 10,000원', image: 'lotte-10000.png', brand: '롯데', cost: 10000 },
  { id: 'starbucks-10000', name: '스타벅스 상품권 10,000원', image: 'starbucks-10000.jpg', brand: '스타벅스', cost: 10000 },
  { id: 'mega-2000', name: '메가커피 쿠폰 2,000원', image: 'mega-2000.png', brand: '메가MGC커피', cost: 2000 },
  { id: 'starbucks-americano', name: '스타벅스 아메리카노', image: 'starbucks-americano.jpg', brand: '스타벅스 · 4,900원', cost: 4900 },
]);
const storageKey = owner => 'ego:coupon-tests:v1:' + encodeURIComponent(owner);
export function couponTestHistory(owner) {
  try {
    const items = JSON.parse(localStorage.getItem(storageKey(owner)) || '[]');
    return Array.isArray(items) ? items.filter(item => item?.test === true && couponProducts.some(product => product.id === item.productId)).slice(0, 30) : [];
  } catch { return []; }
}
export function canExchange(balance, cost = 0) {
  return Number.isFinite(balance) && balance >= MIN_EXCHANGE_POINTS && balance >= cost;
}
export const normalizePhone = value => String(value).replace(/[\s-]/g, '');
export const validPhone = value => /^01[016789]\d{7,8}$/.test(normalizePhone(value));

// Integration boundary: replace this adapter with server-issued challenges and
// server-authoritative redemption when the SMS/coupon provider is selected.
// Test verification never updates account identity or the real points ledger.
export const testCouponAdapter = {
  async requestCode(phone) {
    if (!validPhone(phone)) throw Error('휴대폰 번호를 확인해주세요.');
    return { phone: normalizePhone(phone), test: true, expiresAt: Date.now() + 180000 };
  },
  async verifyCode(challenge, code) {
    if (!challenge?.test || challenge.expiresAt <= Date.now()) throw Error('인증 시간이 지났어요. 인증번호를 다시 요청해주세요.');
    if (!/^\d+$/.test(String(code).trim())) throw Error('테스트 인증번호로 숫자를 입력해주세요.');
    return { phone: challenge.phone, test: true };
  },
  async redeem({ owner, product, verification, balance }) {
    if (!owner || !verification?.test || !validPhone(verification.phone)) throw Error('전화번호 인증이 필요해요.');
    if (!couponProducts.includes(product) || !canExchange(balance, product.cost)) throw Error('30,000P 이상 보유하면 교환할 수 있어요.');
    const receipt = { id: crypto.randomUUID(), productId: product.id, name: product.name, cost: product.cost, phone: verification.phone.slice(0, 3) + '-****-' + verification.phone.slice(-4), createdAt: new Date().toISOString(), test: true };
    try { localStorage.setItem(storageKey(owner), JSON.stringify([receipt, ...couponTestHistory(owner)].slice(0, 30))); }
    catch { throw Error('테스트 내역을 저장하지 못했어요. 기기 저장 공간과 설정을 확인해주세요.'); }
    return receipt;
  },
};

export function openCouponExchange({ getState, requireSession, onComplete }) {
  const initial = getState(), owner = initial.user?.id, accountKey = initial.accountKey;
  if (!owner || !requireSession() || !canExchange(initial.me?.wallet?.available)) return;
  const d = dialog('포인트 교환하기', '<div data-coupon-content></div>');
  d.classList.add('coupon-dialog');
  const body = d.querySelector('[data-coupon-content]');
  let product = null, challenge = null, phone = '', busy = false, step = 'products';
  const current = () => d.isConnected && d.open && getState().user?.id === owner && getState().accountKey === accountKey && getState().access === 'allowed';
  const live = () => current() && requireSession();
  const notice = '<p class="coupon-test-note">테스트 모드 · 문자 발송, 실제 포인트 차감 및 쿠폰 발급은 진행되지 않아요.</p>';
  function render() {
    if (!current()) { d.close(); return; }
    if (step === 'products') body.innerHTML = `<p class="coupon-intro">보유 ${points(getState().me.wallet.available)} · 1P = 1원</p><div class="coupon-products" role="group" aria-label="교환 상품">${couponProducts.map(item => `<button type="button" class="coupon-product" data-product="${item.id}" aria-pressed="${product === item}"><img src="assets/rewards/${item.image}" alt="${esc(item.name)} 상품 이미지" width="64" height="64"><span><small>${esc(item.brand)}</small><strong>${esc(item.name)}</strong><b>${points(item.cost)}</b></span><span class="coupon-selection" aria-hidden="true">${product === item ? '✓' : ''}</span></button>`).join('')}</div>${notice}<button type="button" class="app-button primary coupon-next" data-coupon-next ${product ? '' : 'disabled'}>${product ? points(product.cost) + ' · 교환하기' : '상품을 선택해주세요'}</button>`;
    else if (step === 'phone') body.innerHTML = `<button type="button" class="text-button" data-coupon-back>← 상품 다시 선택</button><h3>전화번호 인증이 필요해요</h3><p class="coupon-intro">${esc(product.name)}<br>쿠폰을 받을 휴대폰 번호를 입력해주세요.</p><form class="online-form" data-coupon-phone><label>휴대폰 번호<input name="phone" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="010-1234-5678" maxlength="13" required value="${esc(phone)}"></label>${notice}<p role="status" class="coupon-error"></p><button type="submit" class="app-button primary">테스트 인증번호 요청</button></form>`;
    else if (step === 'code') body.innerHTML = `<button type="button" class="text-button" data-coupon-change>← 번호 수정</button><h3>인증번호를 입력해주세요</h3><p class="coupon-intro">${esc(phone)}<br>테스트에서는 아무 숫자나 입력하면 통과해요.</p><form class="online-form" data-coupon-code><label>테스트 인증번호<input name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]+" maxlength="12" required placeholder="예: 123456"></label>${notice}<p role="status" class="coupon-error"></p><button type="submit" class="app-button primary">인증하고 테스트 교환</button><button type="button" class="text-button" data-coupon-resend>테스트 인증번호 다시 요청</button></form>`;
    body.querySelector('input')?.focus();
  }
  const showError = error => { if (current()) { const node = body.querySelector('[role="status"]'); if (node) node.textContent = error.message; } };
  async function run(work) {
    if (busy || !live()) return;
    busy = true;
    body.querySelectorAll('button,input').forEach(node => { node.disabled = true; });
    try { await work(); } catch (error) { showError(error); }
    finally { busy = false; if (current()) body.querySelectorAll('button,input').forEach(node => { node.disabled = false; }); }
  }
  d.addEventListener('click', event => {
    const target = event.target.closest('button');
    if (!target || busy || !current()) return;
    if (target.dataset.product) { product = couponProducts.find(item => item.id === target.dataset.product); render(); body.querySelector(`[data-product="${product.id}"]`)?.focus(); }
    if (target.hasAttribute('data-coupon-next') && product) { step = 'phone'; render(); }
    if (target.hasAttribute('data-coupon-back')) { step = 'products'; challenge = null; render(); }
    if (target.hasAttribute('data-coupon-change')) { step = 'phone'; challenge = null; render(); }
    if (target.hasAttribute('data-coupon-resend')) void run(async () => { challenge = await testCouponAdapter.requestCode(phone); if (current()) body.querySelector('[role="status"]').textContent = '다시 요청했어요. 아무 숫자나 입력해주세요. (문자 발송 없음)'; });
    if (target.hasAttribute('data-coupon-done')) d.close();
  });
  d.addEventListener('submit', event => {
    const form = event.target;
    if (!form.matches('[data-coupon-phone],[data-coupon-code]')) return;
    event.preventDefault();
    const value = form.elements[form.hasAttribute('data-coupon-phone') ? 'phone' : 'code'].value;
    void run(async () => {
      if (step === 'phone') {
        phone = normalizePhone(value);
        challenge = await testCouponAdapter.requestCode(phone);
        if (current()) { step = 'code'; render(); }
      } else if (step === 'code') {
        const verification = await testCouponAdapter.verifyCode(challenge, value);
        if (!live()) return;
        const receipt = await testCouponAdapter.redeem({ owner, product, verification, balance: getState().me?.wallet?.available });
        if (!current()) return;
        step = 'done'; challenge = null; phone = '';
        body.innerHTML = `<div class="coupon-complete"><span aria-hidden="true">✓</span><h3>테스트 교환을 완료했어요</h3><strong>${esc(product.name)}</strong><p>${esc(receipt.phone)}</p>${notice}<p>보상 메뉴의 테스트 교환 내역에서 확인할 수 있어요.</p><button type="button" class="app-button primary" data-coupon-done>확인</button></div>`;
        body.querySelector('button').focus();
        onComplete?.();
      }
    });
  });
  const closeIfStale = () => { if (!current()) d.close(); };
  window.addEventListener('service-session', closeIfStale);
  d.addEventListener('close', () => { phone = ''; challenge = null; window.removeEventListener('service-session', closeIfStale); }, { once: true });
  render();
}
