import { isNativeApp, shareNativeBlob } from '../app/native.js';
import { deleteClip, saveClip } from '../shared/store.js';
import { formatBytes, formatDuration } from '../shared/data.js';
import { escapeHTML as esc, icon } from '../shared/ui.js';

const MAX_DURATION_MS = 10 * 60 * 1000;
const MAX_SIZE = 250 * 1024 * 1024;
const GUIDE_LINES = ['가로로 고정', '손과 작업 대상', '얼굴·개인정보 제외'];
const MP4_MIME_CANDIDATES = [
  'video/mp4;codecs=h264',
  'video/mp4',
];
const WEBM_MIME_CANDIDATES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

let activeCamera = null;

const hasMediaDevices = () => Boolean(navigator.mediaDevices?.getUserMedia);
const hasRecorder = () => typeof MediaRecorder === 'function';
const now = () => (performance?.now ? performance.now() : Date.now());
const safeTitle = activity => String(activity?.title || '촬영 영상').trim().slice(0, 120) || '촬영 영상';
const safeCategory = activity => String(activity?.category || '촬영').trim().slice(0, 60) || '촬영';
const safeActivityId = activity => String(activity?.id || 'camera').trim().slice(0, 80) || 'camera';
const isSafariRecorder = () => /Safari/i.test(navigator.userAgent) && !/Chrome|Chromium|Edg|Firefox/i.test(navigator.userAgent);
const pickMimeType = () => {
  if (!hasRecorder() || typeof MediaRecorder.isTypeSupported !== 'function') return '';
  const candidates = isSafariRecorder()
    ? [...MP4_MIME_CANDIDATES, ...WEBM_MIME_CANDIDATES]
    : [...WEBM_MIME_CANDIDATES, ...MP4_MIME_CANDIDATES];
  return candidates.find(type => {
    try { return MediaRecorder.isTypeSupported(type); } catch { return false; }
  }) || '';
};
const fileNameFor = (title, mimeType = 'video/webm') => {
  const base = String(title || '60base-camera').replace(/[\\/:*?"<>|]/g, '_').trim() || '60base-camera';
  return `${base}.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`;
};

function usefulError(error) {
  if (!window.isSecureContext) return '보안 연결에서만 카메라를 사용할 수 있어요. https 주소로 다시 열어주세요.';
  if (!hasMediaDevices()) return '이 브라우저는 웹 카메라 촬영을 지원하지 않아요. 아래 파일 촬영 버튼을 사용해보세요.';
  const name = error?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return '카메라 권한이 거부됐어요. 브라우저 주소창의 권한 설정을 바꾼 뒤 다시 시도해주세요.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return '사용할 수 있는 카메라를 찾지 못했어요. 카메라 연결과 권한을 확인해주세요.';
  if (name === 'NotReadableError' || name === 'AbortError') return '다른 앱이 카메라를 사용 중일 수 있어요. 다른 화상 회의나 카메라 앱을 닫고 다시 시도해주세요.';
  if (name === 'TypeError') return '현재 브라우저 환경에서 카메라 요청을 시작할 수 없어요. 권한과 보안 연결을 확인해주세요.';
  return error?.message || '카메라를 시작하지 못했어요. 잠시 뒤 다시 시도해주세요.';
}

function inspectVideo(blob, hint = {}) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(blob);
    let done = false;
    const finish = (error, details) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.onloadedmetadata = video.onerror = null;
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      error ? reject(error) : resolve(details);
    };
    const timer = setTimeout(() => finish(new Error('촬영한 영상 정보를 읽지 못했어요. 다운로드하거나 다시 촬영해주세요.')), 8000);
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => finish(null, {
      duration: Number.isFinite(video.duration) && video.duration > 0 ? video.duration : hint.duration || 0,
      width: video.videoWidth || hint.width || 0,
      height: video.videoHeight || hint.height || 0,
    });
    video.onerror = () => finish(new Error('촬영한 영상을 읽지 못했어요. 다시 촬영하거나 다운로드로 보관해주세요.'));
    video.src = url;
  });
}

function buildDialog(activity, canRecord) {
  const title = safeTitle(activity);
  const dialog = document.createElement('dialog');
  dialog.className = 'studio-camera-dialog';
  dialog.setAttribute('aria-labelledby', 'studio-camera-title');
  dialog.innerHTML = `
    <div class="studio-camera-shell" data-camera-stage>
      <video class="studio-camera-live" autoplay muted playsinline></video>
      <div class="studio-camera-review-stage" data-camera-review hidden>
        <video class="studio-camera-review" controls playsinline></video>
      </div>
      <div class="studio-camera-scrim" data-guide>
        <div class="studio-camera-guide" data-camera-guide role="note" aria-label="촬영 가이드">
          ${GUIDE_LINES.map(line => `<span>${esc(line)}</span>`).join('')}
        </div>
      </div>
      <div class="studio-camera-top">
        <button class="studio-camera-tool" type="button" data-close aria-label="카메라 닫기" title="닫기">${icon('close', 20)}</button>
        <div class="studio-camera-heading">
          <p id="studio-camera-title">${esc(title)}</p>
          <span data-status role="status" aria-live="polite">카메라를 준비하고 있어요.</span>
        </div>
        <button class="studio-camera-tool" type="button" data-guide-toggle aria-label="촬영 가이드 보기" title="촬영 가이드">${icon('help', 20)}</button>
        <button class="studio-camera-tool" type="button" data-flip aria-label="카메라 전환" title="카메라 전환" hidden>${icon('camera', 20)}</button>
      </div>
      <div class="studio-camera-timer" data-timer hidden><i></i><span>00:00</span></div>
      <div class="studio-camera-error" data-error role="status" aria-live="assertive" hidden></div>
      <div class="studio-camera-bottom" data-camera-controls>
        <button class="studio-camera-record" type="button" data-record aria-label="녹화 시작" ${canRecord ? '' : 'hidden'}><span></span></button>
        <button class="studio-camera-stop" type="button" data-stop hidden>녹화 마치기</button>
        <button class="studio-camera-retry" type="button" data-retry data-camera-retry hidden>${icon('camera', 18)} 다시 시도</button>
        <label class="studio-camera-file" data-file-fallback ${canRecord ? 'hidden' : ''}>
          ${icon('phone', 18)} 휴대폰 카메라로 촬영
          <input type="file" accept="video/*" capture="environment">
        </label>
      </div>
      <section class="studio-camera-review-sheet" data-review-sheet hidden aria-label="촬영 영상 확인">
        <div>
          <h2>${esc(title)}</h2>
          <p data-meta>촬영 정보를 확인하고 있어요.</p>
          <p>이 브라우저에 저장됩니다. 자동 제출되지 않으며, 심사 제출은 별도 버튼을 눌러 진행합니다.</p>
        </div>
        <p class="studio-camera-save-status" data-save-status role="status" aria-live="polite"></p>
        <div class="studio-camera-review-actions">
          <button class="button" type="button" data-retake>다시 촬영</button>
          <button class="button" type="button" data-download>${icon('download', 17)} 다운로드</button>
          <button class="button primary" type="button" data-save>이 브라우저에 저장</button>
          <button class="button" type="button" data-open-saved hidden>보관한 영상 보기</button>
          <button class="button primary" type="button" data-submit hidden>심사 제출하기</button>
        </div>
      </section>
      <div class="studio-camera-confirm" data-confirm hidden role="alertdialog" aria-modal="true" aria-labelledby="studio-camera-confirm-title">
        <div>
          <h2 id="studio-camera-confirm-title">촬영한 영상을 버릴까요?</h2>
          <p>아직 이 브라우저에 저장하지 않았습니다.</p>
          <div>
            <button class="button" type="button" data-confirm-cancel>계속 보기</button>
            <button class="button danger" type="button" data-confirm-discard>버리고 닫기</button>
          </div>
        </div>
      </div>
    </div>`;
  return dialog;
}

class StudioCamera {
  constructor(options) {
    this.activity = options.activity || {};
    this.isCurrent = typeof options.isCurrent === 'function' ? options.isCurrent : () => true;
    this.onSaved = typeof options.onSaved === 'function' ? options.onSaved : () => {};
    this.onSubmit = typeof options.onSubmit === 'function' ? options.onSubmit : null;
    this.trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.mimeType = pickMimeType();
    this.dialog = buildDialog(this.activity, hasMediaDevices() && hasRecorder());
    this.liveVideo = this.dialog.querySelector('.studio-camera-live');
    this.reviewVideo = this.dialog.querySelector('.studio-camera-review');
    this.statusNode = this.dialog.querySelector('[data-status]');
    this.errorNode = this.dialog.querySelector('[data-error]');
    this.timerNode = this.dialog.querySelector('[data-timer]');
    this.reviewStage = this.dialog.querySelector('[data-camera-review]');
    this.guideButton = this.dialog.querySelector('[data-guide-toggle]');
    this.recordButton = this.dialog.querySelector('[data-record]');
    this.stopButton = this.dialog.querySelector('[data-stop]');
    this.flipButton = this.dialog.querySelector('[data-flip]');
    this.retryButton = this.dialog.querySelector('[data-retry]');
    this.fileInput = this.dialog.querySelector('[data-file-fallback] input');
    this.reviewSheet = this.dialog.querySelector('[data-review-sheet]');
    this.saveButton = this.dialog.querySelector('[data-save]');
    this.submitButton = this.dialog.querySelector('[data-submit]');
    this.openSavedButton = this.dialog.querySelector('[data-open-saved]');
    this.generation = 0;
    this.closed = false;
    this.devices = [];
    this.deviceIndex = 0;
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
    this.size = 0;
    this.startedAt = 0;
    this.duration = 0;
    this.streamWidth = 0;
    this.streamHeight = 0;
    this.stopReason = '';
    this.recordTimer = 0;
    this.limitTimer = 0;
    this.reviewUrl = '';
    this.reviewBlob = null;
    this.reviewMeta = null;
    this.savedClip = null;
    this.saved = false;
    this.saving = false;
    this.state = 'idle';
    this.metadataValid = false;
    this.saveToken = 0;
    this.unloadGuardActive = false;
  }

  open() {
    document.body.append(this.dialog);
    this.bind();
    this.dialog.showModal();
    this.dialog.querySelector('[data-close]').focus();
    if (!hasMediaDevices() || !hasRecorder()) this.showUnsupported();
    else void this.startCamera();
  }

  bind() {
    this.dialog.querySelector('[data-close]').addEventListener('click', () => this.requestClose());
    this.guideButton.addEventListener('click', () => this.toggleGuide());
    this.recordButton.addEventListener('click', () => this.startRecording());
    this.stopButton.addEventListener('click', () => this.stopRecording('manual'));
    this.retryButton.addEventListener('click', () => this.startCamera());
    this.flipButton.addEventListener('click', () => this.flipCamera());
    this.dialog.querySelector('[data-retake]').addEventListener('click', () => this.requestRetake());
    this.dialog.querySelector('[data-download]').addEventListener('click', () => this.downloadReview());
    this.saveButton.addEventListener('click', () => this.saveReview());
    this.openSavedButton.addEventListener('click', () => {
      if (!this.savedClip?.id) return;
      const clip = this.savedClip;
      this.close(true);
      void import('./local-records.js').then(({ openLocalClip }) => openLocalClip(clip.id));
    });
    this.submitButton.addEventListener('click', () => {
      if (!this.savedClip || !this.isCurrent()) return;
      const clip = this.savedClip;
      this.close(true);
      this.onSubmit?.(clip);
    });
    this.dialog.querySelector('[data-confirm-cancel]').addEventListener('click', () => this.hideConfirm());
    this.dialog.querySelector('[data-confirm-discard]').addEventListener('click', () => {
      if (this.confirmDiscard) this.confirmDiscard();
      else this.close(true);
    });
    this.fileInput.addEventListener('change', () => this.useFallbackFile());
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.requestClose(); });
    this.dialog.addEventListener('close', () => this.close(true));
    this.boundKeydown = event => this.onKeydown(event);
    this.boundVisibility = () => this.onVisibilityChange();
    this.boundBeforeUnload = event => {
      event.preventDefault();
      event.returnValue = '';
    };
    this.boundPagehide = () => this.interrupt('pagehide');
    this.boundHash = () => this.interrupt('interrupted');
    document.addEventListener('keydown', this.boundKeydown);
    document.addEventListener('visibilitychange', this.boundVisibility);
    this.boundNativeState = event => { if(event.detail?.isActive===false)this.onVisibilityChange(true); };
    document.addEventListener('native:app-state', this.boundNativeState);
    window.addEventListener('pagehide', this.boundPagehide, { once: true });
    window.addEventListener('hashchange', this.boundHash, { once: true });
  }

  onKeydown(event) {
    if (!this.dialog.open || event.key !== 'Tab') return;
    const controls = [...this.dialog.querySelectorAll('button,[href],input,label[tabindex],video[controls]')].filter(node => !node.hidden && !node.disabled && node.offsetParent !== null);
    if (!controls.length) return;
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  async startCamera(preferredDeviceId = '') {
    const token = ++this.generation;
    this.clearError();
    this.setState('loading');
    this.stopStream();
    this.clearReview();
    try {
      const constraints = {
        audio: false,
        video: preferredDeviceId
          ? { deviceId: { exact: preferredDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (!this.isActive(token)) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      this.stream = stream;
      this.liveVideo.srcObject = stream;
      this.liveVideo.hidden = false;
      this.reviewStage.hidden = true;
      stream.getTracks().forEach(track => track.addEventListener('ended', () => this.stopRecording('track-ended'), { once: true }));
      await this.liveVideo.play().catch(() => {});
      await this.enumerateDevices();
      if (!this.isActive(token)) return;
      this.setState('ready');
    } catch (error) {
      if (!this.isActive(token)) return;
      this.stopStream();
      this.showError(usefulError(error), true);
      this.setState('error');
    }
  }

  async enumerateDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.devices = devices.filter(device => device.kind === 'videoinput');
      const current = this.stream?.getVideoTracks()[0]?.getSettings?.().deviceId;
      this.deviceIndex = Math.max(0, this.devices.findIndex(device => device.deviceId === current));
      this.flipButton.hidden = this.devices.length <= 1;
    } catch {
      this.devices = [];
      this.flipButton.hidden = true;
    }
  }

  flipCamera() {
    if (this.recorder?.state === 'recording' || this.devices.length <= 1) return;
    this.deviceIndex = (this.deviceIndex + 1) % this.devices.length;
    const next = this.devices[this.deviceIndex]?.deviceId;
    if (next) void this.startCamera(next);
  }

  startRecording() {
    if (!this.stream || !hasRecorder() || this.recorder?.state === 'recording') return;
    this.chunks = [];
    this.size = 0;
    this.duration = 0;
    this.stopReason = '';
    this.clearError();
    try {
      this.recorder = this.mimeType ? new MediaRecorder(this.stream, { mimeType: this.mimeType }) : new MediaRecorder(this.stream);
    } catch {
      try { this.recorder = new MediaRecorder(this.stream); }
      catch (error) {
        this.showError(usefulError(error), true);
        this.setState('error');
        return;
      }
    }
    this.mimeType = this.recorder.mimeType || this.mimeType || 'video/webm';
    this.recorder.ondataavailable = event => {
      if (!event.data?.size) return;
      this.chunks.push(event.data);
      this.size += event.data.size;
      if (this.size >= MAX_SIZE) this.stopRecording('size');
    };
    this.recorder.onerror = () => {
      this.showError('녹화가 중단됐어요. 다시 촬영해주세요.', true);
      this.stopRecording('error');
    };
    this.recorder.onstop = () => void this.finalizeRecording();
    this.startedAt = now();
    this.recorder.start(1000);
    this.limitTimer = window.setTimeout(() => this.stopRecording('duration'), MAX_DURATION_MS);
    this.recordTimer = window.setInterval(() => this.updateTimer(), 250);
    this.setState('recording');
    this.updateTimer();
  }

  stopRecording(reason = 'manual') {
    this.stopReason = reason;
    clearTimeout(this.limitTimer);
    clearInterval(this.recordTimer);
    if (this.recorder?.state === 'recording') {
      this.duration = Math.max(0, (now() - this.startedAt) / 1000);
      const settings = this.stream?.getVideoTracks()[0]?.getSettings?.() || {};
      this.streamWidth = this.liveVideo.videoWidth || settings.width || 0;
      this.streamHeight = this.liveVideo.videoHeight || settings.height || 0;
      try { this.recorder.requestData?.(); } catch {}
      try { this.recorder.stop(); } catch { void this.finalizeRecording(); }
      this.setState('finalizing');
      this.stopStream();
    }
  }

  async finalizeRecording() {
    clearTimeout(this.limitTimer);
    clearInterval(this.recordTimer);
    this.stopStream();
    if (!this.chunks.length) {
      this.showError('저장할 녹화 데이터가 없어요. 다시 촬영해주세요.', true);
      this.setState('error');
      return;
    }
    const blob = new Blob(this.chunks, { type: this.mimeType || 'video/webm' });
    const width = this.streamWidth || this.liveVideo.videoWidth || 0;
    const height = this.streamHeight || this.liveVideo.videoHeight || 0;
    try {
      const details = await inspectVideo(blob, { duration: this.duration, width, height });
      this.showReview(blob, details, { metadataValid: true });
    } catch (error) {
      this.showReview(blob, { duration: this.duration, width, height }, { metadataValid: false });
      this.showError(error.message, true);
    }
  }

  async useFallbackFile() {
    const file = this.fileInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/') || file.size > MAX_SIZE) {
      this.showError('250 MB 이하의 동영상 파일만 보관할 수 있어요.', true);
      return;
    }
    try {
      const details = await inspectVideo(file);
      this.mimeType = file.type || 'video/mp4';
      this.showReview(file, details, { metadataValid: true });
    } catch (error) {
      this.showError(error.message, true);
    }
  }

  showReview(blob, details, { metadataValid = true } = {}) {
    const validDetails = metadataValid && Number.isFinite(details.duration) && details.duration > 0 && details.width > 0 && details.height > 0;
    this.reviewBlob = blob;
    this.metadataValid = validDetails;
    this.reviewMeta = {
      duration: details.duration || this.duration || 0,
      width: details.width || 0,
      height: details.height || 0,
      size: blob.size,
      mimeType: blob.type || this.mimeType || 'video/webm',
    };
    if (this.reviewUrl) URL.revokeObjectURL(this.reviewUrl);
    this.reviewUrl = URL.createObjectURL(blob);
    this.reviewVideo.src = this.reviewUrl;
    this.reviewStage.hidden = false;
    this.liveVideo.hidden = true;
    this.reviewSheet.hidden = false;
    this.dialog.querySelector('[data-meta]').textContent = `${formatDuration(this.reviewMeta.duration)} · ${this.reviewMeta.width || '-'} × ${this.reviewMeta.height || '-'} · ${formatBytes(blob.size)}`;
    if (blob.size > MAX_SIZE) this.showError('영상이 250 MB를 넘었어요. 다운로드로 보관하거나 다시 촬영해주세요.', true);
    else if (this.stopReason === 'duration') this.showError('최대 10분이 되어 녹화를 마쳤어요. 확인 후 저장할 수 있습니다.');
    else if (this.stopReason === 'hidden') this.showError('화면이 숨겨져 녹화를 마쳤어요. 촬영분은 아래에서 확인할 수 있습니다.');
    else if (this.stopReason === 'track-ended') this.showError('카메라 연결이 종료되어 녹화를 마쳤어요. 촬영분은 아래에서 확인할 수 있습니다.');
    this.setState('review');
    if (!validDetails) {
      this.saveButton.hidden = true;
      this.saveButton.disabled = true;
      this.submitButton.hidden = true;
      this.setSaveStatus('영상 정보를 읽지 못해 저장할 수 없어요. 다운로드하거나 다시 촬영해주세요.', true);
    }
  }

  async saveReview() {
    if (this.saving || this.saved || !this.reviewBlob || !this.reviewMeta) return;
    if (!this.metadataValid) {
      this.setSaveStatus('영상 정보를 읽지 못해 저장할 수 없어요. 다운로드하거나 다시 촬영해주세요.', true);
      return;
    }
    if (this.reviewBlob.size > MAX_SIZE) {
      this.setSaveStatus('250 MB 이하 영상만 저장할 수 있어요. 다운로드 후 다시 촬영해주세요.', true);
      return;
    }
    if (!this.isCurrent()) {
      this.setSaveStatus('현재 계정이나 화면 상태가 바뀌었어요. 다시 열어 저장해주세요.', true);
      return;
    }
    this.saving = true;
    const token = ++this.saveToken;
    this.saveButton.disabled = true;
    this.setSaveStatus('이 브라우저에 저장하고 있어요...');
    try {
      const activityId = safeActivityId(this.activity);
      const saved = await saveClip({
        activityId,
        missionId: activityId,
        title: safeTitle(this.activity),
        category: safeCategory(this.activity),
        duration: this.reviewMeta.duration,
        width: this.reviewMeta.width,
        height: this.reviewMeta.height,
        size: this.reviewBlob.size,
        mimeType: this.reviewMeta.mimeType,
        blob: this.reviewBlob,
        status: 'draft',
        source: 'camera',
        example: false,
        notes: '',
      });
      if (token !== this.saveToken || !this.dialog.open || !this.isCurrent()) {
        try { await deleteClip(saved.id); } catch (error) { console.error(error); }
        this.setSaveStatus('계정 상태가 바뀌어 저장을 취소했어요. 다시 열어 저장해주세요.', true);
        return;
      }
      this.saved = true;
      this.savedClip = saved;
      this.setSaveStatus('저장했습니다. 보관함에서 다시 볼 수 있어요.');
      this.openSavedButton.hidden = false;
      this.submitButton.hidden = !this.onSubmit;
      this.saveButton.textContent = '저장 완료';
      this.saveButton.disabled = true;
      this.setState('saved');
      try { this.onSaved(saved); } catch (error) { console.error(error); }
    } catch (error) {
      this.saveButton.disabled = false;
      this.setSaveStatus(error?.message || '저장하지 못했어요. 저장 공간과 브라우저 설정을 확인해주세요.', true);
    } finally {
      this.saving = false;
    }
  }

  requestRetake() {
    if (this.reviewBlob && !this.saved) {
      this.showConfirm(() => {
        this.hideConfirm();
        this.clearReview();
        void this.startCamera();
      }, '버리고 다시 촬영');
      return;
    }
    this.clearReview();
    void this.startCamera();
  }

  requestClose() {
    if ((this.reviewBlob && !this.saved) || this.recorder?.state === 'recording') {
      this.showConfirm(() => this.close(true), '버리고 닫기');
      return;
    }
    this.close(true);
  }

  showConfirm(onDiscard, discardLabel = '버리고 닫기') {
    this.confirmDiscard = onDiscard;
    const confirm = this.dialog.querySelector('[data-confirm]');
    confirm.querySelector('[data-confirm-discard]').textContent = discardLabel;
    confirm.hidden = false;
    confirm.querySelector('[data-confirm-cancel]').focus();
  }

  hideConfirm() {
    this.dialog.querySelector('[data-confirm]').hidden = true;
    this.confirmDiscard = null;
  }

  showUnsupported() {
    const unsupported = !hasMediaDevices()
      ? '이 브라우저는 웹 카메라 촬영을 지원하지 않아요. 휴대폰에서는 아래 버튼으로 카메라 촬영 파일을 만들 수 있습니다.'
      : '이 브라우저는 녹화 기능을 지원하지 않아요. 휴대폰 카메라 촬영 파일로 보관할 수 있습니다.';
    this.showError(unsupported, true);
    this.setState('fallback');
  }

  setState(state) {
    this.state = state;
    this.dialog.dataset.state = state;
    this.recordButton.hidden = state !== 'ready';
    this.stopButton.hidden = state !== 'recording';
    this.retryButton.hidden = !['error', 'fallback'].includes(state) || !hasMediaDevices() || !hasRecorder();
    this.timerNode.hidden = state !== 'recording';
    this.reviewSheet.hidden = state !== 'review' && state !== 'saved';
    this.flipButton.disabled = state === 'recording' || state === 'loading';
    this.guideButton.hidden = state === 'recording';
    this.guideButton.disabled = state === 'recording';
    this.dialog.querySelector('[data-guide]').hidden = state === 'recording' || state === 'review' || state === 'saved';
    const messages = {
      loading: '카메라 권한을 확인하고 있어요.',
      ready: '준비됐습니다. 가운데 버튼을 누르면 녹화가 시작돼요.',
      recording: '녹화 중입니다.',
      finalizing: '촬영한 영상을 준비하고 있어요.',
      review: '촬영한 영상을 확인해주세요.',
      saved: '저장했습니다.',
      error: '다시 시도하거나 파일 촬영을 사용할 수 있어요.',
      fallback: '파일 촬영으로 보관할 수 있어요.',
    };
    this.statusNode.textContent = messages[state] || '';
    this.refreshUnloadGuard();
  }

  updateTimer() {
    const elapsed = Math.max(0, now() - this.startedAt);
    const seconds = Math.floor(elapsed / 1000);
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
    const ss = String(seconds % 60).padStart(2, '0');
    this.timerNode.querySelector('span').textContent = `${mm}:${ss}`;
  }

  setSaveStatus(message, error = false) {
    const node = this.dialog.querySelector('[data-save-status]');
    node.textContent = message;
    node.classList.toggle('is-error', error);
    if (message) this.statusNode.textContent = message;
  }

  showError(message, error = false) {
    this.errorNode.hidden = !message;
    this.errorNode.textContent = message || '';
    this.errorNode.classList.toggle('is-error', error);
  }

  clearError() {
    this.showError('');
  }

  refreshUnloadGuard() {
    const shouldProtect = !this.closed && (this.recorder?.state === 'recording' || this.state === 'finalizing' || (this.reviewBlob && !this.saved));
    if (shouldProtect && !this.unloadGuardActive) {
      window.addEventListener('beforeunload', this.boundBeforeUnload);
      this.unloadGuardActive = true;
    } else if (!shouldProtect && this.unloadGuardActive) {
      window.removeEventListener('beforeunload', this.boundBeforeUnload);
      this.unloadGuardActive = false;
    }
  }

  toggleGuide() {
    if (this.state === 'recording') return;
    const guide = this.dialog.querySelector('[data-guide]');
    guide.hidden = !guide.hidden;
  }

  clearReview() {
    this.saved = false;
    this.savedClip = null;
    this.reviewBlob = null;
    this.reviewMeta = null;
    this.metadataValid = false;
    this.reviewSheet.hidden = true;
    this.reviewStage.hidden = true;
    this.reviewVideo.removeAttribute('src');
    this.reviewVideo.load();
    if (this.reviewUrl) URL.revokeObjectURL(this.reviewUrl);
    this.reviewUrl = '';
    this.openSavedButton.hidden = true;
    this.submitButton.hidden = true;
    this.saveButton.hidden = false;
    this.saveButton.disabled = false;
    this.saveButton.textContent = '이 브라우저에 저장';
    this.setSaveStatus('');
    this.refreshUnloadGuard();
  }

  async downloadReview() {
    if (!this.reviewUrl || this.nativeSharing) return;
    if (isNativeApp()) {
      this.nativeSharing = true;
      const button = this.dialog.querySelector('[data-download]');
      button.disabled = true;
      this.setSaveStatus('파일을 준비하고 있습니다.');
      try { await shareNativeBlob(this.reviewBlob, fileNameFor(safeTitle(this.activity), this.reviewMeta?.mimeType)); this.setSaveStatus(''); }
      catch (error) { this.setSaveStatus(error.message || '파일을 공유하지 못했습니다.'); }
      finally { this.nativeSharing = false; if(button.isConnected)button.disabled = false; }
      return;
    }
    const link = document.createElement('a');
    link.href = this.reviewUrl;
    link.download = fileNameFor(safeTitle(this.activity), this.reviewMeta?.mimeType);
    document.body.append(link);
    link.click();
    link.remove();
  }

  isActive(token) {
    return !this.closed && !document.hidden && this.dialog.open && this.generation === token && this.isCurrent();
  }

  onVisibilityChange(nativeBackground = false) {
    if (!document.hidden && !nativeBackground) return;
    if (this.recorder?.state === 'recording') {
      this.stopRecording('hidden');
      return;
    }
    this.generation++;
    this.stopStream();
    if (!this.reviewBlob && !this.saved) {
      this.showError('화면이 숨겨져 카메라를 껐어요. 다시 시도해주세요.');
      this.setState('error');
    }
  }

  stopStream() {
    const stream = this.stream;
    this.stream = null;
    if (stream) stream.getTracks().forEach(track => track.stop());
    this.liveVideo.srcObject = null;
  }

  interrupt(reason = 'interrupted') {
    if (this.closed) return;
    if (this.state === 'finalizing') return;
    if (this.recorder?.state === 'recording') {
      if (!this.isCurrent()) {
        this.close(true);
        return;
      }
      this.showError('화면 전환으로 녹화를 마쳤어요. 촬영분은 확인 후 저장할 수 있습니다.');
      this.stopRecording(reason);
      return;
    }
    if (this.reviewBlob && !this.saved) {
      this.showError('화면 전환이 감지됐어요. 촬영분은 저장하거나 다시 촬영할 수 있습니다.');
      return;
    }
    this.close(true);
  }

  close(force = false) {
    if (this.closed) return;
    if (!force) return this.requestClose();
    this.closed = true;
    this.generation++;
    clearTimeout(this.limitTimer);
    clearInterval(this.recordTimer);
    if (this.recorder?.state === 'recording') {
      this.recorder.onstop = null;
      try { this.recorder.stop(); } catch {}
    }
    this.stopStream();
    this.clearReview();
    document.removeEventListener('keydown', this.boundKeydown);
    document.removeEventListener('visibilitychange', this.boundVisibility);
    document.removeEventListener('native:app-state', this.boundNativeState);
    window.removeEventListener('beforeunload', this.boundBeforeUnload);
    this.unloadGuardActive = false;
    window.removeEventListener('pagehide', this.boundPagehide);
    window.removeEventListener('hashchange', this.boundHash);
    if (this.dialog.open) this.dialog.close();
    this.dialog.remove();
    if (activeCamera === this) activeCamera = null;
    this.trigger?.focus?.({ preventScroll: true });
  }
}

export function openStudioCamera(options = {}) {
  activeCamera?.close(true);
  activeCamera = new StudioCamera(options);
  activeCamera.open();
  return activeCamera.dialog;
}

export function interruptStudioCamera(reason = 'interrupted') {
  activeCamera?.interrupt(reason);
}

export function closeStudioCamera({ preserve = false } = {}) {
  if (preserve) activeCamera?.interrupt('interrupted');
  else activeCamera?.close(true);
}
