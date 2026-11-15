(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.QingchangToolTask=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const allowed=['streamer-home','escort-home','settlement','orders','accounts','tools'];
 function capture({page,role,phase,orderId,step,recordId,accountId,accountView,accountSearch,accountSort,scroll=0}){
  return {page:allowed.includes(page)?page:'tools',role:role==='打手'?'打手':'主播',phase:['prepare','live','wrap'].includes(phase)?phase:'prepare',orderId:orderId||'',step:[1,2,3].includes(Number(step))?Number(step):undefined,recordId:recordId||'',accountId:accountId||'',accountView:accountView||'all',accountSearch:accountSearch||'',accountSort:accountSort||'queue',scroll:Math.max(0,Number(scroll)||0)};
 }
 function resolve(value,state){const task=capture(value||{});if(!value)return {...task,page:'tools',role:state.role};if(task.page==='settlement'&&!state.orders.some(o=>o.id===task.orderId))return {...task,page:'escort-home',orderId:'',missing:true};return task;}
 function label(task){return task?.page==='streamer-home'?{prepare:'回到开播准备',live:'回到本场直播',wrap:'回到下播整理'}[task.phase]||'回到主播工作台':task?.page==='settlement'?'回到原订单':task?.page==='escort-home'?'回到陪玩工作台':task?.page==='orders'?'回到订单记录':task?.page==='accounts'?'回到账号名单':'回到工具总览';}
 return {capture,resolve,label};
});
