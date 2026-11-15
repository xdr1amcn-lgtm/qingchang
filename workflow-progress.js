(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.QingchangWorkflowProgress=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const kinds=['bitrate','stream-fps','game-fps','live-data','game-data','obs-render','obs-encode','obs-network','cpu-temperature','gpu-temperature','cpu-load','gpu-load','memory-load','vram-load'];
 function currentSegment(order){
  const rows=order?.segments||[];
  if(Object.hasOwn(order||{},'activeSegmentId'))return rows.find(x=>x.id===order.activeSegmentId)||null;
  if(rows.length===1)return rows[0];
  if(rows.length>1&&rows.slice(0,-1).every(x=>String(x.endBalance??'').trim()!==''))return rows.at(-1);
  return null;
 }
 function migrate(state){let changed=false;for(const order of state.orders||[])if(!Object.hasOwn(order,'activeSegmentId')){const current=currentSegment(order);if(current){order.activeSegmentId=current.id;changed=true;}}return changed;}
 function startIssue(order){const s=currentSegment(order);if(!s)return '请先添加或选择当前账号';if(!String(s.accountName||'').trim())return '请填写当前账号备注';if(order.billingMode==='none')return '';if(!/^\d+(?:\.\d+)?(?:M|K|万|亿)?$/i.test(String(s.startBalance??'').trim()))return '请填写当前账号有效的开始余额';if(!(Number(s.coinPerYuan)>0&&Number.isFinite(Number(s.coinPerYuan))))return '请填写当前账号租号比例';return '';}
 function summary(value,now=Date.now(),mode='douyin'){
  const a=value?.alerts||{},warnings=[...(a.active||[])].sort((x,y)=>(x.group==='live'?0:1)-(y.group==='live'?0:1));
  const fresh=(at,max)=>Number.isFinite(at)&&at<=now&&now-at<=max;
  const game=!!value?.selected&&value.game?.state==='ready'&&Number.isFinite(value.game.fps)&&fresh(value.game.at,3000);
  const live=(mode!=='obs'||value?.live?.source==='obs')&&(mode!=='douyin'||value?.live?.source!=='obs')&&!!value?.live?.available&&a.liveArmed===true&&fresh(value.live.at,6000)&&Number.isFinite(value.live.metrics?.stream_real_fps)&&Number.isFinite(value.live.metrics?.real_bitrate);
  const missing=[...(!game?['游戏帧数据']:[]),...(!live?[mode==='douyin'?'直播伴侣推流数据':'OBS 推流数据']:[])];
  if(!value?.enabled)return {level:'pending',title:'运行监测尚未开启',detail:'打开监测后查看本次游戏与推流状态。',warnings,missing,tool:'monitor',label:'打开运行监测'};
  if(a.warming)return {level:'pending',title:'正在预热，等待稳定读数',detail:'前 20 秒不触发持续低值提醒。',warnings:[],missing,tool:'monitor',label:'查看监测来源'};
  if(warnings.length){const gameBad=warnings.some(x=>x.id==='game-fps'),liveBad=warnings.some(x=>['bitrate','stream-fps','obs-render','obs-encode','obs-network'].includes(x.id));return {level:'warning',title:warnings.some(x=>x.group==='hardware')?'电脑硬件出现持续提醒':gameBad&&liveBad?'游戏与推流同时出现持续异常':liveBad?'推流出现持续异常':gameBad?'游戏帧率持续偏低':'监测数据暂时中断',detail:missing.length?'缺少有效的'+missing.join('、')+'，不能据此判断两端正常。':'请先核对下方依据，再逐项处理；打开工具不代表异常已恢复。',warnings,missing};}
  if(!game||!live)return {level:'pending',title:'数据不足，暂不能判断整体稳定性',detail:'等待有效的'+missing.join('、')+'。',warnings,missing,tool:'monitor',label:'检查监测来源'};
  if(!a.enabled||!a.config?.game||!a.config?.live)return {level:'pending',title:'已取得数据，部分异常判断未开启',detail:'请在运行监测中核对提醒项目；有读数不等于已完成持续异常检查。',warnings,missing,tool:'monitor',label:'检查提醒设置'};
  return {level:'ready',title:'当前监测项未发现持续异常',detail:'已取得本次游戏与推流数据；这不保证观众端画面和声音均正常。',warnings,missing,tool:'monitor',label:'查看详细数据'};
 }
 function capture(session,alerts){
  if(!session?.active||!Number.isFinite(alerts?.startedAt))return false;
  const start=Date.parse(session.startedAt);if(!Number.isFinite(start))return false;
  let changed=false;const rows=session.anomalyEvents||[];
  for(const entry of alerts.history||[]){if(!kinds.includes(entry.kind)||!Number.isFinite(entry.at)||entry.at<start||!Number.isFinite(entry.id))continue;
   const key=`${alerts.startedAt}:${entry.id}`,existing=rows.find(x=>x.key===key);
   if(existing){if(Number.isFinite(entry.recoveredAt)&&existing.recoveredAt!==entry.recoveredAt){existing.recoveredAt=entry.recoveredAt;changed=true;}}
   else{rows.push({key,kind:entry.kind,title:String(entry.title||'').slice(0,120),detail:String(entry.detail||'').slice(0,250),at:entry.at,recoveredAt:Number.isFinite(entry.recoveredAt)?entry.recoveredAt:null});changed=true;}
  }
  if(changed){rows.sort((a,b)=>a.at-b.at);if(rows.length>200){session.anomalyOmitted=(session.anomalyOmitted||0)+rows.length-200;rows.splice(0,rows.length-200);}session.anomalyEvents=rows;}
  return changed;
 }
 function recordAction(session,key,tool,at=Date.now()){
  const event=session?.anomalyEvents?.find(x=>x.key===key);if(!event||!['network','monitor'].includes(tool))return false;
  if(event.viewedTool===tool&&Number.isFinite(event.viewedAt))return false;
  event.viewedTool=tool;event.viewedAt=at;return true;
 }
 return {currentSegment,migrate,startIssue,summary,capture,recordAction};
});
