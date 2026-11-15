const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const M=require('./preflight-model'),V=require('./preflight-view');
function rig(options={}){
 const changes={},results=[],soundResults=[],tracks=[],revoked=[],nodes=[];let now=10000000;
 const document={querySelector:()=>null,addEventListener:(type,fn)=>changes[type]=fn};
 const devices=[{kind:'audioinput',deviceId:'default',groupId:'group'},{kind:'audioinput',deviceId:'mic',groupId:'group',label:'Test mic'}];
 const media={enumerateDevices:async()=>devices,getUserMedia:options.getUserMedia||(async()=>{const track={getSettings:()=>({deviceId:'mic',groupId:'group'}),stop(){this.stopped=true;}};tracks.push(track);return {getTracks:()=>[track],getAudioTracks:()=>[track]};})};
 class FakeContext{constructor(){this.sampleRate=8000;this.audioWorklet={addModule:async()=>{}};}createMediaStreamSource(){return {connect(){},disconnect(){}};}createGain(){return {gain:{value:0},connect(){},disconnect(){}};}resume(){return Promise.resolve();}close(){return Promise.resolve();}}
 class FakeNode{constructor(){this.port={};nodes.push(this);}connect(){}disconnect(){}}
 class FakeURL extends URL{static createObjectURL(){return 'blob:test';}static revokeObjectURL(url){revoked.push(url);}}
 const context={window:{QingchangPreflightModel:M,QingchangPreflightView:V},document,navigator:{mediaDevices:media},AbortController,setTimeout,clearTimeout,URL:FakeURL,Blob,AudioContext:FakeContext,AudioWorkletNode:FakeNode,location:{href:'file:///test/index.html'},Float32Array};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'preflight-page.js'),'utf8'),context);
 const controller=context.window.QingchangPreflightPage.create({api:{networkProbe:options.networkProbe||(async()=>({ok:true,rttMs:2}))},toast(){},repaint(){},onNetworkResult:x=>results.push(x),onSoundResult:x=>soundResults.push(x),getUpload:()=>({mbps:40,at:now}),clock:()=>now,wait:async ms=>{now+=ms;},measureUpload:options.measureUpload||(async()=>true)});
 return {controller,results,soundResults,changes,tracks,revoked,nodes};
}
test('completed probes publish immutable snapshots and changing the target invalidates readiness',async()=>{
 const r=rig();await r.controller.action('preflight-network-complete');assert.equal(r.results.at(-1).completed,true);assert.equal(r.results.at(-1).samples.length,30);assert.equal(r.results[0].samples.length,0);
 r.changes.change({target:{dataset:{preflight:'target'},value:'cloudflare'}});assert.equal(r.results.at(-1).completed,false);assert.equal(r.results.at(-1).samples.length,0);assert.equal(r.results.at(-1).target,'cloudflare');
});
test('leaving during upload cancels the request and never starts probes afterwards',async()=>{
 let finish,signal,calls=0;const r=rig({measureUpload:async options=>{signal=options.signal;return new Promise(resolve=>finish=resolve);},networkProbe:async()=>{calls++;return {ok:true,rttMs:1};}});
 const task=r.controller.action('preflight-network-complete');r.controller.leave();assert.equal(signal.aborted,true);finish(true);await task;assert.equal(calls,0);assert.equal(r.results.at(-1).completed,false);assert.equal(r.controller.status().network.running,false);
});
test('stopping an in-flight probe drops its late reply and coalesces duplicate starts',async()=>{
 let finish,calls=0;const r=rig({networkProbe:async()=>{calls++;return new Promise(resolve=>finish=resolve);}});const task=r.controller.action('preflight-network-start');await r.controller.action('preflight-network-start');assert.equal(calls,1);r.controller.action('preflight-network-stop');finish({ok:true,rttMs:1});await task;assert.equal(r.results.at(-1).samples.length,0);assert.equal(r.results.at(-1).completed,false);
});
test('upload failure cannot reuse the previous completed result',async()=>{
 let ok=true;const r=rig({measureUpload:async()=>ok});await r.controller.action('preflight-network-complete');ok=false;await r.controller.action('preflight-network-complete');assert.equal(r.results.at(-1).completed,false);assert.equal(r.results.at(-1).samples.length,0);assert.ok(r.controller.status().network.error);
});
test('late microphone permission after leaving stops its tracks and never records',async()=>{
 let finish,stopped=false;const r=rig({getUserMedia:()=>new Promise(resolve=>finish=resolve)});const task=r.controller.action('preflight-audio-start');r.controller.leave();finish({getTracks:()=>[{stop(){stopped=true;}}]});await task;assert.equal(stopped,true);assert.equal(r.nodes.length,0);assert.equal(r.soundResults.at(-1).completed,false);
});
test('a full sound capture retains measured metadata but leaving clears playback data',async()=>{
 const r=rig();await r.controller.action('preflight-audio-start');assert.equal(r.nodes.length,1);
 const quiet=new Float32Array(24000).fill(.0001),voice=new Float32Array(56000);for(let i=0;i<voice.length;i++)voice[i]=.1*Math.sin(i*.2);
 r.nodes[0].port.onmessage({data:quiet});r.nodes[0].port.onmessage({data:voice});const result=r.soundResults.at(-1);assert.equal(result.completed,true);assert.equal(result.seconds,10);assert.equal(result.deviceId,'mic');assert.equal(result.usingDefault,true);assert.equal(result.groupId,'group');assert.equal(result.issues.length,0);assert.ok(result.result.voiceDb>-25);assert.equal(r.tracks[0].stopped,true);
 r.controller.leave();assert.equal(r.controller.status().audio.result,null);assert.equal(r.revoked.at(-1),'blob:test');
});

test('expired sound results and a changed default input cannot render as currently passed',()=>{
 const result={seconds:10,completed:true,issues:[],noiseDb:-80,voiceDb:-23,peakDb:-20,clipPercent:0};
 const base={audio:{phase:'idle',error:'',result:null},devices:[{deviceId:'mic',groupId:'one'},{deviceId:'default',groupId:'two'}],deviceId:'',now:10000000,soundCheck:{at:10000000,deviceId:'mic',groupId:'one',usingDefault:true,seconds:10,completed:true,issues:[],result}};
 assert.ok(!V.sound(base).includes('diagnosis-summary ready'));
 const expired={...base,audio:{...base.audio,result,at:1}};assert.match(V.sound(expired),/试音结果已过期/);assert.ok(!V.sound(expired).includes('diagnosis-summary ready'));
 const current={...base,devices:[{deviceId:'mic',groupId:'one'},{deviceId:'default',groupId:'one'}]};assert.ok(V.sound(current).includes('diagnosis-summary ready'));
});
