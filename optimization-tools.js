const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
let helperPath = path.join(__dirname, 'optimization-native.ps1');
const THRESHOLDS = [70, 75, 80, 85, 90, 95];
const protectedName = name => /^(system|idle|registry|memory compression|smss|csrss|wininit|winlogon|services|lsass|svchost|dwm|explorer|audiodg|conhost|powershell|pwsh|electron|obs.*|livehime.*|douyin.*|直播伴侣.*|轻场|qingchang|deltaforce.*|wegame.*|qq.*|discord.*|voicemeeter.*|1u|presentmon|qingchangsensors|pawnio_setup)$/i.test(name.replace(/\.exe$/i, ''));
function configureHelper(file) { helperPath = file; }
function runNative(action, payload = {}) {
  if (process.platform !== 'win32') return Promise.reject(new Error('此功能需要 Windows'));
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helperPath, '-Action', action], { windowsHide: true, stdio: ['pipe','pipe','pipe'] });
    let output = '', error = '', settled = false;
    const finish = (err, value) => { if (settled) return; settled = true; clearTimeout(timer); err ? reject(err) : resolve(value); };
    const timer = setTimeout(() => { child.kill(); finish(new Error('Windows 操作超时，请刷新状态后再试')); }, 25000);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', x => { output += x; if(output.length > 1024*1024) {child.kill(); finish(new Error('Windows 输出超过限制'));} });
    child.stderr.on('data', x => { error = (error+x).slice(-8000); });
    child.on('error', err => finish(err));
    child.on('close', code => { if(code!==0) return finish(new Error(error.trim() || 'Windows 操作失败')); try {finish(null, JSON.parse(output.replace(/^\uFEFF/, '').trim()));} catch {finish(new Error('Windows 返回数据无法读取'));} });
    child.stdin.on('error', () => {}); child.stdin.end(JSON.stringify({...payload,ownerPid:process.pid}), 'utf8');
  });
}
function normalizeConfig(input = {}) {
  const threshold = Number(input.threshold ?? 85);
  if (!THRESHOLDS.includes(threshold)) throw new Error('内存阈值无效');
  const names = [...new Set((Array.isArray(input.names) ? input.names : []).map(x => String(x).trim().toLowerCase()))];
  if (names.length > 32 || names.some(x => !/^[\p{L}\p{N}_. ()-]{1,100}\.exe$/u.test(x) || protectedName(x))) throw new Error('清理名单含有受保护程序或无效名称');
  if (input.enabled && !names.length) throw new Error('请先选择允许清理的后台程序');
  return { enabled: input.enabled === true, threshold, names };
}
function pressureStep(previous, percent, now, threshold) {
  const next = {hits:0,firstHit:0,lastRun:0,runs:[],armed:true,...previous};
  next.runs = next.runs.filter(x => now-x < 3600000);
  if (percent < threshold) {next.hits=0;next.firstHit=0;if(percent <= threshold-5)next.armed=true;return {next,fire:false};}
  if(!next.hits)next.firstHit=now; next.hits++;
  const fire = next.armed && next.hits>=2 && now-next.firstHit>=30000 && (!next.lastRun || now-next.lastRun>=600000) && next.runs.length<6;
  if(fire){next.lastRun=now;next.runs.push(now);next.armed=false;next.hits=0;next.firstHit=0;}
  return {next,fire};
}
function cachePath(executable) {
  if(typeof executable!=='string' || !path.isAbsolute(executable) || !/^DeltaForceClient.*\.exe$/i.test(path.basename(executable))) throw new Error('请先选择三角洲游戏程序');
  const win64=path.dirname(executable),binaries=path.dirname(win64),project=path.dirname(binaries);
  if(path.basename(win64).toLowerCase()!=='win64'||path.basename(binaries).toLowerCase()!=='binaries'||!fs.existsSync(executable))throw new Error('游戏程序目录不符合三角洲的目录结构');
  const target=path.join(project,'Saved','PSOCache');
  for(const item of [project,path.dirname(target),target]) if(fs.existsSync(item) && (fs.lstatSync(item).isSymbolicLink() || path.resolve(fs.realpathSync(item)).toLowerCase()!==path.resolve(item).toLowerCase()))throw new Error('缓存路径包含链接，请使用原始游戏目录');
  return target;
}
function measureCache(target) {
  if(!fs.existsSync(target))return {path:target,exists:false,files:0,bytes:0,complete:true};
  let files=0,bytes=0,complete=true; const queue=[target], deadline=Date.now()+2000;
  while(queue.length){if(files>=50000||Date.now()>deadline){complete=false;break;}const dir=queue.pop();for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isSymbolicLink()){complete=false;continue;}if(entry.isDirectory())queue.push(file);else if(entry.isFile()){files++;bytes+=fs.statSync(file).size;}}}
  return {path:target,exists:true,files,bytes,complete};
}
function createController({read=()=>null,write=()=>{},execute=runNative,usage=()=>100*(1-os.freemem()/os.totalmem()),now=Date.now,onChange=()=>{}}={}) {
  const saved=read()||{}; let config=normalizeConfig(saved.config||{}),history=Array.isArray(saved.history)?saved.history.slice(0,80):[],backups=Array.isArray(saved.backups)?saved.backups:[];
  let pressure={},busy=false,timer=null,lastResult=saved.lastResult||null;
  let resourceRecords=Array.isArray(saved.resourceRecords)?saved.resourceRecords:[],resourceActive=false,resourceTimer=null,resourceResult=saved.resourceResult||null;
  const persist=()=>write({config,history,backups,lastResult,resourceRecords,resourceResult});
  const status=()=>({config,history,backups,lastResult,busy,memoryPercent:Math.round(usage()),monitoring:!!timer,resource:{active:resourceActive,count:resourceRecords.length,records:resourceRecords.map(x=>({pid:x.pid,name:x.name,powerSupported:x.powerSupported})),lastResult:resourceResult}});
  function record(label,ok,detail){history.unshift({at:now(),label,ok,detail:String(detail||'').slice(0,500)});history=history.slice(0,80);persist();onChange(status());}
  async function clean(manual=true){if(busy)throw new Error('已有清理操作正在运行');if(!config.names.length)throw new Error('请先选择允许清理的后台程序');busy=true;try{const rows=await execute('trim',{names:config.names});const successes=rows.filter(x=>x.ok);lastResult={at:now(),manual,rows,releasedMb:Math.round(successes.reduce((n,x)=>n+(Number(x.releasedMb)||0),0)*10)/10};record(manual?'手动内存清理':'自动内存清理',rows.length>0&&successes.length===rows.length,`成功 ${successes.length} / ${rows.length} 个进程，工作集减少 ${lastResult.releasedMb} MB`);return lastResult;}catch(error){record('内存清理失败',false,error.message);throw error;}finally{busy=false;onChange(status());}}
  async function tick(){if(!config.enabled||busy)return;const step=pressureStep(pressure,usage(),now(),config.threshold);pressure=step.next;if(step.fire)await clean(false).catch(()=>{});}
  function configure(input){const previous=config;config=normalizeConfig(input);try{persist();}catch(error){config=previous;throw error;}pressure={};if(timer)clearInterval(timer);timer=config.enabled?setInterval(tick,5000):null;timer?.unref?.();onChange(status());return status();}
  async function cacheInspect(executable){return measureCache(cachePath(executable));}
  async function cacheBackup(executable){if(busy)throw new Error('已有维护操作正在运行');busy=true;try{const target=cachePath(executable);if((await execute('game-running')).running)throw new Error('请退出三角洲后再重建缓存');const info=measureCache(target);if(!info.exists)throw new Error('没有发现 PSO 缓存，无需重建');const backup=target+'.qingchang-backup-'+now();if(fs.existsSync(backup))throw new Error('备份目录已存在，请稍后重试');fs.renameSync(target,backup);const row={id:now().toString(36),executable,target,backup,at:now(),bytes:info.bytes};backups.unshift(row);try{persist();}catch(error){backups.shift();fs.renameSync(backup,target);throw error;}record('备份并重建游戏缓存',true,`PSO 缓存已改名备份，${info.files} 个文件`);return row;}finally{busy=false;}}
  async function cacheRestore(id){if(busy)throw new Error('已有维护操作正在运行');busy=true;try{const row=backups.find(x=>x.id===id);if(!row)throw new Error('找不到缓存备份');const target=cachePath(row.executable);if(target!==row.target||!row.backup.startsWith(target+'.qingchang-backup-')||path.dirname(row.backup)!==path.dirname(target)||!fs.existsSync(row.backup)||fs.lstatSync(row.backup).isSymbolicLink())throw new Error('缓存备份路径无效');if((await execute('game-running')).running)throw new Error('请退出三角洲后再恢复缓存');const displaced=target+'.qingchang-current-'+now();if(fs.existsSync(displaced))throw new Error('暂存目录已存在');let moved=false;if(fs.existsSync(target)){fs.renameSync(target,displaced);moved=true;}try{fs.renameSync(row.backup,target);}catch(error){if(moved)fs.renameSync(displaced,target);throw error;}backups=backups.filter(x=>x.id!==id);record('恢复游戏缓存',true,moved?`原缓存已恢复，新生成缓存保留在 ${path.basename(displaced)}`:'原缓存已恢复');return {restored:true,displaced:moved?displaced:''};}finally{busy=false;}}
  async function restoreResources(watch=false) {
    if(busy)throw new Error('已有维护操作正在运行');
    if(!resourceRecords.length)return status();
    busy=true;let changed=!watch;
    try {
      const rows=await execute(watch?'resource-watch':'resource-restore',{records:resourceRecords});
      const done=new Set(rows.filter(x=>x.done&&x.ok).map(x=>x.pid));
      changed=changed||done.size>0||rows.some(x=>!x.ok);
      if(!changed)return status();
      resourceRecords=resourceRecords.filter(x=>!done.has(x.pid));
      if(!watch||!resourceRecords.length){resourceActive=false;clearInterval(resourceTimer);resourceTimer=null;}
      resourceResult={at:now(),rows,restoring:!watch};
      if(!watch||done.size)record(watch?'前台程序恢复':'停止后台资源让位',!rows.some(x=>!x.ok),`恢复或已退出 ${done.size} 个进程，剩余 ${resourceRecords.length} 个`);
      else persist();
      return status();
    } finally {busy=false;if(changed)onChange(status());}
  }
  async function startResources() {
    if(busy)throw new Error('已有维护操作正在运行');
    if(resourceRecords.length)throw new Error('请先停止并恢复上一批程序');
    if(!config.names.length)throw new Error('请先选择后台程序');
    busy=true;
    try {
      const rows=await execute('resource-snapshot',{names:config.names});
      const snapshots=rows.filter(x=>x.ok&&x.created);
      if(!snapshots.length)throw new Error(rows.find(x=>x.error)?.error||'没有可操作的后台进程，请刷新列表');
      resourceRecords=snapshots;
      try{persist();}catch(error){resourceRecords=[];throw error;}
      // The encrypted recovery journal is committed before any Windows mutation.
      const applied=await execute('resource-apply',{records:resourceRecords});
      if(applied.some(x=>!x.ok)||applied.length!==snapshots.length)throw new Error(applied.find(x=>!x.ok)?.error||'部分进程未返回结果');
      resourceActive=true;resourceResult={at:now(),rows:applied,restoring:false};
      record('启动后台资源让位',true,`已调整 ${applied.length} 个进程，${applied.filter(x=>x.eco).length} 个启用效率模式`);
      resourceTimer=setInterval(()=>{if(!busy)restoreResources(true).catch(()=>{});},5000);resourceTimer.unref?.();
      return status();
    } catch(error) {
      busy=false;
      if(resourceRecords.length)await restoreResources().catch(()=>{});
      throw error;
    } finally {busy=false;onChange(status());}
  }
  configure(config);
  return {status,configure,clean,tick,record,processes:()=>execute('processes'),cacheInspect,cacheBackup,cacheRestore,startResources,restoreResources,stop(){if(timer)clearInterval(timer);timer=null;if(resourceTimer)clearInterval(resourceTimer);resourceTimer=null;},async shutdown(){this.stop();while(busy)await new Promise(resolve=>setTimeout(resolve,100));return restoreResources();}};
}
module.exports={configureHelper,runNative,normalizeConfig,pressureStep,cachePath,measureCache,createController,protectedName};
