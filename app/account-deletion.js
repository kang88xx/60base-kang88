import { api, session, sessionEpoch, sessionReady, dialog, esc } from '../studio/online-api.js';
import { showAccountEntry } from '../studio/online.js';

const statusNames = { pending: '삭제 요청 접수', processing: '삭제 처리 중', blocked: '처리 확인 중', completed: '삭제 완료' };
export async function openAccountDeletion() {
  await sessionReady;
  if (!session.online || !session.user) {
    await showAccountEntry({ returnTo: location.hash || '#profile' });
    return;
  }
  const owner = session.user.id, epoch = sessionEpoch;
  const current = () => owner === session.user?.id && epoch === sessionEpoch;
  const element = dialog('계정과 데이터 삭제', '<p role="status">삭제 요청 상태를 확인하고 있습니다.</p>');
  const content = element.querySelector('.online-dialog-body');
  const active = () => element.isConnected && element.open && current();
  function receipt(value) {
    if (!active()) return;
    const complete = value.status === 'completed';
    content.innerHTML = `<h3>${esc(statusNames[value.status] || '처리 상태 확인')}</h3><p>요청 번호: <strong>${esc(value.id)}</strong></p><p>${complete ? '서버에서 계정과 관련 데이터의 삭제 완료를 확인했습니다.' : '삭제 요청이 접수되었습니다. 아직 삭제가 완료된 것은 아닙니다. 인증 계정과 제출 영상, 개인정보의 처리 결과를 확인한 후 완료됩니다.'}</p><p>이 기기에 따로 저장한 영상과 다운로드 파일은 자동으로 삭제되지 않습니다. 필요한 파일은 직접 정리해주세요.</p>${complete ? '' : '<button type="button" class="button" data-deletion-refresh>처리 상태 새로고침</button>'}`;
    content.querySelector('[data-deletion-refresh]')?.addEventListener('click', () => void load());
  }
  function form() {
    content.innerHTML = `<p><strong>${esc(session.user.email)}</strong> 계정의 삭제를 요청합니다.</p><ul><li>로그인 계정, 가입 정보, 제출 영상과 관련 개인정보가 삭제 대상입니다.</li><li>계정 삭제가 완료되면 제출 내역과 포인트를 복구할 수 없습니다.</li><li>이 기기의 보관 영상과 이미 내려받은 파일은 따로 삭제해야 합니다.</li><li>별도 계약으로 제공된 데이터와 보관 예외가 있으면 처리 범위를 확인합니다.</li></ul><form class="online-form" data-deletion-form><label class="online-check"><input type="checkbox" name="confirm" required>삭제 대상과 복구할 수 없다는 점을 확인했습니다.</label><p role="status" aria-live="polite"></p><button type="submit" class="button">계정과 데이터 삭제 요청</button></form>`;
    const form = content.querySelector('form');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!active() || !form.elements.confirm.checked) return;
      const button = form.querySelector('[type=submit]');
      if (button.disabled) return;
      button.disabled = true;
      try {
        const result = await api('/account/deletion', { method: 'POST', body: { confirm: 'DELETE' } });
        if (!result.deletion?.id) throw Error('삭제 접수를 확인하지 못했습니다. 처리 상태를 다시 확인해주세요.');
        receipt(result.deletion);
      } catch (error) {
        if (active()) form.querySelector('[role=status]').textContent = error.message;
      } finally { if (form.isConnected) button.disabled = false; }
    });
  }
  async function load() {
    try {
      const result = await api('/account/deletion');
      if (!active()) return;
      result.deletion ? receipt(result.deletion) : form();
    } catch (error) {
      if (!active()) return;
      content.innerHTML = `<p role="status">${esc(error.message)}</p><button type="button" class="button" data-retry>다시 확인하기</button>`;
      content.querySelector('[data-retry]').onclick = () => void load();
    }
  }
  await load();
}

// Public web entry works independently of whether the mobile app is installed.
export function mountDeletionPage(button, status) {
  function render() {
    button.disabled = !session.online;
    button.textContent = session.user ? '계정과 데이터 삭제 요청' : '로그인하고 삭제 요청';
    status.textContent = session.online ? (session.user ? '로그인한 본인 계정의 삭제를 요청할 수 있습니다.' : '계정 소유 확인을 위해 로그인해주세요. 앱 설치는 필요하지 않습니다.') : '서비스에 연결하지 못했습니다. 연결 후 다시 시도해주세요.';
  }
  button.addEventListener('click', () => { void openAccountDeletion().catch(error => { status.textContent = error.message; }); });
  window.addEventListener('service-session', render);
  void sessionReady.then(render);
}
