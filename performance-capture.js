const crypto=require('node:crypto');
const model=require('./performance-report');
const {createCollector}=require('./frame-monitor');
function createPerformanceCapture({executable,listProcesses,sampleHardware,readLive,liveSource=null,getReports=()=>[],saveReports,onChange=()=>{},clock=Date.now,collectorFactory=createCollector}){
 let job=null,preparing=false,lastError='',unsaved=null,generation=0,finishing=null;
 const reports=()=>{const value=getReports();return Array.isArray(value)?value.filter(x=>x?.version===1&&x.metrics&&x.context&&Array.isArray(x.series)).slice(0,20):[];};
 function status(includeReports=true){return {running:!!(preparing||job),preparing,lastError,unsaved,capture:job?{id:job.id,label:job.config.label,startedAt:job.startedAt,seconds:job.config.seconds,elapsedMs:Math.max(0,clock()-job.startedAt),frames:job.frames.length,game:job.game.name,liveSource:job.config.context.liveSource}:null,...(includeReports?{reports:reports()}: {})};}
 function publish(includeReports=false){const value=status(includeReports);onChange(value);return value;}
 function save(report){const old=reports(),baseline=report.baselineId?old.find(x=>x.id===report.baselineId):null;const next=[report,...(baseline?[baseline]:[]),...old.filter(x=>x.id!==report.id&&x.id!==baseline?.id)].slice(0,20);saveReports(next);unsaved=null;lastError='';}
 async function start(input){
  if(preparing||job)throw Error('已有性能采样正在进行');if(unsaved)throw Error('请先重试保存上一次采样结果');
  const config=model.options(input);if(config.stage==='after'&&!reports().some(x=>x.id===config.baselineId&&x.stage==='before'))throw Error('请先选择已保存的优化前采样');
  const mine=++generation;preparing=true;lastError='';publish();let collector;
  try{
   const processes=await listProcesses();if(mine!==generation)return status();const game=config.pid?processes.find(x=>x.pid===config.pid):processes.find(x=>/^DeltaForce/i.test(x.name));if(!game)throw Error('请先启动游戏，并刷新、选择游戏进程');
   const current={id:crypto.randomUUID(),config,game,startedAt:clock(),frames:[],hardware:[],live:[],timer:null,deadline:null,sampling:false,ending:false,truncated:false};
   collector=collectorFactory(executable,()=>{},async pid=>(await listProcesses()).some(x=>x.pid===pid&&x.started===game.started&&x.name===game.name),{onFrame:frame=>{if(job!==current||current.ending)return;if(current.frames.length<200000)current.frames.push(frame);else current.truncated=true;}});current.collector=collector;job=current;
   liveSource?.start(config.context.liveSource);await collector.start(game.pid,{detailed:false});if(mine!==generation||job!==current){await collector.stop();return status();}
   preparing=false;current.deadline=setTimeout(()=>finish(false).catch(()=>{}),config.seconds*1000);current.deadline.unref?.();
   current.timer=setInterval(()=>{publish();if(!current.sampling&&clock()-current.startedAt-(current.lastSample??-2000)>=2000)sample(current);},500);current.timer.unref?.();sample(current);return publish();
  }catch(error){await collector?.stop().catch(()=>{});if(mine!==generation)return status();liveSource?.stop();job=null;preparing=false;lastError=error.message;publish();throw error;}
 }
 async function sample(current){if(job!==current||current.ending)return;current.sampling=true;current.lastSample=clock()-current.startedAt;try{const source=current.config.context.liveSource;const result=await Promise.allSettled([sampleHardware(['cpuTemp','cpuClock']),['douyin','obs'].includes(source)?liveSource?liveSource.read(source,clock()):readLive(clock(),source):null]);if(job!==current||current.ending)return;if(result[0].status==='fulfilled'&&result[0].value)current.hardware.push(result[0].value);if(result[1].status==='fulfilled'&&result[1].value)current.live.push(result[1].value);}finally{current.sampling=false;}}
 async function finishImpl(interrupted=false){const current=job;if(!current||current.ending)return status();current.ending=true;clearInterval(current.timer);clearTimeout(current.deadline);const endedAt=clock(),collectorState=current.collector.read();
  try{await current.collector.stop();sampleHardware.stop?.();const report=model.aggregate({...current,endedAt,interrupted,collectorState});if(current.truncated)report.warnings.push('帧样本达到上限，仅统计已保存的样本。');unsaved=report;save(report);}catch(error){lastError=`报告保存失败：${error.message}`;}finally{liveSource?.stop();if(job===current)job=null;preparing=false;}return publish(true);
 }
 function finish(interrupted=false){if(finishing)return finishing;finishing=finishImpl(interrupted).finally(()=>{finishing=null;});return finishing;}
 async function cancel(){if(finishing)return finishing;generation++;const current=job;job=null;preparing=!!current;try{if(current){clearInterval(current.timer);clearTimeout(current.deadline);await current.collector.stop();sampleHardware.stop?.();}}finally{liveSource?.stop();preparing=false;}lastError='';return publish();}
 function remove(id){if(preparing||job)throw Error('请先完成或取消采样');const list=reports();if(list.some(x=>x.baselineId===id))throw Error('这份优化前采样仍有对应的优化后报告，请先删除对应报告');saveReports(list.filter(x=>x.id!==id));return publish(true);}
 function retrySave(){if(!unsaved)throw Error('没有待保存的采样结果');save(unsaved);return publish(true);}
 function recordLive(value){if(job&&!job.ending&&value?.source===job.config.context.liveSource&&job.live.length<1000)job.live.push({...value,observedAt:clock()});}
 return {status,start,cancel,finish,remove,retrySave,recordLive,report:id=>reports().find(x=>x.id===id),async shutdown(){await cancel();}};
}
module.exports={createPerformanceCapture};
