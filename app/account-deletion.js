import { api, session, sessionEpoch, sessionReady, refreshSession, dialog, esc, date } from '../studio/online-api.js';
import { showAccountEntry } from '../studio/online.js';

const statusNames = { pending: '삭제 요청 접수', processing: '삭제 처리 중', blocked: '처리 확인 중', completed: '삭제 완료' };
const receiptKey = 'husuabi.deletion-receipt.v1';
const deadlineText = '삭제 요청 후 7일 이내에 처리합니다.';
let memoryReceipt = null;
let memoryOnly = false;
function savedReceipt() {
  if (!memoryOnly) { try { memoryReceipt = JSON.parse(localStorage.getItem(receiptKey)); } catch {} }
  const value = memoryReceipt;
  return value && typeof value.owner === 'string' && typeof value.id === 'string' && /^[-_A-Za-z0-9]{43}$/.test(value.token) ? value : null;
}
function rememberReceipt(owner, value) {
  const saved = { owner, id: value.id, token: value.receiptToken };
  if (!/^[-_A-Za-z0-9]{43}$/.test(saved.token || '')) throw Error('삭제 처리 확인 정보를 받지 못했습니다. 다시 확인해주세요.');
  memoryReceipt = saved;
  try { localStorage.setItem(receiptKey, JSON.stringify(saved)); memoryOnly = false; } catch { memoryOnly = true; }
  window.dispatchEvent(new Event('deletion-receipt'));
  return saved;
}
function forgetReceipt(value) {
  if (savedReceipt()?.token !== value.token) return;
  memoryReceipt = null;
  memoryOnly = false;
  try { localStorage.removeItem(receiptKey); } catch {}
  window.dispatchEvent(new Event('deletion-receipt'));
}
window.addEventListener('storage', event => {
  if (event.storageArea === localStorage && (event.key === receiptKey || event.key === null)) {
    memoryReceipt = null;
    memoryOnly = false;
    window.dispatchEvent(new Event('deletion-receipt'));
  }
});
// Never expose the previous account's receipt when another account signs in.
window.addEventListener('service-session', () => {
  const saved = savedReceipt();
  if (saved && session.user && session.user.id !== saved.owner) forgetReceipt(saved);
});

async function showReceipt(saved, initial) {
  if (session.user && session.user.id !== saved.owner) return;
  // Only the minimal possession-authorized receipt survives logout. Other dialogs stay account-bound.
  const element = dialog('계정 삭제 처리 결과', '<p role="status">처리 결과를 확인하고 있습니다.</p>', { accountBound: false });
  const content = element.querySelector('.online-dialog-body');
  const active = () => element.isConnected && element.open && savedReceipt()?.token === saved.token && (!session.user || session.user.id === saved.owner);
  let loading = false;
  function render(value) {
    if (!active()) return;
    const complete = value.status === 'completed';
    const overdue = !complete && value.dueAt && Date.now() > Date.parse(value.dueAt);
    content.innerHTML = `<h3>${esc(statusNames[value.status] || '처리 상태 확인')}</h3><p>요청 번호: <strong>${esc(value.id)}</strong></p><p>접수일: ${esc(date(value.requestedAt))}<br>처리 기한: ${esc(date(value.dueAt))}</p><p>${complete ? `서비스에서 관리하는 계정과 관련 데이터의 삭제가 완료되었습니다.<br>완료일: ${esc(date(value.completedAt))}` : `${deadlineText} 아직 삭제가 완료된 것은 아닙니다. 인증 계정과 제출 영상, 개인정보의 처리 결과를 확인한 후 완료로 표시합니다.`}</p>${overdue ? '<p role="status">안내한 처리 기한이 지났으며 아직 완료되지 않았습니다. 운영팀에 요청 번호로 문의해주세요.</p>' : ''}${value.status === 'blocked' ? '<p>처리 과정에서 추가 확인이 필요합니다. 운영팀이 확인 후 다시 처리합니다.</p>' : ''}<p>${memoryOnly ? '이 기기에 확인 정보를 저장하지 못했습니다. 현재 열린 화면에서는 확인할 수 있지만, 화면을 닫거나 앱을 종료하면 확인 정보가 사라집니다. 요청 번호를 보관하고 운영팀에 문의해주세요.' : '로그아웃 후에도 이 기기의 같은 화면에서 처리 결과를 확인할 수 있습니다. 앱 삭제·저장 공간 초기화 또는 다른 계정 로그인 시 이 기기의 확인 정보가 없어질 수 있습니다.'}</p><p>기기에 따로 보관한 영상과 다운로드 파일은 직접 삭제해주세요. 별도 계약으로 제공된 사본이나 보관 예외의 처리 범위는 운영팀에 확인해주세요.</p><p><a href="mailto:60base.ai@gmail.com">60base.ai@gmail.com</a></p><p data-receipt-error role="status" aria-live="polite"></p><button type="button" class="button" data-deletion-refresh>처리 상태 새로고침</button>`;
    content.querySelector('[data-deletion-refresh]').onclick = () => void load();
  }
  async function load() {
    if (loading || !active()) return;
    loading = true;
    try {
      const result = await api('/account/deletion/receipt', { method: 'POST', body: { receiptToken: saved.token } });
      if (!active()) return;
      render(result.deletion);
      if (['processing', 'blocked', 'completed'].includes(result.deletion.status) && session.user?.id === saved.owner) await refreshSession();
    } catch (error) {
      if (!active()) return;
      const status = content.querySelector('[data-receipt-error]');
      if (status) status.textContent = error.message;
      else {
        content.innerHTML = `<p role="status">${esc(error.message)}</p><button type="button" class="button" data-retry>다시 확인하기</button>`;
        content.querySelector('[data-retry]').onclick = () => void load();
      }
    } finally { loading = false; }
  }
  const onSession = () => { if (session.user && session.user.id !== saved.owner) element.close(); };
  const onReceipt = () => { if (savedReceipt()?.token !== saved.token) element.close(); };
  window.addEventListener('service-session', onSession);
  window.addEventListener('deletion-receipt', onReceipt);
  const timer = setInterval(() => { if (!document.hidden) void load(); }, 15000);
  element.addEventListener('close', () => { clearInterval(timer); window.removeEventListener('service-session', onSession); window.removeEventListener('deletion-receipt', onReceipt); });
  if (initial) render(initial);
  await load();
}

export async function openAccountDeletion() {
  await sessionReady;
  const saved = savedReceipt();
  if (saved && (!session.user || session.user.id === saved.owner)) return showReceipt(saved);
  if (!session.online || !session.user) {
    await showAccountEntry({ returnTo: location.hash || '#profile' });
    return;
  }
  const owner = session.user.id, epoch = sessionEpoch;
  const current = () => owner === session.user?.id && epoch === sessionEpoch;
  const element = dialog('계정과 데이터 삭제', '<p role="status">삭제 요청 상태를 확인하고 있습니다.</p>');
  const content = element.querySelector('.online-dialog-body');
  const active = () => element.isConnected && element.open && current();
  async function receipt(value) {
    // Older requests gain a receipt credential through the same idempotent, authenticated request.
    if (!value.receiptToken) value = (await api('/account/deletion', { method: 'POST', body: { confirm: 'DELETE' } })).deletion;
    if (!active()) return;
    const saved = rememberReceipt(owner, value);
    element.close();
    await showReceipt(saved, value);
  }
  function form() {
    content.innerHTML = `<p><strong>${esc(session.user.email)}</strong> 계정의 삭제를 요청합니다.</p><p><strong>${deadlineText}</strong> 접수 후 이 화면에서 처리 상태와 실제 완료일을 확인할 수 있습니다.</p><ul><li>로그인 계정, 가입 정보, 제출 영상과 관련 개인정보가 삭제 대상입니다.</li><li>계정 삭제가 완료되면 제출 내역과 포인트를 복구할 수 없습니다.</li><li>이 기기의 보관 영상과 이미 내려받은 파일은 따로 삭제해야 합니다.</li><li>별도 계약으로 제공된 데이터와 보관 예외가 있으면 처리 범위를 확인합니다.</li></ul><form class="online-form" data-deletion-form><label class="online-check"><input type="checkbox" name="confirm" required>삭제 대상과 복구할 수 없다는 점을 확인했습니다.</label><p role="status" aria-live="polite"></p><button type="submit" class="button">계정과 데이터 삭제 요청</button></form>`;
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
        await receipt(result.deletion);
      } catch (error) {
        if (active()) form.querySelector('[role=status]').textContent = error.message;
      } finally { if (form.isConnected) button.disabled = false; }
    });
  }
  async function load() {
    try {
      const result = await api('/account/deletion');
      if (!active()) return;
      result.deletion ? await receipt(result.deletion) : form();
    } catch (error) {
      if (!active()) return;
      content.innerHTML = `<p role="status">${esc(error.message)}</p><button type="button" class="button" data-retry>다시 확인하기</button>`;
      content.querySelector('[data-retry]').onclick = () => void load();
    }
  }
  await load();
}

export function mountDeletionPage(button, status) {
  function render() {
    const saved = savedReceipt();
    const canView = saved && (!session.user || saved.owner === session.user.id);
    button.disabled = !canView && !session.online;
    button.textContent = canView ? '삭제 처리 결과 확인' : session.user ? '계정과 데이터 삭제 요청' : '로그인하고 삭제 요청';
    status.textContent = canView ? (memoryOnly ? '확인 정보가 저장되지 않았습니다. 화면을 닫기 전에 요청 번호를 보관해주세요.' : '이 기기에서 접수한 삭제 요청은 로그인 없이 처리 결과를 확인할 수 있습니다.') : session.online ? (session.user ? '로그인한 본인 계정의 삭제를 요청할 수 있습니다. ' + deadlineText : '계정 소유 확인을 위해 로그인해주세요. 앱 설치는 필요하지 않습니다.') : '서비스에 연결하지 못했습니다. 연결 후 다시 시도해주세요.';
  }
  button.addEventListener('click', () => { void openAccountDeletion().catch(error => { status.textContent = error.message; }); });
  window.addEventListener('service-session', render);
  window.addEventListener('deletion-receipt', render);
  void sessionReady.then(render);
}
