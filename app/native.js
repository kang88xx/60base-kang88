// Web imports this safely; native dependencies load only inside the bundled shell.
export const isNativeApp=()=>globalThis.Capacitor?.isNativePlatform?.()===true;
const dependencies=()=>Promise.all([import('@capacitor/core'),import('@capacitor-firebase/authentication'),import('@capacitor/filesystem'),import('@capacitor/share'),import('@capacitor/app'),import('@capacitor/browser')]);
let loaded;
const plugins=()=>loaded||(loaded=dependencies().catch(error=>{loaded=undefined;throw error;}));
const aborted=signal=>{if(signal?.aborted)throw new DOMException('Request aborted','AbortError');};
export async function signInNative(providerId){
 if(!isNativeApp())return null;
 const [, {FirebaseAuthentication}]=await plugins();
 const result=providerId==='google.com'?await FirebaseAuthentication.signInWithGoogle():providerId==='apple.com'?await FirebaseAuthentication.signInWithApple():null;
 if(!result?.credential?.idToken)throw new Error('기기 로그인 인증 정보를 받지 못했습니다.');
 return {idToken:result.credential.idToken,accessToken:result.credential.accessToken,rawNonce:result.credential.nonce,authorizationCode:result.credential.authorizationCode};
}
export async function nativeSignOut(){if(isNativeApp()){const [, {FirebaseAuthentication}]=await plugins();await FirebaseAuthentication.signOut();}}
async function base64(blob){
 const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';
 for(let index=0;index<bytes.length;index+=16384)binary+=String.fromCharCode(...bytes.subarray(index,index+16384));
 return btoa(binary);
}
export async function nativeApiRequest(path,{method='GET',body,raw,csrf='',signal}={}){
 if(!isNativeApp())throw new Error('Native transport is unavailable.');
 if(typeof path!=='string'||!path.startsWith('/api/')||path.includes('\\'))throw new Error('Invalid API path.');
 const url=new URL(path,'https://60base.ai');
 if(url.origin!=='https://60base.ai'||!url.pathname.startsWith('/api/'))throw new Error('Invalid API destination.');
 aborted(signal);
 const [{CapacitorHttp}]=await plugins();aborted(signal);
 const headers={Origin:'https://60base.ai',Accept:'application/json'};
 if(csrf)headers['X-CSRF-Token']=csrf;
 let data=body,dataType;
 if(raw!==undefined&&raw!==null){
  if(!(raw instanceof Blob)||raw.size>2*1024*1024)throw new Error('Native upload chunks must be Blob values up to 2 MiB.');
  data=await base64(raw);dataType='file';headers['Content-Type']='application/octet-stream';
 }else if(body!==undefined)headers['Content-Type']='application/json';
 aborted(signal);
 const response=await CapacitorHttp.request({url:url.href,method,headers,data,dataType,responseType:'json',disableRedirects:true,connectTimeout:30000,readTimeout:60000});
 // CapacitorHttp cannot cancel a dispatched native request; fence its result.
 aborted(signal);
 return {ok:response.status>=200&&response.status<300,status:response.status,json:async()=>typeof response.data==='string'?JSON.parse(response.data):response.data};
}
const missingNativeFile=error=>error?.code==='OS-PLUG-FILE-0008';
function cleanupError(error){return new Error('공유용 임시 영상 정리를 완료하지 못했습니다. 앱을 다시 열어 정리를 재시도해주세요.',{cause:error});}
async function deleteShareFile(Filesystem,path,directory){
 try{await Filesystem.deleteFile({path,directory});}catch(error){if(!missingNativeFile(error))throw cleanupError(error);}
}
export async function shareNativeBlob(blob,filename){
 if(!isNativeApp())return false;
 const [,,{Filesystem,Directory},{Share}]=await plugins();
 const safe=String(filename||'60base-video.mp4').replace(/[^a-zA-Z0-9._-]/g,'_');
 const path=`60base-share-${crypto.randomUUID()}-${safe}`,directory=Directory.Cache;
 try{
  for(let offset=0;offset<Math.max(1,blob.size);offset+=768*1024){
   const data=await base64(blob.slice(offset,offset+768*1024));
   if(offset===0)await Filesystem.writeFile({path,directory,data});else await Filesystem.appendFile({path,directory,data});
  }
  const {uri}=await Filesystem.getUri({path,directory});
  await Share.share({title:'에고 영상',files:[uri],dialogTitle:'영상 저장 또는 공유'});
  return true;
 }finally{await deleteShareFile(Filesystem,path,directory);}
}
let initialized=false,initializing;
let navigationInstalled=false,backInstalled=false,stateInstalled=false;
export async function initializeNative(){
 if(!isNativeApp()||initialized)return;
 if(initializing)return initializing;
 initializing=(async()=>{
 const [,,{Filesystem,Directory},,{App},{Browser}]=await plugins();
 document.documentElement.dataset.native='true';
 if(!navigationInstalled){document.addEventListener('click',event=>{
  const link=event.target.closest?.('a[href]');if(!link)return;
  const url=new URL(link.href,location.href);
  if(url.origin===location.origin){
   if(url.pathname==='/'||url.pathname.startsWith('/admin/')){event.preventDefault();Browser.open({url:'https://60base.ai'+url.pathname+url.search+url.hash});}
   return;
  }
  if(url.protocol==='https:'||url.protocol==='http:'){event.preventDefault();if(url.protocol==='https:')Browser.open({url:url.href});}
 });navigationInstalled=true;}
 if(!backInstalled){await App.addListener('backButton',()=>{
  const dialog=document.querySelector('dialog[open]');
  if(dialog){dialog.close();return;}
  if(location.hash&&location.hash!=='#home'){history.back();return;}
  App.minimizeApp();
 });backInstalled=true;}
 if(!stateInstalled){await App.addListener('appStateChange',({isActive})=>document.dispatchEvent(new CustomEvent('native:app-state',{detail:{isActive}})));stateInstalled=true;}
 // Keep navigation protections active even when private-cache recovery needs retry.
 let entries;
 try{entries=await Filesystem.readdir({path:'',directory:Directory.Cache});}
 catch(error){if(missingNativeFile(error))entries={files:[]};else throw cleanupError(error);}
 for(const file of entries.files){
  if(typeof file.name==='string'&&file.name.startsWith('60base-share-')&&!/[\\/]/.test(file.name))await deleteShareFile(Filesystem,file.name,Directory.Cache);
 }
 initialized=true;
 })();
 try{await initializing;}catch(error){initialized=false;throw error;}finally{initializing=undefined;}
}
