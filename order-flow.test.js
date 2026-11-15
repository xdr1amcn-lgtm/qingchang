const test=require('node:test'),assert=require('node:assert/strict'),F=require('./order-flow'),D=require('./domain'),S=require('./settlement-validation'),P=require('./workflow-progress');
const options={orderId:'order-1',segmentId:'account-1',at:'2026-10-28T08:00:00.000Z'};
const input={name:'晚间陪玩',accountName:'租用号 A',startBalance:'116M',coinPerYuan:450000};
test('one action creates the first account and running order without asking for final income or exit values',()=>{
 const o=F.create(input,options);assert.equal(o.status,'进行中');assert.equal(o.activeSegmentId,'account-1');assert.equal(o.income,'');assert.equal(o.segments[0].endBalance,'');assert.equal(o.segments[0].suitUnused,true);assert.equal(o.segments[0].ammoUnused,true);assert.equal(P.startIssue(o),'');assert.equal(F.phase(o),2);assert.equal(F.amounts(o).netReady,false);
});
test('incomplete initial information can be saved as draft but cannot falsely start',()=>{
 const o=F.create({name:'待补单'},{...options,start:false});assert.equal(o.status,'未开始');assert.equal(F.phase(o),1);assert.throws(()=>F.advance(o,options.at),/备注/);assert.throws(()=>F.create({...input,startBalance:'abc'},options),/余额/);assert.throws(()=>F.create({...input,coinPerYuan:0},options),/比例/);assert.equal(o.status,'未开始');
});
test('missing, invalid and zero charges are distinguished; partial records never make a complete bill',()=>{
 const o=F.create(input,options);o.income=200;
 assert.equal(F.amounts(o).rentalReady,false);assert.equal(F.amounts(o).netReady,false);
 o.segments[0].endBalance='116M';assert.equal(F.amounts(o).netReady,true);assert.equal(F.amounts(o).rentalCost,0);
 o.segments[0].suitUnused=false;assert.equal(F.amounts(o).costReady,false);
 Object.assign(o.segments[0],{suitStart:1,suitEnd:1,suitPrice:0});assert.equal(F.amounts(o).costReady,true);
 o.segments.push(F.segment({accountName:'另一个账号',startBalance:'20M',endBalance:''},'other'));assert.equal(F.amounts(o).costReady,false);
});
test('end-use and confirm-settlement are independent persisted transitions; invalid completion leaves the original intact',()=>{
 const running=F.create(input,options),pending=F.advance(running,'2026-10-28T09:00:00Z');assert.equal(running.status,'进行中');assert.equal(pending.status,'待结算');assert.equal(pending.endedAt,'2026-10-28T09:00:00Z');assert.throws(()=>F.advance(pending,'end'),/收入/);assert.equal(pending.completedAt,undefined);
 pending.income=100;pending.segments[0].endBalance='107M';pending.expenses=3;
 const completed=F.advance(pending,'2026-10-28T10:00:00Z');assert.equal(pending.status,'待结算');assert.equal(completed.status,'已完成');assert.equal(F.amounts(completed).net,77);assert.equal(D.netIncome(completed),77);assert.equal(F.advance(completed,'other'),completed);
});
test('an explicit order without rental charges needs an account name, not made-up balances or prices',()=>{
 const o=F.create({billingMode:'none',accountName:'自有账号'},options);assert.equal(P.startIssue(o),'');o.income=200;o.expenses=2;const result=F.advance(F.advance(o,'ended'),'completed');assert.equal(S.issues(result).length,0);assert.equal(D.netIncome(result),198);
 // Switching an unstarted draft away from rental billing retains old fields but excludes their charges.
 result.segments[0]={...result.segments[0],startBalance:'116M',endBalance:'100M',coinPerYuan:100000};assert.equal(D.netIncome(result),198);assert.equal(F.amounts(result).rentalCost,0);
 assert.throws(()=>F.create({billingMode:'none'},options),/备注/);
});
test('legacy records keep rental pricing and never merge different account identities',()=>{
 const o={id:'old',status:'待结算',income:100,expenses:0,segments:[F.segment({accountName:'相同备注',startBalance:'10M',endBalance:'9M',coinPerYuan:500000},'a'),F.segment({accountName:'相同备注',startBalance:'20M',endBalance:'19M',coinPerYuan:250000},'b')]};
 assert.equal(F.rental(o),true);assert.equal(F.amounts(o).rentalCost,6);assert.equal(F.advance(o,'now').segments.length,2);assert.equal(F.phase(o),3);assert.equal(F.phase({...o,status:'已完成'},1),3);
});
test('explicit billed items remain required and a correction preserves the completed date and original snapshot',()=>{
 const o=F.create({...input,suitUnused:false,suitStart:2,suitPrice:5},options);o.income=100;o.segments[0].endBalance='107M';assert.equal(F.amounts(o).netReady,false);assert.ok(S.issues(o).some(x=>x.field==='suitEnd'));o.segments[0].suitEnd=1;
 const done=F.advance(F.advance(o,'ended'),'original'),draft=structuredClone(done);draft.income=110;const correction=S.correction(done,draft,'补录收入','corrected');assert.equal(correction.completedAt,'original');assert.equal(correction.corrections[0].before.income,100);assert.equal(correction.income,110);assert.equal(D.netIncome(correction),85);
});
