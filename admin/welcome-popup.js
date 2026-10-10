import { openWelcomePopupPreview } from '../app/welcome-popup.js';

const routes = [['#education', '촬영 교육·점검'], ['#missions', '촬영 활동'], ['#ranking', '랭킹'], ['#home', '앱 홈'], ['#announcements', '운영 안내'], ['#support', '문의·도움'], ['#estimate', '포인트 계산'], ['#profile', '프로필'], ['#settings', '설정']];
const toLocal = value => { if (!value) return ''; const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

export async function mountWelcomePopupSettings(container, { api }) {
  container.classList.add('admin-welcome-popup');
  container.innerHTML = '<h2>로그인 후 팝업</h2><p role="status">팝업 설정을 불러오고 있습니다.</p>';
  let saved;
  try { saved = (await api('/admin/welcome-popup')).popup; }
  catch (error) { if (container.isConnected) container.querySelector('[role=status]').textContent = error.message; return; }
  if (!container.isConnected) return;
  container.innerHTML = '<h2>로그인 후 팝업</h2><p class="admin-info-line">가입 안내나 공지를 로그인한 참여자에게 표시합니다. 저장하면 새 버전으로 표시 횟수가 다시 시작됩니다.</p><form class="online-form"><label class="online-check"><input type="checkbox" name="enabled">팝업 사용</label><label>제목<input name="title" required maxlength="100"></label><label>내용<textarea name="body" required maxlength="1600" rows="4"></textarea></label><div class="admin-popup-field-row"><label>이미지 주소<input name="imageUrl" maxlength="2048" placeholder="/app/icons/symbol.svg 또는 HTTPS 이미지 주소"></label><label>이미지 설명<input name="imageAlt" maxlength="120"></label></div><p class="admin-info-line">주소를 비우면 이미지 없이 표시됩니다. 파일 업로드 대신 공개 이미지 주소를 입력하세요.</p><div class="admin-popup-field-row"><label>이동 버튼 문구<input name="ctaLabel" required maxlength="40"></label><label>이동할 앱 화면<select name="ctaPath"></select></label><label>닫기 문구<input name="closeLabel" required maxlength="40"></label></div><label>노출 빈도<select name="frequency"><option value="once">계정마다 한 번 · 현재 버전</option><option value="daily">하루 한 번 · 한국 시간</option><option value="session">로그인 세션마다 한 번</option></select></label><div class="admin-popup-field-row"><label>시작일 · 이 기기의 시간<input type="datetime-local" name="startsAt"></label><label>종료일 · 이 기기의 시간<input type="datetime-local" name="endsAt"></label></div><p class="admin-info-line">기간을 비우면 해당 날짜 제한 없이 표시합니다. 종료 시각부터는 표시하지 않습니다.</p><p class="online-status" role="status" aria-live="polite"></p><div class="admin-popup-actions"><button type="button" class="button" data-popup-preview>미리보기</button><button type="submit" class="button primary">팝업 저장</button></div></form>';
  const form = container.querySelector('form'), status = form.querySelector('[role=status]');
  const choices = routes.slice();
  if (!choices.some(([route]) => route === saved.ctaPath)) choices.push([saved.ctaPath, saved.ctaPath]);
  for (const [value, label] of choices) form.elements.ctaPath.add(new Option(label, value));
  const populate = value => {
    for (const name of ['title', 'body', 'imageUrl', 'imageAlt', 'ctaLabel', 'ctaPath', 'closeLabel', 'frequency']) form.elements[name].value = value[name] || '';
    form.elements.enabled.checked = value.enabled;
    for (const name of ['startsAt', 'endsAt']) form.elements[name].value = toLocal(value[name]);
  };
  const read = () => {
    const value = Object.fromEntries(new FormData(form));
    value.enabled = form.elements.enabled.checked;
    value.version = saved.version;
    for (const name of ['startsAt', 'endsAt']) value[name] = value[name] ? new Date(value[name]).toISOString() : null;
    return value;
  };
  populate(saved);
  form.querySelector('[data-popup-preview]').onclick = () => { if (form.reportValidity()) openWelcomePopupPreview(read()); };
  form.onsubmit = async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const buttons = [...form.querySelectorAll('button')];
    buttons.forEach(button => { button.disabled = true; });
    status.textContent = '저장하고 있습니다.';
    try {
      const result = await api('/admin/welcome-popup', { method: 'PATCH', body: read() });
      if (!container.isConnected) return;
      saved = result.popup; populate(saved); status.textContent = `팝업을 저장했습니다. 버전 ${saved.version}`;
    } catch (error) { if (container.isConnected) status.textContent = error.message; }
    finally { buttons.forEach(button => { button.disabled = false; }); }
  };
}
