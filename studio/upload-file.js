// Preserve the original container and filename; the server verifies actual media.
const mimeExtensions={'video/mp4':'.mp4','video/webm':'.webm','video/quicktime':'.mov'};
export async function uploadFileInfo(file,fallbackName='촬영 영상'){
 const declared=(file.type||'').split(';')[0].trim().toLowerCase();
 const name=file.name||'',extension=name.toLowerCase().match(/\.(mp4|m4v|webm|mov)$/)?.[1];
 let mime=declared;
 if(!mime||mime==='application/octet-stream')mime=({mp4:'video/mp4',m4v:'video/mp4',webm:'video/webm',mov:'video/quicktime'})[extension];
 if(!mimeExtensions[mime])throw Error('재생 가능한 MOV·MP4·WebM 원본 영상을 선택해주세요.');
 return {mime,filename:name||fallbackName+mimeExtensions[mime]};
}
