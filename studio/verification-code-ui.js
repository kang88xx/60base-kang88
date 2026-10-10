// Presentation only. Delivery, verification, and authenticated session creation
// belong to the caller's real server integration; this module never performs them.
// SMS/email delivery is undecided (2026-10-11): no app login route imports this UI.
// Contract: onVerify(code,{signal}) -> {verified:true,...serverResult}; then
// onVerified(result,{signal}) must fulfill before any completion text appears.
// onResend({signal}) -> {expiresAt,resendAvailableAt,message?} using server deadlines.
// The caller must destroy() the view when the challenge/account/screen changes.
export function mountVerificationCode(container, {
  length = 6,
  title = '인증번호를 입력해주세요',
  description = '전달받은 인증번호를 입력해 주세요.',
  expiresAt = Date.now() + 180000,
  resendAvailableAt = Date.now() + 30000,
  onVerify,
  onResend,
  onVerified,
} = {}) {
  if (!(container instanceof Element)) throw new TypeError('A verification container is required.');
  if (!Number.isInteger(length) || length < 4 || length > 8) throw new TypeError('Code length must be 4–8 digits.');
  if (![onVerify, onResend, onVerified].every(callback => typeof callback === 'function')) throw new TypeError('onVerify, onResend, and onVerified callbacks are required.');
  if (![expiresAt, resendAvailableAt].every(Number.isFinite)) throw new TypeError('Verification deadlines must be timestamps.');

  const element = document.createElement('section'), id = 'verification-' + crypto.randomUUID();
  element.className = 'verification-card';
  element.setAttribute('aria-labelledby', id + '-title');
  element.innerHTML = `<img class="verification-symbol" src="/app/icons/symbol.svg" alt="" width="76" height="80">
    <h1 id="${id}-title"></h1><p class="verification-description" id="${id}-description"></p>
    <form novalidate><label class="verification-sr-only" for="${id}-input">${length}자리 인증번호</label>
      <div class="verification-entry"><div class="verification-cells" aria-hidden="true"></div>
        <input id="${id}-input" name="verification-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="${length}" pattern="[0-9]{${length}}" spellcheck="false" autocapitalize="off" aria-describedby="${id}-description ${id}-status"></div>
      <p class="verification-time" role="timer" aria-live="off"></p>
      <p class="verification-status" id="${id}-status" role="status" aria-live="polite"></p>
      <button class="verification-submit" type="submit">인증번호 확인</button>
    </form><div class="verification-resend"><span>인증번호를 받지 못하셨나요?</span><button type="button">다시 받기</button></div>`;
  element.querySelector('h1').textContent = title;
  element.querySelector('.verification-description').textContent = description;
  const form = element.querySelector('form'), input = element.querySelector('input');
  const cells = element.querySelector('.verification-cells'), timer = element.querySelector('.verification-time');
  const status = element.querySelector('.verification-status'), submit = element.querySelector('.verification-submit'), resend = element.querySelector('.verification-resend button');
  cells.style.setProperty('--verification-length', String(length));
  for (let index = 0; index < length; index++) cells.append(document.createElement('span'));
  let busy = '', verified = false, destroyed = false, expiredAnnounced = false, request;
  const events = new AbortController();
  const digits = value => String(value).normalize('NFKC').replace(/[^0-9]/g, '').slice(0, length);
  const message = (text, error = false) => {
    status.textContent = text;
    status.dataset.error = String(error);
    input.setAttribute('aria-invalid', String(error));
  };
  const current = controller => !destroyed && request === controller && !controller.signal.aborted;
  function render() {
    if (destroyed) return;
    const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    const cooldown = Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1000));
    const active = Math.min(input.selectionStart ?? input.value.length, length - 1);
    [...cells.children].forEach((cell, index) => {
      cell.textContent = input.value[index] || '';
      cell.classList.toggle('is-filled', !!input.value[index]);
      cell.classList.toggle('is-active', document.activeElement === input && active === index);
    });
    element.dataset.state = verified ? 'verified' : busy || (remaining ? 'ready' : 'expired');
    input.readOnly = !!busy || verified || remaining === 0;
    submit.disabled = !!busy || verified || remaining === 0 || input.value.length !== length;
    submit.textContent = verified ? '인증 완료' : busy === 'verifying' ? '확인하고 있어요…' : '인증번호 확인';
    submit.setAttribute('aria-busy', String(busy === 'verifying'));
    resend.disabled = !!busy || verified || cooldown > 0;
    resend.textContent = busy === 'resending' ? '요청하고 있어요…' : cooldown ? `다시 받기 (${cooldown}초)` : '다시 받기';
    timer.textContent = verified ? '' : `남은 시간 ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
    if (!remaining && !verified && !busy && !expiredAnnounced) {
      expiredAnnounced = true;
      message('입력 시간이 지났어요. 인증번호를 다시 받아주세요.', true);
    }
  }
  function entered() {
    const caret = input.selectionStart ?? input.value.length;
    input.value = digits(input.value);
    input.setSelectionRange(Math.min(caret, input.value.length), Math.min(caret, input.value.length));
    if (!verified && expiresAt > Date.now()) message('');
    render();
  }
  input.addEventListener('input', entered, { signal: events.signal });
  input.addEventListener('paste', event => {
    if (input.readOnly) return;
    event.preventDefault();
    const text = digits(event.clipboardData?.getData('text') || '');
    if (text.length === length) input.value = text;
    else input.setRangeText(text, input.selectionStart, input.selectionEnd, 'end');
    input.value = digits(input.value);
    input.setSelectionRange(input.value.length, input.value.length);
    entered();
  }, { signal: events.signal });
  for (const event of ['focus', 'blur', 'keyup', 'click', 'select']) input.addEventListener(event, render, { signal: events.signal });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || verified || input.value.length !== length || expiresAt <= Date.now()) return render();
    const controller = request = new AbortController(), code = input.value;
    busy = 'verifying'; message(''); render();
    try {
      const result = await onVerify(code, { signal: controller.signal });
      if (!current(controller)) return;
      if (result?.verified !== true) throw Error(result?.message || '인증 결과를 확인하지 못했어요. 다시 확인해주세요.');
      // Completion requires both a positive verifier result and the caller's
      // successful completion callback. No local code can bypass verification.
      await onVerified(result, { signal: controller.signal });
      if (!current(controller)) return;
      verified = true; input.value = ''; message('인증이 완료됐어요.');
    } catch (error) {
      if (!current(controller)) return;
      message(error?.message || '확인 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.', true);
      input.focus(); input.select();
    } finally {
      if (current(controller)) { busy = ''; render(); }
    }
  }, { signal: events.signal });
  resend.addEventListener('click', async () => {
    if (busy || verified || resendAvailableAt > Date.now()) return;
    const controller = request = new AbortController();
    busy = 'resending'; message(''); render();
    try {
      const result = await onResend({ signal: controller.signal });
      if (!current(controller)) return;
      if (!Number.isFinite(result?.expiresAt) || result.expiresAt <= Date.now() || !Number.isFinite(result?.resendAvailableAt)) throw Error('재전송 결과를 확인하지 못했어요. 잠시 후 다시 시도해주세요.');
      expiresAt = result.expiresAt; resendAvailableAt = result.resendAvailableAt;
      input.value = ''; expiredAnnounced = false;
      message(result.message || '새 인증번호를 요청했어요. 전달된 번호를 확인해주세요.');
      input.focus();
    } catch (error) { if (current(controller)) message(error?.message || '재전송하지 못했어요. 잠시 후 다시 시도해주세요.', true); }
    finally { if (current(controller)) { busy = ''; render(); } }
  }, { signal: events.signal });
  container.append(element);
  render();
  const interval = setInterval(render, 1000);
  return {
    element,
    focus: () => input.focus(),
    destroy() { destroyed = true; request?.abort(); events.abort(); clearInterval(interval); input.value = ''; element.remove(); },
  };
}
