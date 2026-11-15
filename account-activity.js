(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.QingchangAccountActivity=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 function week(date=new Date()){const d=new Date(date);if(!Number.isFinite(d.getTime()))return '';d.setHours(0,0,0,0);d.setDate(d.getDate()-(d.getDay()+6)%7);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
 function count(events,period=week()){return (events||[]).filter(e=>{const valid=Number.isFinite(Date.parse(e.at));return (valid?week(e.at):e.week)===period;}).length;}
 function status(account,period=week()){return {logins:count(account.loginEvents,period),plays:count(account.playEvents,period),historyLogins:account.loginEvents?.length||0,historyPlays:account.playEvents?.length||0};}
 function rollover(state,at=new Date()){
  const next=week(at);if(!next||state.workspaceWeek===next)return false;
  if(state.workspaceWeek){state.workspaceWeeks={...(state.workspaceWeeks||{}),[state.workspaceWeek]:[...(state.workspaceAccountIds||[])]};const keys=Object.keys(state.workspaceWeeks).sort().reverse();for(const key of keys.slice(104))delete state.workspaceWeeks[key];state.workspaceRollover={from:state.workspaceWeek,to:next};}
  state.workspaceWeek=next;return true;
 }
 return {week,count,status,rollover};
});
