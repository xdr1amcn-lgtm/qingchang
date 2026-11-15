let saveController=null,savePhase='saved',saveError='',commitBusy=false,orderCorrection=null,settlementErrors=[],appInfo={},shortcutState={};
let saveStatusBar=null,saveStatusTimer=null;
function mountSaveStatus(){
 if(!saveStatusBar)return;
 const slot=document.querySelector('[data-save-status-slot]');
 saveStatusBar.dataset.floating=String(!slot);
 (slot||document.body).append(saveStatusBar);
}
function showSaveStatus(status){
 clearTimeout(saveStatusTimer);
 savePhase=status.phase;saveError=String(status.error||'').replace(/Error invoking remote method '[^']+': (?:Error: )?/g,'');
 if(!saveStatusBar){saveStatusBar=document.createElement('div');saveStatusBar.id='save-status';saveStatusBar.setAttribute('role','status');saveStatusBar.setAttribute('aria-live','polite');}
 const bar=saveStatusBar;bar.className='save-status '+savePhase;bar.replaceChildren();
 const label=document.createElement('span');label.textContent=savePhase==='error'?'保存失败':savePhase==='saving'?'正在保存…':savePhase==='pending'?'修改待保存':'已保存到本机';bar.append(label);
 if(savePhase==='error'){
  const detail=document.createElement('span');detail.className='save-error-detail';detail.textContent=saveError+(status.dirty?'':'。本次操作未完成，请重新操作。');bar.append(detail);
  if(status.dirty){const button=document.createElement('button');button.textContent='重试保存';button.onclick=()=>flushSave().catch(()=>{});bar.append(button);}
 }
 mountSaveStatus();
 if(savePhase==='saved')saveStatusTimer=setTimeout(()=>{bar.classList.add('is-idle');bar.replaceChildren();},2400);
}
function initializeSaving(){api.onCloseBlocked?.(message=>toast(message,true));let mayUnload=false;window.close=()=>api.requestClose?.();window.addEventListener('beforeunload',event=>{if(mayUnload)return;const draft=orderCorrection||accountModal&&!['account-detail','setup-guide'].includes(accountModal.kind);if(!saveController?.status().dirty&&!commitBusy&&!modalSaving&&!orderScreenshotPending&&!draft)return;event.preventDefault();event.returnValue=false;if(commitBusy||modalSaving||orderScreenshotPending||draft){toast('请先完成或取消当前编辑，再刷新页面',true);return;}flushSave().then(()=>toast('修改已保存，可以再次刷新页面')).catch(()=>{});});saveController=QingchangSave.create({write:api.save,getState:()=>state,onStatus:showSaveStatus});showSaveStatus({phase:'saved'});api.onPrepareClose?.(async()=>{if(commitBusy||modalSaving||orderScreenshotPending){api.closeReady(false);toast('正在保存或识别截图，请完成或取消后再关闭',true);return;}if((orderCorrection||accountModal&&!['account-detail','setup-guide'].includes(accountModal.kind))&&!confirm('当前编辑尚未确认，退出将放弃本次未确认的内容。继续退出？')){api.closeReady(false);return;}document.activeElement?.blur();try{await flushSave();mayUnload=true;api.closeReady(true);}catch(_){api.closeReady(false);toast('修改尚未保存，请重试保存后再关闭',true);}});}
function saveNow(){saveController.mark();return flushSave();}
function flushSave(){return saveController?saveController.flush():api.save(state);}
async function commitState(next){if(commitBusy)throw Error('正在保存，请稍候');commitBusy=true;appRoot.inert=true;try{const result=await saveController.commit(next);state=next;if(result?.shortcuts)shortcutState=result.shortcuts;return result;}finally{commitBusy=false;appRoot.inert=false;}}
function editableOrder(orderId){return orderCorrection?.id===orderId?orderCorrection.draft:state.orders.find(o=>o.id===orderId);}
function orderWritable(order){return order&&(!QingchangOrderFlow.terminal(order)||orderCorrection?.id===order.id);}
function persistOrder(order){if(orderCorrection?.id===order.id)return;persist();}
function validateSettlement(order){settlementErrors=QingchangSettlement.issues(order);if(!settlementErrors.length)return true;activeOrder=order.id;settlementFocus={orderId:order.id,step:3};const e=settlementErrors[0];orderRecordId=e.segmentId||'';orderEditingRecord=!!e.segmentId;page='settlement';render();const node=e.segmentId?document.getElementById('record-'+e.segmentId+'-'+e.field):document.getElementById('order-'+e.field);if(node){for(let p=node.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;node.setAttribute('aria-invalid','true');node.scrollIntoView({block:'center'});node.focus({preventScroll:true});}toast(e.message,true);return false;}
function reviewDetails(order){if(order.billingMode==='none')return '<p class="workflow-note">本单不计租号费用。其他支出 '+money(order.expenses)+' · 净收入 '+money(orderNet(order))+'</p>';return `<details class="settlement-breakdown" open><summary>核对每个账号的费用</summary>${order.segments.map((s,i)=>{const c=segmentCost(s);return `<div><b>${esc(s.accountName||'账号 '+(i+1))}</b><p>${esc(s.startBalance||'未填')} → ${esc(s.endBalance||'未填')} · 1 元兑换 ${esc(qingchangDomain.ratioToWan(s.coinPerYuan)||'未填')} 万</p><p>哈夫币 ${money(c.coinCost)}　六套 ${s.suitUnused?'不计费':money(c.suitCost)}　子弹 ${s.ammoUnused?'不计费':money(c.ammoCost)}　合计 ${money(c.total)}</p></div>`;}).join('')}<strong>总支出 ${money(orderCost(order))} · ${String(order.income??'')===''?'收入待填':'收入 '+money(order.income)+' · 净收入 '+money(orderNet(order))}</strong></details>`;}
function renderReleaseUX(){
 if(page==='settlement'){
  const order=activeOrderObj();if(order){
   if(!orderWritable(order))document.querySelectorAll('[data-order-flow] input,[data-order-flow] select:not([data-order-select]):not([data-order-record]),#settlement-records input,#settlement-records button,#settlement-review input').forEach(n=>n.disabled=true);
   const review=document.querySelector('#settlement-review');if(!document.querySelector('[data-order-flow]'))review?.insertAdjacentHTML('beforeend',reviewDetails(order));
   if(settlementErrors.length&&!document.querySelector('[data-order-flow]'))review?.insertAdjacentHTML('afterbegin',`<div class="notice warn" role="alert">请补齐以下项目：<ul>${settlementErrors.map(e=>`<li>${esc(e.message)}</li>`).join('')}</ul></div>`);
   if(QingchangOrderFlow.settled(order)){
    review?.insertAdjacentHTML('beforeend',orderCorrection?.id===order.id?`<div class="correction-actions"><label>更正原因<input class="input" id="correction-reason" placeholder="例如：补录退出余额" value="${esc(orderCorrection.reason||'')}"></label><button class="btn primary" data-act="confirm-correction">核对并保存更正</button><button class="btn" data-act="cancel-correction">放弃更正</button><p>未确认前不会改变已完成订单与收入统计。</p></div>`:'<button class="btn" data-act="begin-correction">更正这笔结算</button>');
    if(order.corrections?.length)review?.insertAdjacentHTML('beforeend',`<details><summary>更正记录（${order.corrections.length}）</summary>${order.corrections.map(x=>`<div class="settlement-breakdown"><b>${stamp(x.at)}</b> · ${esc(x.reason)}<p>更正前收入 ${money(x.before.income)} / 支出 ${money(orderCost(x.before))} / 净收入 ${money(orderNet(x.before))}</p><p>更正后收入 ${money(x.after.income)} / 支出 ${money(orderCost(x.after))} / 净收入 ${money(orderNet(x.after))}</p><details><summary>查看逐账号明细</summary>${reviewDetails(x.before)}${reviewDetails(x.after)}</details></div>`).join('')}</details>`);
   }
  }
 }
 if(page==='settings'){
  const host=document.querySelector('.q-content')||appRoot;
  host.insertAdjacentHTML('beforeend',`<section class="card"><h2>版本与问题反馈</h2><p>轻场 ${esc(appInfo.version||'0.14.0')} · 正式版</p><p>开发者：凡梦大王</p><p>数据目录：${esc(appInfo.dataPath||'读取中')}</p><button class="btn" data-act="copy-feedback">复制问题反馈模板</button><p>模板仅包含版本和系统信息；请补充操作步骤后发给技术支持。</p><div data-shortcut-status>${Object.entries(shortcutState).map(([key,x])=>`<p>${key==='session'?'直播计时':'精彩标记'} ${esc(x.key)}：${x.ok?'已启用':esc(x.message)}</p>`).join('')}</div></section>`);
 }
 if(page==='welcome'||page==='escort-home'||page==='streamer-home'){
  if(state.accounts.some(a=>a.sample)||state.orders.some(o=>o.sample)){const host=document.querySelector('.q-content')||appRoot;host.insertAdjacentHTML('afterbegin','<div class="notice demo-banner">当前包含演示记录，演示订单不计入真实净收入。<button class="btn sm" data-act="finish-demo">结束演示，开始正式使用</button></div>');}
 }
}
async function releaseAction(act){
 if(act==='copy-feedback'){await navigator.clipboard.writeText(`轻场版本：${appInfo.version||'0.13.3'}\nWindows：${appInfo.windows||'未知'}\n使用角色：${state.role==='打手'?'陪玩':state.role}\n想完成什么：\n操作步骤：\n实际结果：\n发生时间：\n请勿附账号密码。`);toast('反馈模板已复制');return true;}
 if(act==='finish-demo'){if(!confirm('仅移除带演示标记的账号和订单，保留你创建的真实记录与设置。继续？'))return true;await commitState(QingchangSettlement.removeDemo(state));activeOrder='';render();toast('已结束演示，可以开始正式记录');return true;}
 if(act==='begin-correction'){const order=activeOrderObj();orderCorrection={id:order.id,before:structuredClone(order),draft:structuredClone(order),reason:''};settlementErrors=[];settlementFocus={orderId:order.id,step:3};orderEditingRecord=true;render();document.getElementById('settlement-records')?.scrollIntoView({block:'start'});return true;}
 if(act==='cancel-correction'){orderCorrection=null;settlementErrors=[];render();return true;}
 if(act==='confirm-correction'){if(!orderCorrection)return true;const {before,draft,reason}=orderCorrection;if(!String(reason||'').trim()){const node=document.getElementById('correction-reason');node?.scrollIntoView({block:'center'});node?.focus();toast('请填写更正原因',true);return true;}if(orderScreenshotPending){toast('截图正在识别，请稍后保存更正',true);return true;}if(!validateSettlement(draft))return true;const updated=QingchangSettlement.correction(before,draft,reason,safeNow());const next={...state,orders:state.orders.map(o=>o.id===updated.id?updated:o)};await commitState(next);orderCorrection=null;settlementErrors=[];render();toast('更正已保存，原结算与修改记录均已保留');return true;}
 return false;
}
