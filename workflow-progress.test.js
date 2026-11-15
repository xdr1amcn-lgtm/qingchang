const test=require('node:test'),assert=require('node:assert/strict'),P=require('./workflow-progress');
test('recovery is recorded after stable new samples; stop and missing data never manufacture recovery',()=>{
 let time=100000;const a=require('./monitor-alerts').create({clock:()=>time});a.start();
 const step=(t,bitrate)=>{time=100000+t;return a.update({selected:{pid:1,started:'one'},game:{state:'ready',fps:100,at:time},live:{available:true,at:time,fileName:'current',metrics:{real_bitrate:bitrate,stream_real_fps:60}}});};
 step(0,6000);let s;for(let t=20000;t<=30000;t+=2000)s=step(t,500);
 assert.equal(s.startedAt,100000);assert.equal(s.history[0].recoveredAt,null);const snapshot=s.history[0];
 step(32000,6000);step(36000,6000);s=step(38000,6000);assert.equal(s.history[0].recoveredAt,138000);assert.equal(snapshot.recoveredAt,null);
 for(let t=40000;t<=50000;t+=2000)s=step(t,500);assert.equal(a.stop().history[0].recoveredAt,null);
});
test('legacy activity only migrates an unambiguous sequence; explicit missing IDs never fall back',()=>{
 const state={orders:[{segments:[{id:'a',endBalance:'10M'},{id:'b'}]},{segments:[{id:'c'},{id:'d'}]},{activeSegmentId:'gone',segments:[{id:'e'}]}]};
 assert.equal(P.migrate(state),true);assert.equal(state.orders[0].activeSegmentId,'b');assert.equal(P.currentSegment(state.orders[1]),null);assert.equal(P.currentSegment(state.orders[2]),null);assert.equal(P.migrate(state),false);
 const copy=JSON.parse(JSON.stringify(state));assert.equal(P.currentSegment(copy.orders[0]).id,'b');
});
const now=100000,valid={enabled:true,selected:{pid:2},game:{state:'ready',fps:100,at:now},live:{available:true,at:now,metrics:{real_bitrate:6000,stream_real_fps:60}},alerts:{enabled:true,liveArmed:true,config:{game:true,live:true},active:[]}};
test('only two fresh sources with enabled rules can report no sustained anomaly',()=>{
 assert.equal(P.summary(valid,now).level,'ready');
 for(const value of [{...valid,live:{available:false}},{...valid,selected:null},{...valid,game:{...valid.game,at:now-4000}},{...valid,alerts:{...valid.alerts,config:{game:false,live:true}}}])assert.equal(P.summary(value,now).level,'pending');
 assert.equal(P.summary(valid,now,'obs').level,'pending');assert.equal(P.summary({...valid,live:{...valid.live,source:'obs'}},now,'obs').level,'ready');
});
test('combined faults prioritize stream and never call missing stream healthy',()=>{
 const active=[{id:'game-fps',group:'game'},{id:'bitrate',group:'live'}],s=P.summary({...valid,live:{available:false},alerts:{...valid.alerts,active}},now);
 assert.match(s.title,/同时/);assert.match(s.detail,/缺少有效/);assert.equal(s.warnings[0].id,'bitrate');
});
test('session capture is bounded, idempotent, filters old sessions, and opening a tool cannot resolve a fault',()=>{
 const s={active:true,startedAt:new Date(now).toISOString()},a={startedAt:now,history:[{id:1,kind:'bitrate',at:now-1},{id:2,kind:'bitrate',title:'低码率',detail:'当前 1000',at:now+10}]};
 assert.ok(P.capture(s,a));assert.equal(s.anomalyEvents.length,1);assert.equal(P.capture(s,a),false);
 assert.ok(P.recordAction(s,s.anomalyEvents[0].key,'network',now+20));assert.equal(s.anomalyEvents[0].recoveredAt,null);
 a.history[1].recoveredAt=now+100;assert.ok(P.capture(s,a));assert.equal(s.anomalyEvents[0].recoveredAt,now+100);s.active=false;a.history.push({id:3,kind:'game-fps',at:now+200});assert.equal(P.capture(s,a),false);
});
test('order start requires account and valid starting data without requiring future exit data',()=>{
 assert.match(P.startIssue({segments:[]}),/账号/);assert.match(P.startIssue({segments:[{id:'a',accountName:'账号',startBalance:'116M',coinPerYuan:''}]}),/比例/);
 assert.equal(P.startIssue({segments:[{id:'a',accountName:'账号',startBalance:'0',coinPerYuan:'400000'}]}),'');
});
