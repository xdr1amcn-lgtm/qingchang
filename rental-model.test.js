const test=require('node:test');
const assert=require('node:assert/strict');
const R=require('./rental-model');
const {encryptBackup,decryptBackup}=require('./backup-crypto');

const baseState=(leases=[],orders=[])=>({version:1,accounts:[{id:'a1',account:'streamer'}],orders,rentalLeases:leases});
const lease=(id,overrides={})=>({id,remark:`备注-${id}`,loginAccount:`login-${id}`,password:`pass-${id}`,platform:'QQ区',region:'华东',source:'租号平台',rentedAt:'2026-11-01',expiresAt:'2026-11-30',note:'',defaultCoinPerYuan:400000,defaultSuitPrice:5,defaultAmmoPrice:0.5,returnedAt:'',archivedAt:'',createdAt:'2026-11-01T00:00:00.000Z',updatedAt:'2026-11-01T00:00:00.000Z',...overrides});
const order=(id,status,segment)=>({id,name:`订单-${id}`,status,createdAt:'2026-11-01T00:00:00.000Z',segments:[segment],activeSegmentId:segment?.id});
const seg=(id,leaseId,overrides={})=>({id,accountName:'A',startBalance:'116M',endBalance:'',coinPerYuan:400000,rentalLeaseId:leaseId,rentalPlatform:'QQ区',rentalRegion:'华东',rentalLoginAccount:'login-l1',...overrides});

test('表头制表符导入：密码原样保留，缺失项被标出',()=>{
 const text='登录账号\t密码\t平台\t区服\t来源\t到期时间\t比例\t六套单价\t子弹单价\n'+
  'alpha\t p a ss \tQQ区\t华东\t平台A\t2026-11-10\t40\t5\t0.5\n'+
  'beta\t\t微信区\t\t平台B\t2026/12/01\t50\t\t\n'+
  'alpha\tdup\tQQ区\t华东\t平台C\t2026-11-20\t45\t6\t0.6\n';
 const parsed=R.parseImport(text);
 assert.equal(parsed.rows.length,3);
 assert.equal(parsed.rows[0].password,' p a ss ');
 assert.equal(parsed.rows[0].platform,'QQ区');
 assert.equal(parsed.rows[0].expiresAt,'2026-11-10');
 assert.equal(parsed.rows[0].ratio,'40');
 assert.equal(parsed.rows[1].missingPassword,true);
 assert.equal(parsed.stats.recognized,3);
 assert.equal(parsed.stats.missingPassword,1);
});

test('无表头数据行不会被误认成表头',()=>{
 const parsed=R.parseImport('demo-account\tpass-word\tQQ区\t华东\t平台A\n');
 assert.equal(parsed.rows.length,1);
 assert.equal(parsed.rows[0].loginAccount,'demo-account');
 assert.equal(parsed.rows[0].password,'pass-word');
});

test('没有密码列的表头也能识别',()=>{
 const parsed=R.parseImport('登录账号\t备注\nbeta\tB号\n');
 assert.equal(parsed.rows.length,1);
 assert.equal(parsed.rows[0].loginAccount,'beta');
 assert.equal(parsed.rows[0].remark,'B号');
 assert.equal(parsed.rows[0].password,'');
});

test('标签格式导入：一个账号一块，密码不 trim',()=>{
 const text='备注：A号\n账号：alpha\n密码：p@ss word\n平台：QQ区\n区服：华东\n到期：2026-11-10\n比例：40\n\n账号：beta\n密码：\n平台：微信区\n';
 const parsed=R.parseImport(text);
 assert.equal(parsed.rows.length,2);
 assert.equal(parsed.rows[0].remark,'A号');
 assert.equal(parsed.rows[0].password,'p@ss word');
 assert.equal(parsed.rows[0].platform,'QQ区');
 assert.equal(parsed.rows[0].region,'华东');
 assert.equal(parsed.rows[1].missingPassword,true);
 assert.equal(parsed.rows[1].loginAccount,'beta');
});

test('CSV 引号与逗号：密码字段完整保留',()=>{
 const text='登录账号,密码,平台,区服\n"alpha"," pass,word ","QQ区","华东"\n';
 const parsed=R.parseImport(text);
 assert.equal(parsed.rows.length,1);
 assert.equal(parsed.rows[0].password,' pass,word ');
 assert.equal(parsed.rows[0].region,'华东');
});

test('无法识别的自由文本只报告行号，不猜密码',()=>{
 const parsed=R.parseImport('这是从微信复制的一段话\n账号：alpha\n密码：pass\n');
 assert.equal(parsed.rows.length,1);
 assert.equal(parsed.rows[0].password,'pass');
 assert.equal(parsed.issues.some(x=>x.line===1&&/未导入/.test(x.message)),true);
});

test('预览会标记已有重复和同批重复',()=>{
 const state=baseState([lease('l1',{loginAccount:'alpha'})]);
 const rows=[
  {remark:'新资料',loginAccount:'alpha',password:'new',platform:'QQ区',region:'华东'},
  {remark:'批内重复',loginAccount:'alpha',password:'x',platform:'QQ区',region:'华东'},
  {remark:'新号',loginAccount:'beta',password:'',platform:'QQ区',region:'华东'}
 ];
 const analyzed=R.analyzeImport(state,rows);
 assert.equal(analyzed[0].duplicate.id,'l1');
 assert.equal(analyzed[1].duplicate.id,'l1');
 assert.equal(analyzed[2].missingPassword,true);
});

test('导入更新不覆盖旧密码和旧订单金额，默认跳过重复项',()=>{
 const oldSegment=seg('s1','l1',{coinPerYuan:400000,startBalance:'116M',endBalance:'108M'});
 const state=baseState([lease('l1',{loginAccount:'alpha',remark:'旧备注',password:'old-password'})],[order('o1','待结算',oldSegment)]);
 const result=R.applyImport(state,[
  {remark:'新备注',loginAccount:'alpha',password:'new-password',platform:'QQ区',region:'华东',source:'新来源',ratio:'50',resolution:'update'},
  {remark:'重复默认跳过',loginAccount:'alpha',password:'x',platform:'QQ区',region:'华东'}
 ],{now:'2026-11-02T00:00:00.000Z',idFactory:(()=>{let n=0;return()=>`new-${++n}`;})()});
 assert.equal(result.ok,true);
 assert.equal(result.updated,1);
 assert.equal(result.skipped,1);
 const updated=result.state.rentalLeases.find(x=>x.id==='l1');
 assert.equal(updated.password,'old-password');
 assert.equal(updated.remark,'新备注');
 assert.equal(updated.defaultCoinPerYuan,500000);
 assert.equal(result.state.orders[0].segments[0].coinPerYuan,400000);
});

test('导入登记新一轮租用会生成新 ID，不改旧记录',()=>{
 const state=baseState([lease('l1',{loginAccount:'alpha'})]);
 const result=R.applyImport(state,[
  {remark:'新一轮',loginAccount:'alpha',password:'round-2',platform:'QQ区',region:'华东',resolution:'new'}
 ],{now:'2026-11-02T00:00:00.000Z',idFactory:()=> 'l2'});
 assert.equal(result.ok,true);
 assert.equal(result.added,1);
 assert.equal(result.state.rentalLeases.length,2);
 assert.equal(result.state.rentalLeases.find(x=>x.id==='l2').password,'round-2');
 assert.equal(result.state.rentalLeases.find(x=>x.id==='l1').password,'pass-l1');
});

test('导入缺登录账号时整体不落库',()=>{
 const state=baseState([],[]);
 const result=R.applyImport(state,[{loginAccount:'',password:'x'}],{now:'2026-11-02T00:00:00.000Z'});
 assert.equal(result.ok,false);
 assert.equal(result.errors.length,1);
 assert.equal(state.rentalLeases.length,0);
 assert.equal(result.state,undefined);
});

test('占用由有效订单推导：暂停仍占用，待结算释放，不同 ID 同账号也冲突',()=>{
 const a1=lease('l1',{loginAccount:'alpha'});
 const a2=lease('l2',{loginAccount:'alpha'});
 const b=lease('l3',{loginAccount:'beta'});
 const state=baseState([a1,a2,b],[order('o1','进行中',seg('s1','l1'))]);
 assert.equal(R.status(state,a1).key,'in-use');
 assert.equal(R.status(state,a2).key,'in-use');
 assert.equal(R.conflictFor(state,a2).order.id,'o1');
 assert.equal(R.status(state,b).key,'available');
 assert.deepEqual(R.availableLeases(state).map(x=>x.id),['l3']);

 const paused=baseState([a1,a2,b],[order('o1','已暂停',seg('s1','l1'))]);
 assert.equal(R.status(paused,a1).label,'使用中 · 订单已暂停');
 assert.equal(R.availableLeases(paused).some(x=>x.id==='l2'),false);

 const waiting=baseState([a1,a2,b],[order('o1','待结算',seg('s1','l1'))]);
 assert.equal(R.status(waiting,a1).key,'available');
 assert.equal(R.availableLeases(waiting).some(x=>x.id==='l2'),true);
});

test('归还、归档、到期各有独立状态',()=>{
 const returned=lease('l1',{returnedAt:'2026-11-01T00:00:00.000Z'});
 const archived=lease('l2',{archivedAt:'2026-11-01T00:00:00.000Z'});
 const expired=lease('l3',{expiresAt:'2026-10-01'});
 const state=baseState([returned,archived,expired]);
 assert.equal(R.status(state,returned).key,'returned');
 assert.equal(R.status(state,archived).key,'archived');
 const s=R.status(state,expired,{todayKey:'2026-11-01'});
 assert.equal(s.key,'available');
 assert.equal(s.expired,true);
 assert.equal(s.selectable,true);
});

test('使用记录按租用 ID 关联：A → B → A 生成三段',()=>{
 const a=lease('l1',{loginAccount:'alpha'});
 const b=lease('l2',{loginAccount:'beta'});
 const state=baseState([a,b],[order('o1','待结算',seg('s1','l1',{useStartedAt:'2026-11-01T10:00:00.000Z',useEndedAt:'2026-11-01T11:00:00.000Z'})),order('o2','待结算',seg('s2','l2',{useStartedAt:'2026-11-01T11:00:00.000Z'})),order('o3','待结算',seg('s3','l1',{useStartedAt:'2026-11-01T12:00:00.000Z'}))]);
 const records=R.usageRecords(state,a);
 assert.equal(records.length,2);
 assert.deepEqual(records.map(x=>x.segment.id),['s1','s3']);
});

test('费用快照：租号资料不复制密码，修改默认比例不影响旧段',()=>{
 const l=lease('l1',{password:'secret',defaultCoinPerYuan:400000});
 const segment=R.attachLease({id:'s1',accountName:'',startBalance:'',coinPerYuan:'',suitUnused:true,ammoUnused:true},{...l},{startBalance:'116M',coinPerYuan:400000,useStartedAt:'2026-11-01T10:00:00.000Z'});
 assert.equal(segment.password,undefined);
 assert.equal(segment.rentalLeaseId,'l1');
 assert.equal(segment.rentalLoginAccount,'login-l1');
 assert.equal(segment.coinPerYuan,400000);
 l.defaultCoinPerYuan=500000;
 assert.equal(segment.coinPerYuan,400000);
 const linked=R.linkLease({id:'old',accountName:'旧记录',startBalance:'116M',endBalance:'108M',coinPerYuan:400000},l,{at:'2026-11-02T00:00:00.000Z'});
 assert.equal(linked.startBalance,'116M');
 assert.equal(linked.endBalance,'108M');
 assert.equal(linked.coinPerYuan,400000);
 assert.equal(linked.rentalLeaseId,'l1');
});

test('使用时间标记只补一次，不覆盖已有时间',()=>{
 const state=baseState([], [order('o1','进行中',seg('s1','l1',{useStartedAt:''}))]);
 const started=R.markUse(state.orders[0],'2026-11-01T10:00:00.000Z');
 assert.equal(started.segments[0].useStartedAt,'2026-11-01T10:00:00.000Z');
 const again=R.markUse(started,'2026-11-01T11:00:00.000Z');
 assert.equal(again.segments[0].useStartedAt,'2026-11-01T10:00:00.000Z');
 const ended=R.markUse({...started,status:'待结算'},'2026-11-01T12:00:00.000Z');
 assert.equal(ended.segments[0].useEndedAt,'2026-11-01T12:00:00.000Z');
});

test('旧数据迁移只补空集合，保留旧账号与订单',()=>{
 const state={version:1,accounts:[{id:'a'}],orders:[{id:'o',segments:[]}],workspaceAccountIds:['a']};
 const snapshot=JSON.stringify(state);
 assert.equal(R.migrate(state),true);
 assert.deepEqual(state.rentalLeases,[]);
 assert.equal(state.accounts[0].id,'a');
 assert.equal(state.orders[0].id,'o');
 assert.equal(JSON.stringify({...state,rentalLeases:undefined}).replace(/,"rentalLeases":\[\]/,''),snapshot);
 assert.equal(R.migrate(state),false);
});

test('加密备份覆盖租号资料、订单关联与金额',()=>{
 const state=baseState([lease('l1')],[order('o1','已完成',seg('s1','l1',{endBalance:'108M',useStartedAt:'2026-11-01T10:00:00.000Z',useEndedAt:'2026-11-01T11:00:00.000Z'}))]);
 const encrypted=encryptBackup(state,'test-password');
 const restored=decryptBackup(encrypted,'test-password');
 assert.equal(restored.rentalLeases[0].id,'l1');
 assert.equal(restored.orders[0].segments[0].rentalLeaseId,'l1');
 assert.equal(restored.orders[0].segments[0].coinPerYuan,400000);
});
