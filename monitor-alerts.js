(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.QingchangMonitorAlerts=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const defaults={enabled:true,sound:false,live:true,game:true,hardware:true,minBitrateKbps:2000,minStreamFps:20,minGameFps:45,holdSeconds:8,maxCpuTempC:90,maxGpuTempC:85,maxCpuPercent:90,maxGpuPercent:95,maxMemoryPercent:90,maxVramPercent:95,temperatureHoldSeconds:10,hardwareHoldSeconds:30};
 function guidance(id,active=[]){const gameOnly=!active.some(x=>x.group==='live'||['bitrate','stream-fps','live-data'].includes(x.id));return ({
  'cpu-temperature':{reason:'CPU 温度持续达到你设置的提醒线，不等于已超过这个型号的厂商温度上限。',next:'先降低游戏帧率上限和非必要负载，检查风扇、散热与通风；结合 CPU 型号的温度规格判断。',tool:'monitor',label:'查看温度与阈值'},
  'gpu-temperature':{reason:'所选显卡的核心温度持续达到提醒线；这里不混用显存或热点温度。',next:'先降低游戏帧率上限与画质，检查显卡散热、风扇和机箱通风，再观察温度。',tool:'monitor',label:'查看显卡温度'},
  'cpu-load':{reason:'整机 CPU 占用持续达到提醒线，可能挤占游戏和推流的处理余量。',next:'检查任务管理器中的高占用程序，关闭非必要任务；不要直接结束系统或直播进程。',tool:'monitor',label:'查看电脑负载'},
  'gpu-load':{reason:'所选显卡占用持续较高；高占用在游戏中可能正常，需要结合卡顿与推流情况。',next:'主播可先限制游戏帧率，给推流留出余量；陪玩若帧率稳定，可按需要调整提醒阈值。',tool:'monitor',label:'查看显卡负载'},
  'memory-load':{reason:'整机物理内存持续占用较多，不是硬盘剩余空间不足。',next:'关闭不需要的软件与浏览器标签，观察占用是否下降，再判断是否需要增加内存。',tool:'monitor',label:'查看内存占用'},
  'vram-load':{reason:'所选显卡的独立显存持续接近容量上限，不包含共享系统内存。',next:'适当降低纹理质量或游戏分辨率，关闭其他占用显存的软件，再观察卡顿。',tool:'monitor',label:'查看显存占用'},
  'obs-render':{reason:'OBS 渲染线程在连续采样区间内跳帧，不能直接归因于网络。',next:'先降低游戏帧率上限，给 OBS 留出 GPU 余量，再检查场景中高负载的来源。',tool:'monitor',label:'查看运行数据'},
  'obs-encode':{reason:'OBS 输出线程连续跳帧；此计数也可能包含其他正在运行的输出。',next:'在 OBS 统计窗口核对编码负载，尝试降低输出分辨率或帧率，再复测。',tool:'monitor',label:'查看运行数据'},
  'obs-network':{reason:'OBS 推流输出持续报告丢帧，需要结合网络与服务器连接情况判断。',next:'检查 OBS 网络提示，暂停其他上传，改用网线；再检查连接波动。',tool:'network',label:'检查网络'},
  'bitrate':{reason:'码率低于设置阈值，单凭码率不能确定是网络问题。',next:'先查看直播软件的网络提示；若也提示网络异常，暂停其他上传并用网线复测。',tool:'network',label:'检查网络'},
  'stream-fps':{reason:'推流帧率低于设置阈值，可能与渲染或编码负载有关。',next:'先降低游戏帧率上限，为推流留出余量；仍异常时查看游戏与推流负载。',tool:'monitor',label:'查看运行数据'},
  'game-fps':{reason:gameOnly?'游戏帧率低于设置阈值；当前未触发推流异常提醒，不代表推流一定正常。':'游戏帧率低于设置阈值，同时有推流异常，需要分别核对。',next:'先确认是否正在加载或切屏；持续偏低时查看负载，再调整游戏画质。',tool:'monitor',label:'查看运行数据'},
  'live-data':{reason:'暂时没有新的推流数据，不能据此判断直播已中断。',next:'确认直播软件是否仍在推流；若正在直播，检查监测来源与数据状态。',tool:'monitor',label:'检查监测来源'},
  'game-data':{reason:'暂时没有新的游戏帧数据，不能据此判断游戏掉帧。',next:'回到对局等待加载完成；仍无数据时，检查选中的游戏进程。',tool:'monitor',label:'检查游戏进程'}
 })[id]||{reason:'需要结合当前游戏和推流状态判断。',next:'查看运行数据后再决定如何处理。',tool:'monitor',label:'查看运行数据'};}
 function normalize(input={}){if(!input||typeof input!=='object'||Array.isArray(input))input={};const out={...defaults};for(const key of ['enabled','sound','live','game','hardware'])if(typeof input[key]==='boolean')out[key]=input[key];for(const [key,min,max]of [['minBitrateKbps',100,100000],['minStreamFps',1,120],['minGameFps',1,500],['holdSeconds',4,60],['maxCpuTempC',50,115],['maxGpuTempC',50,110],['maxCpuPercent',50,100],['maxGpuPercent',50,100],['maxMemoryPercent',50,100],['maxVramPercent',50,100],['temperatureHoldSeconds',4,60],['hardwareHoldSeconds',10,120]]){if(input[key]===undefined)continue;const n=Number(input[key]);if(!Number.isFinite(n)||n<min||n>max)throw Error('异常提醒阈值超出允许范围');out[key]=n;}return out;}
 function create({clock=Date.now,onAlert=()=>{}}={}){
  let config=normalize(),running=false,startedAt=0,mutedUntil=0,states=new Map(),history=[],sequence=0,lastSound=-Infinity,liveSeen=null,gameSeen=null,source=null,gameSource=null,gpuSource=null;
  function clearGroup(group){for(const [id,state]of states)if(state.group===group)states.delete(id);}
  function reset(){states.clear();liveSeen=null;gameSeen=null;source=null;gameSource=null;gpuSource=null;}
  function configure(value){config=normalize(value);reset();startedAt=clock();return status();}
  function start(){running=true;startedAt=clock();history=[];mutedUntil=0;lastSound=-Infinity;reset();return status();}
  function stop(){running=false;reset();return status();}
  function mute(){mutedUntil=clock()+10*60*1000;return status();}
  function unmute(){mutedUntil=0;return status();}
  function status(){return {running,startedAt,enabled:config.enabled,config,mutedUntil,active:[...states.values()].filter(x=>x.active).map(x=>({id:x.id,title:x.title,detail:x.detail,since:x.since,group:x.group})),history:history.map(x=>({...x})),warming:running&&clock()-startedAt<20000,liveArmed:liveSeen!==null,gameArmed:gameSeen!==null};}
  function observe(id,group,bad,at,title,detail,now,hold=config.holdSeconds*1000){
   let s=states.get(id);if(!s){s={id,group,title,detail,since:null,lastAt:null,count:0,active:false,recovery:null};states.set(id,s);}
   s.detail=detail;s.title=title;
   if(bad===null){s.since=null;s.count=0;s.active=false;s.recovery=null;s.lastAt=null;return;}
   if(s.lastAt!==null&&at<s.lastAt)return;
   const fresh=at!==s.lastAt;
   if(bad){s.recovery=null;if(s.since===null||(s.lastAt!==null&&at-s.lastAt>5000)){s.since=at;s.count=0;}if(fresh)s.count++;
    if(!s.active&&at-s.since>=hold&&s.count>=3){s.active=true;const entry={id:++sequence,kind:id,title,detail,at:now,recoveredAt:null};s.eventId=entry.id;history.unshift(entry);history=history.slice(0,20);if(config.sound&&now>=mutedUntil&&now-lastSound>=60000){lastSound=now;try{onAlert(entry);}catch{}}}
   }else{if(s.active){if(s.recovery===null)s.recovery=at;if(at-s.recovery>=5000){const event=history.find(x=>x.id===s.eventId);if(event)event.recoveredAt=now;s.active=false;s.recovery=null;}}s.since=null;s.count=0;}
   s.lastAt=at;
  }
  function update({game={},live={},selected=null,hardware=null}={}){
   const now=clock();if(!running||!config.enabled)return status();
   if(live.source==='obs'&&live.state==='idle'){clearGroup('live');liveSeen=null;}
   if(live.fileName&&source!==live.fileName){clearGroup('live');liveSeen=null;source=live.fileName;}
   const identity=selected?`${selected.pid}:${selected.started||''}`:null;if(identity!==gameSource){clearGroup('game');gameSeen=null;gameSource=identity;}
   const liveAt=live.at,liveFresh=config.live&&live.available&&Number.isFinite(liveAt)&&liveAt>=startedAt&&liveAt<=now+1000&&now-liveAt<=6000;
   if(liveFresh&&(liveSeen!==null||live.metrics?.real_bitrate>0||live.metrics?.stream_real_fps>0))liveSeen=liveAt;
   const gameFresh=config.game&&!!selected&&game.state==='ready'&&Number.isFinite(game.at)&&game.at>=startedAt&&now-game.at<=3000&&game.at<=now+1000;
   if(gameFresh)gameSeen=game.at;
   if(now-startedAt<20000)return status();
   const h=hardware||{},gpu=h.gpu||{},freshAt=at=>Number.isFinite(at)&&at>=startedAt&&at<=now&&now-at<=6500;
   if((gpu.id||null)!==gpuSource){for(const id of ['gpu-temperature','gpu-load','vram-load'])states.delete(id);gpuSource=gpu.id||null;}
   const cpuAt=h.cpuSensors?.at??h.at,gpuAt=gpu.at??h.at,vram=Number.isFinite(gpu.memoryUsedMb)&&Number.isFinite(gpu.memoryTotalMb)&&gpu.memoryTotalMb>0&&gpu.memoryUsedMb>=0&&gpu.memoryUsedMb<=gpu.memoryTotalMb?100*gpu.memoryUsedMb/gpu.memoryTotalMb:null;
   for(const [id,value,limit,at,title,unit,temperature]of [
    ['cpu-temperature',h.cpuTempC,config.maxCpuTempC,cpuAt,'CPU 温度持续偏高','°C',true],['gpu-temperature',gpu.temperatureC,config.maxGpuTempC,gpuAt,'GPU 核心温度持续偏高','°C',true],
    ['cpu-load',h.cpuPercent,config.maxCpuPercent,h.at,'CPU 持续高占用','%',false],['gpu-load',gpu.utilization,config.maxGpuPercent,gpuAt,'GPU 持续高占用','%',false],['memory-load',h.memoryUsedPercent,config.maxMemoryPercent,h.at,'内存持续高占用','%',false],['vram-load',vram,config.maxVramPercent,gpuAt,'显存持续高占用','%',false]]){
    const valid=config.hardware&&freshAt(at)&&Number.isFinite(value)&&value>=(temperature?1:0)&&value<=(temperature?149:100);
    const active=states.get(id)?.active,threshold=active?limit-(temperature?3:5):limit;
    observe(id,'hardware',valid?value>=threshold:null,at,title,`${id.startsWith('gpu')||id==='vram-load'?(gpu.name||'所选显卡')+' · ':''}当前 ${Number.isFinite(value)?value.toFixed(1):'—'} ${unit}，提醒线 ${limit} ${unit}`,now,(temperature?config.temperatureHoldSeconds:config.hardwareHoldSeconds)*1000);
   }
   const metric=(id,group,fresh,value,limit,at,title,unit)=>observe(id,group,fresh&&Number.isFinite(value)?value<limit:null,at,title,Number.isFinite(value)?`当前 ${Math.round(value)} ${unit}，下限 ${limit} ${unit}`:'等待有效数据',now);
   metric('bitrate','live',liveFresh&&liveSeen!==null,live.metrics?.real_bitrate,config.minBitrateKbps,liveAt,'直播码率持续偏低','Kbps');
   metric('stream-fps','live',liveFresh&&liveSeen!==null,live.metrics?.stream_real_fps,config.minStreamFps,liveAt,live.source==='obs'?'OBS 渲染帧率持续偏低':'推流帧率持续偏低','FPS');
   for(const [id,key,title]of [['obs-render','render','OBS 渲染持续跳帧'],['obs-encode','encoding','OBS 编码输出持续跳帧'],['obs-network','network','OBS 网络持续丢帧']]){const count=live.obs?.[key]?.skipped;observe(id,'live',live.source==='obs'&&liveFresh&&Number.isFinite(count)?count>0:null,liveAt,title,Number.isFinite(count)?`最近 ${live.obs.intervalSeconds?.toFixed(1)||'—'} 秒新增 ${count} 帧；不是启动以来累计值`:'等待完整区间统计',now);}
   metric('game-fps','game',gameFresh,game.fps,config.minGameFps,game.at,'游戏帧率持续偏低','FPS');
   // Missing telemetry is distinct from zero FPS/bitrate; never arm on old logs.
   for(const [id,group,seen,enabled,title]of [['live-data','live',liveSeen,config.live,'推流数据中断'],['game-data','game',gameSeen,config.game&&!!selected,'游戏帧数据中断']]){
    const missing=enabled&&seen!==null&&now-seen>=15000;
    observe(id,group,enabled&&seen!==null?missing:null,now,title,group==='live'?'已超过 15 秒没有新推流数据；也可能已下播。':'已超过 15 秒没有新游戏帧；也可能正在切屏或加载。',now,1000);
   }
   return status();
  }
  return {configure,start,stop,mute,unmute,status,update,resetHardware(){clearGroup('hardware');gpuSource=null;}};
 }
 return {defaults,normalize,create,guidance};
});
