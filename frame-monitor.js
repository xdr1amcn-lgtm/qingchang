const {spawn,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {randomUUID}=require('node:crypto');
function csv(line){const out=[];let text='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){text+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){out.push(text);text='';}else text+=c;}out.push(text);return out;}
function metricNumber(value){if(typeof value!=='string'||!value.trim()||/^(na|nan|unknown)$/i.test(value.trim()))return null;const n=Number(value);return Number.isFinite(n)?n:null;}
function frameKind(value){if(value==='Application')return 'native';if(['Intel XeSS-FG','AMD AFMF','NVIDIA DLSS-FG'].includes(value))return 'generated';return 'unknown';}
function createFeed(pid,clock=Date.now,onFrame=()=>{}){
 let header=null,pending='',frames=[],lastAt=0;
 function push(chunk){
  pending+=chunk;if(pending.length>1024*1024)pending=pending.slice(-65536);
  let end;while((end=pending.indexOf('\n'))>=0){
   const line=pending.slice(0,end).trim();pending=pending.slice(end+1);const row=csv(line);
   if(row.some(x=>x.toLowerCase()==='msbetweenpresents')&&row.some(x=>x.toLowerCase()==='processid')){header=row.map(x=>x.toLowerCase().replace(/^\uFEFF/,''));continue;}
   if(!header)continue;
   const get=k=>row[header.indexOf(k)],num=k=>metricNumber(get(k));
   if(Number(get('processid'))!==pid)continue;
   const ms=num('msbetweenpresents'),displayMs=num('msbetweendisplaychange'),kind=frameKind(get('frametype'));
   if((ms===null||ms<=0||ms>10000)&&!(kind==='generated'&&displayMs>0&&displayMs<10000))continue;
   const at=clock(),time=num('timeinms')??(num('timeinseconds')===null?null:num('timeinseconds')*1000);
   const latency=num('msuntildisplayed'),displayAt=time!==null&&latency!==null?time+latency:null;
   const frame={at,ms,kind,displayMs,displayAt,time,simulationMs:num('msbetweensimulationstart'),chain:get('swapchainaddress')||'default'};frames.push(frame);onFrame(frame);lastAt=at;
   if(frames.length>60000)frames=frames.slice(-50000);
  }
 }
 function read(){
  const now=clock();frames=frames.filter(x=>now-x.at<=30000);
  const unavailable={state:'waiting',fps:null,frameMs:null,nativeFps:null,generatedFps:null,generationMs:null,message:'等待游戏帧数据'};
  if(!frames.length||now-lastAt>3000)return unavailable;
  const chains=new Map();for(const frame of frames.filter(x=>now-x.at<=1200)){const list=chains.get(frame.chain)||[];list.push(frame);chains.set(frame.chain,list);}
  if(!chains.size)return unavailable;
  const dominant=[...chains.entries()].sort((a,b)=>b[1].length-a[1].length)[0][0],main=frames.filter(x=>x.chain===dominant);
  // Generated displays can repeat the same application's Present timestamp. Count it only once.
  const seen=new Set(),application=main.filter(x=>{if(x.kind==='generated'||!(x.ms>0))return false;if(x.time===null)return true;const key=String(x.time);if(seen.has(key))return false;seen.add(key);return true;});
  const recent=application.filter(x=>now-x.at<=1200);if(!recent.length)return unavailable;
  const slow=application.length>=100?application.map(x=>x.ms).sort((a,b)=>b-a).slice(0,Math.ceil(application.length*.01)):[];
  const low1=slow.length?1000/(slow.reduce((a,b)=>a+b,0)/slow.length):null,ms=recent.reduce((sum,x)=>sum+x.ms,0)/recent.length;
  const displays=main.filter(x=>now-x.at<=1200&&x.displayMs>0&&x.displayMs<10000&&x.kind!=='unknown');
  const generated=displays.filter(x=>x.kind==='generated'),native=displays.filter(x=>x.kind==='native');
  const duration=displays.reduce((sum,x)=>sum+x.displayMs,0);
  const simulation=recent.filter(x=>x.simulationMs>0&&x.simulationMs<10000);
  let nativeFps=null,nativeSource=null,generatedFps=null;
  // Only claim a native/generated split after a generated frame has actually been identified.
  if(generated.length&&native.length&&duration>0){nativeFps=native.length*1000/duration;generatedFps=generated.length*1000/duration;nativeSource='frame-type';}
  else if(simulation.length>=2){nativeFps=1000/(simulation.reduce((sum,x)=>sum+x.simulationMs,0)/simulation.length);nativeSource='simulation';}
  return {state:'ready',at:lastAt,fps:1000/ms,frameMs:ms,low1,lowSamples:application.length,samples:recent.length,nativeFps,generatedFps,nativeSource,generationMs:null,frameTypeState:generatedFps!==null?'ready':'not-reported',generationState:'not-provided',message:'ETW 游戏提交帧率'};
 }
 return {push,read};
}
function createCollector(executable,onChange=()=>{},canRestart=async()=>false,capture={}){
 let child=null,session='',feed=null,wanted=false,restart=null,watchdog=null,generation=0,lastError='',state='stopped',captureMode='detailed',advancedRequested=true;
 const read=()=>({... (state==='running'?feed.read():{state,fps:null,frameMs:null,message:lastError||(state==='stopped'?'未开始游戏采集':'等待游戏帧数据')}),captureMode,advancedRequested});
 async function cleanup(name){if(name)await promisify(execFile)(executable,['--session_name',name,'--terminate_existing_session'],{windowsHide:true,timeout:5000}).catch(()=>{});}
 async function stop(){wanted=false;generation++;clearTimeout(restart);clearTimeout(watchdog);restart=null;watchdog=null;const previous=child,previousSession=session;child=null;session='';if(previous){const ended=new Promise(resolve=>previous.once('close',resolve));previous.kill();await Promise.race([ended,new Promise(resolve=>setTimeout(resolve,1500))]);}await cleanup(previousSession);state='stopped';lastError='';onChange(read());}
 async function start(pid,options={}){
  await stop();if(!Number.isInteger(pid)||pid<=0)throw new Error('请选择正在运行的游戏进程');wanted=true;const mine=++generation;captureMode='detailed';advancedRequested=options.detailed!==false;
  function launch(mode){
   if(!wanted||mine!==generation)return;captureMode=mode;feed=createFeed(pid,Date.now,capture.onFrame);state='running';lastError='';session=`Qingchang-${process.pid}-${randomUUID()}`;const ownSession=session;
   const tracking=mode==='detailed'?['--track_frame_type','--track_app_timing','--no_track_input']:['--v1_metrics','--no_track_gpu','--no_track_input','--no_track_display'];
   const proc=spawn(executable,['--process_id',String(pid),'--output_stdout','--no_console_stats',...tracking,'--terminate_on_proc_exit','--session_name',ownSession,'--timed','300','--terminate_after_timed'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
   child=proc;let errors='',failed=false,replacing=false;proc.stdout.setEncoding('utf8');proc.stdout.on('data',text=>{if(mine===generation&&!replacing)feed.push(text);});proc.stderr.setEncoding('utf8');proc.stderr.on('data',text=>{errors=(errors+text).slice(-6000);});
   if(mode==='detailed')watchdog=setTimeout(async()=>{
    if(mine!==generation||!wanted||child!==proc||feed.read().state==='ready')return;
    // Some display/driver paths do not produce advanced rows. Retain basic FPS instead of a blank overlay.
    replacing=true;child=null;proc.kill();await cleanup(ownSession);if(mine===generation&&wanted)launch('basic');
   },5500);
   proc.on('error',error=>{if(mine!==generation||replacing)return;failed=true;state='error';lastError=error.code==='ENOENT'?'未找到帧率采集器':`帧率采集器启动失败：${error.code||error.message}`;onChange(read());});
   proc.on('close',async code=>{
    if(mine!==generation||replacing)return;clearTimeout(watchdog);child=null;cleanup(ownSession).catch(()=>{});
    if(code!==0||failed){state=/access denied|administrative privileges/i.test(errors)?'permission':'error';lastError=state==='permission'?'游戏FPS需要管理员权限':'帧率采集停止，请检查游戏进程或重新开始';wanted=false;onChange(read());}
    else if(wanted){const valid=await canRestart(pid).catch(()=>false);if(mine!==generation||!wanted)return;if(valid){restart=setTimeout(()=>launch(mode),1000);restart.unref?.();}else{wanted=false;state='exited';lastError='游戏已退出或身份已改变';onChange(read());}}
   });
   onChange(read());
  }
  launch(options.detailed===false?'basic':'detailed');return read();
 }
 return {read,start,stop};
}
module.exports={csv,metricNumber,frameKind,createFeed,createCollector};
