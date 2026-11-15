const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os');
const {parseMetrics,readMetricFile,snapshot,readSnapshot,summarize}=require('./douyin-telemetry');
const at=1791956456548;
const frame=(time=at,extra=[])=>JSON.stringify({log_level:'info',timestamp:time/1000,log_content:JSON.stringify([{category:'push_perf',tag:'stream_real_fps',value:60,time:Math.floor(time/1000)},...extra])});
test('binary-prefixed escaped JSON returns only whitelisted numeric metrics',()=>{
 const text='\0\u0010binary'+frame(at,[{category:'push_stream_perf',tag:'drop_count',value:3},{category:'private',tag:'token',value:'secret'},{category:'render_perf',tag:'stream_preview_fps',value:'60'}])+'\0\0';
 assert.deepEqual(parseMetrics(text),[{at,tag:'stream_real_fps',value:60},{at,tag:'drop_count',value:3}]);
});
test('incomplete JSON and unrelated records do not prevent later complete records',()=>{
 assert.equal(parseMetrics('{"log_level":"info","timestamp":'+frame()).length,1);
 assert.equal(parseMetrics(frame()+'\n{"log_level":"info"').length,1);
});
test('old and future records cannot appear as current live data; missing drops are unknown',()=>{
 const records=parseMetrics(frame());assert.equal(snapshot(records,at+12000).state,'stale');assert.equal(snapshot(records,at-6000).state,'stale');
 assert.equal(snapshot([],at).state,'waiting');const current=snapshot(records,at+1000);assert.equal(current.available,true);assert.equal(current.metrics.drop_count,undefined);
});
test('each newest group keeps missing drop fields unknown rather than carrying an older drop rate',()=>{
 const records=parseMetrics(frame(at,[{category:'push_stream_perf',tag:'drop_count',value:7}])+frame(at+2000));
 const current=snapshot(records,at+3000);assert.equal(current.metrics.drop_count,undefined);assert.equal(current.metrics.stream_real_fps,60);
});
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'qingchang-mate-test-'));const dir=path.join(root,'webcast_mate','mediasdk_log','metrics');fs.mkdirSync(dir,{recursive:true});return {root,dir,dispose(){assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep+'qingchang-mate-test-'));fs.rmSync(root,{recursive:true,force:true});}};}
test('reader skips a locked header region and parses data before zero preallocation; newer empty session blocks historical fallback',()=>{
 const f=fixture();try{const old=path.join(f.dir,'metrics.100.20.log');fs.writeFileSync(old,Buffer.concat([Buffer.alloc(256),Buffer.from(frame()),Buffer.alloc(65536)]));assert.equal(readMetricFile(old).length,1);assert.equal(readSnapshot(f.root,at+1000).available,true);fs.writeFileSync(path.join(f.dir,'metrics.200.20.log'),Buffer.alloc(65536));assert.equal(readSnapshot(f.root,at+1000).state,'waiting');}finally{f.dispose();}
});
test('summary uses only new unique samples and preserves unreported drop fields',()=>{
 const current=snapshot(parseMetrics(frame()),at+1000);const result=summarize([current,current],at-10,at+1000);assert.equal(result.samples,1);assert.equal(result.outputFpsAvg,60);assert.equal(result.dropRateMax,null);assert.equal(result.encodeDropRateMax,null);assert.equal(result.partial,true);assert.equal(summarize([current],at+2000,at+4000).available,false);
});
