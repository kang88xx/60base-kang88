import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../studio/online.js',import.meta.url),'utf8');
const viewVideoSource=source.match(/^export async function viewVideo\(id\).*$/m)?.[0];
assert.ok(viewVideoSource,'video viewer must be present');
async function renderPlayback(url,{native=true,status='submitted'}={}){
 const body={innerHTML:'',textContent:''},calls=[];
 const context={URL,isNativeApp:()=>native,dialog:()=>({isConnected:true,open:true,querySelector:()=>body}),api:async(path)=>{
  calls.push(path);
  return path.endsWith('/playback')?{url}:{video:{status,title:'Fixture',duration:10,size:20},reviews:[]};
 },esc:String,badge:String,date:String,size:String,videoPoints:()=>''};
 vm.createContext(context);
 vm.runInContext(viewVideoSource.replace('export ',''),context);
 await context.viewVideo('video-1');
 return {body,calls};
}
const accepted=await renderPlayback('https://60base.ai/api/videos/video-1/file?token=fixture');
assert.match(accepted.body.innerHTML,/<video src="https:\/\/60base\.ai\/api\/videos\/video-1\/file\?token=fixture"/);
assert.equal(accepted.body.textContent,'');
for(const url of ['https://60base.kr/api/videos/video-1/file?token=fixture','http://60base.ai/api/videos/video-1/file','https://60base.ai.evil.test/api/videos/video-1/file','https://60base.ai/api/videos/other/file']){
 const result=await renderPlayback(url);
 assert.equal(result.body.innerHTML,'');
 assert.equal(result.body.textContent,'영상 주소를 확인하지 못했습니다.');
}
const web=await renderPlayback(undefined,{native:false});
assert.deepEqual(web.calls,['/videos/video-1']);
assert.match(web.body.innerHTML,/<video src="\/api\/videos\/video-1\/file"/);
const deleted=await renderPlayback(undefined,{status:'deleted'});
assert.deepEqual(deleted.calls,['/videos/video-1']);
assert.doesNotMatch(deleted.body.innerHTML,/<video/);
console.log('PASS canonical native playback, legacy/untrusted origin rejection, video identity, relative web playback and deleted-video exclusion.');
