import { openWelcomePopupPreview } from '../app/welcome-popup.js';

const routes = [['#education', '촬영 교육·점검'], ['#missions', '촬영 활동'], ['#ranking', '랭킹'], ['#home', '앱 홈'], ['#announcements', '공지사항'], ['#support', '문의·도움'], ['#estimate', '포인트 계산'], ['#profile', '프로필'], ['#settings', '설정']];
const toLocal = value => { if (!value) return ''; const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

export async function mountWelcomePopupSettings(container, { api }) {
  container.classList.add('admin-welcome-popup');
  container.innerHTML = '<h2>로그인 후 팝업</h2><p role="status">팝업 설정을 불러오고 있습니다.</p>';
  let saved;
  try { saved = (await api('/admin/welcome-popup')).popup; }
  catch (error) { if (container.isConnected) container.querySelector('[role=status]').textContent = error.message; return; }
  if (!container.isConnected) return;
  container.innerHTML = '<h2>로그인 후 팝업</h2><p class="admin-info-line">가입 안내나 공지를 로그인한 참여자에게 표시합니다. 저장하면 새 버전으로 표시 횟수가 다시 시작됩니다.</p><form class="online-form" novalidate><label class="online-check"><input type="checkbox" name="enabled">팝업 사용</label><label>제목<input name="title" required maxlength="100"></label><label>내용<textarea name="body" required maxlength="1600" rows="4"></textarea></label><div class="admin-popup-field-row"><label>이미지 주소<input name="imageUrl" maxlength="2048" placeholder="/app/icons/symbol.svg 또는 HTTPS 이미지 주소"></label><label>이미지 설명<input name="imageAlt" maxlength="120" aria-describedby="admin-popup-image-help"></label></div><label class="online-check"><input type="checkbox" name="imageDecorative">장식 이미지 · 본문과 별도로 전달하는 정보 없음</label><p class="admin-info-line" id="admin-popup-image-help">정보를 전달하는 이미지는 핵심 내용을 설명에 적어주세요. 장식 이미지는 화면 읽기 프로그램에서 건너뜁니다. 주소를 비우면 이미지 없이 표시됩니다.</p><div class="admin-popup-field-row"><label>이동 버튼 문구<input name="ctaLabel" required maxlength="40"></label><label>이동할 앱 화면<select name="ctaPath"></select></label><label>닫기 문구<input name="closeLabel" required maxlength="40"></label></div><label>노출 빈도<select name="frequency"><option value="once">계정마다 한 번 · 현재 버전</option><option value="daily">하루 한 번 · 한국 시간</option><option value="session">로그인 세션마다 한 번</option></select></label><div class="admin-popup-field-row"><label>시작일 · 이 기기의 시간<input type="datetime-local" name="startsAt"></label><label>종료일 · 이 기기의 시간<input type="datetime-local" name="endsAt"></label></div><p class="admin-info-line">기간을 비우면 해당 날짜 제한 없이 표시합니다. 종료 시각부터는 표시하지 않습니다.</p><p class="online-status" role="status" aria-live="polite"></p><p class="admin-popup-save-note" id="admin-popup-save-note">저장하면 새 버전이 되어 표시 횟수가 다시 시작됩니다. 이미 본 참여자에게도 선택한 빈도와 기간에 따라 다시 표시될 수 있습니다.</p><div class="admin-popup-actions"><button type="button" class="button" data-popup-preview>미리보기</button><button type="submit" class="button primary" aria-describedby="admin-popup-save-note">팝업 저장</button></div></form>';
  const form = container.querySelector('form'), status = form.querySelector('[role=status]');
  const choices = routes.slice();
  if (!choices.some(([route]) => route === saved.ctaPath)) choices.push([saved.ctaPath, saved.ctaPath]);
  for (const [value, label] of choices) form.elements.ctaPath.add(new Option(label, value));
  const syncImage = () => {
    const informative = Boolean(form.elements.imageUrl.value.trim()) && !form.elements.imageDecorative.checked;
    form.elements.imageAlt.disabled = !informative;
    form.elements.imageAlt.required = form.elements.enabled.checked && informative;
    form.elements.imageAlt.setCustomValidity('');
    form.elements.imageAlt.removeAttribute('aria-invalid');
  };
  const validate = () => {
    syncImage();
    if (form.elements.imageAlt.required && !form.elements.imageAlt.value.trim()) {
      form.elements.imageAlt.setCustomValidity('정보를 전달하는 이미지의 핵심 내용을 설명해주세요.');
      form.elements.imageAlt.setAttribute('aria-invalid', 'true');
    }
    return form.reportValidity();
  };
  for (const name of ['enabled', 'imageUrl', 'imageAlt', 'imageDecorative']) form.elements[name].addEventListener('input', syncImage);
  const populate = value => {
    for (const name of ['title', 'body', 'imageUrl', 'imageAlt', 'ctaLabel', 'ctaPath', 'closeLabel', 'frequency']) form.elements[name].value = value[name] || '';
    form.elements.enabled.checked = value.enabled;
    form.elements.imageDecorative.checked = !value.imageAlt?.trim();
    syncImage();
    for (const name of ['startsAt', 'endsAt']) form.elements[name].value = toLocal(value[name]);
  };
  const read = () => {
    const value = Object.fromEntries(new FormData(form));
    value.enabled = form.elements.enabled.checked;
    value.imageAlt = form.elements.imageDecorative.checked || !value.imageUrl?.trim() ? '' : form.elements.imageAlt.value.trim();
    delete value.imageDecorative;
    value.version = saved.version;
    for (const name of ['startsAt', 'endsAt']) value[name] = value[name] ? new Date(value[name]).toISOString() : null;
    return value;
  };
  populate(saved);
  form.querySelector('[data-popup-preview]').onclick = () => { if (validate()) openWelcomePopupPreview(read()); };
  form.onsubmit = async event => {
    event.preventDefault();
    if (!validate()) return;
    const buttons = [...form.querySelectorAll('button')];
    buttons.forEach(button => { button.disabled = true; });
    status.textContent = '저장하고 있습니다.';
    try {
      const result = await api('/admin/welcome-popup', { method: 'PATCH', body: read() });
      if (!container.isConnected) return;
      saved = result.popup; populate(saved); status.textContent = `팝업을 저장했습니다. 버전 ${saved.version} · 이미 본 참여자에게도 노출 조건에 따라 다시 표시될 수 있습니다.`;
    } catch (error) { if (container.isConnected) status.textContent = error.message; }
    finally { buttons.forEach(button => { button.disabled = false; }); }
  };
}
