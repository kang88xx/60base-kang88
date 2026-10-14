// Public upload errors are fixed messages, never arbitrary upstream content.
export const uploadErrors=Object.freeze({
 upload_format:'재생 가능한 MOV·MP4·WebM 원본 영상을 선택해주세요.',
 upload_size:'파일 용량이 업로드 한도를 초과했습니다.',
 upload_duration:'영상 길이를 확인해주세요. 최대 30분까지 제출할 수 있습니다.',
 upload_dimensions:'영상의 길이 또는 해상도를 확인해주세요.',
 upload_task:'모집 중인 촬영 활동을 선택해주세요.',
 upload_title:'영상 제목을 확인해주세요.',
 upload_consent:'촬영·개인정보·이용 동의와 교육 확인이 필요합니다.',
 upload_korea:'대한민국에서 직접 촬영한 영상인지 확인해주세요.'
});
export function uploadErrorCode(message){return Object.keys(uploadErrors).find(code=>uploadErrors[code]===message);}
export function publicUploadError(path,status,payload){
 if(status!==400||!/^\/api\/(?:uploads(?:\/[^/]+\/complete)?|videos\/[^/]+\/submit)$/.test(path))return null;
 if(!payload||typeof payload.code!=='string'||!Object.hasOwn(uploadErrors,payload.code)||payload.error!==uploadErrors[payload.code])return null;
 return {code:payload.code,error:uploadErrors[payload.code]};
}
