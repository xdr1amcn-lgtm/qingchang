const test=require('node:test'),assert=require('node:assert/strict'),M=require('./preflight-model'),{parseReply,createProbe}=require('./network-probe');
test('quiet calibration and ordinary speech produce measured levels without warnings',()=>{const rate=8000,a=new Float32Array(rate*3).fill(.0001),b=new Float32Array(rate*7);for(let i=0;i<b.length;i++)b[i]=.1*Math.sin(i*.2);const result=M.audioSummary([a,b],rate);assert.equal(result.seconds,10);assert.ok(result.voiceDb>-25&&result.voiceDb<-22);assert.ok(result.noiseDb<-70);assert.deepEqual(result.issues,[]);});
test('silence, clipping, high noise and incomplete audio are distinct findings',()=>{const silent=M.audioSummary([new Float32Array(80000)],8000);assert.ok(silent.issues.some(x=>x.includes('几乎无声音')));const clipped=M.audioSummary([new Float32Array(80000).fill(1)],8000,false);assert.equal(clipped.clipPercent,100);assert.ok(clipped.issues.some(x=>x.includes('削波')));assert.ok(clipped.issues.some(x=>x.includes('安静阶段')));assert.ok(clipped.issues.some(x=>x.includes('未完成')));});
test('WAV is bounded mono PCM16 and preserves sample signs and header sizes',()=>{const bytes=M.wav([new Float32Array([-1,0,1])],48000),view=new DataView(bytes.buffer);assert.equal(Buffer.from(bytes).toString('ascii',0,4),'RIFF');assert.equal(view.getUint32(40,true),6);assert.equal(view.getUint16(22,true),1);assert.equal(view.getInt16(44,true),-32768);assert.equal(view.getInt16(48,true),32767);assert.throws(()=>M.wav([],1));assert.throws(()=>M.wav([new Float32Array(8000*16)],8000));});
test('network statistics retain zero, do not bridge failures for jitter, and missing is not zero latency',()=>{const s=M.networkSummary([{ok:true,rttMs:0},{ok:true,rttMs:10},{ok:false,rttMs:null},{ok:true,rttMs:40}]);assert.equal(s.lossPercent,25);assert.equal(s.avg,50/3);assert.equal(s.jitter,10);const none=M.networkSummary([{ok:false}]);assert.equal(none.avg,null);assert.equal(none.jitter,null);assert.equal(none.lossPercent,100);assert.equal(M.networkSummary([]).lossPercent,null);});
test('Windows ping parsing accepts Chinese and English replies and does not mistake unreachable text for success',()=>{assert.equal(parseReply('Reply from 1.1.1.1: bytes=32 time=23ms TTL=54').rttMs,23);assert.equal(parseReply('来自 1.1.1.1 的回复: 字节=32 时间<1ms TTL=54').rttMs,.5);assert.equal(parseReply('Reply from 10.0.0.1: Destination host unreachable.').ok,false);assert.equal(parseReply('Minimum = 23ms, Maximum = 23ms').ok,false);});
test('probe arguments are fixed and concurrent requests cannot launch extra ping processes',async()=>{let resolve,calls=0;const probe=createProbe(async(exe,args,options)=>{calls++;assert.ok(exe.endsWith('ping.exe'));assert.deepEqual(args,['-4','-n','1','-w','1000','1.1.1.1']);assert.equal(options.windowsHide,true);return new Promise(r=>resolve=r);},()=>100);await assert.rejects(probe('1.1.1.1 & cmd'));const first=probe('cloudflare');await assert.rejects(probe('alibaba'));resolve({stdout:'Reply time=12ms TTL=52'});assert.equal((await first).rttMs,12);assert.equal(calls,1);});
test('probe failure stays unavailable and does not expose process output',async()=>{const probe=createProbe(async()=>{throw Object.assign(Error('sensitive command output'),{code:'ENOENT'});});const r=await probe('alibaba');assert.equal(r.ok,false);assert.equal(r.rttMs,null);assert.ok(!JSON.stringify(r).includes('sensitive'));});
const now=10000000;
test('upload thresholds honor 30 and 50 Mbps, reject missing or stale readings',()=>{
 for(const speed of [0,NaN,Infinity])assert.equal(M.uploadAssessment(speed,now,now).level,'pending');
 assert.equal(M.uploadAssessment(29.99,now,now).title,'上传未达到最低门槛');
 assert.match(M.uploadAssessment(30,now,now).title,/达到最低门槛/);
 assert.equal(M.uploadAssessment(49.99,now,now).level,'warn');
 assert.equal(M.uploadAssessment(50,now,now).level,'green');
 assert.equal(M.uploadAssessment(60,now-900001,now).level,'pending');
 assert.equal(M.uploadAssessment(60,undefined,now).level,'pending');
});
test('good upload alone cannot pass an unfinished or unstable network check',()=>{
 const stable=[{ok:true,rttMs:1},{ok:true,rttMs:2},{ok:true,rttMs:1}];
 assert.equal(M.networkVerdict(stable,false,60,now,now).level,'pending');
 assert.equal(M.networkVerdict(stable,true,50,now,now).level,'green');
 assert.equal(M.networkVerdict(stable,true,30,now,now).level,'warn');
 assert.equal(M.networkVerdict([...stable,{ok:false}],true,60,now,now).level,'warn');
 assert.equal(M.networkVerdict([{ok:true,rttMs:1},{ok:true,rttMs:80}],true,60,now,now).level,'warn');
 assert.equal(M.networkVerdict(stable,true,60,now-900001,now).level,'pending');
});

test('fresh upload cannot revive expired or incomplete connection results',()=>{
 const samples=[{ok:true,rttMs:1},{ok:true,rttMs:2}];
 assert.equal(M.networkAssessment({at:now,completed:true,samples},40,now,now).code,'upload-margin');
 assert.equal(M.networkAssessment({at:now-900001,completed:true,samples},60,now,now).level,'pending');
 assert.equal(M.networkAssessment({at:now,completed:false,samples},60,now,now).level,'pending');
 assert.equal(M.networkAssessment({at:now,completed:true,samples},20,now,now).code,'below-minimum');
});
