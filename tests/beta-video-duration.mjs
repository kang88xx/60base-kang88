import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { VIDEO_TARGET_SECONDS, videoDurationError, assertVideoDuration } from '../shared/video-policy.js';
for (const [seconds, valid] of [[59.99,false],[60,true],[90,true],[90.01,false],[NaN,false],[Infinity,false],[0,false]]) {
 test(`measured duration ${seconds} ${valid?'accepted':'rejected'}`, () => {
  assert.equal(videoDurationError(seconds)==='', valid);
  valid ? assert.doesNotThrow(()=>assertVideoDuration(seconds)) : assert.throws(()=>assertVideoDuration(seconds));
 });
}
test('policy does not accept claimed numeric strings or round fractional boundaries',()=>{
 assert.throws(()=>assertVideoDuration('60'));
 assert.match(videoDurationError(59.99),/1분 미만/);
 assert.match(videoDurationError(90.01),/너무 길/);
});
const cameraSource=(await readFile(new URL('../studio/camera.js', import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
function cameraFixture({autoStart=true}={}){
 let clock=0, limit, interval, stopCount=0;const timerText={textContent:''};
 const context=vm.createContext({VIDEO_TARGET_SECONDS,videoDurationError,assertVideoDuration,performance:{now:()=>clock},navigator:{userAgent:'Safari'},window:{setTimeout:(fn,ms)=>{limit={fn,ms};return 1},setInterval:fn=>{interval=fn;return 2}},clearTimeout(){},clearInterval(){},MediaRecorder:class{constructor(){this.state='inactive';this.mimeType='video/mp4'}start(){this.state='recording';if(autoStart)this.onstart?.()}requestData(){}stop(){stopCount++;this.state='inactive'}},Blob,URL});
 vm.runInContext(cameraSource+'\nglobalThis.Controller=StudioCamera;',context);
 const c=Object.create(context.Controller.prototype);
 Object.assign(c,{state:'ready',stream:{getVideoTracks:()=>[{getSettings:()=>({})}]},liveVideo:{videoWidth:640,videoHeight:360},clearError(){},setState(state){this.state=state},stopStream(){},timerNode:{querySelector:()=>timerText}});
 return {c,clock:value=>clock=value,limit:()=>limit,interval:()=>interval,stops:()=>stopCount,timer:()=>timerText.textContent};
}
test('recorder completes final frame at 60.25s once while UI stays at 01:00',()=>{
 const f=cameraFixture();f.c.startRecording();assert.equal(f.limit().ms,60250);f.clock(60000);f.interval()();assert.equal(f.stops(),0);assert.equal(f.timer(),'01:00');f.clock(60249);f.interval()();assert.equal(f.stops(),0);assert.equal(f.timer(),'01:00');f.clock(60250);f.limit().fn();assert.equal(f.stops(),1);assert.equal(f.c.duration,60.25);f.c.stopRecording('hidden');f.limit().fn();assert.equal(f.stops(),1);assert.equal(f.c.stopReason,'duration');
});
test('timer update also stops recording if timeout is delayed',()=>{
 const f=cameraFixture();f.c.startRecording();f.clock(60250);f.interval()();assert.equal(f.stops(),1);assert.equal(f.timer(),'01:00');assert.equal(f.c.stopReason,'duration');
});
test('manual cancellation prevents later timer from stopping twice or overwriting reason',()=>{
 const f=cameraFixture();f.c.startRecording();f.clock(23000);f.c.stopRecording('manual');f.clock(60000);f.limit().fn();assert.equal(f.stops(),1);assert.equal(f.c.stopReason,'manual');assert.equal(f.c.duration,23);
});

for (const rel of ['studio/camera.js','studio/local-records.js','studio/online.js']) {
 test(`${rel} uses measured duration and rejects unknown media instead of trusting hints`, async()=>{
  const source=await readFile(new URL('../'+rel,import.meta.url),'utf8');
  const name=rel.endsWith('online.js')?'metadata':'inspectVideo';
  const start=source.indexOf((name==='metadata'?'async ':'')+'function '+name+'(');
  const end=source.indexOf('\n}',start)+2;
  const timers=[];let video;
  const context=vm.createContext({document:{createElement:()=>video={duration:Infinity,videoWidth:640,videoHeight:360,removeAttribute(){},load(){}}},URL:{createObjectURL:()=> 'blob:qa',revokeObjectURL(){}},setTimeout:fn=>{timers.push(fn);return 1},clearTimeout(){},Error});
  vm.runInContext(source.slice(start,end)+'\nglobalThis.inspect='+name,context);
  const result=context.inspect({},60);video.onloadedmetadata();timers[0]();
  try{const details=await result;assert.throws(()=>assertVideoDuration(details.duration));}catch(error){assert.match(error.message,/영상|시간/);}
 });
}

test('60-second deadline begins on encoder start event and excludes startup latency',()=>{
 const f=cameraFixture({autoStart:false});f.clock(10000);f.c.startRecording();assert.equal(f.limit(),undefined);f.clock(15000);f.c.recorder.onstart();assert.equal(f.limit().ms,60250);f.clock(75250);f.limit().fn();assert.equal(f.c.duration,60.25);
});
test('late encoder start after cancellation cannot arm a new stop timer',()=>{
 const f=cameraFixture({autoStart:false});f.c.startRecording();f.c.stopRecording('manual');f.c.recorder.onstart();assert.equal(f.limit(),undefined);assert.equal(f.stops(),1);
});

// Exercise the secondary shared recorder's real start handler, not its text shape.
test('shared capture completes its final frame while displayed time stays at one minute',async()=>{
 const source=await readFile(new URL('../shared/capture.js',import.meta.url),'utf8');
 const begin=source.indexOf('recorder.onstart = () => {');
 const end=source.indexOf('      recorder.start(500);',begin);
 let clock=0,deadline,interval,stops=0;const label={textContent:''};
 const recorder={state:'recording',stop(){stops++;this.state='inactive'}};
 const context=vm.createContext({closed:false,recorder,recording:recorder,started:null,limitTimer:null,timer:null,RECORDING_STOP_MS:60250,VIDEO_TARGET_SECONDS,Date:{now:()=>clock},setTimeout:(fn,ms)=>{deadline={fn,ms}},setInterval:fn=>{interval=fn},$:()=>({querySelector:()=>label}),formatDuration:value=>String(value)});
 vm.runInContext(source.slice(begin,end),context);recorder.onstart();
 assert.equal(deadline.ms,60250);clock=60000;interval();assert.equal(stops,0);assert.equal(label.textContent,'60');
 clock=60249;interval();assert.equal(stops,0);clock=60250;interval();deadline.fn();assert.equal(stops,1);assert.equal(label.textContent,'60');
});

test('interruption during final-frame margin prevents automatic stop overriding its reason',()=>{
 const f=cameraFixture();f.c.startRecording();f.clock(60100);f.c.stopRecording('hidden');f.clock(60250);f.limit().fn();f.interval()();assert.equal(f.stops(),1);assert.equal(f.c.stopReason,'hidden');assert.equal(f.c.duration,60.1);
});
