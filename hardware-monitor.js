const {spawn,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const valid=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max?n:null;
const text=(s,max=160)=>typeof s==='string'?s.slice(0,max):'';
function normalizeGpu(data,at){
 if(!data||typeof data!=='object'||!text(data.id))return null;
 const out={id:text(data.id,350),name:text(data.name)||'未命名显卡',vendor:['AMD','Intel','NVIDIA'].includes(data.vendor)?data.vendor:'Unknown',source:text(data.source),state:['ready','unsupported','error'].includes(data.state)?data.state:'unsupported',at,
 temperatureC:valid(data.temperatureC,1,149),temperatureSource:text(data.temperatureSource),utilization:valid(data.utilization,0,100),utilizationSource:text(data.utilizationSource),clockMhz:valid(data.clockMhz,1,20000),memoryUsedMb:valid(data.memoryUsedMb,0,1048576),memoryTotalMb:valid(data.memoryTotalMb,1,1048576),sharedMemoryUsedMb:valid(data.sharedMemoryUsedMb,0,1048576),sharedMemoryTotalMb:valid(data.sharedMemoryTotalMb,1,1048576)};
 if(out.memoryUsedMb!==null&&out.memoryTotalMb!==null&&out.memoryUsedMb>out.memoryTotalMb){out.memoryUsedMb=null;out.memoryTotalMb=null;}return out;
}
function normalizeSensor(data,now=Date.now()){
 const states=['ready','driver-missing','permission','unsupported','error'];
 const blocked=['driver-missing','permission'].includes(data?.state);
 return {at:now,state:states.includes(data?.state)?data.state:'error',cpuTempC:blocked?null:valid(data?.cpuTempC,1,149),cpuClockMhz:blocked?null:valid(data?.cpuClockMhz,1,12000),tempSource:text(data?.tempSource,80)||null,clockSource:'各核心实时频率平均值',cpuName:text(data?.cpuName),driverInstalled:data?.driverInstalled===true,admin:data?.admin===true,gpus:Array.isArray(data?.gpus)?data.gpus.slice(0,16).map(x=>normalizeGpu(x,now)).filter(Boolean):[]};
}
function createSensorReader(executable,{spawnProcess=spawn,clock=Date.now}={}){
 let child=null,pending='',last=null,retryAt=0;
 function start(){if(child||clock()<retryAt)return;retryAt=clock()+15000;const proc=spawnProcess(executable,[],{windowsHide:true,stdio:['pipe','pipe','pipe']});child=proc;pending='';proc.stdout.setEncoding('utf8');proc.stdout.on('data',chunk=>{if(child!==proc)return;pending+=chunk;if(pending.length>65536)pending=pending.slice(-32768);let index;while((index=pending.indexOf('\n'))>=0){const line=pending.slice(0,index);pending=pending.slice(index+1);try{last=normalizeSensor(JSON.parse(line),clock());}catch{}}});proc.stderr.resume();proc.stdin.on('error',()=>{});proc.on('error',()=>{if(child===proc)last=normalizeSensor({state:'error'},clock());});proc.on('close',()=>{if(child===proc)child=null;});}
 function stop(){const proc=child;child=null;last=null;retryAt=0;if(proc){proc.stdin.end();proc.kill();}}
 return {read(){if(child&&last?.state==='driver-missing'&&clock()>=retryAt)stop();start();return last&&clock()>=last.at&&clock()-last.at<=6500?last:{at:clock(),state:last?.state==='driver-missing'?'driver-missing':last?.state==='permission'?'permission':child?'waiting':'error',cpuTempC:null,cpuClockMhz:null,gpus:[]};},stop};
}
function combineHardware(result,sensor,gpuId='auto',now=Date.now()){
 const fresh=sensor&&Number.isFinite(sensor.at)&&now>=sensor.at&&now-sensor.at<=6500;
 const fallback=(result.gpus||[]).map(x=>normalizeGpu(x,result.at)).filter(Boolean);
 let gpus=fresh?sensor.gpus||[]:[];
 if(!gpus.length)gpus=fallback;
 else gpus=gpus.map(g=>{if(g.state==='ready')return g;const matches=fallback.filter(x=>x.vendor===g.vendor&&x.name===g.name);return matches.length===1&&gpus.filter(x=>x.name===g.name&&x.vendor===g.vendor).length===1?{...matches[0],id:g.id}:g;});
 // Automatic selection stays stable; never average metrics across different GPUs.
 const ranked=[...gpus].sort((a,b)=>((b.memoryTotalMb||0)-(a.memoryTotalMb||0))||a.id.localeCompare(b.id));
 const gpu=gpuId==='auto'?ranked[0]||null:gpus.find(x=>x.id===gpuId)||null;
 return {...result,at:Math.max(result.at,fresh?sensor.at:0),cpuSensors:fresh?sensor:sensor?{...sensor,state:'stale'}:null,cpuTempC:fresh?sensor.cpuTempC:null,cpuClockMhz:fresh?sensor.cpuClockMhz:null,gpus,gpu,gpuSelectionMissing:gpuId!=='auto'&&!gpu};
}
function createHardwareSampler(baseSample,executable,{reader=createSensorReader(executable)}={}){
 const sample=async(_fields=[],options={})=>{const sensor=reader.read();const result=await baseSample();return combineHardware(result,sensor,options.gpuId);};
 sample.probe=async(options={})=>{
  reader.stop();
  const [result,readout]=await Promise.all([baseSample(),promisify(execFile)(executable,['--once'],{windowsHide:true,timeout:12000,maxBuffer:65536}).then(({stdout})=>normalizeSensor(JSON.parse(stdout.trim().split(/\r?\n/).pop()))).catch(()=>normalizeSensor({state:'error'}))]);
  return combineHardware(result,readout,options.gpuId);
 };
 sample.stop=()=>reader.stop();return sample;
}
module.exports={normalizeGpu,normalizeSensor,combineHardware,createSensorReader,createHardwareSampler};
