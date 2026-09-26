import { getProfile, saveProfile } from '../shared/store.js';
import { getStudioAccess, studioAccountKey } from '../studio/access.js';
import { dialog, esc, sessionEpoch } from '../studio/online-api.js';

const photoKey = 'momjit-studio-photo-v1';
const stylesheetId = 'app-device-settings-css';
let activeDialog = null;
let openingPromise = null;
let profilePhoto = '';
let photoReadError = false;

function validPhoto(value) {
  return typeof value === 'string' && value.length < 180000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(value);
}

function readPhoto() {
  try {
    const value = localStorage.getItem(photoKey) || '';
    if (value && !validPhoto(value)) throw new Error('Invalid photo');
    photoReadError = false;
    profilePhoto = value;
  } catch {
    photoReadError = true;
    profilePhoto = '';
  }
  return profilePhoto;
}

function savePhoto(value) {
  if (value) localStorage.setItem(photoKey, value);
  else localStorage.removeItem(photoKey);
  profilePhoto = value;
  photoReadError = false;
}

function ensureStylesheet() {
  if (document.getElementById(stylesheetId)) return;
  const link = document.createElement('link');
  link.id = stylesheetId;
  link.rel = 'stylesheet';
  link.href = './device-settings.css';
  document.head.append(link);
}

function initial(name) {
  return esc(Array.from(name || '참여자')[0] || '참');
}

function previewMarkup(photo, name) {
  return photo ? `<img src="${photo}" alt="선택한 프로필 사진 미리보기">` : `<span>${initial(name)}</span>`;
}

function profileSnapshot(profile) {
  return JSON.stringify({ name: String(profile?.name || '').trim() || '참여자', goal: Math.min(30, Math.max(1, Number(profile?.goal) || 3)) });
}

function boundarySnapshot() {
  return { access: getStudioAccess(), accountKey: studioAccountKey(), epoch: sessionEpoch };
}

function sameBoundary(boundary) {
  return boundary?.access === getStudioAccess() && boundary.accountKey === studioAccountKey() && boundary.epoch === sessionEpoch;
}

function goalOptions(selected) {
  const current = Math.min(30, Math.max(1, Number(selected) || 3));
  return Array.from({ length: 30 }, (_, index) => {
    const value = index + 1;
    return `<option value="${value}" ${value === current ? 'selected' : ''}>${value}개 기록하기</option>`;
  }).join('');
}

export function getDevicePhoto() {
  const value = readPhoto();
  return validPhoto(value) ? value : '';
}

export function renderDeviceSettings({ profile, photo, icon = () => '', message = '' } = {}) {
  const safeProfile = profile || { name: '참여자', goal: 3 };
  return `<form class="online-form app-device-settings" id="app-device-settings-form">
    <div class="app-device-profile">
      <div class="app-device-photo-preview" aria-label="이 기기 프로필 사진 미리보기">${previewMarkup(photo, safeProfile.name)}</div>
      <div>
        <h3>이 기기 촬영 설정</h3>
        <p>이름, 촬영 목표, 사진은 현재 브라우저에만 저장됩니다. Google 또는 60BASE 로그인 계정 정보는 <strong>내 정보 수정</strong>에서 관리해주세요.</p>
      </div>
    </div>
    <label>표시 이름
      <input id="app-device-name" name="name" required maxlength="24" autocomplete="name" value="${esc(safeProfile.name)}">
    </label>
    <label>기록 목표
      <select id="app-device-goal" name="goal">${goalOptions(safeProfile.goal)}</select>
    </label>
    <div class="app-device-photo-panel">
      <label class="app-device-photo-file">프로필 사진 선택
        <input id="app-device-photo-file" type="file" accept="image/jpeg,image/png,image/webp">
      </label>
      <p>JPG, PNG, WebP 파일을 5MB 이하로 선택하세요. 사진 중앙을 정사각형으로 잘라 원형으로 표시합니다.</p>
    </div>
    <p class="online-status" id="app-device-status" role="status" aria-live="polite">${esc(message || (photoReadError ? '저장된 사진을 읽지 못했어요. 새 사진을 선택해 다시 저장할 수 있어요.' : ''))}</p>
    <div class="app-device-actions">
      <button class="button" type="button" data-device-remove>${icon('trash') || ''}기본 이미지로 변경</button>
      <button class="button" type="button" data-device-cancel>취소</button>
      <button class="button primary" type="submit" data-device-save>${icon('check') || ''}저장</button>
    </div>
  </form>`;
}

async function cropPhoto(file, signal) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024 || !file.size) {
    throw new Error('5MB 이하의 JPG, PNG, WebP 사진을 선택해주세요.');
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    if (signal.cancelled) return '';
    if (bitmap.width * bitmap.height > 40000000) throw new Error('사진 해상도가 너무 커요. 4,000만 화소 이하의 사진을 선택해주세요.');
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('이 브라우저에서 사진을 처리하지 못했어요.');
    context.fillStyle = '#f3f5f8';
    context.fillRect(0, 0, 256, 256);
    const side = Math.min(bitmap.width, bitmap.height);
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
    const result = canvas.toDataURL('image/jpeg', 0.82);
    if (!validPhoto(result)) throw new Error('사진을 줄이지 못했어요. 다른 사진을 선택해주세요.');
    return result;
  } finally {
    bitmap?.close();
  }
}

export async function openDeviceSettings({ icon } = {}) {
  if (activeDialog?.open) {
    activeDialog.focus();
    return activeDialog;
  }
  if (openingPromise) return openingPromise;

  openingPromise = (async () => {
    ensureStylesheet();
    const boundary = boundarySnapshot();
    if (boundary.access !== 'allowed') {
      dialog('촬영 프로필', '<p>로그인 또는 회원가입을 완료한 뒤 이 기기 촬영 설정을 관리할 수 있어요.</p>');
      return null;
    }
    let profile = { name: '참여자', goal: 3 };
    let profileError = '';
    try {
      profile = await getProfile();
    } catch (error) {
      profileError = error.message || '이 브라우저의 촬영 설정 저장소를 열지 못했어요.';
    }
    const photo = readPhoto();
    if (!sameBoundary(boundary)) return null;
    let baselineProfile = profileSnapshot(profile);
    let baselinePhoto = '';
    let photoStoreReadable = true;
    try {
      baselinePhoto = localStorage.getItem(photoKey) || '';
    } catch {
      photoStoreReadable = false;
      photoReadError = true;
    }

    const element = dialog('촬영 프로필', renderDeviceSettings({ profile, photo, icon, message: profileError }));
    element.classList.add('app-device-settings-dialog');
    element.setAttribute('data-studio-private', '');
    activeDialog = element;

    const form = element.querySelector('#app-device-settings-form');
    const name = element.querySelector('#app-device-name');
    const goal = element.querySelector('#app-device-goal');
    const fileInput = element.querySelector('#app-device-photo-file');
    const preview = element.querySelector('.app-device-photo-preview');
    const status = element.querySelector('#app-device-status');
    const save = element.querySelector('[data-device-save]');
    let draftPhoto = photo;
    let photoDirty = false;
    let version = 0;
    const closeOnBoundaryChange = () => {
      if (!sameBoundary(boundary)) element.close();
    };
    window.addEventListener('service-session', closeOnBoundaryChange);

    function setStatus(message, isError = false) {
      status.textContent = message;
      status.dataset.error = String(isError);
    }

    function showPhoto(message = '') {
      preview.innerHTML = previewMarkup(draftPhoto, name.value);
      if (message) setStatus(message);
    }

    name.addEventListener('input', () => {
      if (!draftPhoto) preview.innerHTML = previewMarkup('', name.value);
    });

    fileInput.addEventListener('change', async event => {
      const file = event.target.files[0];
      event.target.value = '';
      if (!file) return;
      const ticket = ++version;
      save.disabled = true;
      setStatus('사진을 준비하고 있어요.');
      try {
        const result = await cropPhoto(file, { get cancelled() { return ticket !== version || !element.open; } });
        if (!result || ticket !== version || !element.open) {
          if (element.open) save.disabled = false;
          return;
        }
        draftPhoto = result;
        photoDirty = true;
        showPhoto('미리보기를 확인한 뒤 저장을 눌러주세요.');
      } catch (error) {
        if (ticket === version && element.open) setStatus(error.message || '사진을 읽지 못했어요. 다른 사진을 선택해주세요.', true);
      } finally {
        if (ticket === version && element.open) save.disabled = false;
      }
    });

    element.querySelector('[data-device-remove]').addEventListener('click', () => {
      version += 1;
      draftPhoto = '';
      photoDirty = true;
      save.disabled = false;
      showPhoto('기본 이미지로 변경하려면 저장을 눌러주세요.');
    });

    element.querySelector('[data-device-cancel]').addEventListener('click', () => element.close());
    element.addEventListener('close', () => {
      version += 1;
      window.removeEventListener('service-session', closeOnBoundaryChange);
      if (activeDialog === element) activeDialog = null;
    }, { once: true });

    form.addEventListener('submit', async event => {
      event.preventDefault();
      save.disabled = true;
      try {
        if (!sameBoundary(boundary)) {
          setStatus('계정 상태가 변경됐어요. 다시 열어 확인해주세요.', true);
          element.close();
          return;
        }
        const currentProfile = await getProfile();
        if (!sameBoundary(boundary)) {
          setStatus('계정 상태가 변경됐어요. 다시 열어 확인해주세요.', true);
          element.close();
          return;
        }
        if (profileSnapshot(currentProfile) !== baselineProfile) {
          baselineProfile = profileSnapshot(currentProfile);
          name.value = currentProfile.name;
          goal.value = String(currentProfile.goal);
          showPhoto();
          setStatus('다른 탭에서 촬영 설정이 변경됐어요. 확인한 뒤 다시 저장해주세요.', true);
          return;
        }

        let currentPhoto = '';
        try {
          currentPhoto = localStorage.getItem(photoKey) || '';
          photoStoreReadable = true;
        } catch {
          photoStoreReadable = false;
          if (photoDirty) {
            setStatus('촬영 설정은 확인했지만 사진 저장소에 접근할 수 없어요. 사진 변경 없이 다시 저장하거나 브라우저 저장 설정을 확인해주세요.', true);
            return;
          }
        }
        if (photoDirty && photoStoreReadable && currentPhoto !== baselinePhoto) {
          baselinePhoto = currentPhoto;
          const safePhoto = currentPhoto && validPhoto(currentPhoto) ? currentPhoto : '';
          draftPhoto = safePhoto;
          showPhoto();
          setStatus('다른 탭에서 사진이 변경됐어요. 미리보기를 확인한 뒤 다시 저장해주세요.', true);
          return;
        }

        const saved = await saveProfile({ name: name.value, goal: Number(goal.value) });
        if (!sameBoundary(boundary)) {
          setStatus('촬영 설정은 저장됐지만 계정 상태가 변경됐어요. 다시 열어 확인해주세요.', true);
          element.close();
          return;
        }
        const changedPhoto = photoDirty;
        if (changedPhoto) {
          try {
            savePhoto(draftPhoto);
          } catch {
            baselineProfile = profileSnapshot(saved);
            setStatus('이름과 기록 목표는 저장했지만 사진은 저장하지 못했어요. 브라우저 저장 설정을 확인한 뒤 사진만 다시 저장해주세요.', true);
            window.dispatchEvent(new CustomEvent('app-device-settings-changed', { detail: { profile: saved, photoChanged: false } }));
            return;
          }
        }
        baselineProfile = profileSnapshot(saved);
        baselinePhoto = draftPhoto;
        photoDirty = false;
        setStatus('이 브라우저의 촬영 설정을 저장했습니다.');
        window.dispatchEvent(new CustomEvent('app-device-settings-changed', { detail: { profile: saved, photoChanged: changedPhoto } }));
        element.close();
      } catch (error) {
        setStatus(error.message || '저장하지 못했어요. 저장 공간과 브라우저 설정을 확인해주세요.', true);
      } finally {
        if (element.open) save.disabled = false;
      }
    });

    return element;
  })();
  try {
    return await openingPromise;
  } finally {
    openingPromise = null;
  }
}

if (typeof addEventListener === 'function') {
  addEventListener('storage', event => {
    try {
      if (event.storageArea !== localStorage) return;
    } catch {
      return;
    }
    if (event.key !== photoKey && event.key !== null) return;
    const value = event.newValue || '';
    if (value && !validPhoto(value)) return;
    profilePhoto = value;
  });
}
