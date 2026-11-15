const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {normalizeConfig,pressureStep,createController,cachePath}=require('./optimization-tools');
test('protected game, streaming and system processes cannot enter the cleanup list',()=>{
 for(const name of ['obs64.exe','DeltaForceClient-Win64-Shipping.exe','轻场.exe','svchost.exe','electron.exe'])assert.throws(()=>normalizeConfig({names:[name]}));
 assert.throws(()=>normalizeConfig({enabled:true,names:[]}));
 assert.deepEqual(normalizeConfig({names:['chrome.exe','CHROME.EXE']}),{enabled:false,threshold:85,names:['chrome.exe']});
});
test('pressure cleanup requires sustained load, recovery and a ten minute cooldown',()=>{
 let p={};for(const at of [1000,6000,11000,16000,21000,26000]){const r=pressureStep(p,90,at,85);assert.equal(r.fire,false);p=r.next;}
 let r=pressureStep(p,90,31000,85);assert.equal(r.fire,true);p=r.next;
 r=pressureStep(p,90,700000,85);assert.equal(r.fire,false);p=r.next;
 p=pressureStep(p,79,701000,85).next;
 p=pressureStep(p,90,702000,85).next;
 assert.equal(pressureStep(p,90,732000,85).fire,true);
});
test('automatic cleanup calls only the selected programs and records measured results',async()=>{
 let clock=1000,calls=[];const c=createController({now:()=>clock,usage:()=>90,execute:async(action,payload)=>{calls.push({action,payload});return [{name:'chrome.exe',ok:true,releasedMb:12.5}];}});
 c.configure({enabled:true,threshold:85,names:['chrome.exe']});
 try{await c.tick();clock+=30000;await c.tick();assert.equal(calls.length,1);assert.deepEqual(calls[0],{action:'trim',payload:{names:['chrome.exe']}});assert.equal(c.status().lastResult.releasedMb,12.5);assert.equal(c.status().lastResult.manual,false);await c.tick();assert.equal(calls.length,1);}finally{c.stop();}
});
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'qingchang-cache-test-'));const project=path.join(root,'DeltaForce');const exe=path.join(project,'Binaries','Win64','DeltaForceClient-Win64-Shipping.exe');fs.mkdirSync(path.dirname(exe),{recursive:true});fs.writeFileSync(exe,'fixture');const target=path.join(project,'Saved','PSOCache');fs.mkdirSync(target,{recursive:true});fs.writeFileSync(path.join(target,'original.bin'),'original');return {root,exe,target,dispose(){assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep+'qingchang-cache-test-'));fs.rmSync(root,{recursive:true,force:true});}};}
test('cache backup and restore preserve original and newly generated cache separately',async()=>{
 const f=fixture(),c=createController({execute:async()=>({running:false}),now:()=>100000});
 try{const b=await c.cacheBackup(f.exe);assert.equal(fs.existsSync(f.target),false);assert.equal(fs.readFileSync(path.join(b.backup,'original.bin'),'utf8'),'original');fs.mkdirSync(f.target);fs.writeFileSync(path.join(f.target,'new.bin'),'new');const r=await c.cacheRestore(b.id);assert.equal(fs.readFileSync(path.join(f.target,'original.bin'),'utf8'),'original');assert.equal(fs.readFileSync(path.join(r.displaced,'new.bin'),'utf8'),'new');assert.equal(c.status().backups.length,0);}finally{c.stop();f.dispose();}
});
test('running game prevents cache changes; unexpected executable layout is rejected',async()=>{
 const f=fixture(),c=createController({execute:async()=>({running:true})});try{await assert.rejects(c.cacheBackup(f.exe),/退出三角洲/);assert.ok(fs.existsSync(path.join(f.target,'original.bin')));assert.throws(()=>cachePath(path.join(f.root,'DeltaForceClient.exe')),/目录结构/);}finally{c.stop();f.dispose();}
});
test('a backup state write failure rolls the cache directory back',async()=>{
 const f=fixture();let fail=false;const c=createController({write:()=>{if(fail)throw new Error('disk full');},execute:async()=>({running:false})});fail=true;
 try{await assert.rejects(c.cacheBackup(f.exe),/disk full/);assert.ok(fs.existsSync(path.join(f.target,'original.bin')));assert.equal(c.status().backups.length,0);}finally{c.stop();f.dispose();}
});
const resourceFixture={pid:42,name:'chrome.exe',path:'C:\\chrome.exe',created:'1234',priority:32,powerSupported:true,control:0,state:0,ok:true};
test('resource recovery journal is written before applying and original identities are preserved',async()=>{
 let journal,calls=[];const c=createController({write:data=>{journal=structuredClone(data);},execute:async(action,payload)=>{calls.push(action);if(action==='resource-snapshot')return [resourceFixture];if(action==='resource-apply'){assert.equal(journal.resourceRecords[0].created,'1234');assert.equal(payload.records[0].priority,32);return [{pid:42,name:'chrome.exe',ok:true,eco:true}];}return [{pid:42,ok:true,done:true}];}});
 try{c.configure({names:['chrome.exe']});await c.startResources();assert.equal(c.status().resource.active,true);await c.restoreResources();assert.equal(c.status().resource.count,0);assert.deepEqual(calls,['resource-snapshot','resource-apply','resource-restore']);}finally{c.stop();}
});
test('failure to persist the recovery journal prevents Windows mutation',async()=>{
 let fail=false,calls=[];const c=createController({write:()=>{if(fail)throw new Error('disk full');},execute:async action=>{calls.push(action);return [resourceFixture];}});
 try{c.configure({names:['chrome.exe']});fail=true;await assert.rejects(c.startResources(),/disk full/);assert.deepEqual(calls,['resource-snapshot']);assert.equal(c.status().resource.count,0);}finally{c.stop();}
});
test('partial application failure restores the whole batch; failed restores remain available',async()=>{
 let restoreFails=true;const c=createController({execute:async action=>action==='resource-snapshot'?[resourceFixture]:action==='resource-apply'?[{pid:42,ok:false,error:'apply failed'}]:[{pid:42,ok:!restoreFails,done:!restoreFails,error:restoreFails?'access denied':''}]});
 try{c.configure({names:['chrome.exe']});await assert.rejects(c.startResources(),/apply failed/);assert.equal(c.status().resource.active,false);assert.equal(c.status().resource.count,1);restoreFails=false;await c.restoreResources();assert.equal(c.status().resource.count,0);}finally{c.stop();}
});
test('foreground monitoring releases only restored entries; shutdown restores remaining entries',async()=>{
 const c=createController({execute:async(action,payload)=>{if(action==='resource-snapshot')return [resourceFixture,{...resourceFixture,pid:43}];if(action==='resource-apply')return payload.records.map(x=>({pid:x.pid,ok:true}));if(action==='resource-watch')return [{pid:42,ok:true,done:true},{pid:43,ok:true,done:false}];return payload.records.map(x=>({pid:x.pid,ok:true,done:true}));}});
 try{c.configure({names:['chrome.exe']});await c.startResources();await c.restoreResources(true);assert.equal(c.status().resource.count,1);assert.equal(c.status().resource.active,true);await c.shutdown();assert.equal(c.status().resource.count,0);}finally{c.stop();}
});
test('a crash recovery journal is available without automatically reapplying settings',async()=>{
 const c=createController({read:()=>({resourceRecords:[resourceFixture]}),execute:async(action,payload)=>{assert.equal(action,'resource-restore');assert.equal(payload.records[0].created,'1234');return [{pid:42,ok:true,done:true}];}});
 try{assert.equal(c.status().resource.active,false);assert.equal(c.status().resource.count,1);await c.restoreResources();assert.equal(c.status().resource.count,0);}finally{c.stop();}
});
