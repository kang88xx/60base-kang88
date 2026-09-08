const DB_NAME = 'momjit-local-v1';
let database;
const listeners = new Set();
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('momjit-records-v1') : null;
function notify(remote = false) {
  for (const fn of listeners) { try { fn(); } catch (error) { console.error(error); } }
  if (!remote) channel?.postMessage({ type: 'changed' });
}
if (channel) channel.onmessage = () => notify(true);
addEventListener('focus', () => notify(true));
document.addEventListener('visibilitychange', () => { if (!document.hidden) notify(true); });
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function db() {
  if (!database) database = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('이 브라우저에서는 로컬 저장소를 사용할 수 없어요. 일반 브라우저 창으로 열어주세요.')); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('clips', { keyPath: 'id' }); request.result.createObjectStore('settings', { keyPath: 'id' }); };
    request.onsuccess = () => { const connection = request.result; connection.onversionchange = () => { connection.close(); database = null; }; resolve(connection); };
    request.onerror = () => { database = null; reject(request.error); };
    request.onblocked = () => { database = null; reject(new Error('저장소를 업데이트할 수 없어요. 다른 몸짓 탭을 닫고 다시 시도해주세요.')); };
  });
  return database;
}
async function read(store, key) {
  const connection = await db();
  return new Promise((resolve, reject) => { const tx = connection.transaction(store); const request = key === undefined ? tx.objectStore(store).getAll() : tx.objectStore(store).get(key); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
async function write(store, operation) {
  const connection = await db();
  return new Promise((resolve, reject) => {
    const tx = connection.transaction(store, 'readwrite'); let value;
    try { value = operation(tx.objectStore(store)); } catch (error) { tx.abort(); reject(error); return; }
    tx.oncomplete = () => { notify(); resolve(typeof value === 'function' ? value() : value); };
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('저장하지 못했어요. 저장 공간과 브라우저 설정을 확인해주세요.'));
  });
}
export async function getClips() { return (await read('clips')).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
export const getClip = id => read('clips', id);
export async function saveClip(input) {
  const clip = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString(), status: input.status === 'ready' ? 'ready' : 'draft' };
  await write('clips', store => store.put(clip)); return clip;
}
export async function updateClip(id, changes) {
  let record;
  await write('clips', store => { const request = store.get(id); request.onsuccess = () => { if (request.result) { const {title, notes, status} = changes; record = {...request.result, ...(title !== undefined ? {title} : {}), ...(notes !== undefined ? {notes} : {}), ...(status !== undefined ? {status: status === 'ready' ? 'ready' : 'draft'} : {})}; store.put(record); } }; });
  if (!record) throw new Error('다른 화면에서 삭제된 기록이에요. 목록을 새로 확인해주세요.'); return record;
}
export const deleteClip = id => write('clips', store => store.delete(id));
export async function getProfile() { const profile = await read('settings', 'profile'); return profile || { name: '참여자', goal: 3 }; }
export async function saveProfile(profile) { const item = { id: 'profile', name: String(profile.name || '').trim().slice(0, 24) || '참여자', goal: Math.min(30, Math.max(1, Number(profile.goal) || 3)) }; await write('settings', store => store.put(item)); return item; }
export async function addExamples() {
  const items = [{ id:'sample-table',title:'식탁 위의 작은 준비',missionId:'table',category:'주방',duration:185,status:'ready' },{ id:'sample-laundry',title:'차곡차곡, 수건 개기',missionId:'laundry',category:'생활',duration:96,status:'draft' }];
  await write('clips', store => { items.forEach((item,i) => store.put({...item,createdAt:new Date(Date.now()-i*3600000).toISOString(),source:'sample',example:true,blob:null,size:0,mimeType:'',notes:'화면을 살펴보기 위한 예시 기록입니다. 실제 영상은 포함되어 있지 않아요.'})); });
}
