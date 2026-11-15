(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.QingchangHighlights=value;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const time=value=>{if(!value)return null;const n=Date.parse(value);return Number.isFinite(n)?n:null;};
 const format=ms=>{const n=Math.max(0,Math.floor((Number(ms)||0)/1000));return [Math.floor(n/3600),Math.floor(n%3600/60),n%60].map(x=>String(x).padStart(2,'0')).join(':');};
 function migrate(state){
  state.streamSessions=Array.isArray(state.streamSessions)?state.streamSessions:[];state.clips=Array.isArray(state.clips)?state.clips:[];
  const old=state.stream||{active:false,startedAt:null,endedAt:null};
  if(time(old.startedAt)!==null){let session=state.streamSessions.find(x=>x.id===old.id||time(x.startedAt)===time(old.startedAt));if(!session){session={id:old.id||'stream-'+time(old.startedAt),title:'直播 '+new Date(old.startedAt).toLocaleString('zh-CN',{hour12:false}),startedAt:old.startedAt,endedAt:old.endedAt||null,active:!!old.active};state.streamSessions.push(session);}state.stream={...old,id:session.id};}
  for(const clip of state.clips){
   if(clip.sessionId&&state.streamSessions.some(x=>x.id===clip.sessionId))continue;
   const at=time(clip.at),offset=Number(clip.offsetMs),inferred=at!==null&&Number.isFinite(offset)&&offset>=0?at-offset:null;
   let session=inferred===null?null:state.streamSessions.find(x=>time(x.startedAt)!==null&&Math.abs(time(x.startedAt)-inferred)<=2000);
   if(!session){const key=inferred===null?'legacy-unassigned':'legacy-'+Math.round(inferred/1000);session=state.streamSessions.find(x=>x.id===key);if(!session){session={id:key,title:inferred===null?'未归类的历史标记':'历史直播 '+new Date(inferred).toLocaleString('zh-CN',{hour12:false}),startedAt:inferred===null?null:new Date(inferred).toISOString(),endedAt:null,active:false,legacy:true};state.streamSessions.push(session);}}
   clip.sessionId=session.id;
  }
  if(!state.stream)state.stream={active:false,startedAt:null,endedAt:null};
  if(!state.streamSessions.some(x=>x.id===state.highlightSelectedSessionId))state.highlightSelectedSessionId=state.stream?.id||[...state.streamSessions].sort((a,b)=>(time(b.startedAt)||0)-(time(a.startedAt)||0))[0]?.id||'';
  return state;
 }
 function selected(state){return state.streamSessions.find(x=>x.id===state.highlightSelectedSessionId)||null;}
 function duration(session,now=Date.now()){const start=time(session?.startedAt);if(start===null)return null;const end=session.active?now:time(session.endedAt);return end===null?null:Math.max(0,end-start);}
 function clipsFor(state,sessionId){return state.clips.filter(x=>x.sessionId===sessionId).sort((a,b)=>(Number(a.offsetMs)||0)-(Number(b.offsetMs)||0));}
 function range(clip,session,now=Date.now()){const mark=Math.max(0,Number(clip.offsetMs)||0),total=duration(session,now);return {mark,start:Math.max(0,mark-300000),end:total===null?mark+300000:Math.max(mark,Math.min(total,mark+300000))};}
 function start(state,id,now=new Date().toISOString()){migrate(state);if(state.stream.active)throw new Error('当前场次尚未结束');const session={id,title:'直播 '+new Date(now).toLocaleString('zh-CN',{hour12:false}),startedAt:now,endedAt:null,active:true};state.streamSessions.push(session);state.stream={...session};state.highlightSelectedSessionId=id;return session;}
 function stop(state,now=new Date().toISOString()){migrate(state);const session=state.streamSessions.find(x=>x.id===state.stream.id);if(!session||!state.stream.active)throw new Error('当前没有进行中的场次');session.active=false;session.endedAt=now;state.stream={...session};state.highlightSelectedSessionId=session.id;return session;}
 function mark(state,id,now=new Date().toISOString()){migrate(state);const session=state.streamSessions.find(x=>x.id===state.stream.id);if(!session?.active)throw new Error('请先开始直播计时');const clip={id,sessionId:session.id,at:now,offsetMs:Math.max(0,time(now)-time(session.startedAt)),title:'精彩操作',map:'',note:''};state.clips.unshift(clip);state.highlightSelectedSessionId=session.id;return clip;}
 function safeCell(value){const text=String(value??'');return /^[\s]*[=+\-@]/.test(text)?"'"+text:text;}
 function exportSession(state,sessionId,kind,now=Date.now()){
  migrate(state);const session=state.streamSessions.find(x=>x.id===sessionId);if(!session)throw new Error('未找到直播场次');const clips=clipsFor(state,sessionId),rows=clips.map(c=>{const window=range(c,session,now);return {...c,beforeMs:window.start,afterMs:window.end,range:window};});
  if(kind==='json')return JSON.stringify({version:1,exportedAt:new Date(now).toISOString(),session,clips:rows},null,2);
  if(kind==='txt')return [session.title,'开播：'+(session.startedAt||'未知'),'下播：'+(session.endedAt||(session.active?'计时中':'未知')),'说明：仅时间标记，不包含视频。','',...rows.flatMap(c=>[format(c.range.mark)+'  '+(c.title||'精彩操作'),'区间：'+format(c.range.start)+' — '+format(c.range.end),'按键时间：'+c.at,'地图：'+(c.map||''),'备注：'+(c.note||''),''])].join('\r\n');
  if(kind!=='csv')throw new Error('不支持的导出格式');
  const values=[['场次','开播时间','下播时间','片段名称','按键时间','直播时间','区间开始','区间结束','地图','备注'],...rows.map(c=>[session.title,session.startedAt,session.endedAt,c.title,c.at,format(c.range.mark),format(c.range.start),format(c.range.end),c.map,c.note])];
  return '\uFEFF'+values.map(row=>row.map(x=>'"'+safeCell(x).replace(/"/g,'""')+'"').join(',')).join('\r\n');
 }
 return {migrate,selected,duration,clipsFor,range,start,stop,mark,format,exportSession};
});
