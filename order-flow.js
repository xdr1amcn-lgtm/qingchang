(function(root,factory){
 const api=typeof module==='object'&&module.exports?factory(require('./domain'),require('./settlement-validation'),require('./workflow-progress')):factory(root.qingchangDomain,root.QingchangSettlement,root.QingchangWorkflowProgress);
 if(typeof module==='object'&&module.exports)module.exports=api;else root.QingchangOrderFlow=api;
})(typeof globalThis!=='undefined'?globalThis:this,(D,S,P)=>{
 const filled=v=>String(v??'').trim()!=='';
 const nonnegative=v=>filled(v)&&Number.isFinite(Number(v))&&Number(v)>=0;
 const rental=o=>o?.billingMode!=='none';
 function segment(values={},segmentId){return {id:segmentId,accountName:'',startBalance:'',endBalance:'',coinPerYuan:'',suitStart:'',suitEnd:'',suitPrice:'',suitUnused:true,ammoStart:'',ammoEnd:'',ammoPrice:'',ammoUnused:true,beforeShot:'',afterShot:'',checkpoints:[],...values};}
 function create(input,{orderId,segmentId,at,start=true}){
  const account=segment({accountName:String(input.accountName||'').trim(),startBalance:String(input.startBalance||'').trim(),coinPerYuan:input.coinPerYuan??'',beforeShot:input.beforeShot||''},segmentId);
  for(const prefix of ['suit','ammo']){account[prefix+'Unused']=input[prefix+'Unused']!==false;for(const suffix of ['Start','Price'])account[prefix+suffix]=input[prefix+suffix]??'';}
  const order={id:orderId,name:String(input.name||'').trim()||'新订单',status:'未开始',billingMode:input.billingMode==='none'?'none':'rental',income:input.income??'',expenses:0,segments:[account],activeSegmentId:account.id,createdAt:at,sample:false};
  if(filled(order.income)&&!nonnegative(order.income))throw Error('约定收入应为 0 或正数，也可以留到结算时填写');
  if(start){const issue=P.startIssue(order);if(issue)throw Error(issue);order.status='进行中';order.startedAt=at;}
  return order;
 }
 const terminal=o=>['已完成','已取消'].includes(o?.status);
 const settled=o=>o?.status==='已完成'||o?.status==='已取消'&&o.cancellationSettlement==='confirmed';
 function phase(order,requested){if(terminal(order))return requested===2?2:3;return [1,2,3].includes(requested)?requested:order?.status==='未开始'?1:['进行中','已暂停'].includes(order?.status)?2:3;}
 function event(order,kind,at,detail=''){return [...(order.events||[]),{kind,at,detail}].slice(-500);}
 function pause(order,at){if(order.status!=='进行中')throw Error('只有进行中的订单可以暂停');return {...order,status:'已暂停',pausedAt:at,events:event(order,'pause',at)};}
 function resume(order,at){if(order.status!=='已暂停')throw Error('当前订单没有暂停');const issue=P.startIssue(order);if(issue)throw Error(issue);return {...order,status:'进行中',events:event(order,'resume',at)};}
 function cancel(order,{reason,settle=false,at}){
  if(terminal(order))throw Error('已结束的订单不能再次取消');if(!String(reason||'').trim())throw Error('请填写取消原因');
  return {...order,status:settle?'待结算':'已取消',cancelAfterSettlement:settle,cancelReason:String(reason).trim(),canceledAt:at,cancellationSettlement:settle?'pending':'waived',events:event(order,'cancel',at,settle?'结算已有费用后取消':'直接取消，不计入收益')};
 }
 function amounts(order){
  const issues=S.issues(order),recordIssues=issues.filter(x=>!['income','expenses'].includes(x.field));
  const rentalReady=!rental(order)||recordIssues.length===0,expensesReady=nonnegative(order.expenses??0),incomeReady=nonnegative(order.income);
  const rentalCost=rental(order)?(order.segments||[]).reduce((sum,s)=>sum+D.segmentCost(s).total,0):0;
  const total=rentalCost+(expensesReady?Number(order.expenses??0):0),costReady=rentalReady&&expensesReady;
  return {issues,recordIssues,rentalReady,expensesReady,incomeReady,costReady,netReady:costReady&&incomeReady,rentalCost,total,net:Number(order.income)-total};
 }
 function advance(order,at){
  if(terminal(order))return order;
  if(order.status==='未开始'){const issue=P.startIssue(order);if(issue)throw Error(issue);return {...order,status:'进行中',startedAt:order.startedAt||at,activeSegmentId:P.currentSegment(order)?.id||''};}
  if(['进行中','已暂停'].includes(order.status))return {...order,status:'待结算',endedAt:at};
  if(order.status!=='待结算')throw Error('订单状态无法识别，请重新打开订单');
  const issues=S.issues(order);if(issues.length)throw Error(issues[0].message);
  return {...order,status:order.cancelAfterSettlement?'已取消':'已完成',...(order.cancelAfterSettlement?{cancellationSettlement:'confirmed'}:{}),completedAt:at};
 }
 return {rental,segment,create,phase,amounts,advance,pause,resume,cancel,terminal,settled};
});
