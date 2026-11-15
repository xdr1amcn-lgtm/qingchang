window.QingchangPreflightPage=(()=>{
 const V=window.QingchangPreflightView,M=window.QingchangPreflightModel,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),num=(v,d=1)=>Number.isFinite(v)?v.toFixed(d):'—';
 function create({api,toast,repaint,onSoundResult=()=>{},onNetworkResult=()=>{},getUpload=()=>({}),getSoundCheck=()=>null,getNetworkCheck=()=>null,getMicId=()=>'',onDeviceChange=()=>{},getOrigin=()=> 'tools',measureUpload=async()=>{},clock=Date.now,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
  let devices=[],deviceId=getMicId(),audio={phase:'idle',error:'',result:null,bytes:null,url:null,rate:0,count:0,chunks:[],level:-100},stream=null,context=null,source=null,node=null,gain=null,token=0,watchdog=null;
  const saved=getNetworkCheck();
  let net={running:false,stopping:false,target:['alibaba','cloudflare'].includes(saved?.target)?saved.target:'alibaba',seconds:[30,60].includes(saved?.seconds)?saved.seconds:30,samples:Array.isArray(saved?.samples)?saved.samples.slice(0,60):[],error:'',completed:saved?.completed===true,at:saved?.at||0,phase:'idle',progress:''},networkJob=null;
  const active=()=>['connecting','quiet','speak'].includes(audio.phase);
  function paint(){const stage=document.querySelector('[data-sound-stage-title]');if(stage&&active())stage.textContent=audio.phase==='connecting'?'正在连接麦克风':audio.phase==='quiet'?'先保持安静，采集 3 秒环境声音':'现在正常说话，继续 7 秒';const meter=document.querySelector('[data-sound-meter]');if(meter){meter.value=Math.max(0,Math.min(100,(audio.level+70)/70*100));document.querySelector('[data-sound-level]').textContent=`${num(audio.level)} dBFS`;document.querySelector('[data-sound-progress]').textContent=audio.phase==='connecting'?'正在连接麦克风…':audio.phase==='quiet'?`请保持安静 · ${num(audio.count/audio.rate,0)} / 3 秒`:audio.phase==='speak'?`请正常说话 · ${Math.min(7,Math.floor(audio.count/audio.rate)-3)} / 7 秒`:'等待开始';}const network=document.querySelector('[data-network-status]');if(network){network.innerHTML=networkResult();}}
  async function refresh(){try{devices=(await navigator.mediaDevices.enumerateDevices()).filter(x=>x.kind==='audioinput');if(deviceId&&!devices.some(x=>x.deviceId===deviceId))audio.error='上次选择的麦克风不可用，请重新选择设备。';else if(audio.error.startsWith('上次选择')||audio.error.startsWith('无法读取麦克风'))audio.error='';}catch(e){audio.error=`无法读取麦克风列表：${e.message}`;}repaint();}
  function cleanup(){clearTimeout(watchdog);watchdog=null;stream?.getTracks().forEach(t=>t.stop());stream=null;for(const n of [node,source,gain])try{n?.disconnect();}catch{}node=null;source=null;gain=null;context?.close().catch(()=>{});context=null;}
  function discard(){document.querySelector('.preflight-playback audio')?.pause();if(audio.url)URL.revokeObjectURL(audio.url);audio.url=null;audio.bytes=null;audio.result=null;audio.chunks=[];audio.count=0;}
  function finish(completed=true){if(!active())return;token++;cleanup();const result=M.audioSummary(audio.chunks,audio.rate,completed);audio.bytes=M.wav(audio.chunks,audio.rate);audio.url=URL.createObjectURL(new Blob([audio.bytes],{type:'audio/wav'}));audio.result=result;audio.at=clock();if(completed)onSoundResult({at:audio.at,deviceId:audio.deviceId||'',groupId:audio.groupId||devices.find(x=>x.deviceId===audio.deviceId)?.groupId||'',usingDefault:audio.usingDefault,issues:result.issues,seconds:result.seconds,completed:result.completed,result});audio.chunks=[];audio.phase='done';audio.level=-100;repaint();}
  async function startSound(){if(active())return;onSoundResult({at:clock(),deviceId:'',completed:false,issues:['本次试音尚未完成，请按步骤重新检测。'],seconds:0});discard();audio.phase='connecting';audio.error='';audio.level=-100;const mine=++token;repaint();let pending;
   try{
    let timedOut=false;const request=navigator.mediaDevices.getUserMedia({audio:{...(deviceId?{deviceId:{exact:deviceId}}:{}),channelCount:1,echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
    pending=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{timedOut=true;reject(Object.assign(Error('连接麦克风超时，请检查设备是否被占用'),{name:'TimeoutError'}));},12000);request.then(s=>{if(timedOut||mine!==token){s.getTracks().forEach(t=>t.stop());if(!timedOut){clearTimeout(timer);resolve(null);}return;}clearTimeout(timer);resolve(s);},e=>{clearTimeout(timer);reject(e);});});
    if(!pending||mine!==token){pending?.getTracks().forEach(t=>t.stop());return;}stream=pending;const settings=stream.getAudioTracks()[0].getSettings();audio.deviceId=settings.deviceId||'';audio.groupId=settings.groupId||'';audio.usingDefault=!deviceId;context=new AudioContext();audio.rate=context.sampleRate;await context.audioWorklet.addModule(new URL('audio-meter-worklet.js',location.href));if(mine!==token)return;
    source=context.createMediaStreamSource(stream);node=new AudioWorkletNode(context,'qingchang-test-input');gain=context.createGain();gain.gain.value=0;source.connect(node);node.connect(gain);gain.connect(context.destination);
    node.port.onmessage=event=>{if(mine!==token||!active())return;const remaining=audio.rate*10-audio.count,chunk=new Float32Array(event.data).slice(0,remaining);audio.chunks.push(chunk);audio.count+=chunk.length;let square=0;for(const x of chunk)square+=x*x;audio.level=M.db(Math.sqrt(square/Math.max(1,chunk.length)));audio.phase=audio.count<audio.rate*3?'quiet':'speak';paint();if(audio.count>=audio.rate*10)finish(true);};
    stream.getAudioTracks()[0].onended=()=>{if(mine===token){audio.error='麦克风已断开；本次结果可能不完整。';if(audio.count)finish(false);else stopSound();}};
    await context.resume();if(mine!==token)return;audio.phase='quiet';watchdog=setTimeout(()=>{if(mine!==token)return;if(audio.count)finish(false);else{audio.error='没有收到可处理的声音数据，请检查设备后重试。';stopSound();}},16000);repaint();refresh();
   }catch(e){pending?.getTracks().forEach(t=>t.stop());if(mine!==token)return;cleanup();audio.phase='idle';audio.error=e.name==='NotAllowedError'?'麦克风权限被拒绝，请在 Windows 隐私设置中允许桌面应用访问麦克风。':e.name==='NotReadableError'?'麦克风无法打开，请检查占用程序、接口和设备状态。':e.name==='NotFoundError'?'没有找到可用的麦克风，请连接设备后刷新。':e.message;repaint();}
  }
  function stopSound(){token++;cleanup();audio.phase='idle';audio.level=-100;audio.chunks=[];audio.count=0;repaint();}
  function publishNetwork(){onNetworkResult({at:net.at||clock(),target:net.target,seconds:net.seconds,samples:net.samples.map(x=>({...x})),completed:net.completed});}
  function networkResult(){return V.networkResult({net,upload:getUpload(),now:clock(),origin:getOrigin()});}
  async function runNetwork(uploadFirst){
   if(networkJob)return;
   const job={cancelled:false,controller:new AbortController(),target:net.target,seconds:net.seconds};networkJob=job;
   net={...net,running:true,stopping:false,samples:[],error:'',completed:false,at:clock(),phase:uploadFirst?'upload':'probe',progress:uploadFirst?'正在检测上传速度，测试期间会短暂占用上行带宽。':''};publishNetwork();repaint();
   try{
    if(uploadFirst){const ok=await measureUpload({signal:job.controller.signal,onProgress:text=>{if(networkJob===job&&!job.cancelled){net.progress=text;paint();}}});if(job.cancelled)return;if(ok!==true){net.error='上传测速未完成，请检查连接后重试';return;}}
    if(job.cancelled)return;
    net.phase='probe';net.progress='正在向所选公共目标发送小型 Ping 请求。';const started=clock();repaint();
    for(let i=0;i<job.seconds;i++){
     if(job.cancelled)break;
     const sample=await api.networkProbe(job.target);if(job.cancelled)break;
     net.samples.push(sample);paint();
     if(i<job.seconds-1)await wait(Math.max(0,started+(i+1)*1000-clock()));
    }
    net.completed=!job.cancelled&&net.samples.length===job.seconds;
   }catch(error){if(!job.cancelled)net.error=error.message||'网络检测失败';}
   finally{if(networkJob===job){net.running=false;net.stopping=false;net.phase='idle';net.at=clock();net.progress='';networkJob=null;publishNetwork();repaint();}}
  }
  function stopNetwork(){if(!networkJob)return;networkJob.cancelled=true;networkJob.controller.abort();net.completed=false;net.stopping=true;net.at=clock();publishNetwork();repaint();}
  function leave(){token++;cleanup();audio.phase='idle';audio.level=-100;discard();stopNetwork();}
  async function action(act){
   if(act==='preflight-network-complete')return runNetwork(true);
   if(act==='preflight-devices')return refresh();
   if(act==='preflight-audio-start')return startSound();
   if(act==='preflight-audio-stop')return stopSound();
   if(act==='preflight-network-start')return runNetwork(false);
   if(act==='preflight-network-stop')return stopNetwork();
   if(act==='preflight-audio-save'&&audio.bytes){try{const result=await api.saveSoundTest(audio.bytes);if(!result.canceled)toast('试音已保存到本机');}catch(error){toast(error.message,true);}return;}
   if(act==='preflight-network-export'){try{const result=await api.exportNetworkTest({target:net.target,seconds:net.seconds,completed:net.completed,samples:net.samples.map(x=>({...x}))});if(!result.canceled)toast('网络诊断报告已导出');}catch(error){toast(error.message,true);}}
  }
  document.addEventListener('change',event=>{
   const key=event.target.dataset.preflight;
   if(key==='mic'&&!active()){deviceId=event.target.value;discard();audio.phase='idle';audio.error='';onDeviceChange(deviceId);onSoundResult({at:clock(),deviceId,seconds:0,issues:['麦克风已更换，请重新试音。'],completed:false});repaint();}
   if(!networkJob&&((key==='target'&&['alibaba','cloudflare'].includes(event.target.value))||(key==='seconds'&&[30,60].includes(Number(event.target.value))))){
    if(key==='target')net.target=event.target.value;else net.seconds=Number(event.target.value);
    net.samples=[];net.error='';net.completed=false;net.at=clock();publishNetwork();repaint();
   }
  });
  function render(tab){const data={audio,net,devices,deviceId,upload:getUpload(),soundCheck:getSoundCheck(),now:clock(),origin:getOrigin()};return tab==='sound'?V.sound(data):V.network(data);}
  return {render,action,leave,refresh,status:()=>({network:{...net,samples:net.samples.map(x=>({...x}))},audio:{phase:audio.phase,deviceId:audio.deviceId,result:audio.result}})};
 }
 return {create};
})();
