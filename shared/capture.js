import { missions, getMission, formatDuration, formatBytes, statusLabel } from './data.js';
import { getClip, saveClip, updateClip, deleteClip } from './store.js';
import { icon, escapeHTML as esc } from './ui.js';

const MAX_SIZE = 250 * 1024 * 1024;
let active;
function modal(title, content, wide = false) {
  active?.close();
  const dialog = document.createElement('dialog');
  dialog.className = `capture-dialog${wide ? ' wide' : ''}`;
  dialog.setAttribute('aria-labelledby', 'capture-heading');
  dialog.innerHTML = `<div class="capture-head"><div><span class="eyebrow">MOMJIT · YOUR EVERYDAY MOTION</span><h2 id="capture-heading">${esc(title)}</h2></div><button class="icon-button" data-close aria-label="닫기">${icon('close')}</button></div>${content}`;
  document.body.append(dialog); active = dialog;
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  dialog.addEventListener('close', () => { if (active === dialog) active = null; dialog.remove(); }, { once: true });
  dialog.showModal();
  return dialog;
}
function errorMessage(error) {
  const messages = { NotAllowedError: '카메라 권한이 허용되지 않았어요. 주소창의 권한 설정을 확인하거나 영상 가져오기를 이용해주세요.', NotFoundError: '연결된 카메라를 찾지 못했어요. 카메라를 연결하거나 영상을 가져와주세요.', NotReadableError: '카메라를 사용할 수 없어요. 다른 앱에서 카메라를 사용 중인지 확인해주세요.', OverconstrainedError: '이 카메라에서 요청한 촬영 설정을 사용할 수 없어요. 영상을 가져오는 방법도 있어요.', QuotaExceededError: '브라우저 저장 공간이 부족해요. 기존 기록을 내려받고 삭제한 뒤 다시 저장해주세요.' };
  return messages[error?.name] || error?.message || '작업을 완료하지 못했어요. 다시 시도해주세요.';
}
function inspectVideo(blob, hint = 0) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video'), url = URL.createObjectURL(blob); let settled = false;
    const finish = (err, value) => { if (settled) return; settled = true; clearTimeout(timer); video.onloadedmetadata = video.ondurationchange = video.ontimeupdate = video.onerror = null; video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); err ? reject(err) : resolve(value); };
    const details = () => ({ duration: Number.isFinite(video.duration) ? video.duration : hint, width: video.videoWidth, height: video.videoHeight });
    const timer = setTimeout(() => { if(video.videoWidth && video.videoHeight) finish(null,details()); else finish(new Error('영상을 읽는 데 시간이 오래 걸려요. 다른 영상이나 MP4 파일을 선택해주세요.')); }, 10000);
    video.preload = 'metadata'; video.muted = true;
    video.onloadedmetadata = () => {
      if (!video.videoWidth || !video.videoHeight) { finish(new Error('화면이 없는 파일이에요. 재생 가능한 동영상을 선택해주세요.')); return; }
      if (Number.isFinite(video.duration) || hint > 0) { finish(null, details()); return; }
      const durationReady = () => { if (Number.isFinite(video.duration) && video.duration > 0) finish(null,details()); };
      video.ondurationchange = video.ontimeupdate = durationReady;
      video.currentTime = 1e10;
    };
    video.onerror = () => finish(new Error('이 브라우저에서 재생할 수 없는 영상이에요. MP4 또는 WebM 동영상을 선택해주세요.'));
    video.src = url;
  });
}

export function openCapture({ mode = 'camera', missionId } = {}) {
  const selected = getMission(missionId);
  const dialog = modal('일상의 움직임을 담아볼까요?', `
    <div class="capture-body">
      <label class="capture-field">촬영 미션<select id="capture-mission">${missions.map(m => `<option value="${m.id}" ${m.id === selected.id ? 'selected' : ''}>${esc(m.title)}</option>`).join('')}</select></label>
      <div class="capture-tabs" aria-label="영상 추가 방법"><button type="button" data-mode="camera">${icon('camera')} 카메라로 촬영</button><button type="button" data-mode="upload">${icon('upload')} 영상 가져오기</button></div>
      <div id="capture-camera" class="capture-camera">
        <div class="camera-stage"><video id="camera-live" muted autoplay playsinline></video><div class="camera-placeholder" id="camera-placeholder">${icon('camera',42)}<h3>두 손이 보이는 일상 한 장면</h3><p>카메라는 버튼을 누를 때만 켜져요.<br>소리는 녹음하지 않아요.</p></div><span class="record-timer" id="record-timer" hidden><i></i><span>00:00</span></span><div class="frame-corner tl"></div><div class="frame-corner tr"></div><div class="frame-corner bl"></div><div class="frame-corner br"></div></div>
        <div class="camera-controls"><button class="button primary" id="enable-camera">${icon('camera')} 카메라 켜기</button><button class="button record-button" id="start-record" hidden><i></i> 녹화 시작</button><button class="button dark" id="stop-record" hidden>■ 녹화 마치기</button></div><p class="capture-hint">얼굴·개인정보가 보이지 않게, 손과 물건을 화면 안에 담아주세요.</p>
      </div>
      <div id="capture-upload" hidden><div class="upload-zone" id="upload-zone">${icon('upload',38)}<strong>영상을 놓거나 선택해주세요</strong><span>MP4 · WebM · MOV 등 브라우저에서 재생 가능한 영상<br>파일 1개 · 최대 250 MB</span><button class="button" type="button" id="choose-video">파일 선택 ${icon('plus',16)}</button></div><input id="video-file" hidden type="file" accept="video/*,.mp4,.webm,.mov,.m4v" aria-label="영상 파일 선택"></div>
      <div id="capture-preview" hidden><video id="preview-video" controls playsinline preload="metadata"></video><div class="preview-meta"><span id="video-meta"></span><button type="button" class="button ghost" id="retry-video">다시 선택</button></div><div class="capture-form"><label class="capture-field">기록 이름<input id="clip-title" maxlength="120" value="${esc(selected.title)}" required></label><label class="capture-field">메모 <span class="optional">선택</span><textarea id="clip-notes" rows="2" maxlength="1000" placeholder="오늘의 촬영에 대해 남기고 싶은 내용을 적어주세요."></textarea></label><label class="consent-check"><input type="checkbox" id="capture-consent"><span>영상에 얼굴이나 개인정보가 없는지 확인했어요.</span></label><div class="save-actions"><button class="button" id="save-draft">초안으로 저장</button><button class="button primary" id="save-ready">${icon('check')} 준비 완료로 저장</button></div></div></div>
      <p class="capture-status" id="capture-status" role="status" aria-live="polite"></p>
      <div class="local-notice">${icon('folder',16)}<span>영상은 이 브라우저에만 저장돼요. 서버로 전송되지 않아요.</span></div>
    </div>`, true);
  const $ = id => dialog.querySelector(`#${id}`);
  let stream, recorder, chunks = [], blob, metadata, source, objectURL, timer, started, closed = false, generation = 0, busy = false, reading = false, readingVersion = 0;
  const status = (message, error = false) => { $('capture-status').textContent = message; $('capture-status').classList.toggle('is-error', error); };
  const release = () => { generation++; if (recorder && recorder.state !== 'inactive') { recorder.onstop = null; recorder.stop(); } stream?.getTracks().forEach(track => track.stop()); stream = null; clearInterval(timer); $('camera-live').srcObject = null; };
  function unload(event) { if (blob || recorder?.state === 'recording') { event.preventDefault(); event.returnValue = ''; } }
  addEventListener('beforeunload', unload);
  const leavePage = () => { release(); };
  addEventListener('pagehide', leavePage);
  dialog.addEventListener('close', () => { closed = true; readingVersion++; release(); if (objectURL) URL.revokeObjectURL(objectURL); removeEventListener('beforeunload', unload); removeEventListener('pagehide', leavePage); }, { once: true });
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  function setMode(next) {
    if (busy || reading) return;
    release(); mode = next; blob = null; metadata = null;
    if (objectURL) URL.revokeObjectURL(objectURL); objectURL = null;
    $('preview-video').removeAttribute('src'); $('preview-video').load();
    $('capture-preview').hidden = true;
    $('capture-camera').hidden = mode !== 'camera'; $('capture-upload').hidden = mode !== 'upload';
    $('camera-placeholder').hidden = false; $('enable-camera').hidden = false; $('enable-camera').disabled = false; $('enable-camera').textContent = '카메라 켜기';
    $('start-record').hidden = true; $('stop-record').hidden = true; $('stop-record').disabled = false; $('record-timer').hidden = true;
    $('video-file').value = ''; status('');
    dialog.querySelectorAll('[data-mode]').forEach(button => { const on = button.dataset.mode === mode; button.classList.toggle('selected', on); button.setAttribute('aria-pressed', String(on)); });
  }
  dialog.querySelectorAll('[data-mode]').forEach(button => button.onclick = () => setMode(button.dataset.mode));
  $('capture-mission').onchange = () => { $('clip-title').value = getMission($('capture-mission').value).title; };
  $('retry-video').onclick = () => setMode(mode);
  async function preview(candidate, type, hint = 0) {
    if (closed || reading) return;
    if (!candidate.size) { status('비어 있는 파일이에요. 다른 영상을 선택해주세요.', true); return; }
    if (candidate.size > MAX_SIZE) { status('250 MB 이하의 영상을 선택해주세요.', true); return; }
    reading = true; const version = ++readingVersion; status('영상 재생 정보를 확인하고 있어요…');
    try {
      const info = await inspectVideo(candidate, hint);
      if (closed || version !== readingVersion) return;
      blob = candidate; metadata = info; source = type;
      if (objectURL) URL.revokeObjectURL(objectURL); objectURL = URL.createObjectURL(blob);
      $('preview-video').src = objectURL; $('capture-camera').hidden = true; $('capture-upload').hidden = true; $('capture-preview').hidden = false;
      $('video-meta').textContent = `${info.duration ? formatDuration(info.duration) : '길이 정보 없음'} · ${info.width} × ${info.height} · ${formatBytes(blob.size)}`;
      status('저장하기 전에 영상을 재생해 확인해주세요.');
      $('clip-title').focus();
    } catch (error) { if (!closed) status(errorMessage(error), true); }
    finally { reading = false; }
  }
  $('choose-video').onclick = () => $('video-file').click();
  $('video-file').onchange = event => { const file = event.target.files[0]; if (file) void preview(file, 'upload'); };
  const zone = $('upload-zone');
  for (const name of ['dragenter','dragover']) zone.addEventListener(name, event => { event.preventDefault(); zone.classList.add('dragging'); });
  for (const name of ['dragleave','drop']) zone.addEventListener(name, event => { event.preventDefault(); zone.classList.remove('dragging'); });
  zone.addEventListener('drop', event => { const files = event.dataTransfer.files; if (files.length !== 1) { status('한 번에 영상 한 개를 선택해주세요.', true); return; } void preview(files[0], 'upload'); });
  $('enable-camera').onclick = async () => {
    if (!isSecureContext || !navigator.mediaDevices?.getUserMedia) { status('카메라는 localhost 또는 HTTPS 주소에서 사용할 수 있어요. 영상 가져오기는 계속 이용할 수 있어요.', true); return; }
    if (!globalThis.MediaRecorder) { status('이 브라우저는 카메라 녹화를 지원하지 않아요. 영상 가져오기를 이용해주세요.', true); return; }
    const token = ++generation; $('enable-camera').disabled = true; $('enable-camera').textContent = '카메라 권한 확인 중…'; status('브라우저의 카메라 권한 요청에 응답해주세요. 닫거나 영상 가져오기로 바꿀 수 있어요.');
    try {
      const result = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } } });
      if (closed || token !== generation) { result.getTracks().forEach(track => track.stop()); return; }
      stream = result; $('camera-live').srcObject = stream; await $('camera-live').play();
      if (closed || token !== generation) return;
      $('camera-placeholder').hidden = true; $('enable-camera').hidden = true; $('start-record').hidden = false; status('준비되면 녹화를 시작해주세요. 최대 10분까지 촬영할 수 있어요.');
    } catch (error) { if (!closed && token === generation) { release(); status(errorMessage(error), true); $('enable-camera').disabled = false; $('enable-camera').textContent = '카메라 다시 켜기'; } }
  };
  $('start-record').onclick = () => {
    try {
      const mimeType = ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/mp4','video/webm'].find(type => MediaRecorder.isTypeSupported(type));
      recorder = new MediaRecorder(stream, mimeType ? {mimeType} : undefined); chunks = []; let total = 0;
      recorder.ondataavailable = event => { if (event.data.size) { chunks.push(event.data); total += event.data.size; if (total > MAX_SIZE && recorder.state === 'recording') recorder.stop(); } };
      recorder.onstop = () => { const duration = (Date.now() - started) / 1000; const video = new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' }); release(); $('stop-record').hidden = true; $('start-record').hidden = false; $('enable-camera').hidden = false; $('enable-camera').disabled = false; $('enable-camera').textContent = '카메라 다시 켜기'; $('start-record').hidden = true; $('camera-placeholder').hidden = false; $('record-timer').hidden = true; void preview(video, 'camera', duration); };
      recorder.onerror = () => { release(); status('녹화가 중단됐어요. 카메라를 다시 켜서 시도해주세요.', true); $('enable-camera').hidden = false; $('enable-camera').disabled = false; $('start-record').hidden = true; $('stop-record').hidden = true; };
      recorder.start(500); started = Date.now(); $('start-record').hidden = true; $('stop-record').hidden = false; $('stop-record').disabled = false; $('record-timer').hidden = false;
      timer = setInterval(() => { const elapsed = (Date.now()-started)/1000; $('record-timer').querySelector('span').textContent = formatDuration(elapsed); if (elapsed >= 600 && recorder.state === 'recording') recorder.stop(); }, 200);
      status('녹화 중이에요. 완료되면 녹화 마치기를 눌러주세요.');
    } catch (error) { release(); status(errorMessage(error), true); $('enable-camera').hidden = false; $('enable-camera').disabled = false; $('start-record').hidden = true; }
  };
  $('stop-record').onclick = () => { if (recorder?.state === 'recording') { $('stop-record').disabled = true; recorder.stop(); } };
  async function save(state) {
    if (busy || !blob) return;
    const title = $('clip-title').value.trim();
    if (!title) { $('clip-title').focus(); status('기록 이름을 입력해주세요.', true); return; }
    if (!$('capture-consent').checked) { $('capture-consent').focus(); status('영상에 얼굴이나 개인정보가 없는지 먼저 확인해주세요.', true); return; }
    busy = true; dialog.querySelectorAll('button,select,input,textarea').forEach(el => el.disabled = true); status('영상을 이 브라우저에 저장하고 있어요…');
    try {
      const mission = getMission($('capture-mission').value);
      const saved = await saveClip({ title, missionId: mission.id, category: mission.category, duration: metadata.duration, size: blob.size, mimeType: blob.type, status: state, source, blob, notes: $('clip-notes').value.trim(), example:false });
      blob = null; busy = false; dialog.close();
      const success = modal('기록이 저장됐어요', `<div class="capture-body save-success"><span class="success-mark">${icon('check',36)}</span><h3>${esc(saved.title)}</h3><p>${esc(statusLabel(saved.status))} · ${formatDuration(saved.duration)}</p><p class="muted">같은 브라우저의 몸짓 웹과 앱에서<br>이 기록을 이어서 확인할 수 있어요.</p><div class="save-actions"><button class="button" data-done>닫기</button><button class="button primary" data-open>기록 보기 ${icon('arrow',16)}</button></div><small class="muted">로컬 저장 완료 · 서버 전송 없음</small></div>`);
      success.querySelector('[data-done]').onclick = () => success.close(); success.querySelector('[data-open]').onclick = () => { success.close(); void openClip(saved.id); };
    } catch (error) { busy = false; dialog.querySelectorAll('button,select,input,textarea').forEach(el => el.disabled = false); status(errorMessage(error), true); }
  }
  $('save-draft').onclick = () => void save('draft'); $('save-ready').onclick = () => void save('ready');
  setMode(mode);
}

export function openGuide(missionId) {
  const mission = getMission(missionId);
  const dialog = modal('미션 가이드', `<div class="capture-body"><div class="guide-title ${mission.color}"><span class="badge">${esc(mission.category)} · 약 ${mission.duration}분</span><h3>${esc(mission.title)}</h3><p>${esc(mission.description)}</p></div><ol class="guide-steps">${mission.steps.map((step,i) => `<li><span>0${i+1}</span><p>${esc(step)}</p></li>`).join('')}</ol><div class="local-notice">${icon('help',18)}<span>이 미션은 촬영 흐름을 체험하는 예시예요. 실제 수집 의뢰나 보상은 포함되지 않아요.</span></div><div class="save-actions"><button class="button" data-upload>${icon('upload')} 영상 가져오기</button><button class="button primary" data-camera>${icon('camera')} 촬영 시작</button></div></div>`);
  dialog.querySelector('[data-camera]').onclick = () => { dialog.close(); openCapture({ mode:'camera', missionId }); };
  dialog.querySelector('[data-upload]').onclick = () => { dialog.close(); openCapture({ mode:'upload', missionId }); };
}

export async function openClip(id) {
  const dialog = modal('내 기록', '<div class="capture-body" id="detail-body"><p role="status">기록을 불러오고 있어요…</p></div>');
  let url, saving = false;
  dialog.addEventListener('close', () => { if (url) URL.revokeObjectURL(url); }, {once:true});
  dialog.addEventListener('cancel', event => { if(saving) event.preventDefault(); });
  try {
    const clip = await getClip(id); if (!dialog.open) return;
    if (!clip) throw new Error('기록을 찾을 수 없어요. 다른 화면에서 삭제되었을 수 있어요.');
    if (clip.blob) url = URL.createObjectURL(clip.blob);
    dialog.querySelector('#detail-body').innerHTML = `${url ? `<video class="detail-video" src="${url}" controls playsinline preload="metadata"></video>` : `<div class="example-preview">${icon('video',42)}<strong>예시 기록</strong><p>목록과 수정 기능을 살펴보는 예시예요.<br>실제 영상 파일은 포함되어 있지 않아요.</p></div>`}<div class="preview-meta"><span>${esc(clip.category)} · ${formatDuration(clip.duration)} · ${formatBytes(clip.size)}</span><span class="badge ${clip.status}">${statusLabel(clip.status)}</span></div><form id="detail-form" class="capture-form"><label class="capture-field">기록 이름<input id="detail-title" value="${esc(clip.title)}" maxlength="120" required></label><label class="capture-field">메모<textarea id="detail-notes" maxlength="1000" rows="3">${esc(clip.notes||'')}</textarea></label><label class="capture-field">기록 상태<select id="detail-state"><option value="draft" ${clip.status === 'draft'?'selected':''}>초안</option><option value="ready" ${clip.status === 'ready'?'selected':''}>준비 완료</option></select></label><p class="capture-hint">준비 완료는 직접 표시한 상태예요. 실제 검수나 서버 제출은 진행되지 않아요.</p><div class="detail-actions"><button class="button primary" type="submit">변경 저장</button>${url?`<button class="button" type="button" id="download-clip">${icon('download',17)} 영상 다운로드</button>`:''}<button class="button danger" type="button" id="delete-clip">${icon('trash',17)} 삭제</button></div></form><div class="delete-confirm" id="delete-confirm" hidden><p>이 기록을 삭제할까요? 같은 브라우저의 웹과 앱에서도 삭제돼요.</p><div class="save-actions"><button class="button" id="cancel-delete">취소</button><button class="button danger" id="confirm-delete">기록 삭제</button></div></div><p id="detail-status" class="capture-status" role="status"></p><div class="local-notice">${icon('folder',16)}<span>${new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(clip.createdAt))} · 이 브라우저에 저장됨</span></div>`;
    const $ = id => dialog.querySelector(`#${id}`);
    const lock = value => { saving = value; dialog.querySelectorAll('button,input,textarea,select').forEach(el => el.disabled = value); };
    $('detail-form').onsubmit = async event => { event.preventDefault(); const title = $('detail-title').value.trim(); if(!title){$('detail-title').focus();$('detail-status').textContent='기록 이름을 입력해주세요.';return;} lock(true); try { await updateClip(id,{title,notes:$('detail-notes').value.trim(),status:$('detail-state').value}); $('detail-status').textContent = '변경사항을 저장했어요. 웹과 앱에도 반영돼요.'; const badge=dialog.querySelector('.preview-meta .badge');badge.className=`badge ${$('detail-state').value}`;badge.textContent=statusLabel($('detail-state').value); } catch(error){$('detail-status').textContent=errorMessage(error);} finally{lock(false);} };
    if (url) $('download-clip').onclick = () => { const link=document.createElement('a');link.href=url;link.download=`${clip.title.replace(/[\\/:*?"<>|]/g,'_')}.${clip.mimeType.includes('mp4')?'mp4':clip.mimeType.includes('quicktime')?'mov':'webm'}`;document.body.append(link);link.click();link.remove(); };
    $('delete-clip').onclick = () => { $('delete-confirm').hidden=false;$('cancel-delete').focus(); };
    $('cancel-delete').onclick = () => { $('delete-confirm').hidden=true;$('delete-clip').focus(); };
    $('confirm-delete').onclick = async () => { lock(true);try{await deleteClip(id);dialog.close();}catch(error){$('detail-status').textContent=errorMessage(error);lock(false);} };
  } catch(error) { if(dialog.open) dialog.querySelector('#detail-body').innerHTML=`<p class="error-box" role="alert">${esc(errorMessage(error))}</p>`; }
}
