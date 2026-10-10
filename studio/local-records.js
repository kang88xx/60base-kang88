import { isNativeApp, shareNativeBlob } from '../app/native.js';
import { getMission, formatDuration, formatBytes, statusLabel, reviewStatusLabel } from '../shared/data.js';
import { getClip, saveClip, updateClip, deleteClip } from '../shared/store.js';
import { getServiceState } from '../shared/service-store.js';
import { icon } from '../shared/ui.js';
import { dialog, esc } from './online-api.js';
import { getStudioAccess } from './access.js';

const MAX_SIZE = 250 * 1024 * 1024;
const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|m4v)$/i;
const FALLBACK_TITLE = '촬영 영상';

let activeImport = null;
let activeViewer = null;

const messageFromError = error => error?.message || '작업을 완료하지 못했어요. 다시 시도해주세요.';
const localStamp = value => value ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '저장 시간 없음';
const safeFileName = (value, mimeType = '') => {
  const base = String(value || '60base-local-video').trim().replace(/[\\/:*?"<>|]/g, '_') || '60base-local-video';
  const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('quicktime') || mimeType.includes('mov') ? 'mov' : 'webm';
  return `${base}.${ext}`;
};
const titleFromFile = file => String(file?.name || '').replace(/\.[^.]+$/, '').trim().slice(0, 120) || FALLBACK_TITLE;
const mimeTypeFor = file => {
  const declared = String(file?.type || '').toLowerCase();
  if (declared.startsWith('video/')) return declared;
  const name = String(file?.name || '').toLowerCase();
  if (name.endsWith('.mp4') || name.endsWith('.m4v')) return 'video/mp4';
  if (name.endsWith('.mov')) return 'video/quicktime';
  if (name.endsWith('.webm')) return 'video/webm';
  return 'video/webm';
};

function status(node, message = '', error = false) {
  if (!node) return;
  node.textContent = message;
  node.classList.toggle('is-error', error);
}

function assertVideoFile(file) {
  if (!file || !file.size) throw new Error('비어 있는 파일이에요. 다른 영상을 선택해주세요.');
  if (file.size > MAX_SIZE) throw new Error('250 MB 이하의 영상 한 개를 선택해주세요.');
  const declared = String(file.type || '').toLowerCase();
  if (declared && !declared.startsWith('video/')) throw new Error('재생 가능한 동영상 파일을 선택해주세요. MP4·WebM을 권장합니다.');
  if (!declared && !VIDEO_EXTENSIONS.test(file.name || '')) throw new Error('MP4, WebM, MOV, M4V 영상 파일을 선택해주세요.');
}

function inspectVideo(blob, hint = 0) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(blob);
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.onloadedmetadata = video.ondurationchange = video.ontimeupdate = video.onerror = null;
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      error ? reject(error) : resolve(value);
    };
    const details = () => ({
      duration: Number.isFinite(video.duration) && video.duration > 0 ? video.duration : hint,
      width: video.videoWidth,
      height: video.videoHeight,
    });
    const timer = setTimeout(() => {
      if (video.videoWidth && video.videoHeight) finish(null, details());
      else finish(new Error('영상을 읽는 데 시간이 오래 걸려요. 다른 영상이나 MP4 파일을 선택해주세요.'));
    }, 10000);
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => {
      if (!video.videoWidth || !video.videoHeight) {
        finish(new Error('화면이 없는 파일이에요. 재생 가능한 동영상을 선택해주세요.'));
        return;
      }
      if (Number.isFinite(video.duration) || hint > 0) {
        finish(null, details());
        return;
      }
      const durationReady = () => {
        if (Number.isFinite(video.duration) && video.duration > 0) finish(null, details());
      };
      video.ondurationchange = video.ontimeupdate = durationReady;
      video.currentTime = 1e10;
    };
    video.onerror = () => finish(new Error('이 브라우저에서 재생할 수 없는 영상이에요. MP4 또는 WebM을 권장합니다.'));
    video.src = url;
  });
}

function latestReviewFor(clipId, service) {
  return (service?.submissions || []).find(item => item.clipId === clipId);
}

function protectedByReview(clipId, service) {
  return (service?.submissions || []).some(item => item.clipId === clipId && item.status !== 'rejected');
}

function reviewHistory(clipId, service) {
  return (service?.submissions || []).filter(item => item.clipId === clipId);
}

function localNotice(text = '이 기기에만 보관되며 자동 제출되지 않습니다.') {
  return `<div class="local-notice">${icon('folder', 16)}<span>${esc(text)}</span></div>`;
}

export function openLocalImport({ missionId } = {}) {
  if(getStudioAccess()!=='allowed'){location.hash='library';return;}
  activeImport?.close();
  const initialTitle = missionId ? getMission(missionId).title : FALLBACK_TITLE;
  const inApp = !!document.querySelector('#app-shell');
  const element = dialog('영상 가져오기', `
    ${inApp?'<p class="ego-form-intro">기기에 있는 영상을 골라주세요.<br>재생을 확인한 뒤 내 기록에 보관할 수 있어요.</p>':''}
    <form id="local-import-form" class="online-form local-record-form">
      <label class="${inApp?'ego-file-drop':''}">${inApp?'<span class="ego-file-icon" aria-hidden="true">'+icon('upload',28)+'</span><strong>보관할 영상을 선택하세요</strong><span class="ego-file-choose">파일 선택</span>':'영상 파일'}
        <input name="file" type="file" accept="video/*,.mp4,.webm,.mov,.m4v" required aria-label="보관할 영상 파일 선택">
        <small>최대 250 MB · MP4·WebM 권장. MOV·M4V는 브라우저에서 재생 가능한 경우에만 보관할 수 있습니다.</small>
      </label>
      ${inApp?'<div class="ego-file-card" data-file-card hidden><span class="ego-file-thumbnail" aria-hidden="true">'+icon('video',24)+'</span><div><strong data-file-name></strong><small data-file-size></small></div><button type="button" data-file-remove aria-label="선택한 영상 제외">×</button></div>':''}
      <div id="local-import-preview" class="local-record-preview" hidden>
        <video controls playsinline preload="metadata"></video>
        <p class="online-help" data-meta></p>
      </div>
      <label>기록 이름
        <input name="title" required maxlength="120" value="${esc(initialTitle)}">
      </label>
      <label>상태
        <select name="status">
          <option value="ready">준비 완료</option>
          <option value="draft">초안</option>
        </select>
      </label>
      <label><span>메모 <span class="optional">선택</span></span>
        <textarea name="notes" rows="3" maxlength="1000" placeholder="촬영 조건이나 확인할 점을 적어두세요."></textarea>
      </label>
      <p class="capture-status" role="status" aria-live="polite"></p>
      ${localNotice()}
      <div class="save-actions">
        <button class="button" type="button" data-cancel>취소</button>
        <button class="button primary" type="submit" disabled>${icon('upload', 17)} 이 기기에 보관</button>
      </div>
    </form>
  `, { wide: true });
  if(inApp)element.classList.add('ego-form-sheet','ego-upload-sheet');
  activeImport = element;

  const form = element.querySelector('#local-import-form');
  const fileInput = form.elements.file;
  const submit = form.querySelector('button[type="submit"]');
  const statusNode = form.querySelector('[role="status"]');
  const preview = form.querySelector('#local-import-preview');
  const video = preview.querySelector('video');
  const meta = preview.querySelector('[data-meta]');
  let selectedFile = null;
  let selectedMimeType = '';
  let metadata = null;
  let objectURL = '';
  let readingToken = 0;
  let titleTouched = false;

  const clearObjectURL = () => {
    if (objectURL) URL.revokeObjectURL(objectURL);
    objectURL = '';
  };

  element.addEventListener('close', () => {
    activeImport = activeImport === element ? null : activeImport;
    clearObjectURL();
  }, { once: true });
  form.querySelector('[data-cancel]').onclick = () => element.close();
  form.elements.title.addEventListener('input', () => { titleTouched = true; });
  form.querySelector('[data-file-remove]')?.addEventListener('click',()=>{fileInput.value='';fileInput.dispatchEvent(new Event('change'));fileInput.focus();});

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    const token = ++readingToken;
    selectedFile = null;
    selectedMimeType = '';
    metadata = null;
    submit.disabled = true;
    preview.hidden = true;
    video.removeAttribute('src');
    video.load();
    clearObjectURL();
    const card=form.querySelector('[data-file-card]');
    if(card){card.hidden=!file;if(file){card.querySelector('[data-file-name]').textContent=file.name;card.querySelector('[data-file-size]').textContent=formatBytes(file.size);}}
    if (!file) {
      status(statusNode, '');
      return;
    }
    try {
      assertVideoFile(file);
      status(statusNode, '영상 정보를 확인하고 있어요...');
      const details = await inspectVideo(file);
      if (!element.open || token !== readingToken) return;
      selectedFile = file;
      selectedMimeType = mimeTypeFor(file);
      metadata = details;
      objectURL = URL.createObjectURL(file);
      video.src = objectURL;
      preview.hidden = false;
      meta.textContent = `${formatDuration(details.duration)} · ${details.width} × ${details.height} · ${formatBytes(file.size)}`;
      if (!titleTouched) form.elements.title.value = titleFromFile(file);
      submit.disabled = false;
      status(statusNode, '재생을 확인한 뒤 보관할 수 있습니다.');
    } catch (error) {
      if (element.open && token === readingToken) status(statusNode, messageFromError(error), true);
    }
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!selectedFile || !metadata) {
      status(statusNode, '먼저 재생 가능한 영상 파일을 선택해주세요.', true);
      fileInput.focus();
      return;
    }
    const title = form.elements.title.value.trim();
    if (!title) {
      status(statusNode, '기록 이름을 입력해주세요.', true);
      form.elements.title.focus();
      return;
    }
    form.querySelectorAll('button,input,select,textarea').forEach(control => { control.disabled = true; });
    status(statusNode, '영상을 이 기기에 저장하고 있어요...');
    try {
      const baseMission = getMission(missionId);
      const saved = await saveClip({
        title,
        missionId: baseMission.id,
        category: missionId ? baseMission.category : '미분류',
        duration: metadata.duration,
        size: selectedFile.size,
        mimeType: selectedMimeType,
        status: form.elements.status.value,
        source: 'local-import',
        blob: selectedFile,
        notes: form.elements.notes.value.trim(),
        example: false,
      });
      if(!element.open||getStudioAccess()!=='allowed')return;
      selectedFile = null;
      element.close();
      const done = dialog('영상이 보관되었습니다', `
        <div class="save-success">
          <span class="success-mark">${icon('check', 36)}</span>
          <h3>${esc(saved.title)}</h3>
          <p>${esc(statusLabel(saved.status))} · ${formatDuration(saved.duration)}</p>
          <div class="save-actions">
            <button class="button" type="button" data-close-success>닫기</button>
            <button class="button primary" type="button" data-open-local>기록 보기 ${icon('arrow', 16)}</button>
          </div>
        </div>
      `);
      done.dataset.studioPrivate='';
      done.querySelector('[data-close-success]').onclick = () => done.close();
      done.querySelector('[data-open-local]').onclick = () => {
        done.close();
        void openLocalClip(saved.id);
      };
    } catch (error) {
      form.querySelectorAll('button,input,select,textarea').forEach(control => { control.disabled = false; });
      submit.disabled = !selectedFile;
      status(statusNode, messageFromError(error), true);
    }
  });

  element.dataset.studioPrivate='';
  fileInput.focus();
  return element;
}

export async function openLocalClip(id) {
  if(getStudioAccess()!=='allowed'){location.hash='library';return;}
  activeViewer?.close();
  const element = dialog('보관한 영상', '<p role="status">기록을 불러오고 있어요...</p>', { wide: true });
  element.dataset.studioPrivate='';
  activeViewer = element;
  let objectURL = '';
  element.addEventListener('close', () => {
    activeViewer = activeViewer === element ? null : activeViewer;
    if (objectURL) URL.revokeObjectURL(objectURL);
  }, { once: true });

  try {
    const [clip, service] = await Promise.all([getClip(id), getServiceState()]);
    if (!element.open) return element;
    if (!clip) throw new Error('기록을 찾을 수 없어요. 다른 화면에서 삭제되었을 수 있습니다.');

    const protectedRecord = protectedByReview(id, service);
    const history = reviewHistory(id, service);
    const review = latestReviewFor(id, service);
    let currentClip = clip;
    if (clip.blob?.size) objectURL = URL.createObjectURL(clip.blob);

    const media = objectURL
      ? `<video class="detail-video" src="${objectURL}" controls playsinline preload="metadata"></video>`
      : `<div class="example-preview">${icon('video', 42)}<strong>예시 기록</strong><p>목록과 편집 화면을 확인하기 위한 기록입니다.<br>실제 영상 파일은 포함되어 있지 않습니다.</p></div>`;
    const reviewNote = history.length
      ? `<section class="clip-review-summary"><strong>보관 이력</strong><p>${protectedRecord ? `${esc(reviewStatusLabel(review?.status))} 상태 이력이 있어 기록 보존을 위해 수정하거나 삭제할 수 없습니다.` : '이전 상태 이력이 있습니다. 현재 기록은 수정하거나 삭제할 수 있습니다.'}</p><p class="online-help">이 기기의 상태 이력이며 온라인 제출·심사·정산 내역이 아닙니다.</p>${history.length > 1 ? `<details><summary>이전 이력 ${history.length - 1}건</summary>${history.slice(1).map(item => `<p>${esc(item.attempt)}차 · ${esc(reviewStatusLabel(item.status))}${item.reason ? `<br>${esc(item.reason)}` : ''}</p>`).join('')}</details>` : ''}</section>`
      : `<section class="clip-review-summary"><strong>보관 영상</strong><p>현재 브라우저에 저장된 기록입니다.</p></section>`;

    element.querySelector('.online-dialog-body').innerHTML = `
      ${media}
      <div class="preview-meta">
        <span>${esc(clip.category || '로컬')} · ${formatDuration(clip.duration)} · ${formatBytes(clip.size)}</span>
        <span class="badge ${esc(clip.status)}">${esc(statusLabel(clip.status))}</span>
      </div>
      ${reviewNote}
      <form id="local-detail-form" class="online-form local-record-form">
        <label>기록 이름
          <input name="title" maxlength="120" required value="${esc(clip.title)}" ${protectedRecord ? 'disabled' : ''}>
        </label>
        <label>상태
          <select name="status" ${protectedRecord ? 'disabled' : ''}>
            <option value="ready" ${clip.status === 'ready' ? 'selected' : ''}>준비 완료</option>
            <option value="draft" ${clip.status === 'draft' ? 'selected' : ''}>초안</option>
          </select>
        </label>
        <label><span>메모 <span class="optional">선택</span></span>
          <textarea name="notes" rows="3" maxlength="1000" ${protectedRecord ? 'disabled' : ''}>${esc(clip.notes || '')}</textarea>
        </label>
        <p class="capture-status" role="status" aria-live="polite"></p>
        <div class="detail-actions">
          ${protectedRecord ? '' : '<button class="button primary" type="submit">변경 저장</button>'}
          ${objectURL ? `<button class="button" type="button" data-download>${icon('download', 17)} 영상 다운로드</button>` : ''}
          ${protectedRecord ? '' : `<button class="button danger" type="button" data-delete>${icon('trash', 17)} 삭제</button>`}
        </div>
      </form>
      <div class="delete-confirm" data-delete-confirm hidden>
        <p>이 기기에서 이 기록을 삭제할까요? 이 작업은 보관함에서 제거됩니다.</p>
        <div class="save-actions">
          <button class="button" type="button" data-delete-cancel>취소</button>
          <button class="button danger" type="button" data-delete-confirm-button>기록 삭제</button>
        </div>
      </div>
      ${localNotice(`${localStamp(clip.createdAt)} · 이 브라우저에 저장됨`)}
    `;

    const form = element.querySelector('#local-detail-form');
    const statusNode = form.querySelector('[role="status"]');
    let busy = false;
    const setBusy = value => {
      busy = value;
      element.querySelectorAll('button,input,select,textarea').forEach(control => {
        if (control.hasAttribute('data-delete-cancel')) return;
        control.disabled = value || (protectedRecord && ['INPUT', 'SELECT', 'TEXTAREA'].includes(control.tagName));
      });
    };

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy || protectedRecord) return;
      const title = form.elements.title.value.trim();
      if (!title) {
        status(statusNode, '기록 이름을 입력해주세요.', true);
        form.elements.title.focus();
        return;
      }
      setBusy(true);
      try {
        currentClip = await updateClip(id, {
          title,
          status: form.elements.status.value,
          notes: form.elements.notes.value.trim(),
        });
        status(statusNode, '변경사항을 저장했습니다.');
        const badge = element.querySelector('.preview-meta .badge');
        badge.className = `badge ${form.elements.status.value}`;
        badge.textContent = statusLabel(form.elements.status.value);
      } catch (error) {
        status(statusNode, messageFromError(error), true);
      } finally {
        setBusy(false);
      }
    });

    element.querySelector('[data-download]')?.addEventListener('click', async event => {
      const button = event.currentTarget;
      if (button.disabled) return;
      if (isNativeApp()) {
        button.disabled = true;
        try { await shareNativeBlob(currentClip.blob, safeFileName(currentClip.title, currentClip.mimeType)); }
        catch (error) { status(statusNode, error.message || '파일을 공유하지 못했습니다.', true); }
        finally { if(button.isConnected)button.disabled = false; }
        return;
      }
      const link = document.createElement('a');
      link.href = objectURL;
      link.download = safeFileName(currentClip.title, currentClip.mimeType);
      document.body.append(link);
      link.click();
      link.remove();
    });
    element.querySelector('[data-delete]')?.addEventListener('click', () => {
      element.querySelector('[data-delete-confirm]').hidden = false;
      element.querySelector('[data-delete-cancel]').focus();
    });
    element.querySelector('[data-delete-cancel]')?.addEventListener('click', () => {
      element.querySelector('[data-delete-confirm]').hidden = true;
      element.querySelector('[data-delete]')?.focus();
    });
    element.querySelector('[data-delete-confirm-button]')?.addEventListener('click', async () => {
      if (busy || protectedRecord) return;
      setBusy(true);
      try {
        await deleteClip(id);
        element.close();
      } catch (error) {
        status(statusNode, messageFromError(error), true);
        setBusy(false);
      }
    });
  } catch (error) {
    if (element.open) element.querySelector('.online-dialog-body').innerHTML = `<p class="error-box" role="alert">${esc(messageFromError(error))}</p>`;
  }
  return element;
}
