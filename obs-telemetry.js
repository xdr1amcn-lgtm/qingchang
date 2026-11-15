const {createHash,randomUUID}=require('node:crypto');
const number=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;
function normalize(input={}){
 const url=new URL(input.obsUrl||'ws://127.0.0.1:4455');
 if(!['ws:','wss:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('OBS 监测地址请使用本机 WebSocket 地址，例如 ws://127.0.0.1:4455');
 return {url:url.href,password:String(input.obsPassword||'')};
}
function authentication(password,salt,challenge){const hash=s=>createHash('sha256').update(s).digest('base64');return hash(hash(password+salt)+challenge);}
function createSamples(identity=randomUUID()){
 let previous=null,session=0;
 function push(stats,output,at){
  if(typeof output.outputActive!=='boolean')throw Error('OBS 返回的推流状态无效');
  const sample={at,active:output.outputActive===true,reconnecting:output.outputReconnecting===true,duration:number(output.outputDuration),bytes:number(output.outputBytes),renderSkipped:number(stats.renderSkippedFrames),renderTotal:number(stats.renderTotalFrames),encodeSkipped:number(stats.outputSkippedFrames),encodeTotal:number(stats.outputTotalFrames),networkSkipped:number(output.outputSkippedFrames),networkTotal:number(output.outputTotalFrames)};
  const keys=['duration','bytes','renderSkipped','renderTotal','encodeSkipped','encodeTotal','networkSkipped','networkTotal'];
  const reset=previous&&(sample.active!==previous.active||keys.some(k=>sample[k]!==null&&previous[k]!==null&&sample[k]<previous[k]));
  if(reset){previous=null;session++;}
  const elapsed=previous?(at-previous.at)/1000:null,interval=elapsed!==null&&elapsed>=.1&&elapsed<=10;
  const delta=k=>interval&&sample[k]!==null&&previous[k]!==null?sample[k]-previous[k]:null;
  const counters=(skip,total)=>{const skipped=delta(skip),frames=delta(total);return {skipped,frames,percent:skipped!==null&&frames>0&&skipped<=frames?skipped*100/frames:null};};
  const render=counters('renderSkipped','renderTotal'),encoding=counters('encodeSkipped','encodeTotal'),network=counters('networkSkipped','networkTotal');
  const bytes=delta('bytes'),bitrate=sample.active&&bytes!==null?bytes*8/elapsed/1000:null;
  const renderFps=number(stats.activeFps),metrics={real_bitrate:bitrate,stream_real_fps:sample.active?renderFps:null};
  const result={source:'obs',fileName:`obs:${identity}:${session}`,at,available:sample.active&&!sample.reconnecting,state:sample.reconnecting?'reconnecting':sample.active?'ready':'idle',message:sample.reconnecting?'OBS 正在重连推流':sample.active?interval?'OBS 实时统计':'OBS 已推流，等待两次采样计算码率':'OBS 已连接，当前未推流',metrics,obs:{renderFps,renderTimeMs:number(stats.averageFrameRenderTime),cpuPercent:number(stats.cpuUsage),render,encoding,network,intervalSeconds:interval?elapsed:null,active:sample.active,reconnecting:sample.reconnecting,reset:!!reset}};
  previous=sample;return result;
 }
 return {push};
}
function createClient({WebSocket=globalThis.WebSocket,clock=Date.now,onChange=()=>{},pollMs=2000,retryMs=3000,timeoutMs=5000}={}){
 let wanted=false,config=null,socket=null,generation=0,timer=null,handshake=null,ready=false,sequence=0,sampleEpoch=0,samples=null,snapshot={source:'obs',available:false,state:'stopped',message:'OBS 监测未开启'},pending=new Map();
 const publish=value=>{snapshot=value;try{onChange(read());}catch{};};
 function read(){return snapshot.at&&clock()-snapshot.at>6500?{source:'obs',available:false,state:'stale',message:'OBS 数据已过期'}:snapshot;}
 function clear(error){clearTimeout(timer);clearTimeout(handshake);ready=false;for(const request of pending.values()){clearTimeout(request.timer);request.reject(error);}pending.clear();const old=socket;socket=null;try{old?.close();}catch{}}
 function request(type,mine){return new Promise((resolve,reject)=>{if(!ready||mine!==generation||!socket)return reject(Error('OBS 尚未连接'));const id=String(++sequence),entry={resolve,reject,timer:setTimeout(()=>{pending.delete(id);reject(Error('OBS 统计请求超时'));},timeoutMs)};pending.set(id,entry);try{socket.send(JSON.stringify({op:6,d:{requestType:type,requestId:id}}));}catch{clearTimeout(entry.timer);pending.delete(id);reject(Error('OBS 连接已断开'));}});}
 function failure(mine,state,message,retry=true){if(mine!==generation||!wanted)return;generation++;clear(Error(message));publish({source:'obs',available:false,state,message});if(retry){const next=generation;timer=setTimeout(()=>{if(wanted&&next===generation)connect();},retryMs);timer.unref?.();}}
 async function poll(mine){
  const epoch=sampleEpoch;try{const [stats,output]=await Promise.all([request('GetStats',mine),request('GetStreamStatus',mine)]);if(mine!==generation||!wanted)return;if(epoch===sampleEpoch)publish(samples.push(stats,output,clock()));timer=setTimeout(()=>poll(mine),pollMs);timer.unref?.();}
  catch{failure(mine,'disconnected','OBS 统计读取失败，正在重新连接');}
 }
 function connect(){
  if(!wanted)return;const mine=++generation;samples=createSamples();publish({source:'obs',available:false,state:'connecting',message:'正在连接 OBS'});
  try{socket=new WebSocket(config.url,'obswebsocket.json');}catch{return failure(mine,'disconnected','无法连接 OBS，正在重试');}
  const ws=socket;handshake=setTimeout(()=>failure(mine,'disconnected','连接 OBS 超时，请检查 WebSocket 服务和端口'),timeoutMs);handshake.unref?.();
  ws.addEventListener('message',event=>{
   if(mine!==generation||!wanted)return;let value;try{value=JSON.parse(event.data);}catch{return;}const d=value.d||{};
   if(value.op===0){if(ready)return;if(!(d.rpcVersion>=1))return failure(mine,'unsupported','OBS WebSocket 版本不兼容，请使用 5.x',false);const auth=d.authentication;try{ws.send(JSON.stringify({op:1,d:{rpcVersion:1,eventSubscriptions:64,...(auth?{authentication:authentication(config.password,auth.salt,auth.challenge)}:{})}}));}catch{failure(mine,'disconnected','OBS 握手失败，正在重试');}}
   if(value.op===2&&!ready){ready=true;clearTimeout(handshake);poll(mine);}
   if(value.op===5&&d.eventType==='StreamStateChanged'&&d.eventData?.outputActive===false){sampleEpoch++;samples=createSamples();publish({source:'obs',available:false,state:'idle',message:'OBS 已停止推流',obs:{active:false}});}
   if(value.op===7){const p=pending.get(d.requestId);if(!p)return;pending.delete(d.requestId);clearTimeout(p.timer);d.requestStatus?.result?p.resolve(d.responseData||{}):p.reject(Error('OBS 统计接口返回失败'));}
  });
  ws.addEventListener('error',()=>failure(mine,'disconnected','无法连接 OBS，请在 OBS 中开启 WebSocket 服务；稍后自动重试'));
  ws.addEventListener('close',event=>failure(mine,event.code===4009?'authentication':'disconnected',event.code===4009?'OBS 密码不正确，请修改连接设置后重新开始监测':'OBS 连接已断开，正在重试',event.code!==4009));
 }
 function stop(){wanted=false;generation++;clear(Error('OBS 监测已停止'));publish({source:'obs',available:false,state:'stopped',message:'OBS 监测已停止'});}
 function start(input){let next;try{next=normalize(input);}catch(error){stop();publish({source:'obs',available:false,state:'configuration',message:error.message});return read();}if(wanted&&config?.url===next.url&&config.password===next.password)return read();stop();config=next;wanted=true;connect();return read();}
 return {start,stop,read};
}
module.exports={normalize,authentication,createSamples,createClient};
