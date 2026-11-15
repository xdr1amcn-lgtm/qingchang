(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.QingchangWorkflowModel=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 function preferences(value={}){if(!value||typeof value!=='object')value={};return {saved:value.saved===true,startProgram:value.startProgram!==false,program:typeof value.program==='string'?value.program:'',monitor:value.monitor!==false,safePicture:value.safePicture===true};}
 function queue(state){return (state.workspaceAccountIds||[]).map(id=>(state.accounts||[]).find(x=>x.id===id)).filter(Boolean);}
 function currentOrder(state){const rows=(state.orders||[]).filter(x=>['未开始','进行中','已暂停','待结算'].includes(x.status));return rows.find(x=>x.id===state.selectedOrderId)||rows.find(x=>x.status==='进行中')||rows.find(x=>x.status==='待结算')||rows.find(x=>x.status==='已暂停')||rows[0]||null;}
 function currentSession(state){return (state.streamSessions||[]).find(x=>x.id===state.stream?.id)||null;}
 function planJobs(prefs){const p=preferences(prefs);return [p.startProgram?'program':null,p.monitor?'monitor':null,p.safePicture?'picture':null,'network','microphone'].filter(Boolean);}
 function preparationSummary(items){
  const rows=items.filter(x=>!x.key.startsWith('cleanup-')),pending=rows.filter(x=>!['done','warning','skipped'].includes(x.state)),blocked=rows.filter(x=>x.state==='blocked'),warnings=rows.filter(x=>['warning','skipped'].includes(x.state));
  const level=blocked.length?'blocked':pending.length||!rows.length?'pending':warnings.length?'warning':'ready';
  return {pending:pending.length,warnings:warnings.length,level,canProceed:!!rows.length&&!pending.length,title:level==='blocked'?'当前不建议开播，请先处理网络问题':level==='pending'?rows.length?`还有 ${pending.length} 项需要确认`:'先完成开播准备':level==='warning'?`准备已完成，有 ${warnings.length} 项提醒`:'准备项已确认，请核对直播画面',detail:level==='blocked'?'上传低于轻场设定的最低门槛。建议调整后复测，提醒不会被标为通过。':level==='pending'?'按下方提示处理。尚未开播时，等待推流数据属于正常状态。':level==='warning'?'提醒和暂不检查的项目会保留；请在直播软件核对画面和声音，再决定开播。':'请到直播软件核对画面与声音并手动开播；轻场计时与实际推流分别记录。'};
 }

 function swapAccount(segment,input){
  const balance=(value,label)=>{const text=String(value??'').trim();if(!/^(?:\d+(?:\.\d+)?)(?:[MK万亿])?$/i.test(text))throw Error(`请填写有效的${label}，例如 116M 或 0`);return text;};
  const positive=(value,label)=>{if(String(value??'').trim()===''||!Number.isFinite(Number(value))||Number(value)<=0)throw Error(`请填写${label}`);return String(value);};
  const previous={...segment,startBalance:balance(input.startBalance,'当前账号开始余额'),endBalance:balance(input.endBalance,'退出余额'),coinPerYuan:positive(input.coinPerYuan,'当前账号租号比例')};
  for(const prefix of ['suit','ammo']){if(input[prefix+'Unused']===true){previous[prefix+'Unused']=true;continue;}previous[prefix+'Unused']=false;const a=input[prefix+'Start'],b=input[prefix+'End'],price=input[prefix+'Price'];if([a,b,price].every(v=>String(v??'').trim()===''))continue;for(const [key,value] of [[prefix+'Start',a],[prefix+'End',b],[prefix+'Price',price]]){if(String(value??'').trim()===''||!Number.isFinite(Number(value))||Number(value)<0||(!key.endsWith('Price')&&!Number.isInteger(Number(value))))throw Error(`请补齐${prefix==='suit'?'六套':'AWM 子弹'}的开始、结束数量和单价；没有消耗可填 0`);previous[key]=String(value);}}
  const name=String(input.nextName||'').trim();if(!name)throw Error('请填写下一个账号的备注名');
  const next={accountName:name,startBalance:balance(input.nextStart,'下一个账号开始余额'),endBalance:'',coinPerYuan:positive(input.nextRatio,'下一个账号租号比例'),suitStart:'',suitEnd:'',suitPrice:'',suitUnused:true,ammoStart:'',ammoEnd:'',ammoPrice:'',ammoUnused:true,beforeShot:'',afterShot:'',checkpoints:[]};
  return {previous,next};
 }
 function createPreparation({api,getState,save=()=>{},onChange=()=>{},enumerate=async()=>[],assessNetwork=()=>({level:'pending',title:'网络尚未检测',detail:'请完成上传测速与网络波动检测。'}),clock=Date.now}){
  let busy=false,cleanupBusy=false,items=[],preparedAt=null,preparing=null;
  const ensureRow=(key,title)=>{let row=items.find(x=>x.key===key);if(!row){row={key,title};items.push(row);}return row;};
  const skipped=new Set(),status=()=>({busy,cleanupBusy,items:items.map(x=>({...x})),preparedAt});
  const notify=()=>onChange(status());
  function assign(row,data){Object.assign(row,data);if(data.state==='done')skipped.delete(row.key);else if(skipped.has(row.key)&&data.state!=='working'){row.state='skipped';row.detail='本次暂不检查。'+data.detail;}return row;}
  function networkRow(){const v=assessNetwork(),mbps=getState().settings.setup.lastUploadMbps,prefix=Number.isFinite(mbps)?`上传 ${mbps.toFixed(1)} Mbps，`:'';return {state:v.code==='below-minimum'?'blocked':v.level==='green'?'done':v.level==='warn'?'warning':'action',detail:v.code==='upload-margin'?prefix+'达到 30 Mbps 最低门槛，但余量偏少；建议减少其他上传并观察实际推流。':v.code==='ready'?prefix+'已达到上传建议，本次到探测目标的连接较平稳；开播后继续观察推流。':v.title+'。'+v.detail,action:'network'};}
  function soundRow(check,list){
   const recent=check&&clock()>=check.at&&clock()-check.at<15*60000&&check.seconds>=9.5&&check.completed!==false&&Array.isArray(check.issues);
   const selected=getState().settings.workflowMicId||'';
   const same=check?.deviceId&&(!selected||selected===check.deviceId)&&(!list||list.some(x=>x.deviceId===check.deviceId));
   const defaultDevice=list?.find(x=>x.deviceId==='default');
   const defaultMatches=!check?.usingDefault||!list||(check.groupId&&defaultDevice?.groupId===check.groupId);
   const ok=recent&&same&&defaultMatches&&!check.issues.length;
   return {state:ok?'done':'action',action:'sound',detail:ok?'近 15 分钟已完成同一设备试音；输入环境变化后请重新试音。':recent&&same&&check.issues.length?'本次声音有调整建议，请处理后复测；也可以明确暂不检查。':'请完成本次 10 秒试音；旧结果缺失、已过期或设备发生变化。'};
  }
  async function launchProgram(row){
   const file=preferences(getState().settings.workflow).program;
   if(!file)return assign(row,{state:'action',detail:'首次选择直播程序，之后可复用此路径。',action:'choose-program'});
   await api.launchWorkflowProgram(file);
   assign(row,{state:'confirm',detail:'已发送启动请求。请确认直播软件主界面已打开，再点“已打开”。',action:'confirm-program'});
  }
  async function prepareImpl(){
   if(busy||cleanupBusy)return status();busy=true;preparedAt=null;items=[];skipped.clear();notify();const prefs=preferences(getState().settings.workflow);
   try{for(const job of planJobs(prefs)){
    const row={key:job,state:'working',title:{program:'直播软件',monitor:'运行监测',picture:'安全画面',network:'网络准备',microphone:'麦克风'}[job],detail:'正在处理…'};items.push(row);notify();
    try{
     if(job==='program')await launchProgram(row);
     if(job==='monitor'){
      const current=await api.monitorStatus();
      if(current.enabled)assign(row,{state:'done',detail:'监测已在运行；开播前等待推流数据属于正常状态。',action:'monitor'});
      else{const started=await api.startMonitor(0);const verified=started?.enabled?started:await api.monitorStatus();if(!verified.enabled)throw Error('监测尚未成功启动，请检查来源后重试。');getState().settings.workflowOwnedMonitor=true;save();assign(row,{state:'done',detail:'监测已启动；等待游戏和开播后的新数据，不据此判断整体稳定。',action:'monitor'});}
     }
     if(job==='picture'){const opened=await api.openAvatarOutput();if(opened?.created!==false){getState().settings.workflowOwnedPicture=true;save();}assign(row,{state:'confirm',detail:'安全画面窗口已打开；请在直播软件中核对捕获来源，再点“已核对”。',action:'confirm-picture'});}
     if(job==='network')assign(row,networkRow());
     if(job==='microphone'){const list=await enumerate();assign(row,soundRow(getState().settings.workflowSoundCheck,list));}
    }catch(error){assign(row,{state:'error',detail:error.message,action:job==='program'?'choose-program':job==='microphone'?'sound':job==='network'?'network':job==='monitor'?'monitor':'avatar'});}
    notify();
   }preparedAt=clock();}finally{busy=false;notify();}return status();
  }
  function prepare(){if(preparing)return preparing;if(cleanupBusy)return Promise.resolve(status());preparing=prepareImpl().finally(()=>{preparing=null;});return preparing;}
  async function prepareProgram(){const row=items.find(x=>x.key==='program');if(!row||busy||cleanupBusy)return;busy=true;row.state='working';skipped.delete('program');notify();try{await launchProgram(row);}catch(error){assign(row,{state:'error',detail:error.message,action:'choose-program'});}finally{busy=false;notify();}}
  function confirm(key){const row=items.find(x=>x.key===key);if(busy||cleanupBusy||!row||!['confirm','skipped'].includes(row.state)||!['program','picture'].includes(key)||!['confirm-program','confirm-picture'].includes(row.action))return;assign(row,{state:'done',detail:key==='program'?'已由你确认直播软件主界面打开；实际开播仍在直播软件中操作。':'已由你确认安全画面来源；开播前仍请核对观众画面。',action:null});notify();}
  function skip(key){const row=items.find(x=>x.key===key);if(busy||cleanupBusy||!row||['done','working','skipped','blocked'].includes(row.state))return;skipped.add(key);assign(row,{state:row.state,detail:row.detail});notify();}
  function reset(){if(busy||cleanupBusy)return;items=[];preparedAt=null;skipped.clear();notify();}
  async function cleanup(){
   if(cleanupBusy)return status();cleanupBusy=true;items=items.filter(x=>!x.key.startsWith('cleanup-'));notify();if(preparing)await preparing;
   try{for(const [flag,method,title]of [['workflowOwnedMonitor','stopMonitor','运行监测'],['workflowOwnedPicture','closeAvatarOutput','安全画面']])if(getState().settings[flag]){
    try{await api[method]();getState().settings[flag]=false;save();}catch(error){items.push({key:'cleanup-'+flag,state:'error',title:'关闭'+title,detail:error.message,action:'tools'});}
   }}finally{cleanupBusy=false;notify();}return status();
  }
  function updateSound(check){const row=ensureRow('microphone','麦克风');if(row){skipped.delete(row.key);assign(row,soundRow(check));notify();}}
  function updateNetwork(){const row=ensureRow('network','网络准备');if(row){skipped.delete(row.key);assign(row,networkRow());notify();}}
  async function refreshReadiness(){
   if(busy||cleanupBusy)return status();ensureRow('microphone','麦克风');const network=ensureRow('network','网络准备');if(network)assign(network,networkRow());
   const sound=items.find(x=>x.key==='microphone');if(sound)try{assign(sound,soundRow(getState().settings.workflowSoundCheck,await enumerate()));}catch(error){assign(sound,{state:'error',detail:error.message,action:'sound'});}
   const monitor=items.find(x=>x.key==='monitor');if(monitor)try{const v=await api.monitorStatus();assign(monitor,{state:v.enabled?'done':'action',detail:v.enabled?'监测已开启；实际游戏与推流结论在开播后查看。':'监测尚未开启，请检查来源或重新准备。',action:'monitor'});}catch(error){assign(monitor,{state:'error',detail:error.message,action:'monitor'});}
   notify();return status();
  }
  return {status,prepare,prepareProgram,confirm,skip,reset,cleanup,updateSound,updateNetwork,refreshReadiness};
 }
 return {preferences,queue,currentOrder,currentSession,planJobs,preparationSummary,swapAccount,createPreparation};
});
