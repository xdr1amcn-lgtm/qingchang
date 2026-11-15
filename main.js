const { app, BrowserWindow, clipboard, dialog, ipcMain, globalShortcut, shell, safeStorage, desktopCapturer } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const workflowRuntimeId = crypto.randomUUID();
const { spawn } = require('node:child_process');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const liveAssistant = require('./live-integration');
const optimization = require('./optimization');
const optimizationTools = require('./optimization-tools');
const {createRepair}=require('./frame-repair');
const {nativeRunner,downloadRuntime}=require('./frame-repair-runtime');
const douyinTelemetry = require('./douyin-telemetry');
const {createScreenMonitor}=require('./screen-monitor');
const highlights=require('./highlights-model');
const performanceModel=require('./performance-report');
const preflightModel=require('./preflight-model');
const streamFilterModel=require('./stream-filter-model');
const streamFilterExports=new Set();
const networkProbe=require('./network-probe');
const probeNetwork=networkProbe.createProbe();
const {createPerformanceCapture}=require('./performance-capture');
const {createHardwareSampler}=require('./hardware-monitor');
const {screen}=require('electron');
const nvidiaIntegration = require('./nvidia-integration');
const { encryptBackup, decryptBackup } = require('./backup-crypto');

app.setName('轻场');
app.setAppUserModelId('com.qingchang.desktop');
app.disableHardwareAcceleration();

// 正式版默认使用原有轻场数据目录；测试或并行试用可用 QINGCHANG_DATA_DIR 覆盖。
const configuredDataDir = process.env.QINGCHANG_DATA_DIR || process.env.QINGCHANG_TRIAL_DATA_DIR;
const dataDir = configuredDataDir
  ? path.resolve(configuredDataDir)
  : path.join(app.getPath('appData'), '轻场');
fs.mkdirSync(dataDir, { recursive: true });
app.setPath('userData', dataDir);
const DB_NAME = 'qingchang-local.enc';
let mainWindow;
let appData = null;
let loadError = '';
let copiedSecret = '';
let copyTimer;
let hotkeys = { session: 'F8', marker: 'F9' };
let hotkeysRegistered = false;
let localKey = null;
let toolkit = null;
let toolkitError = '';
let screenMonitor=null;
let performanceCapture=null;
let frameRepair=null;
const obsTelemetry=require('./obs-telemetry').createClient();
const reportObsTelemetry=require('./obs-telemetry').createClient({onChange:value=>performanceCapture?.recordLive(value)});
let repairRestartScheduled=false;
const requireRepair=()=>{if(!frameRepair)throw Error('掉帧修复未初始化，请重新打开轻场');return frameRepair;};
function requireToolkit() { if(!toolkit)throw new Error(toolkitError || '维护工具尚未初始化');return toolkit; }
function recordOptimization(label, result) { try { toolkit?.record(label, result.liveApplied !== false, result.detail || '设置已应用并回读校验'); } catch(error) { console.error('优化记录保存失败', error.message); } }

function databasePath() { return path.join(app.getPath('userData'), DB_NAME); }
function saveLocal(data) {
  if (!app.isReady()) throw new Error('应用尚未启动完成');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows 本机加密不可用，轻场已阻止保存敏感数据');
  const body = Buffer.from(JSON.stringify(data), 'utf8');
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  const file = databasePath();
  const temporary = `${file}.tmp`;
  if (!localKey) localKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', localKey, iv);
  const ciphertext = Buffer.concat([cipher.update(body), cipher.final()]);
  const wrappedKey = safeStorage.encryptString(localKey.toString('base64'));
  const sealed = JSON.stringify({ format: 'qingchang-local-v1', key: wrappedKey.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: ciphertext.toString('base64') });
  fs.writeFileSync(temporary, sealed, 'utf8');
  fs.renameSync(temporary, file);
  appData = data;
  loadError = '';
  return { ok: true };
}

function loadLocal() {
  const file = databasePath();
  if (!fs.existsSync(file)) return null;
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows 本机加密不可用，无法读取本地数据');
  try {
    const sealed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (sealed.format !== 'qingchang-local-v1') throw new Error('本地数据库版本不受支持');
    localKey = Buffer.from(safeStorage.decryptString(Buffer.from(sealed.key, 'base64')), 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', localKey, Buffer.from(sealed.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
    const clear = Buffer.concat([decipher.update(Buffer.from(sealed.data, 'base64')), decipher.final()]);
    return JSON.parse(clear.toString('utf8'));
  }
  catch (error) { throw new Error(`无法解密本地数据：${error.message}`); }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500, height: 960, minWidth: 960, minHeight: 640,
    backgroundColor: '#ffffff', title: '轻场 · 繁琐退场，精彩上场。',
    icon: path.join(__dirname, 'assets', 'qingchang.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.on('close',event=>{if(frameRepair?.isBusy()){event.preventDefault();mainWindow.webContents.send('repair:update',frameRepair.status());mainWindow.webContents.send('app:close-blocked','正在检查或处理游戏，请等待完成后再关闭。');return;}if(!closeApproved){event.preventDefault();if(!closeRequested){closeRequested=true;mainWindow.webContents.send('app:prepare-close');setTimeout(()=>{if(closeRequested&&mainWindow&&!mainWindow.isDestroyed()){closeRequested=false;dialog.showMessageBox(mainWindow,{type:'warning',message:'页面暂未响应，请等待后再关闭。若仍无法恢复，可在任务管理器结束轻场；尚未保存的修改会丢失。',buttons:['返回轻场']});}},10000);}}});
  mainWindow.on('closed', () => { mainWindow = null;if(screenMonitor&&process.platform==='win32')app.quit(); });
}

const shortcutManager=require('./shortcut-manager').createShortcutManager(globalShortcut,key=>mainWindow?.webContents.send('app:hotkey',key));
function applyHotkeys(settings={},force=false){return shortcutManager.apply(settings,force);}
ipcMain.handle('qingchang:shortcuts',()=>applyHotkeys(appData?.settings?.shortcuts||{},true));
ipcMain.handle('qingchang:app-info',()=>({version:app.isPackaged?app.getVersion():'0.14.0-dev',runtimeId:workflowRuntimeId,dataPath:app.getPath('userData'),platform:process.platform,windows:require('node:os').release()}));
let closeApproved=false,closeRequested=false;
ipcMain.on('qingchang:request-close',event=>{if(event.sender===mainWindow?.webContents)mainWindow.close();});
ipcMain.on('qingchang:close-ready',(event,ok)=>{if(event.sender!==mainWindow?.webContents)return;closeRequested=false;if(ok){closeApproved=true;mainWindow.close();}});
ipcMain.handle('qingchang:load', () => ({ data: appData, encrypted: safeStorage.isEncryptionAvailable(), error: loadError }));
ipcMain.handle('qingchang:title-save',async(event,dataUrl)=>{
 if(event.sender!==mainWindow?.webContents||typeof dataUrl!=='string'||dataUrl.length>32*1024*1024||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dataUrl))throw Error('标题图片无效');
 const bytes=Buffer.from(dataUrl.split(',')[1],'base64');if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('标题图片格式无效');
 const result=await dialog.showSaveDialog(mainWindow,{title:'保存透明标题 PNG',defaultPath:'轻场-直播标题.png',filters:[{name:'PNG 图片',extensions:['png']}]});if(result.canceled)return {canceled:true};fs.writeFileSync(result.filePath,bytes);return {canceled:false,file:result.filePath};
});
ipcMain.handle('qingchang:ocr-balance', async (_event, imageBase64) => {
  if (typeof imageBase64 !== 'string' || imageBase64.length > 3 * 1024 * 1024 || !/^[A-Za-z0-9+/=]+$/.test(imageBase64)) {
    throw new Error('截图识别数据无效');
  }
  const executable = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const helper = app.isPackaged ? path.join(process.resourcesPath, 'ocr-balance.ps1') : path.join(__dirname, 'ocr-balance.ps1');
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => { child.kill(); reject(new Error('本机识别超时，请手动录入余额')); }, 15000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 12000) child.kill(); });
    child.stderr.on('data', chunk => { stderr += chunk; if (stderr.length > 4000) child.kill(); });
    child.on('error', error => { clearTimeout(timeout); reject(new Error(`无法启动 Windows 本机识别：${error.message}`)); });
    child.on('close', code => {
      clearTimeout(timeout);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || 'Windows 未能识别这张截图，请手动录入余额'));
    });
    child.stdin.end(imageBase64, 'utf8');
  });
});
ipcMain.handle('qingchang:save', (_event, data) => {
  if (loadError) throw new Error(`本地数据库读取失败，已暂停自动写入以免覆盖旧数据。可在“本地数据与安全”中恢复加密备份。${loadError}`);
  if (!data || data.version !== 1 || !Array.isArray(data.accounts) || !Array.isArray(data.orders) || (data.rentalLeases != null && !Array.isArray(data.rentalLeases))) throw new Error('数据格式不正确');
  data.performanceReports=appData?.performanceReports||[];
  saveLocal(data);
  applyHotkeys(data.settings?.shortcuts);
  return { ok: true, shortcuts:shortcutManager.status() };
});
ipcMain.handle('qingchang:workflow-program-pick',async()=>{
 const result=await dialog.showOpenDialog(mainWindow,{title:'选择直播伴侣或 OBS 的启动程序',properties:['openFile'],filters:[{name:'Windows 程序',extensions:['exe']}]});return result.canceled?'':result.filePaths[0]||'';
});
ipcMain.handle('qingchang:workflow-program-launch',async(_event,file)=>{
 if(typeof file!=='string'||!path.isAbsolute(file)||path.extname(file).toLowerCase()!=='.exe'||!fs.existsSync(file)||!fs.statSync(file).isFile())throw new Error('找不到保存的直播程序，请重新选择');
 const error=await shell.openPath(file);if(error)throw new Error('直播程序未能打开：'+error);return {requested:true};
});
ipcMain.handle('qingchang:network-probe',(_event,target)=>probeNetwork(target));
ipcMain.handle('qingchang:stream-filter-capture',async event=>{
 if(event.sender!==mainWindow?.webContents)throw Error('无效的画面读取请求');
 const sources=await desktopCapturer.getSources({types:['window'],thumbnailSize:{width:1280,height:720},fetchWindowIcons:false});
 const games=sources.filter(x=>/DeltaForce|三角洲/i.test(x.name)&&!/^轻场/.test(x.name));
 if(games.length!==1)throw Error(games.length?'找到多个三角洲窗口，请保留一个游戏窗口后重试，或手动选择截图':'未找到三角洲游戏窗口，请打开游戏并使用窗口或无边框模式，或手动选择截图');
 const image=games[0].thumbnail;if(image.isEmpty())throw Error('当前游戏窗口未返回可用画面，请回到游戏后重试或选择原始截图');
 return {dataUrl:image.toDataURL(),name:'当前游戏画面（截图）'};
});
ipcMain.handle('qingchang:stream-filter-export',async(event,input)=>{
 if(event.sender!==mainWindow?.webContents)throw Error('无效的滤镜导出请求');
 const params=streamFilterModel.normalize(input),content=require('./mate-filter-package').create(params).buffer;
 const result=await dialog.showSaveDialog(mainWindow,{title:'导出直播伴侣预设包',defaultPath:`轻场-直播滤镜-${new Date().toISOString().slice(0,10)}.zip`,filters:[{name:'直播伴侣滤镜预设包',extensions:['zip']}]});
 if(result.canceled||!result.filePath)return {canceled:true};
 if(path.extname(result.filePath).toLowerCase()!=='.zip')throw Error('请保存为 .zip 预设包');
 fs.writeFileSync(result.filePath,content);streamFilterExports.add(path.resolve(result.filePath));
 return {canceled:false,file:result.filePath,signature:streamFilterModel.signature(params),at:Date.now(),size:33};
});
ipcMain.handle('qingchang:stream-filter-file',(event,file,action)=>{
 if(event.sender!==mainWindow?.webContents||typeof file!=='string')throw Error('无效的滤镜文件请求');
 const resolved=path.resolve(file),saved=appData?.settings?.setup?.streamFilter?.lastExport?.file;
 if(!['.cube','.zip'].includes(path.extname(resolved).toLowerCase())||(!streamFilterExports.has(resolved)&&(!saved||resolved!==path.resolve(saved)))||!fs.existsSync(resolved))throw Error('滤镜文件不存在，请重新导出');
 if(action==='copy')clipboard.writeText(resolved);else if(action==='reveal')shell.showItemInFolder(resolved);else throw Error('不支持的文件操作');return {ok:true};
});
ipcMain.handle('qingchang:sound-test-save',async(_event,bytes)=>{
 if(!(bytes instanceof Uint8Array)||bytes.byteLength<44||bytes.byteLength>6000000)throw new Error('试音文件无效');const buffer=Buffer.from(bytes);
 if(buffer.toString('ascii',0,4)!=='RIFF'||buffer.toString('ascii',8,12)!=='WAVE'||buffer.readUInt16LE(22)!==1||buffer.readUInt16LE(34)!==16||buffer.readUInt32LE(40)!==buffer.length-44)throw new Error('试音格式不正确');
 const result=await dialog.showSaveDialog(mainWindow,{title:'保存麦克风试音',defaultPath:'轻场-麦克风试音.wav',filters:[{name:'WAV 录音',extensions:['wav']}]});if(result.canceled||!result.filePath)return {canceled:true};fs.writeFileSync(result.filePath,buffer);return {ok:true};
});
ipcMain.handle('qingchang:network-test-export',async(_event,input)=>{
 if(!input||!Object.hasOwn(networkProbe.targets,input.target)||![30,60].includes(input.seconds)||!Array.isArray(input.samples)||!input.samples.length||input.samples.length>60)throw new Error('网络诊断数据无效');
 const samples=input.samples.map(x=>({at:Number.isFinite(x?.at)?x.at:null,ok:x?.ok===true&&Number.isFinite(x.rttMs)&&x.rttMs>=0&&x.rttMs<=10000,rttMs:Number.isFinite(x?.rttMs)?x.rttMs:null,lessThan:x?.lessThan===true}));const summary=preflightModel.networkSummary(samples),target=networkProbe.targets[input.target];
 const number=value=>Number.isFinite(value)?value.toFixed(1):'—';const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>轻场网络波动诊断</title><style>body{font:15px/1.8 'Microsoft YaHei',sans-serif;max-width:900px;margin:32px auto;padding:24px;color:#293d59}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:8px 12px;border-bottom:1px solid #e5ebf3}</style><h1>网络波动诊断</h1><p>目标：${target.label} · ${target.ip}；${input.completed&&samples.length===input.seconds?'已完成':'未完整完成'}。</p><p>已发送 ${summary.sent} 次，收到 ${summary.received} 次，ICMP 无回应 ${number(summary.lossPercent)}%；平均往返延迟 ${number(summary.avg)} ms，最高 ${number(summary.max)} ms，波动 ${number(summary.jitter)} ms。</p><p>无回应比例不是直播链路丢包率，目标也可能限制 Ping。波动为相邻成功探测的延迟差绝对值均值；小于 1 ms 的回应按 0.5 ms 近似统计。</p><table><tr><th>次数</th><th>本地时间</th><th>往返延迟</th></tr>${samples.map((x,i)=>`<tr><td>${i+1}</td><td>${x.at?new Date(x.at).toLocaleString('zh-CN',{hour12:false}):'—'}</td><td>${x.ok?x.lessThan?'小于 1 ms':number(x.rttMs)+' ms':'无回应'}</td></tr>`).join('')}</table></html>`;
 const result=await dialog.showSaveDialog(mainWindow,{title:'导出网络诊断报告',defaultPath:'轻场-网络波动诊断.html',filters:[{name:'网页报告',extensions:['html']}]});if(result.canceled||!result.filePath)return {canceled:true};fs.writeFileSync(result.filePath,html,'utf8');return {ok:true};
});
ipcMain.handle('qingchang:performance-status',()=>performanceCapture.status());
ipcMain.handle('qingchang:performance-start',(_event,input)=>performanceCapture.start(input));
ipcMain.handle('qingchang:performance-finish',()=>performanceCapture.finish(true));
ipcMain.handle('qingchang:performance-cancel',()=>performanceCapture.cancel());
ipcMain.handle('qingchang:performance-remove',(_event,id)=>performanceCapture.remove(String(id)));
ipcMain.handle('qingchang:performance-retry',()=>performanceCapture.retrySave());
ipcMain.handle('qingchang:performance-export',async(_event,beforeId,afterId,format)=>{
 if(!['html','json'].includes(format))throw new Error('导出格式无效');
 const before=performanceCapture.report(beforeId),after=performanceCapture.report(afterId);
 if(!before||!after||before.stage!=='before'||after.stage!=='after'||after.baselineId!==before.id)throw new Error('请选择对应的优化前、优化后采样');
 const content=format==='html'?performanceModel.exportHTML(before,after):JSON.stringify({format:'qingchang-performance-v1',before,after,comparison:performanceModel.compare(before,after)},null,2);
 const result=await dialog.showSaveDialog(mainWindow,{title:'导出优化前后对比报告',defaultPath:`轻场-优化对比-${new Date().toLocaleDateString('sv-SE')}.${format}`,filters:[{name:format==='html'?'网页报告（可打印）':'完整数据 JSON',extensions:[format]}]});
 if(result.canceled||!result.filePath)return {canceled:true};fs.writeFileSync(result.filePath,content,'utf8');return {ok:true,filePath:result.filePath};
});
ipcMain.handle('qingchang:highlights-export',async(_event,sessionId,format)=>{
 if(!appData)throw new Error('暂无场次数据');if(!['csv','txt','json'].includes(format))throw new Error('导出格式无效');
 const content=highlights.exportSession(appData,String(sessionId),format);
 const session=appData.streamSessions.find(x=>x.id===sessionId),name=String(session.title||'直播场次').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,80);
 const result=await dialog.showSaveDialog(mainWindow,{title:'导出精彩时刻',defaultPath:`${name}-精彩时刻.${format}`,filters:[{name:format==='csv'?'表格 CSV':format==='txt'?'文本清单':'完整 JSON',extensions:[format]}]});
 if(result.canceled||!result.filePath)return {canceled:true};fs.writeFileSync(result.filePath,content,'utf8');return {ok:true,count:highlights.clipsFor(appData,sessionId).length,filePath:result.filePath};
});
ipcMain.handle('qingchang:backup', async (_event, password) => {
  if (!appData) throw new Error('暂无可备份的数据');
  const result = await dialog.showSaveDialog(mainWindow, { title: '保存轻场加密备份', defaultPath: `轻场-加密备份-${new Date().toISOString().slice(0, 10)}.qcbak`, filters: [{ name: '轻场加密备份', extensions: ['qcbak'] }] });
  if (result.canceled || !result.filePath) return { canceled: true };
  fs.writeFileSync(result.filePath, encryptBackup(appData, password), 'utf8');
  return { ok: true, filePath: result.filePath };
});
ipcMain.handle('qingchang:restore', async (_event, password) => {
  if(performanceCapture?.status(false).running)throw new Error('请先完成或取消性能采样，再恢复备份');
  const result = await dialog.showOpenDialog(mainWindow, { title: '选择轻场加密备份', properties: ['openFile'], filters: [{ name: '轻场加密备份', extensions: ['qcbak'] }] });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  try {
    const restored = decryptBackup(fs.readFileSync(result.filePaths[0], 'utf8'), password);
    saveLocal(restored);
    applyHotkeys(restored.settings?.shortcuts);
    return { ok: true, data: restored };
  } catch (error) { return { ok: false, error: error.message || '无法读取备份' }; }
});
ipcMain.handle('qingchang:copy-secret', (_event, value) => {
  if (typeof value !== 'string' || !value) return { ok: false };
  clipboard.writeText(value);
  copiedSecret = value;
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => { if (clipboard.readText() === copiedSecret) clipboard.clear(); copiedSecret = ''; }, 30000);
  return { ok: true };
});
ipcMain.handle('qingchang:system-info', () => {
  const os = require('node:os');
  return { cpuCores: os.cpus().length, memoryGb: Math.round(os.totalmem() / 1024 ** 3), platform: `${os.type()} ${os.release()}` };
});
ipcMain.handle('qingchang:optimization-info', () => optimization.getOptimizationInfo());
ipcMain.handle('qingchang:optimization-apply-power', () => optimization.applyPerformancePower());
ipcMain.handle('qingchang:optimization-restore-power', (_event, guid) => optimization.restorePowerPlan(guid));
ipcMain.handle('qingchang:optimization-sample', () => optimization.performanceSample());
ipcMain.handle('qingchang:monitor-status',()=>screenMonitor?.status()||{});
ipcMain.handle('qingchang:monitor-processes',()=>optimizationTools.runNative('game-processes'));
ipcMain.handle('qingchang:monitor-start',(_event,pid)=>screenMonitor.start(Number(pid)||0));
ipcMain.handle('qingchang:monitor-stop',()=>screenMonitor.stop());
ipcMain.handle('qingchang:monitor-mute',(_event,muted)=>{if(typeof muted!=='boolean')throw Error('静音设置无效');return screenMonitor.muteAlerts(muted);});
ipcMain.handle('qingchang:monitor-probe',()=>screenMonitor.probeHardware());
ipcMain.handle('qingchang:monitor-config',(_event,config)=>screenMonitor.configure(config));
ipcMain.handle('qingchang:monitor-install-sensors',async()=>{
 const folder=app.isPackaged?path.join(process.resourcesPath,'hardware-monitor'):path.join(__dirname,'vendor','hardware-monitor');
 const installer=path.join(folder,'PawnIO_setup.exe');
 // Only launch the bundled, pinned official installer, through its normal setup interface.
 const manifest=JSON.parse(fs.readFileSync(path.join(folder,'SOURCE.json'),'utf8'));
 const actual=crypto.createHash('sha256').update(fs.readFileSync(installer)).digest('hex');
 if(actual!==manifest.sha256['PawnIO_setup.exe'])throw new Error('传感器驱动安装包校验失败，请重新下载轻场');
 const error=await shell.openPath(installer);if(error)throw new Error(error);
 return {opened:true};
});

ipcMain.handle('qingchang:douyin-telemetry', () => douyinTelemetry.readSnapshot(app.getPath('appData')));
ipcMain.handle('qingchang:douyin-summary', (_event,samples,startedAt) => {
  if(!Array.isArray(samples)||samples.length>16||!Number.isFinite(startedAt))throw new Error('直播检测参数无效');
  return douyinTelemetry.summarize(samples,startedAt);
});
ipcMain.handle('qingchang:optimization-set', async (_event, id, value) => { const result=await optimization.setTweak(id,value); if(!/^(mouse|keyboard)/.test(id))recordOptimization('应用系统设置',result);return result; });
ipcMain.handle('qingchang:optimization-restore', async (_event, id, before) => {const result=await optimization.restoreTweak(id,before);if(!/^(mouse|keyboard)/.test(id))recordOptimization('恢复系统设置',result);return result;});
ipcMain.handle('qingchang:tools-status', () => requireToolkit().status());
ipcMain.handle('qingchang:optimization-sync-input', async (_event, group, restoring) => {const result=await optimization.syncInputGroup(group);recordOptimization(`${restoring===true?'恢复':'即时应用'}${group==='mouse'?'鼠标':'键盘'}设置`,result);return result;});
ipcMain.handle('qingchang:tools-configure', (_event, config) => requireToolkit().configure(config));
ipcMain.handle('qingchang:tools-processes', () => requireToolkit().processes());
ipcMain.handle('qingchang:tools-clean', () => requireToolkit().clean(true));
ipcMain.handle('qingchang:tools-resource-start', () => requireToolkit().startResources());
ipcMain.handle('qingchang:tools-resource-stop', () => requireToolkit().restoreResources());
ipcMain.handle('qingchang:tools-cache-inspect', (_event, executable) => requireToolkit().cacheInspect(executable));
ipcMain.handle('qingchang:tools-cache-backup', (_event, executable) => requireToolkit().cacheBackup(executable));
ipcMain.handle('qingchang:tools-cache-restore', (_event, id) => requireToolkit().cacheRestore(id));
ipcMain.handle('qingchang:gpu-spoof-snapshot', () => optimization.gpuSpoofSnapshot());
ipcMain.handle('qingchang:gpu-spoof-apply', (_event, backup) => optimization.applyGpuSpoof(backup));
ipcMain.handle('qingchang:gpu-spoof-restore', (_event, backup) => optimization.restoreGpuSpoof(backup));
ipcMain.handle('qingchang:relaunch-admin', async () => {
  if (!app.isPackaged || process.platform !== 'win32') throw new Error('管理员模式仅在打包后的 Windows 应用中可用');
  const executable = process.execPath.replace(/'/g, "''");
  await promisify(execFile)('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', `Start-Process -FilePath '${executable}' -Verb RunAs`], { windowsHide: true, timeout: 45000 });
  setTimeout(() => app.quit(), 100);
  return { ok: true };
});
ipcMain.handle('qingchang:open-nvidia-app', async () => {
  const candidate = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'NVIDIA Corporation', 'NVIDIA App', 'CEF', 'NVIDIA App.exe');
  if (!fs.existsSync(candidate)) throw new Error('这台电脑未找到 NVIDIA App');
  const error = await shell.openPath(candidate);
  if (error) throw new Error(error);
  return { ok: true };
});
ipcMain.handle('qingchang:nvidia-select-game', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { title: '选择三角洲游戏程序', properties: ['openFile'], filters: [{ name: 'Windows 程序', extensions: ['exe'] }] });
  return result.canceled ? '' : (result.filePaths[0] || '');
});
ipcMain.handle('qingchang:nvidia-prepare', async (_event, options) => {
  if (!options || !['performance', 'clarity'].includes(options.preset) || !['off', 'C', 'K'].includes(options.model) || typeof options.executable !== 'string') throw new Error('NVIDIA 方案参数无效');
  return nvidiaIntegration.prepareNvidiaPreset(app.getPath('userData'), options);
});
ipcMain.handle('qingchang:nvidia-open-preset', (_event, file) => nvidiaIntegration.openPresetInInspector(app.getPath('userData'), file));
ipcMain.handle('qingchang:nvidia-open-backup', async (_event, file) => {
  const dir = path.join(app.getPath('userData'), 'nvidia-profile-inspector');
  if (typeof file !== 'string' || path.dirname(file) !== dir || !fs.existsSync(file)) throw new Error('找不到原配置备份');
  shell.showItemInFolder(file);
  return { ok: true };
});
ipcMain.handle('qingchang:repair-resume-requested',()=>process.argv.includes('--repair-resume'));
ipcMain.handle('qingchang:repair-status',()=>requireRepair().status());
ipcMain.handle('qingchang:repair-scan',(_event,exe)=>requireRepair().scan(exe));
ipcMain.handle('qingchang:repair-run',(_event,options)=>requireRepair().run(options));
ipcMain.handle('qingchang:repair-restore',(_event,id)=>requireRepair().restore(id));
ipcMain.handle('qingchang:repair-validate',()=>requireRepair().validate());
ipcMain.handle('qingchang:repair-shader-confirm',()=>requireRepair().markShader());
ipcMain.handle('qingchang:repair-continue',()=>requireRepair().continueAfterReboot());
ipcMain.handle('qingchang:repair-restart',async()=>{
  const repair=requireRepair();if(repair.isBusy())throw Error('修复尚未完成');if(repair.latest()?.phase!=='await-reboot')throw Error('当前没有需要重启的修复');if(!app.isPackaged)throw Error('请使用打包版安排重启');
  const answer=await dialog.showMessageBox(mainWindow,{type:'question',buttons:['取消','60 秒后重启'],defaultId:0,cancelId:0,message:'保存好其他程序中的内容后再重启',detail:'轻场将在下次登录时重新打开并显示修复进度；可在倒计时内取消。'});if(answer.response!==1)return {canceled:true};
  const reg=path.join(process.env.SystemRoot||'C:\\Windows','System32','reg.exe'),shutdown=path.join(process.env.SystemRoot||'C:\\Windows','System32','shutdown.exe'),runOnce='HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce';
  await promisify(execFile)(reg,['add',runOnce,'/v','QingchangRepairResume','/t','REG_SZ','/d','"'+process.execPath+'" --repair-resume','/f'],{windowsHide:true});
  try{await promisify(execFile)(shutdown,['/r','/t','60','/c','轻场：完成运行库修复后重启'],{windowsHide:true});repairRestartScheduled=true;return {scheduled:true};}catch(e){await promisify(execFile)(reg,['delete',runOnce,'/v','QingchangRepairResume','/f'],{windowsHide:true}).catch(()=>{});throw e;}
});
ipcMain.handle('qingchang:repair-restart-cancel',async()=>{if(!repairRestartScheduled)throw Error('本次没有安排重启');const root=process.env.SystemRoot||'C:\\Windows';await promisify(execFile)(path.join(root,'System32','shutdown.exe'),['/a'],{windowsHide:true});await promisify(execFile)(path.join(root,'System32','reg.exe'),['delete','HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce','/v','QingchangRepairResume','/f'],{windowsHide:true});repairRestartScheduled=false;return {canceled:true};});
ipcMain.handle('qingchang:repair-open-folder',()=>{const repair=requireRepair(),plan=repair.status().plan;if(!plan)throw Error('请先检查游戏');return shell.openPath(plan.project);});

ipcMain.handle('qingchang:open-url', (_event, url) => {
  if (typeof url === 'string' && /^https:\/\//i.test(url)) return shell.openExternal(url);
  return false;
});
ipcMain.handle('qingchang:avatar-control', () => liveAssistant.openControl());
ipcMain.handle('qingchang:avatar-output', () => liveAssistant.openOutput());
ipcMain.handle('qingchang:avatar-output-close', () => liveAssistant.closeOutput());

app.whenReady().then(() => {
  optimizationTools.configureHelper(app.isPackaged ? path.join(process.resourcesPath,'optimization-native.ps1') : path.join(__dirname,'optimization-native.ps1'));
  try {
    const file=path.join(app.getPath('userData'),'optimization-tools.enc');
    toolkit=optimizationTools.createController({
      read:()=>fs.existsSync(file)?JSON.parse(safeStorage.decryptString(fs.readFileSync(file))):null,
      write:data=>{if(!safeStorage.isEncryptionAvailable())throw new Error('Windows 本机加密不可用，维护设置未保存');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',safeStorage.encryptString(JSON.stringify(data)));fs.renameSync(file+'.tmp',file);},
      onChange:status=>{if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('optimization:tools-status',status);}
    });
  } catch(error) {toolkitError=`维护设置无法读取：${error.message}`;console.error(toolkitError);}
  try{
    const repairFile=path.join(app.getPath('userData'),'frame-repair.enc'),native=nativeRunner(app.isPackaged?path.join(process.resourcesPath,'frame-repair-native.ps1'):path.join(__dirname,'frame-repair-native.ps1'));
    frameRepair=createRepair({read:()=>fs.existsSync(repairFile)?JSON.parse(safeStorage.decryptString(fs.readFileSync(repairFile))):null,
      write:data=>{if(!safeStorage.isEncryptionAvailable())throw Error('Windows 本机加密不可用，已停止修复');fs.mkdirSync(path.dirname(repairFile),{recursive:true});fs.writeFileSync(repairFile+'.tmp',safeStorage.encryptString(JSON.stringify(data)));fs.renameSync(repairFile+'.tmp',repairFile);},
      detectGame:async()=>{const game=await optimization.deltaGamePath();if(game)return game;const system=await native('inspect');return require('./frame-repair-files').findSteamGame(system.steamRoots||[]);},inspectSystem:()=>native('inspect'),
      download:arch=>downloadRuntime(arch,path.join(app.getPath('userData'),'repair-runtime'),file=>native('signature',{file})),
      install:(file,mode)=>native('install',{file,mode}),openExternal:url=>shell.openExternal(url),openPath:file=>shell.openPath(file),
      onChange:value=>{if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('repair:update',value);}
    });
  }catch(error){console.error('掉帧修复状态无法读取：',error.message);}
  liveAssistant.initialize({onReturn:()=>{mainWindow?.show();mainWindow?.focus();}});
  try { appData = loadLocal(); }
  catch (error) { appData = null; loadError = error.message || '读取本地数据库失败'; console.error(error); }
  performanceCapture=createPerformanceCapture({
    executable:app.isPackaged?path.join(process.resourcesPath,'presentmon','PresentMon.exe'):path.join(__dirname,'vendor','presentmon','PresentMon.exe'),
    listProcesses:()=>optimizationTools.runNative('game-processes'),
    sampleHardware:createHardwareSampler(optimization.createPerformanceSampler(),app.isPackaged?path.join(process.resourcesPath,'hardware-monitor','QingchangSensors.exe'):path.join(__dirname,'vendor','hardware-monitor','QingchangSensors.exe')),
    liveSource:{start:source=>{if(source==='obs')reportObsTelemetry.start({...appData?.settings?.setup});else reportObsTelemetry.stop();},stop:()=>reportObsTelemetry.stop(),read:(source,now)=>source==='obs'?reportObsTelemetry.read():{...douyinTelemetry.readSnapshot(app.getPath('appData'),now),source:'douyin'}},getReports:()=>appData?.performanceReports||[],
    saveReports:list=>{if(loadError||!appData)throw new Error('本地数据不可写，请先进入工作台或恢复备份');saveLocal({...appData,performanceReports:list});},
    onChange:value=>{if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('performance:update',value);}
  });
  screenMonitor=createScreenMonitor({BrowserWindow,screen,globalShortcut,onAlert:()=>shell.beep(),
    executable:app.isPackaged?path.join(process.resourcesPath,'presentmon','PresentMon.exe'):path.join(__dirname,'vendor','presentmon','PresentMon.exe'),
    sampleHardware:createHardwareSampler(optimization.createPerformanceSampler(),app.isPackaged?path.join(process.resourcesPath,'hardware-monitor','QingchangSensors.exe'):path.join(__dirname,'vendor','hardware-monitor','QingchangSensors.exe')),appDataDirectory:app.getPath('appData'),listProcesses:()=>optimizationTools.runNative('game-processes'),loadConfig:()=>({...appData?.settings?.monitor,liveSource:appData?.settings?.monitor?.liveSource||appData?.settings?.setup?.mode||'douyin'}),
    liveSource:{start:config=>{if(config.liveSource==='obs')obsTelemetry.start(appData?.settings?.setup);else obsTelemetry.stop();},stop:()=>obsTelemetry.stop(),read:config=>{if(config.liveSource==='obs'){obsTelemetry.start(appData?.settings?.setup);return obsTelemetry.read();}return {...douyinTelemetry.readSnapshot(app.getPath('appData'),Date.now()),source:'douyin'};}},
    saveConfig:config=>{if(!appData)throw new Error('请先进入工作台后再保存监测设置');const next=structuredClone(appData);next.settings.monitor=config;next.settings.setup||={};next.settings.setup.mode=config.liveSource;saveLocal(next);},
    onChange:value=>{if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('monitor:update',value);}
  });
  try{screenMonitor.registerHotkey();}catch(error){console.error(error.message);}
  createWindow();
  if(toolkit?.status().resource.count)toolkit.restoreResources().catch(error=>console.error('后台设置恢复未完成:',error.message));
  if (appData?.settings?.shortcuts) applyHotkeys(appData.settings.shortcuts);
});
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
let optimizationQuitReady=false;
let optimizationQuitPending=false;
app.on('before-quit', event => {
  if(frameRepair?.isBusy()){event.preventDefault();mainWindow?.show();mainWindow?.webContents.send('app:close-blocked','正在检查或处理游戏，请等待完成后再关闭。');return;}
  if(mainWindow&&!mainWindow.isDestroyed()&&!closeApproved){event.preventDefault();mainWindow.close();return;}
  if(optimizationQuitReady||(!toolkit&&!screenMonitor&&!performanceCapture))return;
  event.preventDefault();
  if(optimizationQuitPending)return;
  optimizationQuitPending=true;
  Promise.all([toolkit?.shutdown(),screenMonitor?.shutdown(),performanceCapture?.shutdown()]).catch(error=>console.error('退出时恢复未完成，下次启动重试:',error.message)).finally(()=>{optimizationQuitReady=true;app.quit();});
});
app.on('will-quit', () => { toolkit?.stop();globalShortcut.unregisterAll(); clearTimeout(copyTimer); if (copiedSecret && clipboard.readText() === copiedSecret) clipboard.clear(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
