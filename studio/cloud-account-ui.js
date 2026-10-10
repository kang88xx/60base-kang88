import { getCloudAccount, subscribeCloudAccount, continueWithGoogle, continueWithApple, appleSignInEnabled, completeRegistration, signOutCloudAccount, retryCloudAccount } from './cloud-account.js';
import { dialog, esc } from './online-api.js';

const errorMessages = {
  'auth/popup-closed-by-user': '로그인 창이 닫혔습니다. 다시 시도해주세요.',
  'auth/cancelled-popup-request': '이미 열린 로그인 창에서 계속해주세요.',
  'auth/popup-blocked': '로그인 팝업이 차단되었습니다. 이 사이트의 팝업을 허용한 뒤 다시 눌러주세요.',
  'auth/network-request-failed': '네트워크 연결을 확인한 뒤 다시 시도해주세요.',
  'auth/unauthorized-domain': '이 주소의 로그인을 준비하고 있습니다. 잠시 후 다시 확인해주세요.',
  'auth/operation-not-allowed': '로그인을 준비하고 있습니다. 잠시 후 다시 확인해주세요.',
  'auth/account-exists-with-different-credential': '다른 방식으로 가입된 계정입니다. 운영 이메일로 문의해주세요.',
  'auth/web-storage-unsupported': '로그인 상태를 저장할 수 없습니다. 브라우저의 사이트 저장 설정을 확인해주세요.',
  'auth/user-disabled': '이 계정은 이용이 중지되었습니다. 운영 이메일로 문의해주세요.',
  'permission-denied': '회원 정보를 확인하지 못했습니다. 다시 시도하거나 운영 이메일로 문의해주세요.',
  'unavailable': '회원 정보를 저장하는 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.',
  'cloud/consent-required': '필수 확인 항목을 모두 선택해주세요.',
  'cloud/invalid-name': '이름을 1~60자로 입력해주세요.',
  'cloud/google-identity-required': '이메일 확인이 완료된 Google 또는 Apple 계정으로 다시 로그인해주세요.',
  'cloud/apple-unconfigured': 'Apple 로그인을 준비하고 있습니다.',
  'cloud/native-auth-unavailable': '앱 로그인을 준비하고 있습니다. 웹에서 계속해주세요.',
  'cloud/invalid-registration': '회원 정보를 확인해야 합니다. 운영 이메일로 문의해주세요.',
  'cloud/account-changed': '로그인 계정이 변경되었습니다. 현재 계정을 확인하고 다시 진행해주세요.',
};
const messageFor = error => errorMessages[error?.code] || '계정 서비스에 연결하지 못했습니다. 다시 시도해주세요.';
const support = '<a href="mailto:60base.ai@gmail.com">60base.ai@gmail.com</a>';
let openDialog;

const busyLine = text => `<p class="cloud-progress-line" role="status" aria-live="polite"><span class="cloud-inline-spinner" aria-hidden="true"></span><span>${text}</span></p>`;

export function cloudDisplayName() {
  const account = getCloudAccount();
  return account.registration?.displayName || account.user?.displayName || '';
}

export function showCloudAccount({returnTo, provider} = {}) {
  if (openDialog?.isConnected) { if(returnTo)openDialog.dataset.returnTo=returnTo;openDialog.focus();if(provider)openDialog.dispatchEvent(new CustomEvent('cloud-provider-entry',{detail:provider}));return openDialog; }
  const inApp = !!document.querySelector('#app-shell');
  const element = dialog(inApp?'에고 계정':'60BASE 계정', '<div data-cloud-content></div>');
  element.id = 'cloud-account-dialog';
  element.classList.add('cloud-account-dialog');
  if(inApp)element.classList.add('ego-form-sheet','ego-auth-sheet');
  if(returnTo)element.dataset.returnTo=returnTo;
  openDialog = element;
  const content = element.querySelector('[data-cloud-content]');
  let renderedKey = '', localError = null, localStage = '', draft = null;

  function startProvider(selected) {
    const account=getCloudAccount();
    if(!['google','apple'].includes(selected)||account.busy||account.phase!=='signedOut')return;
    if(account.availability!=='ready')return;
    localError=null;localStage=selected;
    (selected==='apple'?continueWithApple():continueWithGoogle()).catch(error=>{localError=error;}).finally(()=>{localStage='';render(getCloudAccount());});
  }
  element.addEventListener('cloud-provider-entry',event=>startProvider(event.detail));

  function rememberDraft() {
    const form = content.querySelector('#cloud-registration-form');
    if (!form) return;
    draft = Object.fromEntries(new FormData(form));
  }
  function updateRegistrationButton(account = getCloudAccount()) {
    const form = content.querySelector('#cloud-registration-form');
    if (!form) return;
    const consentComplete = ['adult', 'terms', 'privacy'].every(name => form.elements[name].checked);
    form.querySelector('[type="submit"]').disabled = account.busy || !consentComplete;
  }
  function busyMessage(account) {
    if (!account.busy) return '';
    if (localStage === 'apple') return 'Apple 인증을 진행하고 있습니다.';
    if (localStage === 'google') return 'Google 인증을 진행하고 있습니다.';
    if (localStage === 'registration') return '가입 정보를 저장하고 있습니다.';
    if (account.availability === 'loading') return '계정 연결을 확인하고 있습니다.';
    if (account.phase === 'authenticated') return '계정 정보를 확인하고 있습니다.';
    return '계정 정보를 확인하고 있습니다.';
  }
  function render(account) {
    if (!element.isConnected) return;
    if(account.availability==='ready'&&account.phase==='registered'&&account.user&&element.dataset.returnTo){
      element.close();
      requestAnimationFrame(()=>{if(location.hash===element.dataset.returnTo)document.getElementById('workspace')?.focus({preventScroll:true});});
      return;
    }
    const key = [account.availability, account.phase, account.user?.uid || ''].join(':');
    if (key !== renderedKey) {
      localError = null;
      if (!renderedKey.endsWith(':' + (account.user?.uid || ''))) draft = null;
      else rememberDraft();
      renderedKey = key;
      if (account.availability === 'loading') {
        content.innerHTML = busyLine('계정 연결을 확인하고 있습니다.');
      } else if (account.availability === 'unconfigured') {
        content.innerHTML = `<p class="cloud-intro">Google 회원가입을 준비하고 있습니다.</p><p class="online-help">문의: ${support}</p>${inApp?'':'<a class="button primary" href="#missions" data-cloud-browse>촬영 활동 보기</a>'}`;
      } else if (account.availability === 'error') {
        content.innerHTML = `<p class="cloud-intro">로그인 연결을 확인해주세요.</p><p class="online-help">문의: ${support}</p><button type="button" class="button primary" data-cloud-retry>다시 연결하기</button>`;
      } else if (account.phase === 'signedOut') {
        content.innerHTML = `${inApp?'<div class="ego-auth-mark"><img src="/app/icons/symbol.svg" alt="" width="64" height="67"></div>':''}<h3>${inApp?'나의 일상을 담을 준비':'로그인 / 회원가입'}</h3><p class="cloud-intro">${appleSignInEnabled ? 'Google 또는 Apple 계정으로 계속하세요.' : 'Google 계정으로 계속하세요.'}</p><button type="button" class="cloud-google-button" data-google-signin><img src="../assets/brand/google-signin-g.png" alt="" width="20" height="20"><span>Google 계정으로 계속하기</span></button>${appleSignInEnabled ? '<button type="button" class="cloud-google-button" style="background:#000;color:#fff;border-color:#000;margin-top:12px" data-apple-signin><span>Apple로 계속하기</span></button>' : ''}`;
      } else if (account.phase === 'registrationRequired') {
        const name = draft?.displayName ?? account.user?.displayName ?? '';
        content.innerHTML = `<h3>회원가입</h3><div class="cloud-account-identity"><p class="cloud-email">${esc(account.user.email)}</p><button type="button" class="cloud-account-switch" data-cloud-signout>계정 변경</button></div><form class="online-form" id="cloud-registration-form"><label>이름<input name="displayName" value="${esc(name)}" required maxlength="60" autocomplete="name"></label><label class="online-check"><input type="checkbox" name="adult" required ${draft?.adult?'checked':''}>만 19세 이상입니다.</label><label class="online-check"><input type="checkbox" name="terms" required ${draft?.terms?'checked':''}><span><a href="/studio/terms.html" target="_blank" rel="noopener">이용약관</a>에 동의합니다.</span></label><label class="online-check"><input type="checkbox" name="privacy" required ${draft?.privacy?'checked':''}><span><a href="/studio/privacy.html" target="_blank" rel="noopener">로그인과 개인정보 처리 안내</a>를 확인했습니다.</span></label><button class="button primary" type="submit">가입 완료하기</button></form>`;
      } else if (account.phase === 'registered') {
        content.innerHTML = `<div class="cloud-registered" data-cloud-status="registered"><span class="cloud-check" aria-hidden="true">✓</span><h3>회원가입 완료</h3><strong>${esc(account.registration.displayName)}</strong><p class="cloud-email">${esc(account.user.email)}</p><p class="cloud-login-method">${account.user.provider === 'apple.com' ? '<span>Apple로 로그인됨</span>' : '<img src="../assets/brand/google-signin-g.png" alt="" width="18" height="18"><span>Google로 로그인됨</span>'}</p><a class="button primary" href="#guide" data-cloud-browse>촬영 교육 보기</a></div>`;
      } else {
        content.innerHTML = `<p class="cloud-intro">${account.busy?'회원 정보를 확인하고 있습니다.':'회원 정보를 다시 확인해주세요.'}</p>${account.user?`<p class="cloud-email">${esc(account.user.email)}</p>`:''}<button type="button" class="button" data-cloud-retry>다시 확인하기</button><button type="button" class="button" data-cloud-signout>로그아웃</button>`;
      }
      content.insertAdjacentHTML('beforeend', '<p class="online-status" data-cloud-error role="status" aria-live="polite"></p>');
      content.querySelector('[data-google-signin]')?.addEventListener('click', () => startProvider('google'));
      content.querySelector('[data-apple-signin]')?.addEventListener('click', () => startProvider('apple'));
      content.querySelector('[data-cloud-retry]')?.addEventListener('click', () => {
        localError = null;
        retryCloudAccount().catch(error => { localError = error; render(getCloudAccount()); });
      });
      content.querySelector('[data-cloud-signout]')?.addEventListener('click', () => {
        localError = null;
        signOutCloudAccount().catch(error => { localError = error; render(getCloudAccount()); });
      });
      content.querySelector('[data-cloud-browse]')?.addEventListener('click', () => element.close());
      const form = content.querySelector('#cloud-registration-form');
      form?.addEventListener('change', updateRegistrationButton);
      if (form) form.addEventListener('submit', event => {
        event.preventDefault();
        updateRegistrationButton();
        if (form.querySelector('[type="submit"]').disabled) return;
        localError = null;localStage = 'registration';rememberDraft();render({...getCloudAccount(),busy:true});
        completeRegistration({displayName:draft.displayName,adult:!!draft.adult,terms:!!draft.terms,privacy:!!draft.privacy}).catch(error => { localError = error; }).finally(() => { localStage = ''; render(getCloudAccount()); });
      });
    }
    if(account.phase==='authenticated'&&account.availability==='ready'){
      const intro=content.querySelector('.cloud-intro');if(intro)intro.textContent=account.busy?'회원 정보를 확인하고 있습니다.':'회원 정보를 다시 확인해주세요.';
    }
    content.querySelectorAll('button,input').forEach(button => {
      button.disabled = account.busy;
      button.setAttribute('aria-busy', String(account.busy));
    });
    const googleText = content.querySelector('[data-google-signin] span');
    if (googleText) googleText.textContent = account.busy && localStage === 'google' ? 'Google 인증 중…' : 'Google 계정으로 계속하기';
    const submit = content.querySelector('#cloud-registration-form [type="submit"]');
    if (submit) submit.textContent = account.busy && localStage === 'registration' ? '가입 정보 저장 중…' : '가입 완료하기';
    updateRegistrationButton(account);
    const error = localError || account.error;
    const status = content.querySelector('[data-cloud-error]');
    if (status) {
      status.dataset.error = String(!!error);
      const progress = !error ? busyMessage(account) : '';
      status.dataset.busy = String(!!progress);
      status.replaceChildren();
      if (error) status.textContent = messageFor(error);
      else if (progress) {
        const spinner = document.createElement('span');
        spinner.className = 'cloud-inline-spinner';
        spinner.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.textContent = progress;
        status.append(spinner, label);
      }
    }
    element.setAttribute('aria-busy', String(account.busy));
    element.dataset.cloudPhase = account.phase;
  }
  const unsubscribe = subscribeCloudAccount(render);
  element.addEventListener('close', () => { unsubscribe();openDialog = null; }, {once:true});
  if(provider)startProvider(provider);
  return element;
}
