// Public values only. Native Apple activation never changes the web build.
export function nativeFirebaseConfig(firebaseConfig,appleFlag){
 const appleEnabled=appleFlag==='1';
 if(appleEnabled&&(!firebaseConfig||['apiKey','authDomain','projectId','appId'].some(key=>typeof firebaseConfig[key]!=='string'||!firebaseConfig[key].trim())))throw new Error('MOBILE_APPLE_ENABLED requires real PUBLIC_FIREBASE_* configuration from the root build first.');
 return firebaseConfig?{...firebaseConfig,appleEnabled}:null;
}
