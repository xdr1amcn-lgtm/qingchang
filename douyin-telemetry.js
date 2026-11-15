const fs = require('node:fs');
const path = require('node:path');

// Only these numeric records cross into the renderer. Never return raw log content.
const GROUPS = {
  stream_preview_fps:'render_perf', stream_real_fps:'push_perf',
  stream_in_cap_fps:'encode_perf', real_bitrate:'push_stream_perf',
  drop_count:'push_stream_perf', encode_drop_count:'push_stream_perf'
};
const MAX_FILE_BYTES=16*1024*1024;
function parseMetrics(text) {
  const records=[];let from=0;
  while(from<text.length) {
    const start=text.indexOf('{"log_level"',from);if(start<0)break;
    let quoted=false,escaped=false,depth=0,end=-1;
    for(let i=start;i<text.length&&i-start<1024*1024;i++) {
      const c=text[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}
      else if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0){end=i+1;break;}
    }
    if(end<0){from=start+12;continue;}from=end;
    try {
      const outer=JSON.parse(text.slice(start,end));
      const stamp=Number(outer.timestamp)*1000;if(!Number.isFinite(stamp)||stamp<946684800000)continue;
      const items=typeof outer.log_content==='string'?JSON.parse(outer.log_content):outer.log_content;
      if(!Array.isArray(items))continue;
      for(const item of items) {
        if(!item||!Object.hasOwn(GROUPS,item.tag)||GROUPS[item.tag]!==item.category||typeof item.value!=='number'||!Number.isFinite(item.value)||item.value<0)continue;
        records.push({at:stamp,tag:item.tag,value:item.value});
      }
    }catch{}
  }
  return records;
}
function readMetricFile(file) {
  const fd=fs.openSync(file,'r');const chunks=[];
  try {
    const size=fs.fstatSync(fd).size;if(size>MAX_FILE_BYTES)throw new Error('直播伴侣日志大小超出当前支持范围');
    // The native logger locks the header and preallocates 10 MB. Skip the header,
    // scan complete JSON records, and stop at an entirely zero-filled chunk.
    for(let offset=128;offset<size;offset+=65536) {
      const buffer=Buffer.alloc(Math.min(65536,size-offset));const n=fs.readSync(fd,buffer,0,buffer.length,offset);
      if(!n)break;const chunk=buffer.subarray(0,n);if(chunk.every(x=>x===0))break;chunks.push(chunk);
    }
    return parseMetrics(Buffer.concat(chunks).toString('utf8'));
  }finally{fs.closeSync(fd);}
}
function snapshot(records,now=Date.now(),freshnessMs=10000) {
  if(!records.length)return {state:'waiting',available:false,message:'当前日志没有推流指标；可能尚未推流，或该模式未产出这些指标。',metrics:null,lastSeenAt:null};
  const latest=Math.max(...records.map(x=>x.at));
  if(latest>now+5000||now-latest>freshnessMs)return {state:'stale',available:false,message:'推流记录已过期，未作为当前数据使用。',metrics:null,lastSeenAt:latest};
  const batch=records.filter(x=>x.at===latest),metrics={};
  for(const x of batch)metrics[x.tag]=x.value;
  if(!Object.hasOwn(metrics,'stream_real_fps'))return {state:'waiting',available:false,message:'当前记录缺少推流输出帧率，等待下一组数据。',metrics:null,lastSeenAt:latest};
  return {state:'ready',available:true,message:'正在读取直播伴侣本机推流日志',at:latest,lastSeenAt:latest,metrics};
}
function readSnapshot(appData,now=Date.now()) {
  const directory=path.join(appData,'webcast_mate','mediasdk_log','metrics');
  try {
    const files=fs.readdirSync(directory,{withFileTypes:true}).filter(x=>x.isFile()&&!x.isSymbolicLink()&&/^metrics\.\d+\.\d+\.log$/.test(x.name)).map(x=>x.name).sort((a,b)=>b.localeCompare(a,'en',{numeric:true}));
    if(!files.length)return {state:'unavailable',available:false,message:'尚未找到直播伴侣推流日志，请先打开直播伴侣。',metrics:null};
    // Do not fall back to a previous live session when the current file is empty.
    const file=path.join(directory,files[0]);
    return {...snapshot(readMetricFile(file),now),source:'douyin-local-metrics',fileName:files[0]};
  }catch(error){return {state:'unavailable',available:false,message:error.code==='ENOENT'?'尚未找到直播伴侣推流日志，请先打开直播伴侣。':`直播伴侣日志暂不可读：${error.code||error.message}`,metrics:null};}
}
function summarize(samples,startedAt,endedAt=Date.now()) {
  const unique=new Map();
  for(const sample of samples)if(sample?.available&&sample.at>=startedAt&&sample.at<=endedAt+5000)unique.set(sample.at,sample);
  const frames=[...unique.values()].sort((a,b)=>a.at-b.at),values=tag=>frames.map(x=>x.metrics[tag]).filter(Number.isFinite);
  if(!frames.length)return {available:false,message:samples.at(-1)?.message||'本次没有取得新的直播伴侣推流指标。',samples:0};
  const fps=values('stream_real_fps'),enc=values('stream_in_cap_fps'),bps=values('real_bitrate'),drops=values('drop_count'),encodeDrops=values('encode_drop_count');
  return {available:true,samples:frames.length,firstAt:frames[0].at,lastAt:frames.at(-1).at,
    outputFpsMin:fps.length?Math.min(...fps):null,outputFpsAvg:fps.length?fps.reduce((a,b)=>a+b,0)/fps.length:null,
    encodingFpsMin:enc.length?Math.min(...enc):null,bitrateAvg:bps.length?bps.reduce((a,b)=>a+b,0)/bps.length:null,
    dropRateMax:drops.length?Math.max(...drops):null,encodeDropRateMax:encodeDrops.length?Math.max(...encodeDrops):null,
    lastAtExpired:endedAt-frames.at(-1).at>10000,partial:frames.length<3};
}
module.exports={parseMetrics,readMetricFile,snapshot,readSnapshot,summarize};
