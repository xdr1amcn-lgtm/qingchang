/* 租号管理页与结算页的只读展示。状态、占用和账目始终由数据推导。 */
window.QingchangRentalPage=(()=>{
 const M=window.QingchangRentalModel;
 const D=window.qingchangDomain;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=n=>`¥${(Number(n)||0).toFixed(2)}`;
 const date=v=>v||'未记录';
 const platformText=lease=>[lease.platform||'未填平台',lease.region||'未填区服'].join(' / ');
 const sourceText=lease=>lease.source||'未记录';
 const statusPill=status=>`<span class="pill ${status.pill||''}">${esc(status.label)}</span>`;
 const isReferenced=(state,lease)=>(state.orders||[]).some(order=>(order.segments||[]).some(s=>s.rentalLeaseId===lease.id));
 function filtered(state,{search='',filter='all'}={}){
  const query=String(search||'').trim().toLocaleLowerCase();
  const rows=(state.rentalLeases||[]).map(lease=>({lease,status:M.status(state,lease)})).filter(({lease,status})=>{
   if(filter==='available'&&!status.selectable)return false;
   if(filter==='in-use'&&status.key!=='in-use')return false;
   if(filter==='returned'&&!['returned','archived'].includes(status.key))return false;
   if(!query)return true;
   return [M.displayName(lease),lease.loginAccount,lease.platform,lease.region,lease.source,lease.note].some(value=>String(value||'').toLocaleLowerCase().includes(query));
  });
  const rank={ 'in-use':0,available:1,returned:2,archived:3,missing:4 };
  return rows.sort((a,b)=>(rank[a.status.key]??9)-(rank[b.status.key]??9)||Date.parse(b.lease.updatedAt||b.lease.createdAt||0)-Date.parse(a.lease.updatedAt||a.lease.createdAt||0));
 }
 function counts(state){
  const rows=(state.rentalLeases||[]).map(lease=>M.status(state,lease));
  return {all:rows.length,available:rows.filter(x=>x.selectable).length,inUse:rows.filter(x=>x.key==='in-use').length,returned:rows.filter(x=>['returned','archived'].includes(x.key)).length};
 }
 function rows(state,options){
  const items=filtered(state,options);
  if(!items.length)return `<div class="empty rental-empty"><b>${options.search?'没有找到符合条件的租号':'当前视图还没有租号资料'}</b><p>${options.search?'可搜索备注、登录账号、平台、区服或来源。':'添加或批量导入账号后，这里会集中显示登录资料和占用情况。'}</p><button class="btn sm" data-act="rental-reset-filter">查看全部租号</button></div>`;
  return `<div class="table-wrap"><table class="table rental-table"><thead><tr><th>备注名</th><th>登录账号</th><th>登录平台 / 区服</th><th>租号来源</th><th>状态</th><th>当前订单</th><th>到期时间</th><th>操作</th></tr></thead><tbody>${items.map(({lease,status})=>{
   const missing=!String(lease.password??'');
   const expired=status.expired||M.isExpired(lease);
   const order=status.order;
   return `<tr class="${options.selectedId===lease.id?'is-selected':''}" data-act="rental-show" data-id="${esc(lease.id)}"><td><b class="rental-name">${esc(M.displayName(lease))}</b>${missing?'<small class="rental-warning">登录资料待补齐</small>':''}</td><td><span class="rental-mask">${esc(M.maskAccount(lease.loginAccount))}</span></td><td>${esc(platformText(lease))}</td><td>${esc(sourceText(lease))}</td><td><div class="rental-status">${statusPill(status)}${expired?'<small class="rental-warning">已到期</small>':''}</div></td><td>${order?`<button class="rental-order-link" data-act="rental-open-order" data-order="${esc(order.id)}" title="打开正在使用这个账号的订单">${esc(order.name||'未命名订单')}</button>`:'—'}</td><td class="${expired?'is-expired':''}">${esc(date(lease.expiresAt))}</td><td><div class="table-action">${status.key==='in-use'?`<button class="btn sm" data-act="rental-open-order" data-order="${esc(order.id)}">查看订单</button>`:status.selectable?`<button class="btn sm primary" data-act="rental-use" data-id="${esc(lease.id)}">用于订单</button>`:`<button class="btn sm" data-act="rental-show" data-id="${esc(lease.id)}">查看</button>`}</div></td></tr>`;
  }).join('')}</tbody></table></div>`;
 }
 function usageRows(state,lease){
  return M.usageRecords(state,lease).map(({order,segment},index)=>{
   const cost=D.segmentCost(segment);
   return `<article class="rental-usage-row"><div class="rental-usage-head"><b>第 ${index+1} 段 · ${esc(order.name||'未命名订单')}</b>${statusPill({label:order.status,pill:order.status==='进行中'?'blue':order.status==='待结算'?'orange':order.status==='已完成'?'green':''})}</div><p>${segment.useStartedAt?`${esc(new Date(segment.useStartedAt).toLocaleString('zh-CN',{hour12:false}))}`:'开始时间未记录'}${segment.useEndedAt?` → ${esc(new Date(segment.useEndedAt).toLocaleString('zh-CN',{hour12:false}))}`:segment.useStartedAt?' · 仍在用':''}</p><p>${esc(segment.startBalance||'待填')} → ${esc(segment.endBalance||'待填')} · 1 元兑换 ${esc(D.ratioToWan(segment.coinPerYuan)||'待填')} 万 · 本段 ${money(cost.total)}</p><button class="btn sm" data-act="rental-open-order" data-order="${esc(order.id)}">打开订单</button></article>`;
  }).join('');
 }
 function detail(state,lease,options={}){
  if(!lease)return '';
  const status=M.status(state,lease);
  const records=M.usageRecords(state,lease);
  const used=records.length>0;
  const archive=used||isReferenced(state,lease);
  const missing=!String(lease.password??'');
  return `<aside class="account-inspector rental-inspector" aria-label="租号资料" data-record-context="${esc(lease.id)}"><header><span>租号资料</span><button class="btn quiet sm" data-act="rental-close-detail" aria-label="关闭租号详情">×</button></header><div class="account-inspector-body"><div class="account-detail-owner"><i>${esc(Array.from(M.displayName(lease)).at(-1)||'号')}</i><div><h2 tabindex="-1" data-rental-detail-title>${esc(M.displayName(lease))}</h2><p>${statusPill(status)} · ${esc(platformText(lease))}</p></div></div>
   ${missing?'<div class="notice warn rental-password-warning">登录资料待补齐：还没有保存密码。需要登录游戏时可在编辑资料中补上。</div>':''}
   <div class="account-secret"><label for="rental-detail-account">账号</label><input id="rental-detail-account" type="password" readonly value="${esc(lease.loginAccount||'')}" autocomplete="off"><button class="btn sm" data-act="rental-reveal" data-target="rental-detail-account" aria-label="显示登录账号">显示</button><button class="btn sm" data-act="rental-copy" data-id="${esc(lease.id)}" data-kind="account" aria-label="复制登录账号">复制</button></div>
   <div class="account-secret"><label for="rental-detail-password">密码</label><input id="rental-detail-password" type="password" readonly value="${esc(lease.password||'')}" placeholder="未填写密码" autocomplete="off"><button class="btn sm" data-act="rental-reveal" data-target="rental-detail-password" aria-label="显示账号密码" ${missing?'disabled':''}>显示</button><button class="btn sm" data-act="rental-copy" data-id="${esc(lease.id)}" data-kind="password" aria-label="复制账号密码" ${missing?'disabled':''}>复制</button></div>
   <section class="account-detail-section"><h3>租用信息</h3><div class="account-detail-fields"><div><span>租号来源</span><b>${esc(sourceText(lease))}</b></div><div><span>租用时间</span><b>${esc(date(lease.rentedAt))}</b></div><div><span>到期时间</span><b class="${M.isExpired(lease)?'is-expired':''}">${esc(date(lease.expiresAt))}${M.isExpired(lease)?' · 已到期':''}</b></div><div><span>当前订单</span><b>${status.order?`<button class="rental-order-link" data-act="rental-open-order" data-order="${esc(status.order.id)}">${esc(status.order.name||'未命名订单')}</button>`:'—'}</b></div><div><span>备注</span><b>${esc(lease.note||'—')}</b></div></div></section>
   <section class="account-detail-section"><h3>默认计费</h3><div class="account-detail-fields"><div><span>哈夫币比例</span><b>${lease.defaultCoinPerYuan?`1 元兑换 ${esc(D.ratioToWan(lease.defaultCoinPerYuan))} 万`:'未记录'}</b></div><div><span>六套单价</span><b>${lease.defaultSuitPrice===''||lease.defaultSuitPrice==null?'未记录':money(lease.defaultSuitPrice)}</b></div><div><span>AWM 子弹单价</span><b>${lease.defaultAmmoPrice===''||lease.defaultAmmoPrice==null?'未记录':money(lease.defaultAmmoPrice)}</b></div></div><p class="metric-note">这里只是下一次使用的默认值；修改后不会改变已经开始或已经结算的记录。</p></section>
   <section class="account-detail-section"><h3>使用记录 · ${records.length} 段</h3>${records.length?usageRows(state,lease):'<p class="metric-note">还没有用于订单；选中后开始订单才会生成消耗记录。</p>'}</section>
   <div class="rental-detail-actions">${status.selectable?`<button class="btn sm primary" data-act="rental-use" data-id="${esc(lease.id)}">用于订单</button>`:status.key==='in-use'?`<button class="btn sm primary" data-act="rental-open-order" data-order="${esc(status.order.id)}">查看当前订单</button>`:''}<button class="btn sm" data-act="rental-edit" data-id="${esc(lease.id)}">编辑资料</button>${status.key==='returned'?`<button class="btn sm" data-act="rental-unreturn" data-id="${esc(lease.id)}">撤销归还</button>`:''}${status.key==='archived'?`<button class="btn sm" data-act="rental-unreturn" data-id="${esc(lease.id)}">恢复资料</button>`:''}${['available','in-use'].includes(status.key)?`<button class="btn sm" data-act="rental-return" data-id="${esc(lease.id)}" ${status.key==='in-use'?'disabled title="请先换号或结束订单"':''}>登记归还</button>`:''}${lease.password?`<button class="btn sm" data-act="rental-clear-password" data-id="${esc(lease.id)}">清除密码</button>`:''}${status.key!=='archived'?`<button class="btn sm ${archive?'':'danger'}" data-act="rental-archive" data-id="${esc(lease.id)}" ${status.key==='in-use'?'disabled title="请先换号或结束订单"':''}>${archive?'归档':'删除'}</button>`:''}</div><p class="metric-note rental-detail-footnote">${archive?'有使用记录或被订单引用的账号默认归档，不删除历史账目。':'未被使用、未被订单引用的误录资料可以直接删除。'} 列表、结算页和普通报表都不展示密码。</p></div></aside>`;
 }
 function render(state,{search='',filter='all',selectedId=''}={}){
  const all=state.rentalLeases||[];
  const selected=all.find(x=>x.id===selectedId);
  const c=counts(state);
  return `<div class="rental-workspace"><header class="account-page-heading rental-page-heading"><div><h1>租号管理 <span>${all.length} 个账号</span></h1><p>集中保存租号资料和默认单价；开始订单时只选本次真正使用的账号。</p></div><div class="actions"><button class="btn" data-act="rental-import">批量导入</button><button class="btn primary" data-act="rental-new">＋ 添加账号</button></div></header><nav class="account-view-tabs rental-view-tabs" aria-label="租号视图">${[['all','全部',c.all],['available','可使用',c.available],['in-use','使用中',c.inUse],['returned','已归还',c.returned]].map(([key,label,count])=>`<button class="${filter===key?'active':''}" data-act="rental-filter" data-rental-filter="${key}" aria-pressed="${filter===key}">${label}<small>${count}</small></button>`).join('')}</nav><div class="account-toolbar rental-toolbar"><input class="search" type="search" data-search="rental" aria-label="搜索租号" placeholder="搜索备注、登录账号、平台、区服或来源" value="${esc(search)}"><div><span class="metric-note">登录账号在列表脱敏显示 · 密码不显示</span></div></div><div class="account-workspace-grid rental-workspace-grid ${selected?'has-selection':''}"><section class="account-records rental-records">${rows(state,{search,filter,selectedId})}<footer class="account-list-footer"><span>显示 ${filtered(state,{search,filter}).length} / ${all.length} 个租号 · 占用由进行中或已暂停的订单推导</span><span>到期不会自动退号或改账目</span></footer></section>${selected?detail(state,selected):''}</div></div>`;
 }

 function usageSummaryForOrder(order,state){
  if(!order||order.billingMode==='none')return '';
  if(!(order.segments||[]).some(s=>s.rentalLeaseId))return '';
  const groups=new Map();
  for(const segment of order.segments||[]){
   const key=segment.rentalLeaseId?`lease:${segment.rentalLeaseId}`:`manual:${segment.accountName||segment.id}`;
   if(!groups.has(key))groups.set(key,[]);
   groups.get(key).push(segment);
  }
  return `<section class="rental-usage-summary" data-rental-usage-summary><div class="order-section-title"><div><h2>按租号汇总</h2><p>同一个号多次使用会汇总在这里；展开后可逐段核对。</p></div></div>${[...groups.entries()].map(([key,segments])=>{
   const found=String(key).startsWith('lease:')?M.leaseById(state,key.slice('lease:'.length)):null;
   const name=found?M.displayName(found):(segments[0]?.rentalRemark||segments[0]?.accountName||'手动账号');
   const total=segments.reduce((sum,s)=>sum+D.segmentCost(s).total,0);
   const canLink=!found&&!(window.QingchangOrderFlow&&window.QingchangOrderFlow.settled(order));
   return `<details class="rental-usage-group"><summary><span><b>${esc(name)}</b><small>${segments.length} 段使用</small></span><strong>${money(total)}</strong></summary><div class="rental-usage-segments">${segments.map((s,index)=>{const cost=D.segmentCost(s);return `<div class="rental-usage-segment"><div><b>第 ${index+1} 段</b><small>${esc(s.startBalance||'待填')} → ${esc(s.endBalance||'待填')} · 比例 ${esc(D.ratioToWan(s.coinPerYuan)||'待填')} 万 / 元</small>${s.useStartedAt?`<small>${esc(new Date(s.useStartedAt).toLocaleString('zh-CN',{hour12:false}))}${s.useEndedAt?` → ${esc(new Date(s.useEndedAt).toLocaleString('zh-CN',{hour12:false}))}`:' · 仍在用'}</small>`:''}</div><strong>${money(cost.total)}</strong>${found?`<button class="btn sm" data-act="rental-preview" data-id="${esc(found.id)}" data-order="${esc(order.id)}">租用资料</button>`:canLink?`<button class="btn sm" data-act="rental-link-segment" data-order="${esc(order.id)}" data-segment="${esc(s.id)}">关联租号资料</button>`:''}</div>`;}).join('')}</div></details>`;
  }).join('')}</section>`;
 }

 function leasePreview(state,lease,{fromOrderId=''}={}){
  if(!lease)return '';
  const status=M.status(state,lease);
  const records=M.usageRecords(state,lease);
  return `<div class="rental-preview"><div class="notice">账目页只显示脱敏资料，不展开密码。需要登录信息时请到租号管理查看。</div><div class="account-detail-owner"><i>${esc(Array.from(M.displayName(lease)).at(-1)||'号')}</i><div><h2>${esc(M.displayName(lease))}</h2><p>${statusPill(status)} · ${esc(platformText(lease))}</p></div></div><section class="account-detail-section"><h3>租用信息</h3><div class="account-detail-fields"><div><span>登录账号</span><b>${esc(M.maskAccount(lease.loginAccount))}</b></div><div><span>租号来源</span><b>${esc(sourceText(lease))}</b></div><div><span>租用时间</span><b>${esc(date(lease.rentedAt))}</b></div><div><span>到期时间</span><b>${esc(date(lease.expiresAt))}</b></div><div><span>密码</span><b>${lease.password?'已保存（不在账目页展示）':'未记录'}</b></div></div></section><section class="account-detail-section"><h3>默认计费</h3><div class="account-detail-fields"><div><span>哈夫币比例</span><b>${lease.defaultCoinPerYuan?`1 元兑换 ${esc(D.ratioToWan(lease.defaultCoinPerYuan))} 万`:'未记录'}</b></div><div><span>六套单价</span><b>${lease.defaultSuitPrice===''||lease.defaultSuitPrice==null?'未记录':money(lease.defaultSuitPrice)}</b></div><div><span>AWM 子弹单价</span><b>${lease.defaultAmmoPrice===''||lease.defaultAmmoPrice==null?'未记录':money(lease.defaultAmmoPrice)}</b></div></div></section><section class="account-detail-section"><h3>使用记录 · ${records.length} 段</h3>${records.length?usageRows(state,lease):'<p class="metric-note">还没有使用记录。</p>'}</section>${fromOrderId?`<div class="rental-preview-actions"><button class="btn" data-act="rental-open-order" data-order="${esc(fromOrderId)}">回到订单核对</button></div>`:''}</div>`;
 }
 return {render,detail,leasePreview,usageSummaryForOrder,filtered,counts};
})();
