import { choice, fail, integer, str } from './security.mjs';

export const DEFAULT_WELCOME_POPUP = Object.freeze({
  enabled: true,
  title: '첫 촬영을 준비해볼까요?',
  body: '촬영 가이드에서 구도와 주의사항을 확인해보세요. 준비가 끝나면 일상의 활동을 촬영할 수 있어요.',
  imageUrl: '/app/icons/symbol.svg',
  imageAlt: '에고 캐릭터',
  ctaLabel: '촬영 준비하기',
  ctaPath: '#education',
  closeLabel: '다음에 보기',
  frequency: 'once',
  startsAt: null,
  endsAt: null,
  version: 1,
  updatedAt: null,
});

const APP_ROUTE = /^#(?:home|missions|ranking|education|estimate|announcements|library|reviews|wallet|profile|settings|support|activity\/[a-z0-9-]{1,100}|guide\/[a-z0-9-]{1,100}\/[1-3])$/;
function imageAddress(value) {
  const address = str(value, '이미지 주소', 2048, 0);
  if (!address) return '';
  if (/[\u0000-\u0020\\]/.test(address)) fail(400, '이미지 주소를 확인해주세요.');
  let url;
  try { url = new URL(address, 'https://60base.ai'); } catch { fail(400, '이미지 주소를 확인해주세요.'); }
  if (url.protocol !== 'https:' || url.username || url.password || address.startsWith('//')) fail(400, 'HTTPS 이미지 주소 또는 앱의 공개 이미지 경로를 사용해주세요.');
  if (!/^https:\/\//i.test(address) && (!/^\/(?:app|assets)\//.test(address) || !/^\/(?:app|assets)\//.test(url.pathname))) fail(400, '앱 또는 assets 폴더의 공개 이미지 경로를 사용해주세요.');
  let decoded;
  try { decoded = decodeURIComponent(url.pathname); } catch { fail(400, '이미지 주소를 확인해주세요.'); }
  if (decoded.split('/').some(part => part.startsWith('.')) || decoded.includes('\\') || !/\.(?:png|jpe?g|webp|gif|svg)$/i.test(decoded)) fail(400, 'PNG, JPG, WEBP, GIF 또는 SVG 이미지 주소를 사용해주세요.');
  return address;
}
function timestamp(value, label) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) fail(400, `${label}을 확인해주세요.`);
  return new Date(value).toISOString();
}
function validated(value) {
  if (typeof value.enabled !== 'boolean') fail(400, '팝업 활성화 여부를 확인해주세요.');
  const ctaPath = str(value.ctaPath, '이동할 앱 화면', 150);
  if (!APP_ROUTE.test(ctaPath)) fail(400, '앱 안의 화면 주소를 선택해주세요.');
  const startsAt = timestamp(value.startsAt, '노출 시작일'), endsAt = timestamp(value.endsAt, '노출 종료일');
  if (startsAt && endsAt && Date.parse(startsAt) >= Date.parse(endsAt)) fail(400, '종료일은 시작일보다 뒤여야 합니다.');
  return {
    enabled: value.enabled,
    title: str(value.title, '팝업 제목', 100),
    body: str(value.body, '팝업 내용', 1600),
    imageUrl: imageAddress(value.imageUrl),
    imageAlt: str(value.imageAlt, '이미지 설명', 120, 0),
    ctaLabel: str(value.ctaLabel, '버튼 문구', 40),
    ctaPath,
    closeLabel: str(value.closeLabel, '닫기 문구', 40),
    frequency: choice(value.frequency, ['once', 'daily', 'session'], '노출 빈도'),
    startsAt, endsAt,
  };
}
const koreaDay = date => new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 10);

export function createWelcomePopupService(store) {
  const { run, one, transaction, now, audit } = store;
  run('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)', 'welcomePopup', JSON.stringify(DEFAULT_WELCOME_POPUP));
  const config = () => ({ ...DEFAULT_WELCOME_POPUP, ...JSON.parse(one('SELECT value FROM settings WHERE key=?', 'welcomePopup').value) });
  const scope = (popup, session, at) => popup.frequency === 'session' ? `session:${session.token}` : popup.frequency === 'daily' ? `day:${koreaDay(at)}` : 'once';
  const active = (popup, at) => popup.enabled && (!popup.startsAt || Date.parse(popup.startsAt) <= at.getTime()) && (!popup.endsAt || Date.parse(popup.endsAt) > at.getTime());
  function update(actor, input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, '팝업 설정을 확인해주세요.');
    return transaction(() => {
      const current = config();
      if (integer(input.version, '설정 버전', 1) !== current.version) fail(409, '다른 관리자가 팝업을 변경했습니다. 다시 불러온 후 저장해주세요.');
      const popup = { ...validated({ ...current, ...input }), version: current.version + 1, updatedAt: now() };
      run('UPDATE settings SET value=? WHERE key=?', JSON.stringify(popup), 'welcomePopup');
      // A new version starts a new notice; older delivery records are no longer needed.
      run('DELETE FROM app_popup_views');
      audit(actor, 'welcome-popup.update', 'welcomePopup', { enabled: popup.enabled, version: popup.version, frequency: popup.frequency });
      return popup;
    });
  }
  function eligible(user, session, at = new Date()) {
    const popup = config();
    if (!active(popup, at)) return null;
    return one('SELECT 1 FROM app_popup_views WHERE userId=? AND version=? AND scope=?', user.id, popup.version, scope(popup, session, at)) ? null : popup;
  }
  function seen(user, session, input, at = new Date()) {
    const popup = config();
    if (integer(input?.version, '팝업 버전', 1) !== popup.version) fail(409, '팝업이 변경되었습니다.');
    if (!active(popup, at)) return;
    transaction(() => {
      run('INSERT OR IGNORE INTO app_popup_views(userId,version,scope,seenAt) VALUES(?,?,?,?)', user.id, popup.version, scope(popup, session, at), at.toISOString());
      run("DELETE FROM app_popup_views WHERE userId=? AND scope!='once' AND seenAt<?", user.id, new Date(at.getTime() - 2 * 86400000).toISOString());
    });
  }
  return { config, update, eligible, seen };
}
