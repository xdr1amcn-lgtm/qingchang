(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.QingchangSettlement=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const filled=v=>String(v??'').trim()!=='';
 const positive=v=>filled(v)&&Number.isFinite(Number(v))&&Number(v)>0;
 const nonnegative=v=>filled(v)&&Number.isFinite(Number(v))&&Number(v)>=0;
 const balance=v=>/^\d+(?:\.\d+)?(?:M|K|万|亿)?$/i.test(String(v??'').trim().replace(/[,，\s]/g,''))&&Number.isFinite(Number(String(v).replace(/[,，\sMK万亿]/gi,'')));
 function issues(order){
  const errors=[];const add=(segment,field,message)=>errors.push({segmentId:segment?.id,field,message});
  if(!nonnegative(order.income))add(null,'income','请填写有效的订单收入；没有收入请填 0');
  if(!nonnegative(order.expenses??0))add(null,'expenses','其他支出应为 0 或正数');
  if(order.billingMode!=='none'&&!order.segments?.length)add(null,'segments','请添加租用账号并核对消耗');
  for(const [i,s] of (order.billingMode==='none'?[]:order.segments||[]).entries()){
   const name=s.accountName||`账号 ${i+1}`;
   if(!balance(s.startBalance))add(s,'startBalance',`${name}：请填写有效的开始余额，例如 116M`);
   if(!balance(s.endBalance))add(s,'endBalance',`${name}：请填写有效的结束余额；余额为零请填 0`);
   if(!positive(s.coinPerYuan))add(s,'coinPerYuan',`${name}：请填写租号比例，例如 45 表示 1 元兑换 45 万`);
   for(const [prefix,label] of [['suit','六套'],['ammo','AWM 子弹']]){
    if(s[prefix+'Unused']===true)continue;
    for(const [suffix,caption] of [['Start','开始数量'],['End','结束数量'],['Price','单价']]){
     const v=s[prefix+suffix];
     if(!nonnegative(v)||(suffix!=='Price'&&!Number.isInteger(Number(v))))add(s,prefix+suffix,`${name}：请填写${label}${caption}，未使用可勾选“不计费”`);
    }
   }
  }
  return errors;
 }
 function correction(before,draft,reason,at){
  if(!String(reason||'').trim())throw Error('请填写更正原因');
  const errors=issues(draft);if(errors.length)throw Error(errors[0].message);
  const snapshot=o=>{const {corrections,...data}=o;return JSON.parse(JSON.stringify(data));};
  return {...draft,status:before.status,completedAt:before.completedAt,corrections:[...(before.corrections||[]),{at,reason:String(reason).trim(),before:snapshot(before),after:snapshot(draft)}]};
 }
 function removeDemo(state){const result=JSON.parse(JSON.stringify(state));result.accounts=result.accounts.filter(a=>!a.sample);result.orders=result.orders.filter(o=>!o.sample);const ids=new Set(result.accounts.map(a=>a.id));result.workspaceAccountIds=result.workspaceAccountIds.filter(id=>ids.has(id));if(!result.orders.some(o=>o.id===result.selectedOrderId))result.selectedOrderId='';result.demo=false;return result;}
 return {issues,correction,removeDemo};
});
