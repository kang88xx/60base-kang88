import { isNativeApp, initializeNative } from './native.js';
import { dialog } from '../studio/online-api.js';
let deferredPrompt=null,registration=null,onChange=()=>{},onMessage=()=>{};
let status={installed:false,available:false,updateAvailable:false,offlineReady:false,error:''};
export function getInstallState(){return {...status};}
function publish(patch){status={...status,...patch};onChange(status);}
export function initializeInstall(options={}){
 onChange=options.onChange||(()=>{});onMessage=options.onMessage||(()=>{});
 if(isNativeApp()){publish({installed:true,available:false,offlineReady:true});initializeNative().then(()=>publish({error:''})).catch(error=>{const message=error.message||'기기 연결을 초기화하지 못했습니다.';publish({error:message});onMessage(message);});return;}
 const display=matchMedia('(display-mode: standalone)');
 publish({installed:display.matches||navigator.standalone===true});
 display.addEventListener?.('change',()=>publish({installed:display.matches||navigator.standalone===true}));
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredPrompt=event;publish({available:true});});
 window.addEventListener('appinstalled',()=>{deferredPrompt=null;publish({installed:true,available:false});onMessage('에고가 홈 화면에 추가됐어요.');});
 if('serviceWorker'in navigator&&window.isSecureContext){
  navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(value=>{
   registration=value;
   publish({offlineReady:!!value.active,updateAvailable:!!value.active&&!!value.waiting});
   value.addEventListener('updatefound',()=>{const installing=value.installing;installing?.addEventListener('statechange',()=>{if(installing.state==='installed')publish({offlineReady:!!value.active,updateAvailable:!!value.active&&!!value.waiting});if(installing.state==='activated')publish({offlineReady:true,updateAvailable:!!value.waiting});});});
  }).catch(()=>publish({error:'오프라인 준비를 완료하지 못했어요. 온라인으로 계속 이용할 수 있습니다.'}));
 }
}
export async function requestInstall(){
 if(status.installed){onMessage('홈 화면에 설치된 앱으로 이용 중이에요.');return;}
 if(deferredPrompt){
  const prompt=deferredPrompt;deferredPrompt=null;publish({available:false});
  await prompt.prompt();const choice=await prompt.userChoice;
  if(choice.outcome==='dismissed')onMessage('나중에 설정에서 다시 설치할 수 있어요.');
  return;
 }
 const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 dialog('홈 화면에 에고 추가',ios?'<p>Safari에서 공유 버튼을 누른 뒤 <strong>홈 화면에 추가</strong>를 선택해주세요.</p><p class="online-help">다른 앱 안에서 열었다면 먼저 Safari로 열어주세요.</p>':'<p>브라우저 메뉴에서 <strong>앱 설치</strong> 또는 <strong>홈 화면에 추가</strong>를 선택해주세요.</p><p class="online-help">설치 메뉴가 보이지 않으면 최신 Chrome 또는 Edge에서 열어주세요. 브라우저에서도 촬영과 제출을 이용할 수 있습니다.</p>');
}
export function applyAppUpdate(){
 if(!registration?.waiting)return;
 if(document.querySelector('dialog[open]')){onMessage('열린 작업을 마친 뒤 업데이트해주세요.');return;}
 navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true});
 registration.waiting.postMessage({type:'ACTIVATE_UPDATE'});
}
