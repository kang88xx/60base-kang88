// Beta intake policy. Validate measured media seconds; never round boundary values.
export const VIDEO_TARGET_SECONDS = 60;
export const VIDEO_MAX_UPLOAD_SECONDS = VIDEO_TARGET_SECONDS * 1.5;
export const VIDEO_DURATION_HELP = '베타 테스트 · 촬영은 1분 후 자동 종료됩니다. 업로드는 1분~1분 30초 영상만 가능합니다.';
export function videoDurationError(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return '영상 길이를 확인하지 못했어요. 재생 가능한 MP4·MOV·WebM 파일로 다시 선택해주세요.';
  if (seconds < VIDEO_TARGET_SECONDS) return '1분 미만의 영상은 업로드할 수 없어요. 1분 이상 촬영한 영상을 선택해주세요.';
  if (seconds > VIDEO_MAX_UPLOAD_SECONDS) return '영상이 너무 길어요. 1분 30초 이하의 영상을 선택해주세요.';
  return '';
}
export function assertVideoDuration(seconds) {
  const message = videoDurationError(seconds);
  if (message) throw new Error(message);
}
