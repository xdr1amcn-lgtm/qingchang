const { app, BrowserWindow, desktopCapturer, ipcMain, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { Worker } = require('node:worker_threads');

const root = __dirname;
let controlWindow = null;
let outputWindow = null;
let selectedDesktopSourceId = null;
let speakerWorker = null;
let nextRequestId = 1;
let initialized = false;
const pending = new Map();
const liveState = { speaker: 'idle', speakers: { streamer: false, hamster: false }, intensity: 1, outputOpen: false, audio: { enabled: false, micLevel: 0, desktopLevel: 0, micVoice: false, desktopVoice: false, micEcho: false, message: '未开启自动识别' } };

function broadcast() {
  for (const w of [controlWindow, outputWindow]) if (w && !w.isDestroyed()) w.webContents.send('live:state', liveState);
}
function openControl() {
  if (controlWindow && !controlWindow.isDestroyed()) { controlWindow.show(); controlWindow.focus(); return { ok: true }; }
  controlWindow = new BrowserWindow({ width: 1320, height: 860, minWidth: 1080, minHeight: 720, backgroundColor: '#f1f5fa', title: '轻场 · 直播形象助手', icon: path.join(__dirname, 'assets', 'qingchang.ico'), webPreferences: { preload: path.join(root, 'live-preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  controlWindow.setMenuBarVisibility(false);
  controlWindow.loadFile(path.join(root, 'src', 'live.html'), { query: { mode: 'control',theme:'qingchang' } });
  controlWindow.on('closed', () => { controlWindow = null; if (outputWindow && !outputWindow.isDestroyed()) outputWindow.close(); });
  return { ok: true };
}
function openOutput() {
  if (outputWindow && !outputWindow.isDestroyed()) { outputWindow.show(); outputWindow.focus(); liveState.outputOpen = true; broadcast(); return { ok: true, created:false }; }
  outputWindow = new BrowserWindow({ width: 1280, height: 720, minWidth: 640, minHeight: 360, backgroundColor: '#151311', title: '轻场 · 安全直播画面', icon: path.join(__dirname, 'assets', 'qingchang.ico'), frame: false, resizable: true, webPreferences: { preload: path.join(root, 'live-preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  outputWindow.setMenuBarVisibility(false); outputWindow.setAspectRatio(16 / 9);
  outputWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') closeOutput();
  });
  outputWindow.loadFile(path.join(root, 'src', 'live.html'), { query: { mode: 'output' } });
  outputWindow.on('closed', () => { outputWindow = null; liveState.outputOpen = false; broadcast(); });
  liveState.outputOpen = true; broadcast(); return { ok: true, created:true };
}
function closeOutput() {
  if (outputWindow && !outputWindow.isDestroyed()) outputWindow.close();
  else { liveState.outputOpen = false; broadcast(); }
  return { ok: true };
}
function audioCapture() {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'media' || permission === 'display-capture'));
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try { const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 1, height: 1 }, fetchWindowIcons: false }); const source = sources.find(x => x.id === selectedDesktopSourceId) || sources.find(x => x.id.startsWith('screen:')) || sources[0]; callback(source ? { video: source, audio: 'loopback' } : {}); }
    catch { callback({}); }
  });
}
function ensureWorker() {
  if (speakerWorker) return speakerWorker;
  const resource = (name) => { const packaged = path.join(process.resourcesPath || '', name); return fs.existsSync(packaged) ? packaged : path.join(root, 'assets', name); };
  const workerPath = app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked', 'live-speaker-worker.js') : path.join(root, 'live-speaker-worker.js');
  speakerWorker = new Worker(workerPath, { workerData: { modelPath: resource('live-speaker-campplus.onnx'), vadPath: resource('live-vad-model.onnx'), calibrationPath: path.join(app.getPath('userData'), 'live-speaker-campplus-profile.json') } });
  const worker = speakerWorker;
  speakerWorker.on('message', (msg) => { const task = pending.get(msg?.id); if (!task) return; pending.delete(msg.id); clearTimeout(task.timer); msg.error ? task.reject(new Error(msg.error)) : task.resolve(msg); });
  const fail = (error) => { if (speakerWorker !== worker) return; for (const task of pending.values()) { clearTimeout(task.timer); task.reject(error); } pending.clear(); speakerWorker = null; };
  speakerWorker.on('error', fail); speakerWorker.on('exit', code => fail(new Error(`本地声音识别模型已停止（${code}）`)));
  return speakerWorker;
}
function speakerTask(message, transfer = [], timeout = 8000) {
  return new Promise((resolve, reject) => { const worker=ensureWorker(), id=nextRequestId++;const timer=setTimeout(()=>{if(speakerWorker===worker){speakerWorker=null;for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('声音识别超时，识别引擎将重启'));}pending.clear();worker.terminate();}},timeout);pending.set(id,{resolve,reject,timer});try{worker.postMessage({id,...message},transfer);}catch(error){clearTimeout(timer);pending.delete(id);reject(error);} });
}
function validControl(event) { return controlWindow && event.sender === controlWindow.webContents; }

function initialize(options={}) {
  if (initialized) return; initialized = true; audioCapture();
  ipcMain.handle('live:return-workspace',()=>{controlWindow?.hide();options.onReturn?.();return {ok:true};});
  ipcMain.handle('live:state', () => liveState);
  ipcMain.handle('live:desktop-sources', async () => (await desktopCapturer.getSources({ types:['screen','window'],thumbnailSize:{width:1,height:1},fetchWindowIcons:false })).map(x=>({id:x.id,name:x.name,kind:x.id.startsWith('screen:')?'screen':'window'})));
  ipcMain.handle('live:set-desktop-source', (_event, id) => { selectedDesktopSourceId=typeof id==='string'?id:null;return {ok:true}; });
  ipcMain.handle('live:speaker-status', (event, key='') => { if(!validControl(event))throw new Error('Invalid audio source');return speakerTask({type:'status',sourceKey:String(key).slice(0,512)}); });
  ipcMain.handle('live:classify-speaker', (event, audio, key='') => { if(!validControl(event))throw new Error('Invalid audio source');const samples=audio instanceof Float32Array?audio:new Float32Array(audio);if(samples.length<32000||samples.length>64000)throw new Error('Invalid audio window');return speakerTask({samples,sourceKey:String(key).slice(0,512)},[samples.buffer]); });
  ipcMain.handle('live:calibrate-speaker', (event, windows, key='') => { if(!validControl(event)||!Array.isArray(windows)||windows.length!==5)throw new Error('Invalid calibration input');const samples=windows.map(x=>x instanceof Float32Array?x:new Float32Array(x));if(samples.some(x=>x.length!==48000))throw new Error('Invalid calibration input');return speakerTask({type:'calibrate',windows:samples,sourceKey:String(key).slice(0,512)},samples.map(x=>x.buffer),15000); });
  ipcMain.handle('live:verify-speaker', (event, windows, key='') => { if(!validControl(event)||!Array.isArray(windows)||windows.length!==2)throw new Error('Invalid verification input');const samples=windows.map(x=>x instanceof Float32Array?x:new Float32Array(x));if(samples.some(x=>x.length!==48000))throw new Error('Invalid verification input');return speakerTask({type:'verify',windows:samples,sourceKey:String(key).slice(0,512)},samples.map(x=>x.buffer),15000); });
  ipcMain.on('live:set-state', (_event, patch) => { if(!patch||typeof patch!=='object')return;if(['idle','streamer','hamster','both'].includes(patch.speaker))liveState.speaker=patch.speaker;if(patch.speakers&&typeof patch.speakers==='object')liveState.speakers={...liveState.speakers,...(typeof patch.speakers.streamer==='boolean'?{streamer:patch.speakers.streamer}:{}),...(typeof patch.speakers.hamster==='boolean'?{hamster:patch.speakers.hamster}:{})};if(Number.isFinite(patch.intensity))liveState.intensity=Math.min(1.35,Math.max(.55,patch.intensity));if(patch.audio&&typeof patch.audio==='object')liveState.audio={...liveState.audio,...patch.audio};broadcast(); });
  ipcMain.handle('live:open-output', () => openOutput());
  ipcMain.handle('live:close-output', () => closeOutput());
}

module.exports = { initialize, openControl, openOutput, closeOutput };
