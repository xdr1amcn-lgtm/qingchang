(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.QingchangPreflightModel=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const db=value=>value>0?20*Math.log10(value):-100;
 function audioSummary(chunks,sampleRate,completed=true){let total=0,sum=0,peak=0,clips=0,noiseSum=0,noiseCount=0,voiceSum=0,voiceCount=0;const quiet=sampleRate*3;
  for(const chunk of chunks)for(const raw of chunk){const x=Number.isFinite(raw)?Math.max(-1,Math.min(1,raw)):0;const square=x*x;sum+=square;peak=Math.max(peak,Math.abs(x));if(Math.abs(x)>=.98)clips++;if(total<quiet){noiseSum+=square;noiseCount++;}else{voiceSum+=square;voiceCount++;}total++;}
  const rms=total?Math.sqrt(sum/total):0,noiseDb=noiseCount?db(Math.sqrt(noiseSum/noiseCount)):null,voiceDb=voiceCount?db(Math.sqrt(voiceSum/voiceCount)):null,issues=[];
  if(!completed||total<sampleRate*9.5)issues.push('试音未完成，结果仅供参考。');
  if(total&&db(rms)<-65)issues.push('输入几乎无声音，请检查静音、设备选择和麦克风连接。');
  if(total&&clips/total>=.001)issues.push('接近满刻度的样本偏多，有爆音或削波风险，建议降低输入增益。');
  if(voiceDb!==null&&voiceDb<-42)issues.push('说话阶段平均电平偏低，请靠近麦克风或适当增加输入增益。');
  if(noiseDb!==null&&noiseDb>-40)issues.push('安静阶段电平较高；确认当时未说话，再检查风扇、环境声或设备底噪。');
  if(voiceDb!==null&&noiseDb!==null&&voiceDb-noiseDb<6)issues.push('说话与安静阶段差异较小，暂不能判断人声是否清楚，请按步骤复测。');
  return {seconds:sampleRate>0?total/sampleRate:0,rmsDb:db(rms),peakDb:db(peak),noiseDb,voiceDb,clipPercent:total?clips/total*100:0,issues,completed};
 }
 function wav(chunks,rate){if(!Number.isInteger(rate)||rate<8000||rate>192000)throw Error('录音采样率无效');const size=chunks.reduce((n,x)=>n+x.length,0);if(size>rate*15)throw Error('试音长度超过限制');const buffer=new ArrayBuffer(44+size*2),view=new DataView(buffer),write=(offset,text)=>{for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i));};write(0,'RIFF');view.setUint32(4,36+size*2,true);write(8,'WAVE');write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,size*2,true);let offset=44;for(const chunk of chunks)for(const sample of chunk){const x=Number.isFinite(sample)?Math.max(-1,Math.min(1,sample)):0;view.setInt16(offset,Math.round(x*(x<0?32768:32767)),true);offset+=2;}return new Uint8Array(buffer);}
 function networkSummary(samples){const ok=samples.filter(x=>x.ok&&Number.isFinite(x.rttMs)),values=ok.map(x=>x.rttMs),jitter=[];for(let i=1;i<samples.length;i++)if(samples[i].ok&&samples[i-1].ok&&Number.isFinite(samples[i].rttMs)&&Number.isFinite(samples[i-1].rttMs))jitter.push(Math.abs(samples[i].rttMs-samples[i-1].rttMs));const mean=a=>a.length?a.reduce((n,x)=>n+x,0)/a.length:null;return {sent:samples.length,received:ok.length,failed:samples.length-ok.length,lossPercent:samples.length?(samples.length-ok.length)*100/samples.length:null,min:values.length?Math.min(...values):null,avg:mean(values),max:values.length?Math.max(...values):null,jitter:mean(jitter),approximate:ok.some(x=>x.lessThan)};}
 function uploadAssessment(value,at,now=Date.now()){
  const speed=Number(value),fresh=Number.isFinite(at)&&at>0&&now>=at&&now-at<=15*60*1000;
  if(!Number.isFinite(speed)||speed<=0||!fresh)return {level:'pending',code:'upload-missing',title:'请先测速上传速度',detail:'上传测速结果缺失或已超过 15 分钟，请重新测速后判断。'};
  if(speed<30)return {level:'warn',code:'below-minimum',title:'上传未达到最低门槛',detail:`本次上行约 ${speed.toFixed(1)} Mbps，低于轻场设定的 30 Mbps 门槛。请暂停网盘、下载器等占用，优先使用网线，再重新测速。`};
  if(speed<50)return {level:'warn',code:'upload-margin',title:'上传达到最低门槛，建议提升至 50 Mbps',detail:`本次上行约 ${speed.toFixed(1)} Mbps，已达到 30 Mbps 最低门槛，但未达到 50 Mbps 建议值。请减少其他设备的网络占用，并观察实际推流是否稳定。`};
  return {level:'green',code:'upload-ready',title:'上传速度适合开播',detail:`本次上行约 ${speed.toFixed(1)} Mbps，达到轻场建议的 50 Mbps。还需结合网络波动检测和实际推流表现判断。`};
 }
 function networkVerdict(samples,completed,upload,at,now=Date.now()){
  const speed=uploadAssessment(upload,at,now),s=networkSummary(samples);
  if(speed.level==='pending'||Number(upload)<30)return speed;
  if(!completed)return {level:'pending',code:'probe-incomplete',title:'请完成网络波动检测',detail:`${speed.detail} ${samples.length?'当前探测尚未完成，不能给出完整结论。':'再点击“开始检测”，检查连接是否稳定。'}`};
  if(!s.received||s.lossPercent>0||s.jitter>20)return {level:'warn',code:'probe-warning',title:'建议排查网络后再开播',detail:'本次出现探测无回应或明显波动。请改用网线、暂停其他上传，并更换探测目标复测；公共目标也可能限制探测，需结合直播伴侣实际表现确认。'};
  return {level:speed.level,code:speed.level==='green'?'ready':'upload-margin',title:Number(upload)>=50?'本次检测达到轻场开播建议':'达到最低门槛，建议提升上传余量',detail:`${speed.detail} 本次到所选目标的连接较平稳；公共目标正常不等于直播平台线路一定正常。`};
 }
 function networkAssessment(check,upload,at,now=Date.now()){
  const fresh=check&&Number.isFinite(check.at)&&check.at>0&&now>=check.at&&now-check.at<=15*60000;
  return networkVerdict(fresh&&Array.isArray(check.samples)?check.samples:[],!!(fresh&&check.completed),upload,at,now);
 }
 return {db,audioSummary,wav,networkSummary,uploadAssessment,networkVerdict,networkAssessment};
});
