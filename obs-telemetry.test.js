const test=require('node:test'),assert=require('node:assert/strict'),{WebSocketServer}=require('./test-support/obs-server');
const {createSamples,createClient,normalize,authentication}=require('./obs-telemetry');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check){for(let i=0;i<150;i++){if(check())return;await wait(10);}throw Error('Timed out waiting for OBS fixture');}
function sample(n=0){return [{activeFps:59.9,averageFrameRenderTime:2.1,renderSkippedFrames:10+n,renderTotalFrames:1000+120*n,outputSkippedFrames:20+n*2,outputTotalFrames:2000+120*n},{outputActive:true,outputReconnecting:false,outputDuration:5000+2000*n,outputBytes:1000000+1500000*n,outputSkippedFrames:30+n*3,outputTotalFrames:3000+120*n}];}
test('OBS interval uses bytes/sec in Kbps and keeps render, encoder and network counters separate',()=>{
 const feed=createSamples('fixture'),[s0,o0]=sample(),[s1,o1]=sample(1);const a=feed.push(s0,o0,10000);assert.equal(a.metrics.real_bitrate,null);assert.equal(a.obs.render.skipped,null);
 const b=feed.push(s1,o1,12000);assert.equal(b.metrics.real_bitrate,6000);assert.equal(b.obs.renderFps,59.9);assert.equal(b.obs.render.skipped,1);assert.equal(b.obs.encoding.skipped,2);assert.equal(b.obs.network.skipped,3);assert.equal(b.obs.network.percent,2.5);assert.equal(b.obs.intervalSeconds,2);
});
test('OBS counter reset, output restart, gaps and absent data cannot manufacture zero or negative loss',()=>{
 const feed=createSamples('fixture');let [s,o]=sample(1);const old=feed.push(s,o,10000);[s,o]=sample();let next=feed.push(s,o,12000);assert.equal(next.obs.reset,true);assert.notEqual(old.fileName,next.fileName);assert.equal(next.metrics.real_bitrate,null);assert.equal(next.obs.render.skipped,null);
 const idle=feed.push(s,{...o,outputActive:false},14000);assert.equal(idle.available,false);assert.equal(idle.state,'idle');assert.equal(idle.metrics.real_bitrate,null);
 next=feed.push(s,o,16000);assert.equal(next.metrics.real_bitrate,null);next=feed.push(s,o,30000);assert.equal(next.obs.render.skipped,null);
 next=feed.push({}, {...o,outputBytes:undefined},32000);assert.equal(next.metrics.real_bitrate,null);assert.equal(next.obs.render.skipped,null);assert.equal(next.obs.renderFps,null);
});
test('OBS connection normalization accepts only explicit loopback URLs and computes the 5.x authentication',()=>{
 assert.equal(normalize({}).url,'ws://127.0.0.1:4455/');assert.ok(normalize({obsUrl:'ws://[::1]:4455'}));for(const url of ['http://localhost:4455','ws://example.com:4455','ws://user:secret@localhost:4455','ws://localhost:4455/?token=x'])assert.throws(()=>normalize({obsUrl:url}));
 const crypto=require('node:crypto'),hash=s=>crypto.createHash('sha256').update(s).digest('base64');assert.equal(authentication('secret','salt','challenge'),hash(hash('secretsalt')+'challenge'));
});
async function server(t,onConnection){const wss=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise(resolve=>wss.once('listening',resolve));wss.on('connection',onConnection);t.after(async()=>{for(const c of wss.clients)c.terminate();await new Promise(resolve=>wss.close(resolve));});return wss;}
test('real OBS protocol handshake polls read-only requests, rejects wrong auth, reconnects with fresh baseline, and stops',async t=>{
 let now=100000,connections=0,round=0,identified=false;const requests=[];
 const wss=await server(t,ws=>{connections++;ws.send(JSON.stringify({op:0,d:{rpcVersion:1,authentication:{salt:'salt',challenge:'challenge'}}}));ws.on('message',raw=>{const {op,d}=JSON.parse(raw);if(op===1){assert.equal(d.authentication,authentication('password','salt','challenge'));identified=true;ws.send(JSON.stringify({op:2,d:{negotiatedRpcVersion:1}}));return;}if(op===6){requests.push(d.requestType);if(d.requestType==='GetStats'){now+=2000;round++;}const [stats,output]=sample(round);ws.send(JSON.stringify({op:7,d:{requestId:d.requestId,requestStatus:{result:true},responseData:d.requestType==='GetStats'?stats:output}}));}});});
 const client=createClient({clock:()=>now,pollMs:20,retryMs:20,timeoutMs:500});t.after(()=>client.stop());const config={obsUrl:`ws://127.0.0.1:${wss.address().port}`,obsPassword:'password'};client.start(config);await until(()=>client.read().metrics?.real_bitrate===6000);assert.equal(identified,true);const old=client.read().fileName;for(const ws of wss.clients)ws.close(1001);await until(()=>connections===2&&client.read().metrics?.real_bitrate===6000);assert.notEqual(client.read().fileName,old);assert.deepEqual([...new Set(requests)].sort(),['GetStats','GetStreamStatus']);now+=7000;assert.equal(client.read().state,'stale');client.stop();assert.equal(client.read().state,'stopped');const count=connections;await wait(80);assert.equal(connections,count);assert.ok(!JSON.stringify(client.read()).includes('password'));
});
test('wrong OBS password is reported without retrying or exposing the password',async t=>{
 let count=0;const wss=await server(t,ws=>{count++;ws.send(JSON.stringify({op:0,d:{rpcVersion:1,authentication:{salt:'s',challenge:'c'}}}));ws.on('message',()=>ws.close(4009,'Authentication failed'));});const client=createClient({pollMs:20,retryMs:20,timeoutMs:500});t.after(()=>client.stop());client.start({obsUrl:`ws://127.0.0.1:${wss.address().port}`,obsPassword:'bad-secret'});await until(()=>client.read().state==='authentication');await wait(80);assert.equal(count,1);assert.ok(!JSON.stringify(client.read()).includes('bad-secret'));
});
test('stopping while OBS requests are pending discards late responses',async t=>{
 let held;const wss=await server(t,ws=>{ws.send(JSON.stringify({op:0,d:{rpcVersion:1}}));ws.on('message',raw=>{const {op,d}=JSON.parse(raw);if(op===1)ws.send(JSON.stringify({op:2}));else if(op===6)held={ws,d};});});const client=createClient({pollMs:20,retryMs:20,timeoutMs:100});t.after(()=>client.stop());client.start({obsUrl:`ws://127.0.0.1:${wss.address().port}`});await until(()=>held);client.stop();try{held.ws.send(JSON.stringify({op:7,d:{requestId:held.d.requestId,requestStatus:{result:true},responseData:{}}}));}catch{}await wait(150);assert.equal(client.read().state,'stopped');
});
