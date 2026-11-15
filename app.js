const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const appRoot = $('#app');
const toastRegion = $('#toast-region');
const api = window.qingchang;

const SOURCES = ['会员', '福袋', '老板', '其他'];
const FILTERS = [
  { id: 'natural', title: '原色清晰', desc: '接近游戏原色，轻度锐化', cls: '' },
  { id: 'cool', title: '冷蓝滤镜', desc: '偏冷色调，保留细节', cls: 'cool' },
  { id: 'contrast', title: '压暗·高对比', desc: '压低曝光，拉开明暗', cls: 'contrast' }
];
const NAV = {
  打手:[['日常工作',[['escort-home','陪玩工作台'],['orders','订单记录'],['accounts','账号管理'],['rental','租号管理']]]],
  主播:[['日常工作',[['streamer-home','主播工作台'],['accounts','账号管理'],['highlights','直播记录']]]]
};

function id() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function esc(v = '') { return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function dayKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function weekKey(date = new Date()) { const d = new Date(date); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dayKey(d); }
function money(n) { return `¥${(Number(n) || 0).toFixed(2)}`; }
function stamp(value) { if (!value) return '—'; const d = new Date(value); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function duration(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
function coins(value) { return window.qingchangDomain.parseCoins(value); }
function safeNow() { return new Date().toISOString(); }
function toast(text, error = false, ready=false) { if(!error&&!ready&&saveController?.status().dirty){flushSave().then(()=>toast(text,false,true)).catch(()=>{});return;} toastRegion.replaceChildren();text=String(text).replace(/Error invoking remote method '[^']+': (?:Error: )?/g,'');const n = document.createElement('div'); n.className = `toast${error ? ' error' : ''}`; n.textContent = text; toastRegion.appendChild(n); setTimeout(() => n.remove(), 3400); }
function migrateDemoLabels(target) {
 let changed = false;
 for (const order of target.orders || []) {
  if (order.sample && ['演示单 · 山谷陪玩', '演示单 · 山谷护航', '体验单-98包688w'].includes(order.name)) { order.name = '体验单-98保688w'; changed = true; }
 }
 return changed;
}
function emptyData() {
  const a1 = { id: id(), owner: '演示号主·小林', account: 'demo-member-01', password: 'demo-only-1234', source: '会员', customSource: '', region: '微信区', note: '仅供体验的模拟资料', createdAt: safeNow(), loginEvents: [{ at: new Date(Date.now() - 86400000).toISOString() }], playEvents: [], sample: true };
  const a2 = { id: id(), owner: '演示号主·阿哲', account: 'demo-gift-02', password: 'demo-only-5678', source: '福袋', customSource: '', region: 'QQ区', note: '仅供体验的模拟资料', createdAt: safeNow(), loginEvents: [], playEvents: [{ at: new Date(Date.now() - 172800000).toISOString() }], sample: true };
  return {
    version: 1, role: '', page: '', workspaceWeek: weekKey(), workspaceAccountIds: [a1.id, a2.id], accounts: [a1, a2], rentalLeases: [],
    orders: [{ id: id(), name: '体验单-98保688w', status: '进行中', income: '', expenses: 0, segments: [{ id: id(), accountName: '测试租用号', startBalance: '116M', endBalance: '', coinPerYuan: '', suitStart: '', suitEnd: '', suitPrice: '', ammoStart: '', ammoEnd: '', ammoPrice: '', beforeShot: '', afterShot: '', checkpoints: [], sample: true }], createdAt: safeNow(), sample: true }],
    clips: [], settings: { goal: 1000, shortcuts: { session: 'F8', marker: 'F9' }, title: { text: '绝秘航天最锋利的剑', font: 0, size: 88, spacing: 10, outline: 0, colors: ['#f5e900','#f5e900','#f5e900','#f5e900','#ff4a24','#ff4a24','#ff4a24','#16d7ed','#16d7ed'] }, setup: { mode: 'douyin', filter: 'natural', profile: 'balanced', obsUrl: 'ws://127.0.0.1:4455', obsPassword: '' } },
    stream: { active: false, startedAt: null, endedAt: null }, selectedOrderId: '', demo: true
  };
}
let state = null;
let page = 'welcome';
let accountSearch = '';
let accountView='all',accountSort='queue',accountSelectedId='',accountDetailTab='info',accountReturnPage='streamer-home';
let rentalSearch='',rentalFilter='all',rentalSelectedId='';
let pendingRentalImport=null;
let orderSearch = '';
let activeOrder = '';
let settlementFocus=null,orderRecordId="",orderEditingRecord=false,orderScreenshotPending=0;
const orderShotJobs=new Map();
let accountModal = null;
let pendingImport = null;
let lastTimer = Date.now();
let saveTimer;
let obsSocket = null;
let obsReady = false;
let optimizationInfo = null;
let optimizationError = '';
let optimizationLoading = false;
let optimizationDiagnosis = null;
let optimizationSampling = false;
let optimizationApplying = false;
let optimizationTab = 'overview';
let optimizationEntry='optimize';
const toolsViews={主播:{category:'all',search:'',scroll:0},打手:{category:'all',search:'',scroll:0}};
function currentToolsView(){return toolsViews[state.role]||toolsViews.主播;}
function currentToolKey(){return QingchangToolsPage.currentKey({page,optimizationTab,optimizationEntry,setupToolTab});}
let maintenanceStatus = null;
let maintenanceProcesses = [];
let maintenanceCache = null;
let maintenanceBusy = false;
let maintenanceError = '';
let maintenanceView = 'background';
let monitorStatus=null,monitorProcesses=[],monitorPid=0,monitorLoaded=false,monitorBusy=false,monitorError='';
let performancePage=null,preflightPage=null,setupToolTab='plan',previousPreflightView='off';
let workflowPreparation=null,workflowPhase='',frameRepairPage=null,streamFilterPage=null,diagnosticOrigin='tools',recoveredSession=false;
let workflowPaintQueued=false,diagnosticPaintQueued=false;
let toolOrigin=null;const toolControlDrafts=new Map();let mountedToolKey="";
function requestWorkflowPaint(){if(workflowPaintQueued)return;workflowPaintQueued=true;queueMicrotask(()=>{workflowPaintQueued=false;if(page==='streamer-home')render();});}
function requestDiagnosticPaint(){if(diagnosticPaintQueued)return;diagnosticPaintQueued=true;queueMicrotask(()=>{diagnosticPaintQueued=false;if(page==='setup'&&['sound','network'].includes(setupToolTab))render();});}
let obsReqId = 0;
const obsPending = new Map();

function persist() { saveController?.mark();if(page==='titles'||page==='setup'&&setupToolTab==='filters')queueMicrotask(()=>{if(!currentToolKey())return;document.querySelector('.tool-handoff')?.remove();mountOutputHandoff();}); }

function todayOrders() { return state.orders.filter((x) => dayKey(new Date(x.createdAt || Date.now())) === dayKey() || (['进行中','已暂停','待结算'].includes(x.status)) || (x.completedAt && dayKey(new Date(x.completedAt)) === dayKey())); }
function segmentCost(segment) {
  return window.qingchangDomain.segmentCost(segment);
}
function orderCost(order) { return (order.billingMode==='none'?0:(order.segments || []).reduce((sum, s) => sum + segmentCost(s).total, 0)) + (Number(order.expenses) || 0); }
function orderNet(order) { return window.qingchangDomain.netIncome(order); }
function completedNet() { return state.orders.filter((x) => !x.sample && QingchangOrderFlow.settled(x) && dayKey(new Date(x.completedAt || x.createdAt || Date.now())) === dayKey()).reduce((sum, o) => sum + orderNet(o), 0); }
function displaySource(account) { return account.source === '其他' ? (account.customSource || '其他') : account.source; }
function normalizeSource(value) { const s=String(value||'').trim();if(!s)return '会员';if(s.includes('会员'))return '会员';if(s.includes('福袋'))return '福袋';if(s.includes('老板'))return '老板';return '其他'; }
function statusPill(value) { const cls = value === '已完成' ? 'green' : value === '待结算' ? 'orange' : value === '进行中' ? 'blue' : ''; return `<span class="pill ${cls}">${esc(value)}</span>`; }
function activeOrderObj() { if(orderCorrection?.id===activeOrder)return orderCorrection.draft; return state.orders.find((o) => o.id === activeOrder) || state.orders.find((o) => o.status !== '已完成') || state.orders[0] || null; }

function pageShell() {
  if (page === 'welcome') return `<div class="welcome-shell"><div class="welcome-frame"><header class="welcome-header"><strong>轻场</strong><small>直播 · 陪玩工作台</small></header>${renderWelcome()}<footer class="welcome-footer"><strong>繁琐退场，精彩上场。</strong><span>◈ 安全显示始终开启</span></footer></div></div>${accountModal ? accountModalHtml() : ''}`;
  const role = state.role || '主播';
  const icons = { 'escort-home':'<path d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z"/>', 'streamer-home':'<path d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z"/>', settlement:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h10M7 14h6"/>', orders:'<path d="M4 4h16v16H4zM8 9h8M8 13h8M8 17h5"/>', accounts:'<circle cx="9" cy="8" r="3"/><path d="M2 20v-2a7 7 0 0 1 14 0v2M18 8a3 3 0 0 1 0 6M20 20v-2a5 5 0 0 0-3-4.6"/>', avatar:'<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/>', highlights:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>', titles:'<path d="M4 5h16M12 5v14M8 19h8"/>', setup:'<path d="m12 2 2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/>', settings:'<path d="M12 2 4 5v6c0 5 3.2 8.5 8 11 4.8-2.5 8-6 8-11V5z"/><path d="m9 12 2 2 4-4"/>' };
  icons.optimize = '<path d="M4 18a8 8 0 0 1 16 0M12 13l4-4M7 18h10"/>';
  icons.rental = '<path d="M7 3h10v18l-5-3-5 3zM10 8h4M10 12h4"/>';
  const toolKey=currentToolKey();
  const groups = NAV[role].map(([label, links]) => `<nav class="nav-section"><div class="nav-label">${label}</div>${links.map(([key, title]) => `<button class="nav-link${page===key?' is-active':''}" data-nav="${key}" ${page===key?'aria-current="page"':''}><svg viewBox="0 0 24 24" aria-hidden="true">${icons[key] || icons.setup}</svg><span>${title}</span>${key === 'accounts' ? `<span class="nav-badge new">${state.accounts.length}</span>` : key==='rental' ? `<span class="nav-badge new">${(state.rentalLeases||[]).length}</span>` : ''}</button>`).join('')}</nav>`).join('')+QingchangToolsPage.sidebar(role,{key:toolKey,page});
  return `<div class="shell qingchang-shell"><aside class="d-sidebar"><div class="brand q-brand"><div class="brand-text"><div class="brand-name">轻场</div><div class="brand-tag">正式版</div></div></div><div class="role-switch"><button data-role="主播" class="${role === '主播' ? 'active' : ''}">主播</button><button data-role="打手" class="${role === '打手' ? 'active' : ''}">陪玩</button></div>${groups}<div class="workbench-side-bottom"><button class="nav-link${page==='settings'?' is-active':''}" data-nav="settings"><svg viewBox="0 0 24 24" aria-hidden="true">${icons.settings}</svg><span>数据安全与设置</span></button><button class="nav-link" data-act="switch-home"><span>切换工作方式</span></button></div><div class="local-status"><b><i class="dot"></i>本地工作台</b><span>数据保存在这台电脑</span></div></aside><div class="main"><header class="d-topbar"><div class="crumbs">${toolKey?'<button class="crumb-tools" data-nav="tools">工具总览</button>':'<span>工作台</span>'}<svg class="sep" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg><span class="current">${esc(toolKey?QingchangToolsPage.route(toolKey).title:pageTitle(page))}</span></div><div class="topbar-actions"><div class="save-status-slot" data-save-status-slot></div><span class="local-chip">数据仅存本机</span><button class="top-btn" data-nav="settings">加密备份</button></div></header><main class="content q-content" data-page="${page}">${renderPage()}</main></div></div>${accountModal ? accountModalHtml() : ''}`;
}
function pageTitle(k) { return ({ 'escort-home': '陪玩工作台', 'streamer-home': '主播工作台', settlement: '订单使用与结算', orders: '订单与每日目标', accounts: '账号管理', rental:'租号管理', avatar: '直播形象助手', highlights: '精彩时刻', titles: '标题制作', setup: '开播设置与滤镜', optimize: '游戏与电脑优化', tools:'工具总览',repair:'修复卡顿与掉帧',settings: '本地数据与安全' })[k] || '工作台'; }
function heading(eyebrow, title, subtitle, actions = '') { return `<div class="heading"><div><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>`; }

function renderWelcome() {
  const net = completedNet(); const goal = Number(state.settings.goal) || 0;
  return `<section class="role-page"><div class="role-intro"><div class="eyebrow">一个工作台，两种工作方式</div><h1>今天，<br><em>从哪里开始？</em></h1><p>把三角洲直播、陪玩过程中零散重复的操作，集中到一个本地工作台。</p><div class="role-points"><span>✓　租号记录与订单净收入</span><span>✓　上号名单、直播形象与精彩时刻</span><span>✓　账号资料加密保存在本机</span></div></div><div class="role-cards"><button class="role-card primary-card" data-role-enter="主播"><div class="role-mark" aria-hidden="true">${QingchangIcons.icon('broadcast')}</div><h2>我是主播</h2><p>安排账号上号，准备直播画面、标题和精彩时刻。</p><div class="role-stat"><span>本周工作台账号</span><strong>${state.workspaceAccountIds.length} 个</strong><span>账号历史会一直保留</span></div><div class="role-go">进入主播工作台　→</div></button><button class="role-card" data-role-enter="打手"><div class="role-mark" aria-hidden="true">${QingchangIcons.icon('list')}</div><h2>我是陪玩</h2><p>记录租用账号消耗、订单收入与每日目标。</p><div class="role-stat"><span>今日目标${state.demo?' · 演示中':''}</span><strong>${money(goal)}</strong><span>今天已完成 ${money(net)}</span></div><div class="role-go">进入陪玩工作台　→</div></button></div></section>`;
}

function renderDashboard(role){return role==='打手'?QingchangWorkflowPage.escort(state,{money,cost:orderCost,net:completedNet,today:todayOrders,renderTable:renderOrderTable}):QingchangWorkflowPage.streamer(state,{phase:workflowPhase,recovered:recoveredSession,preparation:workflowPreparation?.status()||{items:[]}});}

function renderOrderTable(orders) {
  if (!orders.length) return `<div class="empty"><b>还没有订单</b>新建后即可关联多个租用账号。</div>`;
  return `<div class="table-wrap"><table class="table"><thead><tr><th>订单</th><th>状态</th><th>收入</th><th>成本</th><th>净收入</th><th>操作</th></tr></thead><tbody>${orders.map((o) => `<tr><td><b>${esc(o.name || '未命名订单')}</b><div style="font-size:10px;color:#9aa6b4;margin-top:4px">${stamp(o.createdAt)} · ${o.segments.length} 个账号</div></td><td>${statusPill(o.status)}</td><td>${String(o.income??'')!=='' ? money(o.income) : '待填写'}</td><td>${QingchangOrderFlow.amounts(o).costReady?money(orderCost(o)):'待补齐'}</td><td><b>${QingchangOrderFlow.settled(o) ? money(orderNet(o)) : '—'}</b></td><td><div class="table-action"><button class="btn sm" data-act="edit-order" data-id="${o.id}">打开</button>${!QingchangOrderFlow.terminal(o) ? `<button class="btn sm primary" data-act="${o.status==='待结算'?'order-stage':o.status==='已暂停'?'order-resume':'advance-order'}" data-step="3" data-id="${o.id}">${o.status === '未开始' ? '开始' : o.status === '进行中' ? '结束订单' : o.status==='已暂停'?'继续订单':'核对结算'}</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>`;
}

function renderOrders() {
  const all = state.orders.filter((o) => `${o.name} ${o.status}`.toLowerCase().includes(orderSearch.toLowerCase()));
  return `${heading('ORDERS & DAILY TARGET', '订单与每日目标', '收入在确认结算时手动填写；扣除租号与其他支出后的净收入计入目标。', `<button class="btn primary" data-act="new-order">＋ 新建订单</button>`)}<div class="grid four" style="margin-bottom:16px"><div class="metric blue"><div class="metric-label">今日净收入</div><div class="metric-value">${money(completedNet())}</div><div class="metric-note">已完成订单</div></div><div class="metric orange"><div class="metric-label">今天目标</div><div class="metric-value">${money(state.settings.goal)}</div><div class="metric-note">在工作台可随时修改</div></div><div class="metric"><div class="metric-label">进行中</div><div class="metric-value">${todayOrders().filter((x) => x.status === '进行中').length}</div><div class="metric-note">可中途切换多个账号</div></div><div class="metric"><div class="metric-label">待结算</div><div class="metric-value">${todayOrders().filter((x) => x.status === '待结算').length}</div><div class="metric-note">确认收入后手动完成</div></div></div><section class="card"><div class="toolbar"><div class="toolbar-left"><input class="search" placeholder="搜索订单" value="${esc(orderSearch)}" data-search="orders"></div><div class="toolbar-right"><span class="pill">共 ${all.length} 笔</span></div></div>${renderOrderTable(all)}</section>`;
}

function renderSettlement() {
 const order=activeOrderObj();
 return QingchangOrderPage.render(state,order,{money,stamp,uploadField,ocrSuggestionMarkup,requested:settlementFocus?.orderId===order?.id?settlementFocus.step:undefined,recordId:orderRecordId,editing:orderEditingRecord,correction:orderCorrection?.id===order?.id});
}
function refreshOrderFigures(){
 const order=page==='settlement'?activeOrderObj():QingchangWorkflowModel.currentOrder(state);if(!order)return;
 document.querySelectorAll('[data-order-summary]').forEach(node=>node.innerHTML=QingchangOrderPage.summary(order,money,orderCorrection?.id===order.id));
 document.querySelectorAll('[data-order-verdict]').forEach(node=>node.innerHTML=QingchangOrderPage.verdict(order,orderCorrection?.id===order.id));
 document.querySelectorAll('[data-order-cost-table]').forEach(node=>node.innerHTML=QingchangOrderPage.costTable(order,money,state));
 document.querySelectorAll('[data-rental-usage-summary]').forEach(node=>{const html=QingchangRentalPage.usageSummaryForOrder(order,state);if(html)node.outerHTML=html;else node.remove();});
}
function updateOrderInput(target){
 if(!(target.dataset.orderField||target.dataset.ratioWan||target.dataset.seg))return false;
 const order=editableOrder(target.dataset.order||target.dataset.id);if(!orderWritable(order))return true;
 if(target.dataset.orderField)order[target.dataset.orderField]=target.value;
 else{const segment=order.segments.find(x=>x.id===target.dataset.segment);if(!segment)return true;
  if(target.dataset.ratioWan){try{segment.coinPerYuan=target.value===''?'':qingchangDomain.ratioFromWan(target.value);target.removeAttribute('aria-invalid');}catch(_){segment.coinPerYuan='';target.setAttribute('aria-invalid','true');}}
  else{segment[target.dataset.seg]=target.value;if(['startBalance','endBalance'].includes(target.dataset.seg))delete segment[target.dataset.seg+'Suggestion'];}
 }
 const changedField=target.dataset.orderField||target.dataset.ratioWan||target.dataset.seg;
 if(!QingchangSettlement.issues(order).some(e=>e.field===changedField&&(!e.segmentId||e.segmentId===target.dataset.segment)))target.removeAttribute('aria-invalid');
 if(!orderCorrection)state.demo=false;persistOrder(order);refreshOrderFigures();return true;
}
async function showOrderStage(orderId,step,{recordId='',editing=false,field=''}={}){
 const order=editableOrder(orderId);if(!order)return;await flushSave();
 activeOrder=orderId;state.selectedOrderId=orderId;persist();settlementFocus={orderId,step:Number(step)||QingchangOrderFlow.phase(order)};orderRecordId=recordId;orderEditingRecord=editing;page='settlement';renderWithMotion();window.scrollTo(0,0);
 if(field){const node=recordId?document.getElementById('record-'+recordId+'-'+field):document.getElementById('order-'+field);if(node){for(let p=node.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;node.setAttribute('aria-invalid','true');node.scrollIntoView({block:'center'});node.focus({preventScroll:true});}}
}
async function saveOrderShot(target){
 const file=target.files[0],orderId=target.dataset.order,segmentId=target.dataset.segment,field=target.dataset.shot,correctionRef=orderCorrection;
 if(!file||!orderWritable(editableOrder(orderId)))return;
 const key=orderId+':'+segmentId+':'+field,job={};orderShotJobs.set(key,job);orderScreenshotPending++;
 toast('正在读取截图并识别余额…');
 try{
  const data=await readImage(file);let suggestion='';try{suggestion=await suggestHaufcoinBalance(data);}catch(_){}
  if(orderShotJobs.get(key)!==job||orderCorrection!==correctionRef)return;
  const order=editableOrder(orderId),segment=order?.segments.find(x=>x.id===segmentId);
  if(!segment||!orderWritable(order))return toast('账号或订单状态已变化，截图未写入，请重新检查',true);
  segment[field]=data;const balanceField=field==='beforeShot'?'startBalance':'endBalance';
  if(suggestion)segment[balanceField+'Suggestion']=suggestion;else delete segment[balanceField+'Suggestion'];
  if(!orderCorrection)state.demo=false;persistOrder(order);render();toast(suggestion?'截图已保存。本机识别建议 '+suggestion+'，请对照原图确认。':'截图已保存，未能可靠识别余额；请手动录入。',!suggestion);
 }catch(error){toast(error.message,true);}finally{orderScreenshotPending--;if(orderShotJobs.get(key)===job)orderShotJobs.delete(key);}
}
async function orderAction(act,target){
 const order=editableOrder(target.dataset.id||activeOrder);
 if(orderCorrection&&act==='order-return-home')return toast('请先保存或放弃结算更正',true);
 if(act==='order-pause'||act==='order-resume'){if(!order)return;const at=safeNow();const updated=QingchangRentalModel.markUse(QingchangOrderFlow[act==='order-pause'?'pause':'resume'](order,at),at);await commitState({...state,orders:state.orders.map(x=>x.id===order.id?updated:x)});render();toast(act==='order-pause'?'订单已暂停，记录保留':'已继续这笔订单');return;}
 if(act==='order-cancel'){if(!order||QingchangOrderFlow.terminal(order))return;accountModal={kind:'order-cancel',orderId:order.id};modal('取消订单并处理已有费用','<p>订单：'+esc(order.name)+'</p><div class="field"><label for="cancel-order-reason">取消原因</label><textarea id="cancel-order-reason" placeholder="例如：客户取消 / 临时中断"></textarea></div><div class="field"><label for="cancel-order-mode">已有收入和费用如何处理</label><select id="cancel-order-mode"><option value="settle" '+(order.status!=='未开始'?'selected':'')+'>核对已有收入和费用，再取消</option><option value="waive" '+(order.status==='未开始'?'selected':'')+'>直接取消，不计入收益</option></select><small>如果已经发生租号消耗或其他费用，建议核对后结算；收入为零也可以记录实际损失。</small></div>','保存取消处理');return;}
 if(act==='order-stage'){await showOrderStage(target.dataset.id,Number(target.dataset.step));return;}
 if(act==='order-return-home'){await flushSave();page='escort-home';renderWithMotion();return;}
 if(act==='order-edit-record'){if(!order)return;const stage=order.status==='待结算'||order.status==='已完成'?3:order.status==='未开始'?1:2;await showOrderStage(order.id,stage,{recordId:target.dataset.segment,editing:stage===3});return;}
 if(act==='order-close-record'){if(order)await showOrderStage(order.id,3);return;}
 if(act==='order-issue'){if(!orderWritable(order))return toast('请先点击更正这笔结算',true);if(target.dataset.field==='segments'){const copy=structuredClone(order),segment=QingchangOrderFlow.segment({},id());copy.segments.push(segment);copy.activeSegmentId=segment.id;if(orderCorrection?.id===order.id)orderCorrection.draft=copy;else await commitState({...state,orders:state.orders.map(x=>x.id===copy.id?copy:x)});await showOrderStage(copy.id,3,{recordId:segment.id,editing:true,field:'accountName'});return;}await showOrderStage(order.id,3,{recordId:target.dataset.segment,editing:!!target.dataset.segment,field:target.dataset.field});return;}
 if(act==='order-create-draft'){if(accountModal?.kind!=='new-order')return;const modalRef=accountModal;modalRef.createDraft=true;try{await saveModal();}finally{modalRef.createDraft=false;}return;}
}
function fileSlot(id,label,hint=''){return `<div class="field"><label for="${id}">${label}</label><div class="upload-slot"><span class="upload-file-name">未添加截图</span><label class="btn sm">选择原始截图<input id="${id}" class="upload-file-input" type="file" accept="image/png,image/jpeg,image/webp"></label></div>${hint?`<small>${hint}</small>`:''}</div>`;}
function syncUploadSlots(){document.querySelectorAll('.upload-slot').forEach(slot=>{const input=slot.querySelector('input.upload-file-input');if(!input)return;const file=input.files?.[0];const name=slot.querySelector('.upload-file-name');if(name)name.textContent=file?file.name:'未添加截图';const button=slot.querySelector('label.btn');if(button?.firstChild?.nodeType===Node.TEXT_NODE)button.firstChild.textContent=file?'更换截图':'选择原始截图';});}
function ocrSuggestionMarkup(seg, field, orderId) {
  const suggestion = seg[`${field}Suggestion`];
  if (!suggestion) return '';
  return `<div class="notice" style="margin-top:7px;display:flex;align-items:center;justify-content:space-between;gap:8px"><span>本机 OCR 建议 <strong>${esc(suggestion)}</strong> · 请核对截图</span><button class="btn sm primary" data-act="accept-ocr-balance" data-id="${orderId}" data-segment="${seg.id}" data-field="${field}">确认并填入</button></div>`;
}
function uploadField(data, field, orderId, segmentId) { return `<div class="upload-slot">${data ? `<img src="${data}" alt="本机截图">` : '<span>未添加截图</span>'}<label class="btn sm">${data ? '更换截图' : '选择原始截图'}<input type="file" accept="image/png,image/jpeg,image/webp" hidden data-shot="${field}" data-order="${orderId}" data-segment="${segmentId}"></label></div>`; }

function renderAccounts() {
 return QingchangAccountsPage.render(state,{view:accountView,search:accountSearch,sort:accountSort,selectedId:accountSelectedId,tab:accountDetailTab,returnPage:accountReturnPage,stamp});
}
function renderRentals(){
 return QingchangRentalPage.render(state,{search:rentalSearch,filter:rentalFilter,selectedId:rentalSelectedId});
}
function rentalLeaseById(leaseId){return (state.rentalLeases||[]).find(x=>x.id===leaseId)||null;}
function rentalPlatformText(lease){return [lease?.platform||'未填平台',lease?.region||'未填区服'].join(' / ');}
function rentalGuard(lease,{ignoreOrderId='',askExpired=true}={}){
 if(!lease)return {ok:false,message:'租号资料不存在，请重新选择账号'};
 const status=QingchangRentalModel.status(state,lease);
 if(status.key==='missing')return {ok:false,message:'租号资料已删除，请重新选择账号'};
 if(['returned','archived'].includes(status.key))return {ok:false,message:`该账号${status.label}，不能直接用于订单`};
 if(status.key==='in-use'&&status.order?.id!==ignoreOrderId)return {ok:false,message:`该账号正在订单「${status.order.name||'未命名订单'}」中使用`,order:status.order};
 const conflict=QingchangRentalModel.conflictFor(state,lease,{ignoreOrderId});
 if(conflict)return {ok:false,message:`该账号正在订单「${conflict.order.name||'未命名订单'}」中使用`,order:conflict.order};
 if(QingchangRentalModel.isExpired(lease)){
  if(askExpired&&!confirm(`租号「${QingchangRentalModel.displayName(lease)}」已到期（${lease.expiresAt}）。确认仍要用于订单？`))return {ok:false,message:'已取消：账号已到期'};
 }
 return {ok:true};
}
function rentalStatusOptions(selected){
 return QingchangRentalModel.PLATFORMS.map(platform=>`<option ${selected===platform?'selected':''}>${esc(platform)}</option>`).join('');
}
function openRentalEditor(lease=null){
 const editing=!!lease;
 accountModal={kind:'rental-edit',id:lease?.id||null};
 const field=(key,label,value='',type='text',extra='')=>`<div class="field"><label for="m-rental-${key}">${label}</label><input id="m-rental-${key}" type="${type}" ${type==='number'?'min="0" step="any"':''} value="${esc(value??'')}" ${extra}></div>`;
 const body=`<div class="form-grid"><div class="field"><label for="m-rental-remark">备注名</label><input id="m-rental-remark" value="${esc(lease?.remark||'')}" placeholder="不填时按登录账号生成脱敏名称" autocomplete="off"></div><div class="field"><label for="m-rental-login">登录账号（必填）</label><input id="m-rental-login" value="${esc(lease?.loginAccount||'')}" autocomplete="off"></div><div class="field"><label for="m-rental-password">密码</label><input id="m-rental-password" type="password" value="" placeholder="${editing?'留空表示不修改':'可暂缺，稍后补齐'}" autocomplete="new-password"><small>${editing?'需要替换时直接填写新密码；清除密码请用详情中的操作。':'密码可暂缺，但列表会提示“登录资料待补齐”。'}</small></div><div class="field"><label for="m-rental-platform">登录平台</label><select id="m-rental-platform"><option value="" ${!lease?.platform?'selected':''}>未填写</option>${rentalStatusOptions(lease?.platform||'')}</select></div><div class="field"><label for="m-rental-region">区服</label><input id="m-rental-region" value="${esc(lease?.region||'')}" placeholder="例如：华东 / 亚服" autocomplete="off"></div><div class="field"><label for="m-rental-source">租号来源</label><input id="m-rental-source" value="${esc(lease?.source||'')}" placeholder="例如：某租号平台 / 号主" autocomplete="off"></div><div class="field"><label for="m-rental-rented">租用时间</label><input id="m-rental-rented" type="date" value="${esc(lease?.rentedAt||'')}"></div><div class="field"><label for="m-rental-expires">到期时间</label><input id="m-rental-expires" type="date" value="${esc(lease?.expiresAt||'')}"><small>未填时显示“未记录”；到期不会自动退号或改账目。</small></div><div class="field full"><label for="m-rental-note">备注</label><textarea id="m-rental-note">${esc(lease?.note||'')}</textarea></div></div><details class="order-create-options" open><summary>默认计费（只影响之后新建的使用记录）</summary><div class="form-grid">${field('ratio','1 元兑换多少万哈夫币',QingchangRentalModel.ratioCoinsToWan(lease?.defaultCoinPerYuan),'number')}${field('suit-price','六套单价（元）',lease?.defaultSuitPrice??'','number')}${field('ammo-price','AWM 子弹单价（元）',lease?.defaultAmmoPrice??'','number')}</div><p class="workflow-note">这里不是已经发生的费用；开始订单时仍要核对本次余额。</p></details><label class="rental-save-check"><input type="checkbox" id="m-rental-new-round"> 如果平台、区服和登录账号已存在，登记为新一轮租用</label><div class="notice" style="margin-top:13px">登录账号只去掉首尾空白；密码按原样保存。修改默认比例不会改变已经开始或已结算的记录。</div>`;
 modal(editing?'编辑租号资料':'添加租号账号',body,'保存');
}
function openRentalImportPaste(){
 accountModal={kind:'rental-import-paste'};
 const body=`<div class="field full"><label for="m-rental-import-text">粘贴账号文本</label><textarea id="m-rental-import-text" rows="9" placeholder="一行一个账号，字段用 Tab 分隔；也可以粘贴带“账号：”“密码：”标签的内容"></textarea><small>只在确认预览后写入本机加密数据库；不读取微信，也不把原文写入日志或临时文件。</small></div><div class="rental-import-source"><label class="btn sm">选择 CSV / TXT 文件<input id="m-rental-import-file" type="file" accept=".csv,.txt,text/csv,text/plain" hidden></label><span class="rental-import-file">导入前会先显示可编辑预览</span></div><pre class="rental-sample">登录账号	密码	平台	区服	来源	备注	到期时间	比例(万/元)
demo-a	pass-a	QQ区	华东	租号平台	主力号	2026-11-10	40
demo-b	pass-b	微信区		号主阿哲		2026-11-20	45

账号：demo-c
密码：pass-c
平台：QQ区
区服：华东</pre><p class="rental-import-note">自由文本识别不确定时会停在预览，不会猜密码。密码默认隐藏，可在预览中逐行查看。</p>`;
 modal('批量导入租号',body,'解析并预览');
}
function rentalImportPreviewHtml(){
 const rows=pendingRentalImport?.rows||[];
 const missingLogin=rows.filter(x=>x.missingLogin).length,missingPassword=rows.filter(x=>x.missingPassword).length,duplicates=rows.filter(x=>x.duplicate||x.inBatchDuplicate!=null).length;
 const issues=pendingRentalImport?.issues||[];
 return `<div class="rental-import-summary"><span class="pill blue">识别 ${rows.length} 行</span><span class="pill ${missingLogin?'red':'green'}">缺少登录账号 ${missingLogin}</span><span class="pill ${missingPassword?'orange':'green'}">缺少密码 ${missingPassword}</span><span class="pill ${duplicates?'orange':'green'}">重复 ${duplicates}</span><span class="metric-note">${esc(pendingRentalImport?.fileName||'')}</span></div>${issues.length?`<div class="rental-import-issues"><b>有 ${issues.length} 处需要核对</b><ul>${issues.slice(0,8).map(issue=>`<li>第 ${issue.line||'—'} 行：${esc(issue.message)}</li>`).join('')}</ul>${issues.length>8?'<small>其余问题请在预览中直接修改。</small>':''}</div>`:''}<div class="rental-import-preview">${rows.map((row,index)=>{
  const current=row.duplicate?QingchangRentalModel.currentRental(state,row):null;
  return `<article class="rental-import-row ${row.missingLogin?'has-error':''}" data-import-row="${index}"><div class="rental-import-row-head"><b>第 ${index+1} 行</b><span class="metric-note">源第 ${row.sourceLine||'—'} 行</span>${row.missingLogin?'<span class="pill red">缺少登录账号</span>':''}${row.missingPassword?'<span class="pill orange">密码待补齐</span>':''}${row.duplicate?`<span class="pill orange">重复：${esc(QingchangRentalModel.displayName(row.duplicate))}</span>`:row.inBatchDuplicate!=null?`<span class="pill orange">与本批第 ${row.inBatchDuplicate+1} 行重复</span>`:''}<span class="rental-row-spacer"></span><label><input type="checkbox" data-import-include="${index}" ${row.skip?'':'checked'}> 导入</label>${row.duplicate?`<select data-import-resolution="${index}" aria-label="重复账号处理方式"><option value="skip" ${row.resolution==='skip'||!row.resolution?'selected':''}>跳过（默认）</option><option value="update" ${row.resolution==='update'?'selected':''} ${current?'':'disabled title="没有可更新的当前租用资料"'}>更新当前租用资料</option><option value="new" ${row.resolution==='new'?'selected':''}>登记为新一轮租用</option></select>`:''}</div><div class="rental-import-fields">${[
   ['remark','备注名','text'],['login','登录账号','text']
  ].map(([key,label,type])=>`<div class="field"><label>${label}</label><input type="${type}" data-import-field="${key}" data-import-index="${index}" value="${esc(key==='login'?row.loginAccount:row.remark)}" autocomplete="off"></div>`).join('')}<div class="field"><label>密码</label><div class="rental-import-password"><input id="import-password-${index}" type="password" data-import-field="password" data-import-index="${index}" value="${esc(row.password||'')}" autocomplete="off"><button class="btn sm" data-act="rental-import-reveal" data-target="import-password-${index}" aria-label="显示或隐藏第 ${index+1} 行密码">显示</button></div></div><div class="field"><label>平台</label><select data-import-field="platform" data-import-index="${index}"><option value="" ${!row.platform?'selected':''}>未填写</option>${QingchangRentalModel.PLATFORMS.map(platform=>`<option ${row.platform===platform?'selected':''}>${esc(platform)}</option>`).join('')}</select></div>${[
   ['region','区服','text'],['source','租号来源','text'],['expires','到期时间','date'],['ratio','比例（万/元）','number'],['suitPrice','六套单价','number'],['ammoPrice','子弹单价','number']
  ].map(([key,label,type])=>`<div class="field"><label>${label}</label><input type="${type}" ${type==='number'?'min="0" step="any"':''} data-import-field="${key}" data-import-index="${index}" value="${esc(key==='expires'?QingchangRentalModel.normalizeDate(row.expiresAt):key==='ratio'?row.ratio:key==='suitPrice'?row.suitPrice:key==='ammoPrice'?row.ammoPrice:key==='source'?row.source:row.region)}" autocomplete="off"></div>`).join('')}</div>${row.duplicate?'<p class="rental-import-note">更新只改备注、来源、租期和默认单价，不覆盖旧密码、旧使用记录或旧订单金额。</p>':''}</article>`;
 }).join('')}</div><p class="rental-import-note">密码默认隐藏；确认导入后才会保存。缺少登录账号的行必须补齐或取消勾选。</p>`;
}
async function readRentalImportFile(file){
 const buffer=await file.arrayBuffer();
 const utf8=new TextDecoder('utf-8').decode(buffer);
 if(!utf8.includes('\uFFFD'))return utf8;
 try{return new TextDecoder('gbk').decode(buffer);}catch(_){return utf8;}
}
function startRentalImportPreview(text,fileName){
 const parsed=QingchangRentalModel.parseImport(text);
 if(!parsed.rows.length){toast(parsed.issues[0]?.message||'没有识别到可用账号',true);return;}
 const analyzed=QingchangRentalModel.analyzeImport(state,parsed.rows);
 pendingRentalImport={fileName,issues:parsed.issues||[],rows:analyzed.map(row=>({...row,resolution:row.duplicate?'skip':'',skip:false}))};
 accountModal={kind:'rental-import',wide:true};
 modal('批量导入预览',rentalImportPreviewHtml(),'确认导入');
}
function readRentalImportRows(){
 const rows=(pendingRentalImport?.rows||[]).map((row,index)=>{
  const value=key=>document.querySelector(`[data-import-field="${key}"][data-import-index="${index}"]`)?.value??row[key]??'';
  const include=document.querySelector(`[data-import-include="${index}"]`)?.checked!==false;
  const resolution=document.querySelector(`[data-import-resolution="${index}"]`)?.value||'skip';
  return {...row,remark:value('remark'),loginAccount:value('login'),password:value('password'),platform:value('platform'),region:value('region'),source:value('source'),expiresAt:value('expires'),ratio:value('ratio'),suitPrice:value('suitPrice'),ammoPrice:value('ammoPrice'),skip:!include,resolution,missingLogin:!String(value('login')||'').trim(),missingPassword:!String(value('password')||'')};
 });
 const bad=rows.find(row=>!row.skip&&row.missingLogin);
 if(bad)throw Error(`第 ${rows.indexOf(bad)+1} 行缺少登录账号；请补齐或取消勾选`);
 return rows;
}
function openRentalForOrder(lease){
 if(!lease)return;
 const guard=rentalGuard(lease,{askExpired:false});
 if(!guard.ok)return toast(guard.message,true);
 const orders=(state.orders||[]).filter(order=>['未开始','进行中','已暂停'].includes(order.status));
 accountModal={kind:'rental-order',id:lease.id};
 const itemField=(key,label,value='')=>`<div class="field"><label for="m-rental-${key}">${label}</label><input id="m-rental-${key}" type="number" min="0" step="any" value="${esc(value??'')}"></div>`;
 const body=`<div class="notice">账号：<strong>${esc(QingchangRentalModel.displayName(lease))}</strong> · ${esc(rentalPlatformText(lease))} · 登录账号 ${esc(QingchangRentalModel.maskAccount(lease.loginAccount))}<br>本次仍要核对开始余额；默认单价只是预填值。</div><div class="form-grid" style="margin-top:14px"><div class="field"><label for="m-rental-order-mode">使用方式</label><select id="m-rental-order-mode"><option value="new">新建订单</option><option value="existing" ${orders.length?'':'disabled'}>加入现有订单</option></select></div><div class="field"><label for="m-rental-order-name">订单名称</label><input id="m-rental-order-name" placeholder="例如：体验单-98保688w" autocomplete="off"></div></div><div data-rental-order-new><div class="form-grid" style="margin-top:13px"><div class="field"><label for="m-rental-order-start">开始余额</label><input id="m-rental-order-start" placeholder="例如 116M 或 450万" autocomplete="off"></div><div class="field"><label for="m-rental-order-ratio">租号比例 · 1 元兑换（万哈夫币）</label><input id="m-rental-order-ratio" type="number" min="0" step="any" value="${esc(QingchangRentalModel.ratioCoinsToWan(lease.defaultCoinPerYuan))}"></div></div><details class="order-create-options"><summary>六套与 AWM 子弹计费（按需填写）</summary>${['suit','ammo'].map(prefix=>`<div class="order-create-optional"><label><input type="checkbox" id="m-rental-${prefix}-used"> 本单${prefix==='suit'?'六套':'AWM 子弹'}需要计费</label><div data-rental-item="${prefix}" hidden><div class="form-grid">${itemField(prefix+'-start','开始数量')}${itemField(prefix+'-end','结束数量')}${itemField(prefix+'-price','单价（元）',prefix==='suit'?lease.defaultSuitPrice??'':lease.defaultAmmoPrice??'')}</div></div></div>`).join('')}</details></div><div data-rental-order-existing hidden style="margin-top:13px"><div class="field"><label for="m-rental-order-existing">加入哪一笔订单</label><select id="m-rental-order-existing"><option value="">请选择订单</option>${orders.map(order=>{const current=QingchangWorkflowProgress.currentSegment(order);return `<option value="${esc(order.id)}">${esc(order.name||'未命名订单')} · ${esc(order.status)}${current?` · 当前账号 ${esc(current.accountName||'未填写备注')}`:''}</option>`;}).join('')}</select></div><p class="rental-import-note" data-rental-existing-note>已有当前账号的订单会先进入换号流程，不会静默替换。</p></div><p class="workflow-note">保存后会立即开始使用这个账号；未使用的其他租号不会产生消耗记录。</p>`;
 modal('用这个租号开始订单',body,'保存并使用');
}
function openRentalPreview(leaseId,orderId=''){
 const lease=rentalLeaseById(leaseId);if(!lease)return toast('租号资料已不存在',true);
 accountModal={kind:'rental-preview',id:lease.id,scrollY:window.scrollY};
 modal('租号资料 · 账目查看',QingchangRentalPage.leasePreview(state,lease,{fromOrderId:orderId}),'关闭');
}
function closeAccountModal(){
 const scroll=accountModal?.kind==='rental-preview'?accountModal.scrollY:null;
 accountModal=null;render();
 if(Number.isFinite(scroll))window.scrollTo(0,scroll);
}
function openRentalLinkSegment(orderId,segmentId){
 const order=state.orders.find(x=>x.id===orderId),segment=order?.segments.find(x=>x.id===segmentId);
 if(!order||!segment)return toast('订单记录已变化，请重新打开',true);
 const leases=state.rentalLeases||[];
 accountModal={kind:'rental-link-segment',orderId,segmentId};
 const body=`<div class="notice">只关联租号资料，不复制密码，也不改变这段记录的余额、比例或金额。</div><div class="field" style="margin-top:13px"><label for="m-rental-link-lease">选择租号资料</label><select id="m-rental-link-lease"><option value="">请选择</option>${leases.map(lease=>`<option value="${esc(lease.id)}">${esc(QingchangRentalModel.displayName(lease))} · ${esc(rentalPlatformText(lease))} · ${esc(QingchangRentalModel.maskAccount(lease.loginAccount))}</option>`).join('')}</select></div><p class="workflow-note">旧记录不会被按备注名自动关联；只有这次明确选择才会写入关联。</p>`;
 modal('关联租号资料',body,'保存关联');
}
function filterSwapLeases(query){
 const select=$('#swap-rental-lease');if(!select)return;
 const needle=String(query||'').trim().toLocaleLowerCase();
 for(const option of [...select.options]){
  if(!option.value){option.hidden=false;continue;}
  option.hidden=!!needle&&!String(option.textContent||'').toLocaleLowerCase().includes(needle);
 }
 const selected=select.selectedOptions?.[0];
 if(selected&&selected.hidden){select.value='';select.dispatchEvent(new Event('change',{bubbles:true}));}
}
async function copyRentalLogin(lease){
 if(!lease)return toast('请先选择一个租号账号',true);
 if(!String(lease.loginAccount||'').trim())return toast('这个租号还没有登录账号',true);
 const text=`账号：${lease.loginAccount}${lease.password?`\n密码：${lease.password}`:'\n密码：未记录'}`;
 await api.copySecret(text);
 toast(lease.password?'登录信息已复制；30 秒后轻场会清除剪贴板':'账号已复制；密码未记录，请到租号管理补齐',!lease.password);
}
async function rentalOpenOrder(orderId){
 const order=state.orders.find(x=>x.id===orderId);if(!order)return toast('订单已不存在',true);
 await flushSave();accountModal=null;activeOrder=order.id;state.selectedOrderId=order.id;
 if(['未开始','进行中','已暂停'].includes(order.status)){settlementFocus=null;page='escort-home';renderWithMotion();}
 else{settlementFocus={orderId:order.id,step:3};orderRecordId='';orderEditingRecord=false;page='settlement';renderWithMotion();window.scrollTo(0,0);}
}
async function rentalAction(act,target){
 if(act==='rental-filter'){rentalFilter=target.dataset.rentalFilter||'all';rentalSelectedId='';render();return true;}
 if(act==='rental-reset-filter'){rentalFilter='all';rentalSearch='';rentalSelectedId='';render();return true;}
 if(act==='rental-show'){rentalSelectedId=target.dataset.id||'';render();const body=document.querySelector('.rental-inspector .account-inspector-body');if(body)body.scrollTop=0;document.querySelector('[data-rental-detail-title]')?.focus({preventScroll:true});return true;}
 if(act==='rental-close-detail'){rentalSelectedId='';render();return true;}
 if(act==='rental-new'){openRentalEditor();return true;}
 if(act==='rental-edit'){const lease=rentalLeaseById(target.dataset.id);if(lease)openRentalEditor(lease);return true;}
 if(act==='rental-import'){openRentalImportPaste();return true;}
 if(act==='rental-reveal'){const input=document.getElementById(target.dataset.target);if(!input)return true;input.type=input.type==='password'?'text':'password';target.textContent=input.type==='text'?'隐藏':'显示';return true;}
 if(act==='rental-import-reveal'){const input=document.getElementById(target.dataset.target);if(!input)return true;input.type=input.type==='password'?'text':'password';target.textContent=input.type==='text'?'隐藏':'显示';return true;}
 if(act==='rental-copy'){const lease=rentalLeaseById(target.dataset.id);if(!lease)return true;const value=target.dataset.kind==='password'?lease.password:lease.loginAccount;if(!value)return toast('这项资料还没有填写',true);await api.copySecret(value);toast('已复制；30 秒后轻场会清除剪贴板');return true;}
 if(act==='rental-copy-order'){const lease=rentalLeaseById(accountModal?.rentalLeaseId||$('#m-order-rental')?.value);await copyRentalLogin(lease);return true;}
 if(act==='rental-use'){const lease=rentalLeaseById(target.dataset.id);if(lease)openRentalForOrder(lease);return true;}
 if(act==='rental-preview'){openRentalPreview(target.dataset.id,target.dataset.order||'');return true;}
 if(act==='rental-link-segment'){openRentalLinkSegment(target.dataset.order,target.dataset.segment);return true;}
 if(act==='rental-open-order'){await rentalOpenOrder(target.dataset.order);return true;}
 if(act==='rental-return'){
  const lease=rentalLeaseById(target.dataset.id);if(!lease)return true;const status=QingchangRentalModel.status(state,lease);
  if(status.key==='in-use')return toast('这个账号正在订单中使用，请先换号或结束订单，再登记归还',true);
  if(!confirm('确认已经在租号渠道完成归还？轻场只登记状态，不会替你向租号平台退号，也不会改动订单账目。'))return true;
  const next=structuredClone(state),item=next.rentalLeases.find(x=>x.id===lease.id);item.returnedAt=safeNow();item.updatedAt=safeNow();next.demo=false;await commitState(next);render();toast('已登记归还；历史记录和旧账目保留');return true;
 }
 if(act==='rental-unreturn'){
  const lease=rentalLeaseById(target.dataset.id);if(!lease)return true;const next=structuredClone(state),item=next.rentalLeases.find(x=>x.id===lease.id);item.returnedAt='';item.archivedAt='';item.updatedAt=safeNow();next.demo=false;await commitState(next);render();toast('已恢复为可查看和使用的租号资料');return true;
 }
 if(act==='rental-clear-password'){
  const lease=rentalLeaseById(target.dataset.id);if(!lease)return true;if(!confirm('清除已保存的密码？历史订单和结算金额不会改变，但之后需要重新补密码才能登录。'))return true;
  const next=structuredClone(state),item=next.rentalLeases.find(x=>x.id===lease.id);item.password='';item.passwordClearedAt=safeNow();item.updatedAt=safeNow();next.demo=false;await commitState(next);render();toast('密码已清除，历史账目仍可阅读');return true;
 }
 if(act==='rental-archive'){
  const lease=rentalLeaseById(target.dataset.id);if(!lease)return true;const status=QingchangRentalModel.status(state,lease);
  if(status.key==='in-use')return toast('这个账号正在订单中使用，不能归档',true);
  const referenced=(state.orders||[]).some(order=>(order.segments||[]).some(segment=>segment.rentalLeaseId===lease.id));
  if(referenced){
   if(!confirm('这个账号已有使用记录，将归档并保留历史账目。继续？'))return true;
   const next=structuredClone(state),item=next.rentalLeases.find(x=>x.id===lease.id);item.archivedAt=safeNow();item.updatedAt=safeNow();next.demo=false;await commitState(next);render();toast('租号资料已归档；历史订单和金额保留');return true;
  }
  if(!confirm('这个账号没有被订单引用，也没有使用记录。确定删除这条误录资料？'))return true;
  const next=structuredClone(state);next.rentalLeases=next.rentalLeases.filter(x=>x.id!==lease.id);next.demo=false;await commitState(next);if(rentalSelectedId===lease.id)rentalSelectedId='';render();toast('误录的租号资料已删除');return true;
 }
 return false;
}

function renderAvatar() {
  return `${heading('LIVE PRIVACY ASSISTANT', '直播形象助手', '通过独立直播画面窗口保护水友 ID；按快捷键切换安全场景，不自动识别敏感界面。')}
    <div class="grid two"><section class="card"><div class="card-head"><div><h2>安全直播场景</h2><p>观众看到主播与水友虚拟形象，不显示玩家 ID、房间号或账号信息。</p></div><span class="pill green">本机运行</span></div><div style="height:280px;border-radius:9px;background:#121a2b;display:grid;place-items:center;position:relative;overflow:hidden"><div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 76%,#193664,#101827 70%);opacity:.95"></div><div style="position:relative;display:flex;align-items:end;gap:28px"><div style="text-align:center;color:#fff"><div style="width:98px;height:122px;border-radius:50% 50% 10px 10px;background:#426891;display:grid;place-items:center;font-size:45px">主播</div><small>主播形象</small></div><div style="text-align:center;color:#fff"><div style="width:86px;height:105px;border-radius:50% 50% 10px 10px;background:#45637b;display:grid;place-items:center;font-size:38px">队友</div><small>水友形象</small></div></div><span style="position:absolute;top:14px;left:15px;color:#94b8ff;font-size:10px;letter-spacing:.12em">轻场 · 隐私安全场景</span></div><div style="display:flex;gap:8px;margin-top:13px;flex-wrap:wrap"><button class="btn primary" data-act="avatar-open">打开形象助手</button><button class="btn" data-act="avatar-output">打开安全直播画面</button><button class="btn" data-act="avatar-output-close">关闭安全直播画面</button><span class="metric-note" style="align-self:center">输出窗口聚焦时也可按 Esc 退出</span></div><div class="notice" style="margin-top:14px">抖音直播伴侣：在场景切换中设置直播伴侣自己的快捷键，再在直播伴侣里捕获“安全直播画面”窗口。轻场不读取游戏界面，不自动判断玩家 ID。</div></section><section class="card"><div class="card-head"><div><h2>声音识别与隐私</h2><p>在本机识别主播与水友的声音，驱动角色开口。</p></div></div><div class="sub-card"><h3>主播声音</h3><p style="font-size:11px;color:#8e9bad;line-height:1.7">可在形象助手中录入主播声纹。主播讲话时切换主播形象；电脑音频识别到其他人声时切换水友或搭档形象。</p></div><div class="sub-card" style="margin-top:10px"><h3>快捷键切换</h3><p style="font-size:11px;color:#8e9bad;line-height:1.7">切入安全场景、退出回到正常游戏画面由你手动操作。请将快捷键也设置在直播伴侣或 OBS 场景切换中。</p></div><div class="notice green" style="margin-top:12px">语音模型与声纹配置在本机运行，本软件不上传录音。</div><div class="field" style="margin-top:14px"><label>打开现有形象助手</label><div class="metric-note">进入统一的形象助手控制界面，设置声音来源、录入声纹并预览角色动作。</div></div></section></div>`;
}

function renderHighlights() {
  const H=window.QingchangHighlights;H.migrate(state);const session=H.selected(state),clips=session?H.clipsFor(state,session.id):[],total=H.duration(session),running=state.stream.active;
  const sessions=[...state.streamSessions].sort((a,b)=>Date.parse(b.startedAt||0)-Date.parse(a.startedAt||0));
  const headingHtml=heading('HIGHLIGHT TIMELINE','精彩时刻','每场直播独立保存时间节点；不录制、不裁切视频，可导出给剪辑。',`<button class="btn ${running?'':'primary'}" data-act="stream-toggle">${running?'结束本场计时':'开始新场次'}</button><button class="btn" data-act="clip-marker" ${running?'':'disabled'}>标记当前直播</button><button class="btn" data-nav="settings">设置快捷键</button>`);
  if(!session)return `${headingHtml}<section class="card empty"><b>还没有直播场次</b><p>点击“开始新场次”，之后按快捷键标记精彩操作。</p></section>`;
  const axisTotal=Math.max(1,total??Math.max(0,...clips.map(c=>H.range(c,session).end)));
  const axis=clips.map(c=>{const r=H.range(c,session);return `<button class="highlight-axis-marker" data-act="focus-clip" data-id="${esc(c.id)}" style="left:${Math.min(100,r.mark/axisTotal*100)}%" title="${esc(c.title)} · 直播时间 ${duration(r.mark)} · 按键时间 ${new Date(c.at).toLocaleString('zh-CN',{hour12:false})}" aria-label="${esc(c.title)} ${duration(r.mark)}"><span class="highlight-hover-tip">直播时间 ${duration(r.mark)}<br>按键时间 ${new Date(c.at).toLocaleString('zh-CN',{hour12:false})}</span></button>`;}).join('');
  return `${headingHtml}<section class="card highlight-session-card"><div class="highlight-session-toolbar"><label>直播场次<select class="select" data-highlight-session>${sessions.map(x=>`<option value="${esc(x.id)}" ${x.id===session.id?'selected':''}>${esc(x.title)}${x.active?' · 计时中':''}</option>`).join('')}</select></label><button class="btn" data-act="rename-session">重命名</button><div class="highlight-export"><select class="select" id="highlight-export-format" aria-label="导出格式"><option value="txt">时间清单 TXT</option><option value="csv">表格 CSV</option><option value="json">完整 JSON</option></select><button class="btn primary" data-act="export-highlights" ${clips.length?'':'disabled'}>导出本场标记</button></div></div><div class="highlight-session-meta"><span class="pill ${session.active?'green':'blue'}">${session.active?'计时中':session.endedAt?'已结束':'历史记录'}</span><span>开播 ${session.startedAt?stamp(session.startedAt):'未知'}</span><span>下播 ${session.endedAt?stamp(session.endedAt):session.active?'尚未下播':'结束时间未知'}</span><strong ${session.active?'data-live-clock':''}>${total===null?'时长未知':duration(total)}</strong><span>${clips.length} 个标记</span></div>${session.legacy&&!session.endedAt?'<p class="optimize-help">旧标记已保留。历史场次没有下播记录，导出区间按标记前后各 5 分钟计算。</p>':''}</section><section class="card highlight-timeline-card"><div class="card-head"><div><h2>本场时间轴</h2><p>保留按键的确切时间；已结束的场次会将区间截到实际下播时间。</p></div></div><div class="highlight-axis"><div class="highlight-axis-labels"><span>00:00:00</span><span>${total===null?'历史时间范围':duration(total)}</span></div><div class="highlight-axis-line">${axis}</div></div>${clips.length?clips.map(c=>{const r=H.range(c,session);return `<article class="clip-item" id="clip-${esc(c.id)}"><div class="clip-time">${duration(r.mark)}</div><div class="clip-desc"><b>${esc(c.title||'精彩操作')}</b><span>按键时间 ${new Date(c.at).toLocaleString('zh-CN',{hour12:false})} · ${esc(c.map||'地图未填写')}</span><span>区间 ${duration(r.start)} — ${duration(r.end)}</span>${c.note?`<p>${esc(c.note)}</p>`:''}</div><button class="btn sm" data-act="copy-clip-time" data-id="${esc(c.id)}">复制时间节点</button><button class="btn sm" data-act="edit-clip" data-id="${esc(c.id)}">编辑</button><button class="btn sm quiet" data-act="delete-clip" data-id="${esc(c.id)}">删除</button></article>`;}).join(''):'<div class="empty"><b>本场还没有标记</b><p>开播后按精彩时刻快捷键即可记录。</p></div>'}</section>`;
}

function renderTitles() {
  ensureTitleSettings(state.settings.title);
  return renderTitleEditor(state.settings.title);
}
function renderSetup() {
  const s = state.settings.setup;
  const tabs=`<div class="optimization-tabs" role="tablist" aria-label="开播检查工具">${[['plan','开播方案'],['filters','直播画面滤镜'],['sound','声音诊断'],['network','网络诊断']].map(([key,label])=>`<button class="optimization-tab ${setupToolTab===key?'is-active':''}" role="tab" aria-selected="${setupToolTab===key}" data-act="preflight-tab" data-tool="${key}">${label}</button>`).join('')}</div>`;
  if(setupToolTab==='filters')return `${heading('STREAM FILTER','直播画面滤镜','预览并导出调色文件，由直播伴侣应用到游戏素材。')}${streamFilterPage.render()}`;
  if(setupToolTab!=='plan')return preflightPage.render(setupToolTab);
  const restoreAction = s.obsBackup ? `<button class="btn" data-act="restore-obs">恢复备份的 OBS 画质</button>` : '';
  return `${heading('STREAM SETUP & FILTERS', '开播方案', '读取本机配置与网络建议，按所用直播软件核对推流设置。', restoreAction)}
    <div class="grid two">
      <section class="card">
        <div class="card-head"><div><h2>开播前检查</h2><p>硬件信息本机读取；测速需手动点击并向 Cloudflare 发送测试数据。</p></div><button class="btn" data-act="speed-test">测速上行</button></div>
        <div class="grid half" id="system-info">
          <div class="metric"><div class="metric-label">处理器逻辑核心</div><div class="metric-value" style="font-size:19px" data-hw="cpu">读取中</div></div>
          <div class="metric"><div class="metric-label">内存</div><div class="metric-value" style="font-size:19px" data-hw="memory">读取中</div></div>
        </div>
        <div class="notice${QingchangPreflightModel.uploadAssessment(s.lastUploadMbps,s.lastUploadAt).level==='green' ? ' green' : s.lastUploadMbps ? ' warn' : ''}" style="margin-top:12px" data-speed-status>${s.lastUploadMbps ? `<strong>${esc(QingchangPreflightModel.uploadAssessment(s.lastUploadMbps,s.lastUploadAt).title)}</strong><br>${esc(QingchangPreflightModel.uploadAssessment(s.lastUploadMbps,s.lastUploadAt).detail)} 最近一次下载约 ${Number(s.lastDownloadMbps || 0).toFixed(1)} Mbps。` : '点击“测速上行”后运行一次测试；测速期间不发送账号、截图或其他产品数据。测速服务会看到这次请求的公网 IP。'}</div>
        <div class="field" style="margin-top:15px"><label>推流方式</label><select data-setup="mode"><option value="douyin" ${s.mode==='douyin'?'selected':''}>抖音直播伴侣</option><option value="obs" ${s.mode==='obs'?'selected':''}>OBS Studio</option></select></div>
        <div class="field" style="margin-top:12px"><label>电脑与网络档位</label><select data-setup="profile"><option value="stable" ${s.profile==='stable'?'selected':''}>稳定优先 · 720p / 30 FPS</option><option value="balanced" ${s.profile==='balanced'?'selected':''}>流畅均衡 · 1080p / 60 FPS（建议实测）</option><option value="quality" ${s.profile==='quality'?'selected':''}>画质优先 · 1080p / 60 FPS（需较强硬件）</option></select></div>
        <div id="obs-config" class="${s.mode==='obs'?'':'hidden'}">
          <div class="grid half" style="margin-top:12px"><div class="field"><label>OBS WebSocket 地址</label><input data-setup="obsUrl" value="${esc(s.obsUrl || 'ws://127.0.0.1:4455')}"></div><div class="field"><label>OBS WebSocket 密码</label><input type="password" data-setup="obsPassword" value="${esc(s.obsPassword || '')}" placeholder="本机加密保存"></div></div>
          <div style="display:flex;gap:8px;margin-top:10px"><button class="btn" data-act="obs-connect">连接 OBS</button><span class="pill" data-obs-status>${obsReady?'已连接':'尚未连接'}</span></div>
        </div>
        <div id="douyin-plan" class="${s.mode==='douyin'?'':'hidden'} notice" style="margin-top:12px"><strong>抖音直播伴侣方案</strong><br>轻场提供分辨率、帧率、码率参考与操作步骤；场景切换和安全画面快捷键在直播伴侣内设置。</div>
        <div style="margin-top:13px"><button class="btn primary" data-act="apply-setup">${s.mode==='obs'?'备份当前画质并应用轻场方案':'查看直播伴侣设置清单'}</button></div>
      </section>
${s.mode==='douyin'?`<section class="card"><div class="card-head"><div><h2>直播画面滤镜</h2><p>先选预设或手动调色，再导出 LUT，由直播伴侣应用到游戏素材。</p></div></div><button class="btn primary" data-act="preflight-tab" data-tool="filters">打开滤镜编辑器</button><p class="workflow-note">支持原图对比、亮度、对比度、白平衡、阴影高光和分色调整。</p></section>`:`      <section class="card">
        <div class="card-head"><div><h2>游戏画面滤镜</h2><p>设置会作用于游戏采集源，不会覆盖标题或虚拟形象。</p></div></div>
        <div class="grid half">${FILTERS.map(f=>`<div class="filter-card ${s.filter===f.id?'selected':''}" data-filter="${f.id}"><b style="font-size:12px">${f.title}</b><div class="filter-swatch ${f.cls}"></div><span style="font-size:10px;color:#95a2b0">${f.desc}</span></div>`).join('')}</div>
        <div class="field" style="margin-top:14px"><label>将滤镜应用到 OBS 游戏采集源</label><div class="grid half"><select id="obs-scene"><option>先连接 OBS 读取场景</option></select><select id="obs-source"><option>选择游戏采集源</option></select></div><button class="btn" style="margin-top:9px" data-act="apply-filter">应用所选滤镜</button><small>OBS 连接后读取当前来源；若来源类型或滤镜接口不支持，轻场会显示错误，不会静默修改。</small></div>
      </section>`}
    </div>
    <section class="card" style="margin-top:15px"><div class="card-head"><div><h2>当前设置方案</h2><p>方案是建议起点，开播前先确认平台支持、网络速度和实际画面。</p></div><span class="pill blue">${s.mode==='obs'?'OBS Studio':'抖音直播伴侣'}</span></div>${renderSetupPlan()}</section>`;
}
function renderSetupPlan() { const p=state.settings.setup.profile;const up=Number(state.settings.setup.lastUploadMbps)||0;const cap=p==='stable'?3500:p==='quality'?8000:6000;const rate=up?`建议不高于 ${Math.min(cap,Math.floor(up*600))} Kbps`:'测速后显示建议';const conf=p==='stable'?['1280 × 720','30 FPS','H.264 软/硬件编码',rate]:p==='quality'?['1920 × 1080','60 FPS','优先硬件编码',rate]:['1920 × 1080','60 FPS','优先可用硬件编码',rate];return `<div class="grid four">${conf.map((x,i)=>`<div class="sub-card"><span class="metric-note">${['输出分辨率','帧率','编码建议','网络建议'][i]}</span><h3 style="margin:7px 0 0">${x}</h3></div>`).join('')}</div>`; }

function renderOptimizationLegacy() {
  const streamer = state.role === '主播';
  const liveMonitor=state.settings.optimization?.liveMonitor||'douyin';
  const liveMonitorControl=streamer?`<label class="live-monitor-select">直播软件<select class="select" data-live-monitor ${optimizationSampling?'disabled':''}><option value="douyin" ${liveMonitor==='douyin'?'selected':''}>抖音直播伴侣</option><option value="obs" ${liveMonitor==='obs'?'selected':''}>OBS Studio</option></select></label>`:'';
  const info = optimizationInfo;
  const nvidia = state.settings.optimization || {};
  const nvidiaPreset = nvidia.nvidiaPreset || (streamer ? 'clarity' : 'performance');
  const nvidiaModel = nvidia.nvidiaModel || (streamer ? 'K' : 'C');
  const nvidiaGame = nvidia.nvidiaGame || info?.gamePath || '';
  const backup = state.settings.optimization?.previousPowerGuid;
  const powerLabel = !info ? '正在读取' : info.highPerformance ? '高性能' : info.powerGuid === '381b4222-f694-41f0-9685-ff5bb260df2e' ? '平衡' : '自定义 / 其他方案';
  const gameItems = streamer ? [
    ['fps', '游戏帧率', '把帧率上限设在电脑能稳定维持的区间，给推流编码留出余量。开播时检查游戏与直播伴侣或 OBS 是否同时掉帧。'],
    ['clarity', '画面清晰度', '先在游戏内选择目标分辨率，再比较原生画质与游戏自带的超分模式；以直播回看中的文字和暗部细节为准。'],
    ['stream', '开播前试播', '进入实际对局做一次短时试播，再按上行网速调整推流码率。直播输出滤镜仍在“开播设置与滤镜”中配置。']
  ] : [
    ['fps', '刷新率与帧率', '在 Windows 和游戏里确认显示器刷新率一致。帧率上限以稳定帧时间为准，避免只追求瞬时峰值。'],
    ['input', '输入与画面', '在游戏设置中比较低延迟选项、动态模糊开关和超分画质；每次只改一项，进入同一场景观察变化。'],
    ['check', '对局前检查', '关闭不需要的录屏和后台重负载程序；若温度或帧率异常，先确认散热与驱动状态。']
  ];
  const memoryTip = info && info.memoryGb < 16 ? `检测到 ${info.memoryGb} GB 内存；游戏和推流同时运行时，建议先关闭不必要的后台程序。` : '检测结果只用来生成本机建议，不上传硬件资料。';
  const tweakBackup = state.settings.optimization?.tweakBackup || {};
  const hasOptimizationBackup = Boolean(backup || Object.keys(tweakBackup).length);
  const tweakRow = (key, title, detail, active, ids, admin = false) => {
    const saved = ids.some(id => tweakBackup[id]);
    const unavailable = !info || (admin && !info.elevated);
    return `<div class="optimize-item"><div class="optimize-item-head"><b>${title}</b><span class="pill ${active ? 'green' : ''}">${!info ? '读取中' : active ? '已生效' : '未启用'}</span></div><p>${detail}</p><div class="optimize-actions">${!active ? `<button class="btn sm primary" data-act="apply-opt-tweak" data-id="${key}" ${unavailable ? 'disabled' : ''}>应用并校验</button>` : ''}${saved ? `<button class="btn sm" data-act="restore-opt-tweak" data-id="${key}" ${unavailable ? 'disabled' : ''}>恢复原设置</button>` : active ? '<span class="pill green">已由系统设置</span>' : ''}${admin && !info?.elevated ? '<span class="metric-note">需以管理员身份打开轻场</span>' : ''}</div></div>`;
  };
  const activeTweak = id => { const value = ({ mouseSpeed:'0', mouseThreshold1:'0', mouseThreshold2:'0', keyboardDelay:'0', keyboardSpeed:'31', startupDelay:0, windowAnimation:'0', lastAccess:0x80000003, shortNames:1, nvmeMemory:1, nvmeLog:0, nvmeIdle:0 })[id]; return info?.tweaks?.[id]?.value === value && info?.tweaks?.[id]?.type === (typeof value === 'string' ? 'REG_SZ' : 'REG_DWORD'); };
  const diag = optimizationDiagnosis;
  const preflightHtml = `<div class="optimization-preflight"><div class="preflight-row"><b>游戏</b><span>${streamer ? '启动三角洲并进入实际对局，让游戏持续运行。' : '进入常玩的对局场景，保持平时使用的画质设置。'}</span></div><div class="preflight-row"><b>${streamer ? '直播' : '采样'}</b><span>${streamer ? (liveMonitor==='douyin'?'打开直播伴侣；推流统计需要当前实际推流产生的新记录。':'打开 OBS 并保持预览；读取跳帧前先连接 OBS。') : '检查时保持游戏在前台，避免切换窗口影响负载。'}</span></div><div class="preflight-row"><b>检查结果</b><span>${streamer ? (liveMonitor==='douyin'?'读取本机推流帧率、编码输入帧率和码率；缺失指标单独标注。':'显示硬件负载，并读取 OBS 渲染与输出跳帧。') : '显示 CPU、内存和显卡负载，并尝试读取温度；游戏 FPS 以游戏内计数器为准。'}</span></div></div>`;
  return `${heading('GAME & PC', '游戏与电脑优化', streamer ? '主播版：先检查游戏与推流能否稳定并行。' : '陪玩版：先检查实际对局的帧率与响应。', '<button class="btn" data-act="refresh-optimization">重新检测</button>')}
    <div class="optimization-tabs" role="tablist" aria-label="优化设置分类">
      ${[['overview','检测与方案'],['comparison','优化对比'],['nvidia','显卡与 DLSS'],['maintenance','后台与维护'],['advanced','更多系统设置']].map(([key,label])=>`<button type="button" role="tab" class="optimization-tab ${optimizationTab===key?'is-active':''}" aria-selected="${optimizationTab===key}" data-act="optimization-tab" data-tab="${key}">${label}</button>`).join('')}
    </div>
    <div class="optimization-panel" role="tabpanel" ${optimizationTab==='overview'?'':'hidden'}>
    <section class="card optimize-overview" style="margin-top:16px"><div class="card-head"><div><h2>这台电脑</h2><p>读取 Windows 硬件与当前电源计划；不会修改游戏文件。</p></div><span class="pill blue">本机检测</span></div>
      ${optimizationError ? `<div class="notice warn">${esc(optimizationError)}</div>` : ''}
      <div class="grid four"><div class="metric"><div class="metric-label">处理器</div><div class="optimize-value">${esc(info?.cpu || '读取中…')}</div><div class="metric-note">${info ? `${info.cpuCores} 个逻辑核心` : ''}</div></div><div class="metric"><div class="metric-label">显卡</div><div class="optimize-value">${esc(info?.gpus?.join(' / ') || (info ? '未识别' : '读取中…'))}</div></div><div class="metric"><div class="metric-label">内存</div><div class="optimize-value">${info ? `${info.memoryGb} GB` : '读取中…'}</div></div><div class="metric"><div class="metric-label">当前电源计划</div><div class="optimize-value">${powerLabel}</div></div></div>
      <p class="optimize-help">${esc(memoryTip)}</p></section>
    <section class="card" style="margin-top:16px"><div class="card-head"><div><h2>${streamer ? '主播稳播方案' : '陪玩高帧方案'}</h2><p>${streamer ? '先做游戏与推流并行检查；方案仅启用游戏模式并关闭 Windows 重复录屏，不改动显卡全局配置。' : '先做实际对局检查；方案启用游戏模式、关闭 Windows 后台录屏，并切换 Windows 高性能电源计划。'}</p></div><span class="pill blue">逐项备份 · 可恢复</span></div><div class="optimize-actions"><button class="btn primary" data-act="apply-role-optimization" ${!info || optimizationSampling || optimizationApplying ? 'disabled' : ''}>${optimizationApplying ? '正在应用…' : `应用${streamer ? '主播稳播' : '陪玩高帧'}方案`}</button>${hasOptimizationBackup ? `<button class="btn" data-act="restore-all-optimization" ${optimizationApplying ? 'disabled' : ''}>恢复轻场修改的系统设置</button>` : ''}</div><p class="optimize-help">鼠标、键盘和存储驱动等选项会改变个人操作习惯或系统行为，请在下方按需单独应用。</p></section>
    <section class="card stability-card"><div class="card-head"><div><h2>${streamer ? '游戏与推流稳定性' : '高帧率运行检查'}</h2><p>${streamer ? '先启动游戏与所选直播软件，再运行负载检查；读取该软件对应的本机统计。' : '进入实际对局后运行 12 秒检查，观察 CPU、显卡、显存和温度。实际游戏 FPS 仍以游戏内计数器为准。'}</p>${liveMonitorControl}</div></div>${diag ? '' : preflightHtml}<button class="btn primary" data-act="sample-optimization" ${optimizationSampling ? 'disabled' : ''}>${optimizationSampling ? '正在采样…' : '开始 12 秒检查'}</button>${diag ? `<div class="grid four stability-results"><div class="metric"><div class="metric-label">CPU 峰值</div><strong>${diag.cpuMax ?? '—'}%</strong></div><div class="metric"><div class="metric-label">内存峰值</div><strong>${diag.memoryMax}%</strong></div><div class="metric"><div class="metric-label">显卡负载峰值</div><strong>${diag.gpuMax == null ? '未取得' : `${diag.gpuMax}%`}</strong></div><div class="metric"><div class="metric-label">显卡温度峰值</div><strong>${diag.tempMax == null ? '未取得' : `${diag.tempMax}°C`}</strong></div></div>${diag.mate?renderMateDiagnosis(diag.mate):''}${diag.obs ? `<div class="notice" style="margin-top:12px">OBS：渲染跳帧 ${diag.obs.renderSkipped} 帧，编码跳帧 ${diag.obs.outputSkipped} 帧；末次帧率 ${diag.obs.fps} FPS。${diag.obs.renderSkipped || diag.obs.outputSkipped ? '建议降低游戏帧率上限或推流负载后重测。' : '本次采样未发现 OBS 跳帧。'}</div>` : streamer && liveMonitor==='obs' ? '<p class="optimize-help">未取得 OBS 数据，请先在开播设置中连接 OBS。</p>' : ''}<p class="optimize-help">${diag.memoryMax >= 90 ? '内存接近满载，建议先关闭不必要的后台程序。' : diag.gpuMax >= 95 && streamer ? '显卡负载接近满载，建议为推流编码留余量。' : '建议在相同对局场景下应用一项设置、重测一次。'}</p>` : ''}</section>
    <div class="optimization-settings-flow"><div class="optimization-settings-main">    <section class="card"><div class="card-head"><div><h2>${streamer ? '游戏与直播设置' : '游戏画面与响应'}</h2><p>按下面的顺序在游戏内检查，每改一项就对比一次实际画面和帧率。</p></div></div><div class="optimize-list">${gameItems.map(([key, title, detail]) => { const checked = Boolean(state.settings.optimization?.checks?.[state.role]?.[key]); return `<div class="optimize-item"><div class="optimize-item-head"><b>${title}</b><button class="btn sm ${checked ? 'primary' : ''}" data-act="toggle-opt-check" data-id="${key}" aria-pressed="${checked}">${checked ? '已检查' : '标记已检查'}</button></div><p>${detail}</p></div>`; }).join('')}</div>${streamer ? '<button class="btn" data-nav="setup">去开播设置与滤镜</button>' : ''}</section>
</div><div class="optimization-settings-side">    <section class="card"><div class="card-head"><div><h2>可恢复的系统优化</h2><p>每项先保存本机原值，应用后回读校验。Windows 设置不会改动游戏文件。</p></div></div><div class="optimize-list">${tweakRow('gameMode', 'Windows 游戏模式', '让 Windows 优先处理游戏负载；主播与陪玩都建议先启用。', info?.tweaks?.gameMode?.value === 1, ['gameMode'])}${tweakRow('capture', '关闭 Windows 后台游戏捕获', '减少重复录屏占用；使用 OBS 或直播伴侣录制时可考虑启用。此项会同时关闭 Windows 游戏录制入口。', info?.tweaks?.backgroundCapture?.value === 0 && info?.tweaks?.appCapture?.value === 0, ['backgroundCapture','appCapture'])}</div></section>      <section class="card"><div class="card-head"><div><h2>Windows 电源计划</h2><p>切换前会记住原方案；可以从这里恢复。</p></div></div><div class="optimize-power"><div><span>当前方案</span><strong>${powerLabel}</strong></div><div><span>轻场可应用</span><strong>Windows 高性能</strong></div></div><div class="notice">高性能计划可能提高耗电与发热。请在插电状态下观察实际帧率和温度；如果没有改善，可恢复原方案。</div><div class="optimize-actions">${info && !info.highPerformance ? '<button class="btn primary" data-act="apply-performance-power">启用高性能计划</button>' : ''}${backup && info?.highPerformance ? '<button class="btn" data-act="restore-performance-power">恢复原电源计划</button>' : ''}${info?.highPerformance && !backup ? '<span class="pill green">已经使用高性能计划</span>' : ''}</div></section></div></div>
    </div>
    <div class="optimization-panel" role="tabpanel" ${optimizationTab==='advanced'?'':'hidden'}>
    <div class="grid two optimize-columns" style="margin-top:16px"><section class="card"><div class="card-head"><div><h2>鼠标与键盘</h2><p>输入行为会影响操作习惯，分别选择是否应用。</p></div></div><div class="optimize-list">${tweakRow('mouse', '关闭 Windows 指针加速', '仅调整系统鼠标曲线，不改变鼠标硬件 DPI；游戏若使用原始输入，效果取决于游戏。', ['mouseSpeed','mouseThreshold1','mouseThreshold2'].every(activeTweak), ['mouseSpeed','mouseThreshold1','mouseThreshold2'])}${tweakRow('keyboard', '缩短键盘重复延迟', '调整按住按键后的重复速度；不会提高游戏设备的轮询率。', ['keyboardDelay','keyboardSpeed'].every(activeTweak), ['keyboardDelay','keyboardSpeed'])}</div></section>
    <section class="card"><div class="card-head"><div><h2>系统细项</h2><p>每项独立应用、独立恢复；请按实际用途选择。</p></div></div>${info && !info.elevated ? '<button class="btn sm" data-act="elevate-qingchang">请求管理员权限以修改系统项</button>' : ''}<div class="optimize-list">${tweakRow('startup', '关闭开机启动延迟', '影响登录后程序启动顺序，不是对局帧率设置。', activeTweak('startupDelay'), ['startupDelay'])}${tweakRow('animation', '关闭窗口最小化动画', '影响 Windows 桌面动画，重新登录后可能才完全生效。', activeTweak('windowAnimation'), ['windowAnimation'])}${tweakRow('lastAccess', '关闭 NTFS 最后访问更新', '文件系统设置；需管理员权限，通常需重启后生效。', activeTweak('lastAccess'), ['lastAccess'], true)}${tweakRow('shortNames', '关闭 8.3 短文件名创建', '文件系统设置；需管理员权限，可能影响依赖短文件名的旧程序。', activeTweak('shortNames'), ['shortNames'], true)}${tweakRow('nvme', 'NVMe 参数', '修改三项存储驱动参数；仅在使用 Windows NVMe 驱动时考虑。需管理员权限及重启。', ['nvmeMemory','nvmeLog','nvmeIdle'].every(activeTweak), ['nvmeMemory','nvmeLog','nvmeIdle'], true)}</div></section></div>
    ${streamer ? '' : `<section class="card" style="margin-top:16px"><div class="card-head"><div><h2>实际帧率对比</h2><p>在同一张地图、同一画质和同一场景里，分别读取游戏内平均 FPS，再记录优化前后数值。</p></div></div><div class="grid two"><label>优化前 FPS<input type="number" min="1" max="1000" step="1" data-fps="before" value="${esc(state.settings.optimization?.fpsBefore || '')}"></label><label>优化后 FPS<input type="number" min="1" max="1000" step="1" data-fps="after" value="${esc(state.settings.optimization?.fpsAfter || '')}"></label></div><div class="optimize-actions" style="margin-top:14px"><button class="btn primary" data-act="save-fps-comparison">保存对比</button>${Number(state.settings.optimization?.fpsBefore) > 0 && Number(state.settings.optimization?.fpsAfter) > 0 ? `<span class="pill blue">${Number(state.settings.optimization.fpsAfter) - Number(state.settings.optimization.fpsBefore) >= 0 ? '+' : ''}${Number(state.settings.optimization.fpsAfter) - Number(state.settings.optimization.fpsBefore)} FPS</span>` : ''}</div></section>`}
    </div>
    <div class="optimization-panel" role="tabpanel" ${optimizationTab==='nvidia'?'':'hidden'}>
    <div class="nvidia-workspace">
    <section class="card" id="nvidia-config" style="margin-top:16px"><div class="card-head"><div><h2>NVIDIA 驱动与 DLSS</h2><p>根据所选方案生成驱动配置，并在 NVIDIA Profile Inspector 中确认导入。</p></div><span class="pill blue">配置导入</span></div>
      <div class="nvidia-settings-grid"><div class="nvidia-field"><label class="field-label" for="nvidia-preset">驱动方案</label><select class="select" id="nvidia-preset" data-nvidia-field="preset"><option value="clarity" ${nvidiaPreset==='clarity'?'selected':''}>清晰流畅 · 主播</option><option value="performance" ${nvidiaPreset==='performance'?'selected':''}>性能优先 · 陪玩</option></select></div><div class="nvidia-field"><label class="field-label" for="nvidia-model">DLSS 超分辨率模型</label><select class="select" id="nvidia-model" data-nvidia-field="model"><option value="K" ${nvidiaModel==='K'?'selected':''}>K 模型</option><option value="C" ${nvidiaModel==='C'?'selected':''}>C 模型</option><option value="off" ${nvidiaModel==='off'?'selected':''}>关闭驱动模型覆盖</option></select></div></div>
      <div class="nvidia-game-row"><div class="nvidia-game-path"><span>游戏程序</span><strong>${nvidiaGame ? esc(nvidiaGame) : '尚未选择游戏程序'}</strong></div><button class="btn sm" data-act="select-nvidia-game">选择游戏程序</button></div>
      <div class="notice" style="margin-top:14px">驱动方案写入 NVIDIA 全局配置；DLSS 模型只绑定所选游戏程序。导入前会导出当前已自定义的驱动配置。游戏是否使用所选模型，请在 NVIDIA 叠加层的 DLSS 统计信息中确认。</div>
      <div class="optimize-actions" style="margin-top:14px"><button class="btn primary" data-act="prepare-nvidia" ${!nvidiaGame || !info ? 'disabled' : ''}>生成配置并备份</button>${nvidia.nvidiaPending?.file ? '<button class="btn primary" data-act="import-nvidia">导入已生成配置</button>' : ''}<button class="btn" data-act="open-nvidia-app">打开 NVIDIA App</button>${nvidia.nvidiaBackup ? '<button class="btn" data-act="open-nvidia-backup">定位原配置备份</button>' : ''}</div>
      ${nvidia.nvidiaPending?.file ? '<p class="optimize-help">配置文件已生成。点击“导入”会通过 NVIDIA Profile Inspector 写入驱动；导入后仍需在游戏里确认模型是否生效。</p>' : ''}</section>
    <details class="card nvidia-secondary" id="gpu-name-config" ${nvidia.gpuSpoofBackup?'open':''}><summary><span><b>显卡名称改写</b><small>独立的设备名称设置 · 需要管理员权限</small></span><span class="pill">${nvidia.gpuSpoofApplied?'已写入':'展开设置'}</span></summary><div class="nvidia-secondary-body"><p>将 Windows 中 NVIDIA 显卡的显示名称改为 GTX 1050 Ti；原始名称先加密保存，重启后检查。</p>
      <div class="notice">这项操作只改设备和驱动的名称字段，不改变真实显卡型号、显存或性能，也无法保证游戏会按此名称识别显卡。请勿把它当作提帧方案。</div>
      <div class="optimize-actions" style="margin-top:14px">${nvidia.gpuSpoofBackup ? '<button class="btn" data-act="restore-gpu-spoof">恢复原始显卡名称</button>' : '<button class="btn" data-act="apply-gpu-spoof" '+(!info?.elevated?'disabled':'')+'>改写为 GTX 1050 Ti</button>'}${!info?.elevated ? '<button class="btn sm" data-act="elevate-qingchang">以管理员身份重新打开</button>' : ''}${nvidia.gpuSpoofApplied ? '<span class="pill blue">已写入 · 重启后检查</span>' : ''}</div></div></details>
    </div>
    </div>${optimizationTab==='comparison' ? performancePage?.render()||'' : ''}${optimizationTab==='maintenance' ? renderMaintenance() : ''}`;
}

function renderOptimization(){if(optimizationEntry==='monitor'&&optimizationTab==='overview')return QingchangToolPages.monitor(renderMonitorControls(),state.role,{...monitorStatus,busy:monitorBusy});const key=optimizationTab==='overview'?'optimize':optimizationTab;return QingchangToolPages.optimization(renderOptimizationLegacy(),key,{state,info:optimizationInfo});}
function renderMaintenance() {
  const s=maintenanceStatus, config=s?.config||{enabled:false,threshold:85,names:[]};
  const resource=s?.resource||{active:false,count:0,records:[]};
  const disabled=maintenanceBusy?'disabled':'';
  const groups=new Map();
  for(const x of maintenanceProcesses){const key=x.name.toLowerCase();const row=groups.get(key)||{name:x.name,count:0,memoryMb:0};row.count++;row.memoryMb+=x.memoryMb;groups.set(key,row);}
  for(const name of config.names)if(!groups.has(name))groups.set(name,{name,count:0,memoryMb:0});
  const rows=[...groups.values()].sort((a,b)=>Number(config.names.includes(b.name.toLowerCase()))-Number(config.names.includes(a.name.toLowerCase()))||b.memoryMb-a.memoryMb);
  const runningNames=new Set(resource.records.map(x=>x.name.toLowerCase()));
  const history=s?.history||[];
  const error=maintenanceError?`<div class="notice warn" role="alert">${esc(maintenanceError)}</div>`:'';
  const navigation=`<div class="maintenance-nav" aria-label="维护工具"><div>${[['background','后台程序'],['cache','游戏缓存'],['history','操作记录']].map(([key,label])=>`<button class="maintenance-nav-item ${maintenanceView===key?'selected':''}" data-act="maintenance-view" data-view="${key}">${label}</button>`).join('')}</div><span>设置与恢复记录均保存在本机</span></div>`;
  let content='';
  if(maintenanceView==='background')content=`<section class="card background-workspace"><div class="background-heading"><div><h2>把资源留给${state.role==='主播'?'游戏和推流':'游戏'}</h2><p>勾选后台程序，再选择资源让位或内存清理。</p></div><button class="btn sm" data-act="refresh-maintenance" ${disabled}>${maintenanceBusy?'读取中…':'刷新程序'}</button></div><div class="background-body"><section class="background-programs"><div class="background-list-head"><b>可选择的后台程序</b><span>已选 ${config.names.length} 项</span></div><div class="background-table-heading"><span>程序 / 进程数</span><span>内存</span><span>状态</span></div><div class="background-program-list">${rows.length?rows.map(x=>`<label class="background-program"><input type="checkbox" data-memory-name="${esc(x.name.toLowerCase())}" ${config.names.includes(x.name.toLowerCase())?'checked':''} ${disabled||resource.count?'disabled':''}><span class="program-name"><b>${esc(x.name)}</b><small>${x.count?x.count+' 个后台进程':'当前未运行'}</small></span><span class="program-memory">${Math.round(x.memoryMb)} MB</span><span class="program-state ${runningNames.has(x.name.toLowerCase())?'active':''}">${runningNames.has(x.name.toLowerCase())?(resource.active?'已让位':'待恢复'):'—'}</span></label>`).join(''):'<div class="empty">暂未发现可选择的后台程序<br>打开其他程序后，可点击刷新。</div>'}</div><p class="background-footnote">自动排除游戏、推流、音频、系统及当前前台程序。</p></section><aside class="background-controls"><div class="resource-control"><div class="control-caption"><span>后台资源让位</span><span class="pill ${resource.active?'green':''}">${resource.active?'运行中':resource.count?'待恢复':'未启动'}</span></div><h3>${resource.count?resource.count+' 个进程'+(resource.active?'正在让位':'等待恢复'):'减少后台程序争用'}</h3><p>降低调度优先级，支持时开启 Windows 效率模式。每 5 秒检查一次，程序切到前台后恢复原设置。</p><button class="btn ${resource.count?'':'primary'}" data-act="${resource.count?'stop-background':'start-background'}" ${maintenanceBusy||(!resource.count&&!config.names.length)?'disabled':''}>${resource.count?'停止并恢复原设置':'启用所选后台程序'}</button><small>作用于本次已运行的进程；新开的进程需重新启用。</small>${resource.lastResult?.rows?.some(x=>!x.ok)?`<div class="notice warn">${resource.lastResult.rows.filter(x=>!x.ok).slice(0,2).map(x=>esc(x.name+'：'+x.error)).join('<br>')}</div>`:''}</div><div class="memory-control"><div class="control-caption"><span>内存清理</span><b>${Number.isFinite(s?.memoryPercent)?s.memoryPercent+'%':'—'} <small>当前占用</small></b></div><div class="memory-meter"><i style="width:${Math.max(0,Math.min(100,s?.memoryPercent||0))}%"></i></div><div class="memory-policy"><label><input type="checkbox" data-memory-enabled ${config.enabled?'checked':''} ${disabled}>自动清理</label><select class="select" aria-label="自动清理阈值" data-memory-threshold ${disabled}>${[70,75,80,85,90,95].map(x=>`<option value="${x}" ${config.threshold===x?'selected':''}>占用达到 ${x}%</option>`).join('')}</select></div><p>持续超过阈值 30 秒后清理，每次至少间隔 10 分钟。</p><button class="btn" data-act="clean-memory" ${maintenanceBusy||!config.names.length?'disabled':''}>立即清理所选程序</button>${s?.lastResult?`<small class="memory-last-result">上次工作集减少 <b>${s.lastResult.releasedMb} MB</b> · ${stamp(s.lastResult.at)}</small>`:''}</div></aside></div></section>`;
  if(maintenanceView==='cache')content=`<section class="card cache-workspace"><div class="card-head"><div><h2>三角洲着色器缓存</h2><p>检查缓存大小，备份后重建；保留恢复入口。</p></div><span class="pill blue">PSO 缓存</span></div><div class="cache-tool-layout"><div><div class="nvidia-game-path"><span>游戏程序</span><strong>${esc(state.settings.optimization?.nvidiaGame||optimizationInfo?.gamePath||'尚未选择')}</strong></div><div class="optimize-actions"><button class="btn" data-act="select-maintenance-game" ${disabled}>选择游戏程序</button><button class="btn" data-act="inspect-cache" ${disabled}>检查缓存</button></div>${maintenanceCache?`<div class="cache-summary"><b>${maintenanceCache.exists?(maintenanceCache.bytes/1024/1024).toFixed(1)+' MB':'未发现缓存'}</b><span>${maintenanceCache.files} 个文件${maintenanceCache.complete?'':' · 统计未完成'}</span><small>${esc(maintenanceCache.path)}</small></div>`:`<div class="cache-before-check"><b>检查 → 备份 → 游戏重新生成</b><p>选择游戏程序后，点击“检查缓存”查看大小。</p></div>`}<button class="btn primary" data-act="backup-cache" ${maintenanceBusy||!maintenanceCache?.exists?'disabled':''}>备份并重建缓存</button><p class="optimize-help">需先退出游戏。首次启动会重新编译着色器，加载可能变慢。</p></div><aside class="cache-restore-list"><h3>可恢复的备份</h3>${(s?.backups||[]).length?(s.backups).map(x=>`<div class="cache-backup-row"><div><b>${stamp(x.at)}</b><span>${(x.bytes/1024/1024).toFixed(1)} MB · ${esc(x.backup)}</span></div><button class="btn sm" data-act="restore-cache" data-id="${esc(x.id)}" ${disabled}>恢复</button></div>`).join(''):'<p>还没有缓存备份。重建前会自动保存原缓存。</p>'}</aside></div></section>`;
  if(maintenanceView==='history')content=`<section class="card"><div class="card-head"><div><h2>优化与维护记录</h2><p>本机加密保存最近 80 次操作。</p></div><span class="pill">${history.length} 条记录</span></div>${history.length?`<div class="maintenance-history">${history.map(x=>`<div><span class="pill ${x.ok?'green':'orange'}">${x.ok?'完成':'请检查'}</span><section><b>${esc(x.label)}</b><p>${esc(x.detail)}</p></section><time>${stamp(x.at)}</time></div>`).join('')}</div>`:'<div class="empty">尚无操作记录。完成优化或恢复后会显示在这里。</div>'}</section>`;
  return navigation+error+content;
}

function renderSettings() {
  const shortcuts = state.settings.shortcuts;
  return `${heading('LOCAL DATA & PRIVACY', '本地数据与安全', '工作数据与账号密码使用 Windows 本机加密保存；加密备份需要单独设置备份密码。')}
    <div class="grid two">
      <section class="card">
        <div class="card-head"><div><h2>本地加密备份</h2><p>备份文件包含账号密码与截图；请牢记备份密码，忘记后无法解密。</p></div><span class="pill green">本机加密</span></div>
        <div class="notice">软件数据库使用 Windows 系统加密密钥，只有当前 Windows 用户可读取。备份文件使用你自行输入的密码加密，可转移到其他电脑恢复。</div>
        <div style="display:flex;gap:8px;margin-top:15px"><button class="btn primary" data-act="backup">创建加密备份</button><button class="btn" data-act="restore">恢复加密备份</button></div>
        <hr style="border:0;border-top:1px solid var(--line);margin:20px 0">
        <div class="field"><label>模拟数据</label><small>${state.demo?'当前首次体验使用模拟数据。':'当前数据库包含你的本地记录。'}</small><button class="btn" style="margin-top:7px;width:max-content" data-act="finish-demo">结束演示，保留正式记录</button></div>
      </section>
      <section class="card">
        <div class="card-head"><div><h2>全局快捷键</h2><p>即使游戏在前台，也能开始 / 结束直播计时和标记精彩时刻。</p></div></div>
        <div class="grid half">
          <div class="field"><label>开播 / 下播</label><select data-shortcut="session">${['F8','F6','F7','F10','F11','F12','Control+F8','Control+F9','Alt+F8','Alt+F9'].map(k=>`<option ${shortcuts.session===k?'selected':''}>${k}</option>`).join('')}</select></div>
          <div class="field"><label>精彩时刻</label><select data-shortcut="marker">${['F9','F6','F7','F10','F11','F12','Control+F8','Control+F9','Alt+F8','Alt+F9'].map(k=>`<option ${shortcuts.marker===k?'selected':''}>${k}</option>`).join('')}</select></div>
        </div>
        <button class="btn" style="margin-top:12px" data-act="save-shortcuts">保存快捷键</button>
        <div class="notice" style="margin-top:14px">开播与精彩标记使用两个不同快捷键。开播键第一次按下开始，第二次按下结束。精彩标记只记录时间轴。</div>
      </section>
    </div>
    <section class="card" style="margin-top:15px">
      <div class="card-head"><div><h2>安全显示说明</h2><p>安全场景和账号凭据显示边界</p></div></div>
      <div class="grid three">
        <div class="sub-card"><h3>账号密码</h3><p class="metric-note">列表默认遮挡；详情中按需复制到登录设备，剪贴板 30 秒后自动清除。</p></div>
        <div class="sub-card"><h3>直播场景</h3><p class="metric-note">使用独立安全输出窗口；请在直播伴侣或 OBS 里捕获该窗口，不要用整屏捕获账号资料页。</p></div>
        <div class="sub-card"><h3>本地数据</h3><p class="metric-note">账号、订单与截图不上传。用户点击网速测试后，测速服务可见公网 IP。</p></div>
      </div>
    </section>`;
}

function renderPageContent() {
  if (page === 'welcome') return renderWelcome();
  if (page === 'escort-home') return renderDashboard('打手');
  if (page === 'streamer-home') return renderDashboard('主播');
  if (page === 'orders') return renderOrders();
  if (page === 'settlement') return renderSettlement();
  if (page === 'accounts') return renderAccounts();
  if (page === 'rental') return renderRentals();
  if (page === 'avatar') return renderAvatar();
  if (page === 'highlights') return renderHighlights();
  if (page === 'titles') return renderTitles();
  if (page === 'setup') return renderSetup();
  if (page === 'optimize') return renderOptimization();
  if (page === 'repair') return frameRepairPage.render();
  if (page === 'tools') return QingchangToolsPage.render(state.role,currentToolsView());
  if (page === 'settings') return renderSettings();
  return renderWelcome();
}
function renderPage(){const content=renderPageContent(),key=currentToolKey()||(page==='highlights'?'highlights':'');return key?QingchangToolPages.frame(content,key,QingchangToolTask.resolve(toolOrigin,state)):content;}
function rememberToolControls(){if(mountedToolKey!=='monitor')return;const controls=[...document.querySelectorAll('[data-monitor-field],[data-alert-option],[data-alert-value],#monitor-display,#monitor-top,#monitor-opacity,#monitor-shortcut,[data-monitor-game],[data-monitor-source],[data-monitor-gpu]')];if(controls.length)toolControlDrafts.set('monitor',controls.map(n=>({id:n.id,attrs:{...n.dataset},value:n.value,checked:n.checked})));}
function restoreToolControls(){if(currentToolKey()!=='monitor')return;for(const saved of toolControlDrafts.get('monitor')||[]){const node=saved.id?document.getElementById(saved.id):[...document.querySelectorAll('input,select')].find(n=>Object.entries(saved.attrs).every(([k,v])=>n.dataset[k]===v));if(node){if(node.type==='checkbox')node.checked=saved.checked;else node.value=saved.value;}}}
function render() {
 if(state&&QingchangAccountActivity.rollover(state))persist();
 rememberToolControls();
 const context=QingchangWorkbenchContext.capture(appRoot);
 const sidebarScroll=$('.d-sidebar')?.scrollTop||0,oldTools=$('[data-tools-role]');
 if(oldTools&&page!=='tools')toolsViews[oldTools.dataset.toolsRole].scroll=scrollY;
 const view=page==='setup'?setupToolTab:'off';if(view!==previousPreflightView){previousPreflightView=view;preflightPage?.leave();}
 appRoot.innerHTML=pageShell();
 mountSaveStatus();
 const sidebar=$('.d-sidebar');if(sidebar)sidebar.scrollTop=sidebarScroll;
 if(typeof enhanceUI==='function')enhanceUI(page,state);renderReleaseUX();
 if(page==='streamer-home')paintWorkflowLiveStatus(monitorStatus||{});
 if(page==='titles')drawTitle();
 if(page==='setup'){fillSystemInfo();if(setupToolTab==='filters')streamFilterPage?.mount();}
 if(page==='optimize'&&['optimize','nvidia','advanced'].includes(currentToolKey())&&!optimizationInfo&&!optimizationError)loadOptimizationInfo();
 if(currentToolKey()==='monitor'&&!monitorLoaded){monitorLoaded=true;refreshMonitorControls();}
 QingchangWorkbenchContext.restore(appRoot,context);
 syncOrderCreateControls();syncUploadSlots();restoreToolControls();mountedToolKey=currentToolKey()||'';
 paintMonitorReadings(monitorStatus);
 if(currentToolKey()){document.querySelectorAll('.diagnostic-heading [data-act="workflow-return-diagnostic"]').forEach(n=>n.remove());mountOutputHandoff();}

 if(page==='tools'&&context.page!=='tools')window.scrollTo(0,currentToolsView().scroll||0);
}

function renderWithMotion(selector = '.q-content') {
  const previous=QingchangMotion.snapshot();
  render();
  QingchangMotion.enter(previous,selector);
}

function modal(title, body, actionLabel = '保存') {
  accountModal = { ...accountModal, title, body, actionLabel };
  render();
}
function accountModalHtml() {
  const preview=accountModal.kind==='rental-preview';
  return `<div class="modal-back" data-act="modal-back"><section class="modal${accountModal.wide?' wide':''}" role="dialog" aria-modal="true" tabindex="-1" data-modal-context="${esc((accountModal.kind||'modal')+':'+(accountModal.id||''))}"><div class="modal-head"><h2>${esc(accountModal.title)}</h2><button class="btn sm" data-act="close-modal">关闭</button></div><div class="modal-body">${accountModal.body}</div><div class="modal-foot">${preview?'<button class="btn primary" data-act="close-modal">关闭</button>':`<button class="btn" data-act="close-modal">取消</button>${accountModal.kind==='new-order'?'<button class="btn" data-act="order-create-draft">保存草稿</button>':''}<button class="btn primary" data-act="modal-submit">${esc(accountModal.actionLabel)}</button>`}</div></section></div>`;
}
function openAccountModal(account = null) {
  const a = account || { owner: '', account: '', password: '', source: '会员', customSource: '', region: '微信区', note: '' };
  accountModal = { kind: account ? 'edit-account' : 'new-account', id: account?.id || null };
  const body = `<div class="form-grid"><div class="field"><label>号主</label><input id="m-owner" value="${esc(a.owner)}" placeholder="号主称呼"></div><div class="field"><label>账号分类</label><select id="m-source">${SOURCES.map(x=>`<option ${a.source===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field ${a.source==='其他'?'':'hidden'}" id="m-custom-wrap"><label>自定义分类名</label><input id="m-custom" value="${esc(a.customSource)}" placeholder="填写分类"></div><div class="field"><label>游戏账号</label><input id="m-account" value="${esc(a.account)}" autocomplete="off"></div><div class="field"><label>账号密码</label><input id="m-password" type="password" value="${esc(a.password)}" autocomplete="new-password"></div><div class="field"><label>分区</label><select id="m-region"><option ${a.region==='微信区'?'selected':''}>微信区</option><option ${a.region==='QQ区'?'selected':''}>QQ区</option></select></div><div class="field full"><label>备注</label><textarea id="m-note">${esc(a.note)}</textarea></div></div><div class="notice" style="margin-top:13px">账号和密码只保存在本机加密数据库中。账号列表和直播输出默认不显示明文。</div>`;
  modal(account ? '编辑账号资料' : '添加账号', body, account ? '保存修改' : '添加账号');
}
function openNewOrder() {
 accountModal={kind:'new-order',rentalLeaseId:''};
 const fields=(key,label,type='text')=>'<div class="field"><label for="m-order-'+key+'">'+label+'</label><input id="m-order-'+key+'" type="'+type+'" '+(type==='number'?'min="0" step="any"':'')+' autocomplete="off"></div>';
 const leases=QingchangRentalModel.availableLeases(state);
 const rentalOptions=leases.map(lease=>`<option value="${esc(lease.id)}">${esc(QingchangRentalModel.displayName(lease))} · ${esc(rentalPlatformText(lease))} · ${esc(QingchangRentalModel.maskAccount(lease.loginAccount))}${QingchangRentalModel.isExpired(lease)?' · 已到期':''}</option>`).join('');
 const body='<div class="form-grid">'+fields('name','订单名称')+'<div class="field"><label for="m-order-mode">本单计费方式</label><select id="m-order-mode"><option value="rental">租用账号，按消耗计费</option><option value="none">自有账号 / 不计租号费</option></select></div><div class="field full" data-create-rental><label for="m-order-rental">从租号管理选择（可选）</label><div class="rental-pick-row"><select id="m-order-rental"><option value="">不使用租号资料，手动填写</option>'+rentalOptions+'</select><button class="btn" data-act="rental-copy-order" disabled>复制登录信息</button></div><small>选择后带入备注、区服和默认单价；开始余额仍要本次核对。已归还、归档或正在其他订单使用的账号不会出现在这里。</small></div><div class="field full"><label for="m-order-account">从主播账号资料选用（可选）</label><select id="m-order-account"><option value="">手动填写账号备注</option>'+state.accounts.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.owner||'未填号主')+' · '+esc(a.region||'未填分区')+'</option>').join('')+'</select></div>'+fields('account-name','首个账号 / 备注名')+'<div></div><div data-create-rental class="field">'+fields('start-balance','开始余额，例如 116M 或 450万')+'</div><div data-create-rental class="field">'+fields('ratio','租号比例 · 1 元兑换（万哈夫币）','number')+'</div></div><details class="order-create-options" data-create-rental><summary>六套与 AWM 子弹计费（按需填写）</summary>'+['suit','ammo'].map(p=>'<div class="order-create-optional"><label><input type="checkbox" id="m-order-'+p+'-used"> 本单'+(p==='suit'?'六套':'AWM 子弹')+'需要计费</label><div data-create-item="'+p+'" hidden>'+fields(p+'-start','开始数量','number')+fields(p+'-price','单价（元）','number')+'</div></div>').join('')+'</details><details class="order-create-options"><summary>开始截图与约定收入（可选）</summary><div class="form-grid">'+fileSlot('m-order-file','开始截图','此处截图仅留档；余额请核对后填写。')+fields('income','约定订单收入（元，结算时仍可修改）','number')+'</div></details><p class="workflow-note">收入和其他支出在结算时填写。不完整的信息可先保存草稿。</p>';
 modal('新建订单并填写开始信息',body,'保存并开始');
}
function syncOrderCreateControls(){
 if(accountModal?.kind!=='new-order')return;
 document.querySelectorAll('[data-create-rental]').forEach(n=>n.hidden=$('#m-order-mode')?.value==='none');
 for(const prefix of ['suit','ammo']){const node=document.querySelector('[data-create-item="'+prefix+'"]');if(node)node.hidden=!$('#m-order-'+prefix+'-used')?.checked;}
}
function openCheckpoint(orderId, segmentId) {
  accountModal = { kind: 'checkpoint', orderId, segmentId };
  modal('添加账号截图节点', `<div class="field"><label>节点类型</label><select id="m-checkpoint-kind"><option>登录上号前</option><option>订单打完</option><option>哈夫币用完</option><option>今日收工</option><option>中途换号前</option></select></div><div style="margin-top:12px">${fileSlot('m-checkpoint-file','截图（可选）','选择游戏内原始截图。截图会在本机加密数据库中保存。')}</div>`, '保存节点');
}
function workflowNetworkAssessment(){
 const setup=state.settings.setup;
 return QingchangPreflightModel.networkAssessment(state.settings.workflowNetworkCheck,setup.lastUploadMbps,setup.lastUploadAt);
}

function openSwapAccount(orderId,options={}){
 const order=state.orders.find(x=>x.id===orderId),segment=QingchangWorkflowProgress.currentSegment(order);if(!segment||order.status!=='进行中')return toast('请先添加账号并开始订单',true);
 const currentIdentity=QingchangRentalModel.segmentIdentity(state,segment);
 const leases=QingchangRentalModel.availableLeases(state,{forOrderId:orderId}).filter(lease=>lease.id!==segment.rentalLeaseId&&QingchangRentalModel.identity(lease)!==currentIdentity);
 const selectedLease=options.lease&&options.lease.id!==segment.rentalLeaseId?options.lease:(null);
 accountModal={kind:'swap-account',orderId,segmentId:segment.id,nextLeaseId:selectedLease?.id||''};
 const field=(key,label,value,type='text',extra='')=>`<div class="field"><label for="swap-${key}">${label}</label><input id="swap-${key}" type="${type}" ${type==='number'?'min="0" step="any"':''} value="${esc(value??'')}" ${extra} autocomplete="off"></div>`;
 const nextStart=options.startBalance||'';
 const nextRatio=selectedLease?QingchangRentalModel.ratioCoinsToWan(selectedLease.defaultCoinPerYuan):(options.ratioWan||'');
 const nextName=selectedLease?QingchangRentalModel.displayName(selectedLease):'';
 const nextLogin=selectedLease?selectedLease.loginAccount:'';
 const nextPasswordLocked=selectedLease?'disabled placeholder="使用租号资料中的密码"':'';
 modal('换号并留证',`<p class="workflow-note">保存后会结束「${esc(segment.accountName||'当前账号')}」的余额记录，并在同一订单中添加下一个账号。</p><div class="workflow-swap-section"><h3>结束当前账号</h3><div class="form-grid">${field('startBalance','开始余额（支持 M / 万）',segment.startBalance)}${field('endBalance','退出余额（没有剩余填 0）',segment.endBalance)}${field('coinPerYuan','租号比例 · 1 元兑换（万哈夫币）',window.qingchangDomain.ratioToWan(segment.coinPerYuan),'number')}${fileSlot('swap-file','退出截图（可选）','截图仅保存在本机，附在当前账号下。')}</div><details ${segment.suitStart!==''&&segment.suitStart!=null||segment.ammoStart!==''&&segment.ammoStart!=null?'open':''}><summary>六套与 AWM 子弹消耗</summary><div class="form-grid">${['suit','ammo'].map(prefix=>`<label class="field full"><input type="checkbox" id="swap-${prefix}-unused" ${segment[prefix+'Unused']?'checked':''}>${prefix==='suit'?'六套':'AWM 子弹'}未使用 / 不计费</label>`+['Start','End','Price'].map((suffix,i)=>field(prefix+suffix,`${prefix==='suit'?'六套':'AWM 子弹'}${['开始数量','结束数量','单价（元）'][i]}`,segment[prefix+suffix],'number')).join('')).join('')}</div><p class="workflow-note">使用过的项目需补齐数量与单价；数量增加按零消耗计算。未使用的项目请勾选“不计费”，以免结算时漏记。</p></details></div><div class="workflow-swap-section"><h3>开始下一个账号</h3><div class="form-grid">${field('nextName','账号 / 备注名（订单显示）',nextName)}${field('nextStart','开始余额（支持 M / 万）',nextStart)}${field('nextRatio','租号比例 · 1 元兑换（万哈夫币）',nextRatio,'number')}</div><div class="field full" style="margin-top:11px"><label for="swap-rental-search">从租号管理选择（可搜索）</label><input class="search rental-swap-search" id="swap-rental-search" placeholder="搜索备注、平台、区服或来源" data-rental-swap-search autocomplete="off"><select id="swap-rental-lease" data-swap-lease><option value="">不使用租号资料，临时录入下一个账号</option>${leases.map(lease=>`<option value="${esc(lease.id)}" ${selectedLease?.id===lease.id?'selected':''}>${esc(QingchangRentalModel.displayName(lease))} · ${esc(rentalPlatformText(lease))} · ${esc(QingchangRentalModel.maskAccount(lease.loginAccount))}${QingchangRentalModel.isExpired(lease)?' · 已到期':''}</option>`).join('')}</select><small data-swap-lease-note>${selectedLease?'已选择租号资料，开始余额仍需核对；密码不会复制到订单。':'选中后会带入备注和默认比例；临时录入的账号可以勾选保存到租号管理。'}</small></div><div class="form-grid" data-swap-temp-fields style="margin-top:11px">${field('nextLogin','登录账号（临时录入 / 保存到租号管理）',nextLogin,'text',selectedLease?'disabled':'')}${field('nextPassword','密码（可暂缺）','','password',nextPasswordLocked)}</div><label class="rental-save-check" data-swap-save-wrap ${selectedLease?'hidden':''}><input type="checkbox" id="swap-save-rental"> 把这个临时账号保存到租号管理</label><p class="workflow-note">不在租号管理里的账号照常可以临时使用；需要时再保存为租号资料。同一个号切走再切回来，会生成新的使用记录。</p></div>`,'保存并切换账号');
}
function openBackup(kind) {
  accountModal = { kind };
  modal(kind === 'backup' ? '创建加密备份' : '恢复加密备份', `<div class="field"><label>备份密码（至少 8 位）</label><input id="m-backup-password" type="password" autocomplete="new-password" placeholder="请妥善记住这个密码"></div><div class="notice warn" style="margin-top:12px">备份密码不会保存在本机。忘记密码后，轻场也无法解开备份中的账号密码。</div>`, kind === 'backup' ? '选择位置并加密' : '选择备份文件并恢复');
}
function showAccount(account) {
 if(page!=='accounts')accountReturnPage=page==='escort-home'?'escort-home':'streamer-home';
 accountSelectedId=account.id;accountDetailTab='info';page='accounts';renderWithMotion();
 document.querySelector('[data-account-detail-title]')?.focus({preventScroll:true});
}

async function saveModalBody() {
 const kind=accountModal?.kind;
 if(kind==='rental-edit')return saveRentalEditModal();
 if(kind==='rental-import')return saveRentalImportModal();
 if(kind==='rental-order')return saveRentalOrderModal();
 if(kind==='rental-link-segment')return saveRentalLinkModal();
 if(kind==='rental-preview'){accountModal=null;render();return;}
 if(kind==='rental-import-paste'){
  const text=$('#m-rental-import-text')?.value||'';
  if(!String(text).trim())throw Error('请先粘贴账号文本，或选择一个 CSV / TXT 文件');
  startRentalImportPreview(text,'粘贴文本');return;
 }
 if(kind==='order-cancel'){const order=state.orders.find(x=>x.id===accountModal.orderId);if(!order)throw Error('订单已不存在');const at=safeNow();const updated=QingchangRentalModel.markUse(QingchangOrderFlow.cancel(order,{reason:$('#cancel-order-reason').value,settle:$('#cancel-order-mode').value==='settle',at}),at);await commitState({...state,orders:state.orders.map(x=>x.id===order.id?updated:x)});accountModal=null;activeOrder=order.id;state.selectedOrderId=order.id;settlementFocus={orderId:order.id,step:3};orderEditingRecord=false;page=updated.status==='待结算'?'settlement':'escort-home';render();toast(updated.status==='待结算'?'已保留取消原因，请核对已有费用':'订单已取消，记录保留且不计收益');return;}
 if(kind==='swap-account')return saveSwapAccount();
 if(kind==='import-review'){
  if(!pendingImport)return;const next=structuredClone(state);let added=0,updated=0;
  for(const item of pendingImport.items){const existing=next.accounts.find(a=>a.account===item.account),source=normalizeSource(item.source),customSource=source==='其他'?(String(item.source||'').trim()||'其他'):'',region=/QQ/i.test(item.region)?'QQ区':/微信/i.test(item.region)?'微信区':item.region;
   if(existing){Object.assign(existing,{owner:item.owner,password:item.password,source,customSource,region,note:item.note,questionnaireUpdatedAt:safeNow()});updated++;}
   else{const account={...item,id:id(),source,customSource,region,createdAt:safeNow(),loginEvents:[],playEvents:[],sample:false};next.accounts.unshift(account);next.workspaceAccountIds.unshift(account.id);added++;}
  }
  next.demo=false;await commitState(next);pendingImport=null;accountModal=null;render();toast(`导入已保存：新增 ${added} 个账号，更新 ${updated} 个账号`);return;
 }
 if(kind==='new-account'||kind==='edit-account'){
  const account={owner:$('#m-owner').value.trim(),source:$('#m-source').value,customSource:$('#m-custom')?.value.trim()||'',account:$('#m-account').value.trim(),password:$('#m-password').value,region:$('#m-region').value,note:$('#m-note').value.trim()};
  if(!account.account)throw Error('请填写游戏账号');const next=structuredClone(state);
  if(kind==='new-account'){Object.assign(account,{id:id(),createdAt:safeNow(),loginEvents:[],playEvents:[],sample:false});next.accounts.unshift(account);next.workspaceAccountIds.unshift(account.id);}else Object.assign(next.accounts.find(a=>a.id===accountModal.id),account);
  next.demo=false;await commitState(next);accountModal=null;render();if(kind==='new-account')toast('账号已添加');return;
 }
 if(kind==='new-order'){
  const input={name:$('#m-order-name').value,accountName:$('#m-order-account-name').value,billingMode:$('#m-order-mode').value,startBalance:$('#m-order-start-balance').value,income:$('#m-order-income').value};
  input.coinPerYuan=input.billingMode==='none'||$('#m-order-ratio').value===''?'':qingchangDomain.ratioFromWan($('#m-order-ratio').value);
  for(const p of ['suit','ammo']){input[p+'Unused']=!$('#m-order-'+p+'-used').checked;input[p+'Start']=$('#m-order-'+p+'-start').value;input[p+'Price']=$('#m-order-'+p+'-price').value;}
  const rentalLease=accountModal.rentalLeaseId&&input.billingMode!=='none'?rentalLeaseById(accountModal.rentalLeaseId):null;
  if(accountModal.rentalLeaseId&&input.billingMode!=='none'&&!rentalLease)throw Error('选中的租号资料已不存在，请重新选择');
  if(rentalLease){const guard=rentalGuard(rentalLease,{askExpired:true});if(!guard.ok){if(String(guard.message).startsWith('已取消'))return;throw Error(guard.message);}}
  const at=safeNow();
  const order=QingchangOrderFlow.create(input,{orderId:id(),segmentId:id(),at,start:!accountModal.createDraft});order.segments[0].accountId=$('#m-order-account').value;
  const file=$('#m-order-file').files[0];if(file)order.segments[0].beforeShot=await readImage(file);
  if(rentalLease){
   order.segments[0]=QingchangRentalModel.attachLease(order.segments[0],rentalLease,{accountName:input.accountName,startBalance:input.startBalance,coinPerYuan:input.coinPerYuan,suitStart:input.suitStart,suitEnd:input.suitEnd,suitPrice:input.suitPrice,suitUnused:input.suitUnused,ammoStart:input.ammoStart,ammoEnd:input.ammoEnd,ammoPrice:input.ammoPrice,ammoUnused:input.ammoUnused,useStartedAt:order.status==='进行中'?at:''});
  }
  await commitState({...state,demo:false,selectedOrderId:order.id,orders:[order,...state.orders]});activeOrder=order.id;settlementFocus={orderId:order.id,step:1};orderRecordId=order.segments[0].id;orderEditingRecord=false;page='escort-home';accountModal=null;render();toast(order.status==='进行中'?'订单已保存并开始':'草稿已保存，补齐开始信息后即可开始');return;
 }
 if(kind==='checkpoint'){
  const current=accountModal,kindLabel=$('#m-checkpoint-kind').value,file=$('#m-checkpoint-file').files[0],image=file?await readImage(file):'',next=structuredClone(state);
  const order=next.orders.find(o=>o.id===current.orderId),segment=order?.segments.find(x=>x.id===current.segmentId);if(!segment||order.status==='已完成')throw Error('当前订单已变化，请重新打开截图节点');
  segment.checkpoints||=[];segment.checkpoints.push({id:id(),kind:kindLabel,at:safeNow(),image});next.demo=false;await commitState(next);accountModal=null;render();toast('截图节点已保存到本机');return;
 }
 if(kind==='backup'||kind==='restore'){
  const pass=$('#m-backup-password').value;await flushSave();const result=await (kind==='backup'?api.backup(pass):api.restore(pass));if(result.canceled)return;if(kind==='restore'){if(!result.ok)throw Error(result.error);state=result.data;window.QingchangHighlights.migrate(state);QingchangRentalModel.migrate(state);QingchangWorkflowProgress.migrate(state);await saveNow();page=state.role?`${state.role==='打手'?'escort':'streamer'}-home`:'welcome';}
  accountModal=null;render();toast(kind==='backup'?'加密备份已保存':'加密备份已恢复');return;
 }
 if(kind==='account-detail'){const a=state.accounts.find(x=>x.id===accountModal.id);accountModal=null;openAccountModal(a);return;}
 if(kind==='setup-guide'){accountModal=null;render();return;}
 if(kind==='rename-session'){
  const name=$('#m-session-name').value.trim();if(!name)throw Error('请填写场次名称');const next=structuredClone(state),session=next.streamSessions.find(x=>x.id===accountModal.id);if(!session)throw Error('场次不存在');session.title=name.slice(0,100);if(next.stream.id===session.id)next.stream.title=session.title;await commitState(next);accountModal=null;render();return;
 }
 if(kind==='clip-edit'){
  const next=structuredClone(state),clip=next.clips.find(x=>x.id===accountModal.id);if(!clip)throw Error('标记不存在');clip.title=$('#m-clip-title').value.trim()||'精彩操作';clip.map=$('#m-clip-map').value.trim();clip.note=$('#m-clip-note').value.trim();await commitState(next);accountModal=null;render();
 }
}

async function saveSwapAccount(){
 const currentModal=accountModal;if(!currentModal||currentModal.busy)return;const order=state.orders.find(x=>x.id===currentModal.orderId),segment=order?.segments.find(x=>x.id===currentModal.segmentId);
 if(!segment||order.status!=='进行中'||QingchangWorkflowProgress.currentSegment(order)!==segment)return toast('当前账号已变化，请关闭后重新换号',true);
 const input={};for(const key of ['startBalance','endBalance','coinPerYuan','suitStart','suitEnd','suitPrice','ammoStart','ammoEnd','ammoPrice','nextName','nextStart','nextRatio','nextLogin','nextPassword'])input[key]=$('#swap-'+key)?.value??'';
 for(const prefix of ['suit','ammo'])input[prefix+'Unused']=$('#swap-'+prefix+'-unused')?.checked===true;
 input.nextLeaseId=$('#swap-rental-lease')?.value||currentModal.nextLeaseId||'';
 input.saveRental=$('#swap-save-rental')?.checked===true;
 let result;try{input.coinPerYuan=window.qingchangDomain.ratioFromWan(input.coinPerYuan);input.nextRatio=window.qingchangDomain.ratioFromWan(input.nextRatio);result=QingchangWorkflowModel.swapAccount(segment,input);}catch(error){return toast(error.message,true);}
 let lease=null,newLease=null;
 const currentIdentity=QingchangRentalModel.segmentIdentity(state,segment);
 if(input.nextLeaseId){
  lease=rentalLeaseById(input.nextLeaseId);
  const guard=rentalGuard(lease,{ignoreOrderId:order.id,askExpired:true});if(!guard.ok){if(!String(guard.message).startsWith('已取消'))toast(guard.message,true);return;}
  if(QingchangRentalModel.identity(lease)===currentIdentity)return toast('这个账号已经是当前账号；需要重新记录余额时请先完整换号',true);
 }else if(input.saveRental){
  if(!String(input.nextLogin||'').trim())return toast('勾选“保存到租号管理”后需要填写登录账号',true);
  newLease=QingchangRentalModel.leaseFromRow({remark:input.nextName,loginAccount:input.nextLogin,password:input.nextPassword,platform:'',region:'',source:'换号时临时录入'},{now:safeNow(),idFactory:id});
  if(QingchangRentalModel.findDuplicate(state,newLease))return toast('已存在相同平台、区服和登录账号的租号资料，请直接从租号管理选择，或修改登录账号',true);
 }
 const file=$('#swap-file').files[0];currentModal.busy=true;const submit=$('[data-act="modal-submit"]');submit.disabled=true;submit.textContent='正在保存…';
 try{
  const image=file?await readImage(file):'';
  if(accountModal!==currentModal)return;
  if(order.status!=='进行中'||QingchangWorkflowProgress.currentSegment(order)!==segment)throw Error('订单状态已变化，请重新换号');
  const at=safeNow(),previous={...result.previous,closedAt:at,useEndedAt:at,checkpoints:[...(segment.checkpoints||[]),{id:id(),kind:'中途换号前',at,image}]};
  let next={...result.next,id:id(),useStartedAt:at,useEndedAt:''};if(image)previous.afterShot=image;
  let rentalLeases=state.rentalLeases||[];
  if(lease)next=QingchangRentalModel.attachLease(next,lease,{accountName:input.nextName,startBalance:input.nextStart,coinPerYuan:input.nextRatio,useStartedAt:at});
  if(newLease){newLease.id=id();rentalLeases=[newLease,...rentalLeases];next=QingchangRentalModel.attachLease(next,newLease,{accountName:input.nextName,startBalance:input.nextStart,coinPerYuan:input.nextRatio,useStartedAt:at});}
  const nextState={...state,demo:false,selectedOrderId:order.id,rentalLeases,orders:state.orders.map(x=>x.id===order.id?{...x,activeSegmentId:next.id,segments:x.segments.map(s=>s.id===segment.id?previous:s).concat(next)}:x)};
  await commitState(nextState);activeOrder=order.id;if(accountModal===currentModal)accountModal=null;page='escort-home';renderWithMotion();QingchangMotion.confirm('.workflow-current-account');toast(image?'已保存退出余额和截图，切换到下一个账号':'已保存退出余额并切换账号；本次未附截图');
 }catch(error){toast(`换号未保存：${error.message}`,true);}
 finally{currentModal.busy=false;if(submit.isConnected){submit.disabled=false;submit.textContent='保存并切换账号';}}
}
async function saveRentalEditModal(){
 const editing=accountModal?.kind==='rental-edit'&&accountModal.id?rentalLeaseById(accountModal.id):null;
 const value=key=>$('#m-rental-'+key)?.value??'';
 const row={remark:value('remark'),loginAccount:value('login'),password:value('password'),platform:value('platform'),region:value('region'),source:value('source'),rentedAt:value('rented'),expiresAt:value('expires'),ratio:value('ratio'),suitPrice:value('suit-price'),ammoPrice:value('ammo-price'),note:value('note')};
 if(!String(row.loginAccount||'').trim())throw Error('请填写登录账号');
 const candidate=QingchangRentalModel.leaseFromRow(row,{now:safeNow(),idFactory:()=>editing?.id||id()});
 const duplicate=QingchangRentalModel.findDuplicate(state,candidate,{excludeId:editing?.id||''});
 const newRound=$('#m-rental-new-round')?.checked===true;
 if(duplicate&&!newRound)throw Error(`已存在相同平台、区服和登录账号的租号资料「${QingchangRentalModel.displayName(duplicate)}」；如确为新一轮租用，请勾选“登记为新一轮租用”`);
 const now=safeNow(),next=structuredClone(state);
 if(editing&&!newRound){
  const item=next.rentalLeases.find(x=>x.id===editing.id);if(!item)throw Error('租号资料已不存在');
  const oldPassword=item.password;
  Object.assign(item,{remark:candidate.remark,loginAccount:candidate.loginAccount,platform:candidate.platform,region:candidate.region,source:candidate.source,rentedAt:candidate.rentedAt,expiresAt:candidate.expiresAt,note:candidate.note,defaultCoinPerYuan:candidate.defaultCoinPerYuan,defaultSuitPrice:candidate.defaultSuitPrice,defaultAmmoPrice:candidate.defaultAmmoPrice,password:row.password?row.password:oldPassword,updatedAt:now});
  rentalSelectedId=item.id;
 }else{
  const created={...candidate,id:id(),createdAt:now,updatedAt:now};
  next.rentalLeases.unshift(created);rentalSelectedId=created.id;
 }
 next.demo=false;await commitState(next);accountModal=null;render();toast(newRound?'已登记为新一轮租用':'租号资料已保存');
}
async function saveRentalImportModal(){
 const rows=readRentalImportRows();
 const result=QingchangRentalModel.applyImport(state,rows,{now:safeNow(),idFactory:id});
 if(!result.ok)throw Error(result.errors[0]||'导入未保存');
 result.state.demo=false;
 await commitState(result.state);pendingRentalImport=null;accountModal=null;render();
 toast(`导入完成：新增 ${result.added} 个，更新 ${result.updated} 个，跳过 ${result.skipped} 行`);
}
async function saveRentalOrderModal(){
 const lease=rentalLeaseById(accountModal?.id);if(!lease)throw Error('租号资料已不存在');
 const mode=$('#m-rental-order-mode')?.value||'new';
 const guard=rentalGuard(lease,{askExpired:true});if(!guard.ok){if(String(guard.message).startsWith('已取消'))return;throw Error(guard.message);}
 const now=safeNow(),startBalance=$('#m-rental-order-start')?.value??'',ratioWan=$('#m-rental-order-ratio')?.value??'';
 if(!String(startBalance).trim())throw Error('请填写本次开始余额');
 let coinPerYuan;try{coinPerYuan=qingchangDomain.ratioFromWan(ratioWan);}catch(error){throw Error(error.message);}
 const finance={startBalance,coinPerYuan};
 for(const prefix of ['suit','ammo']){
  const used=$(`#m-rental-${prefix}-used`)?.checked===true;
  finance[prefix+'Unused']=!used;
  for(const suffix of ['start','end','price']){
   const key=prefix+(suffix[0].toUpperCase()+suffix.slice(1));
   finance[key]=used?($(`#m-rental-${prefix}-${suffix}`)?.value??''):'';
  }
 }
 if(mode==='existing'){
  const orderId=$('#m-rental-order-existing')?.value;const order=state.orders.find(x=>x.id===orderId);
  if(!order)throw Error('请选择要加入的订单');
  if(!['未开始','进行中','已暂停'].includes(order.status))throw Error('这笔订单已经结束使用，请在结算核对中补充记录');
  if(order.status==='已暂停')throw Error('这笔订单已暂停，请先在订单中继续，再换号');
  const current=QingchangWorkflowProgress.currentSegment(order);
  if(current?.rentalLeaseId===lease.id)throw Error('这个账号已经是该订单的当前账号');
  const conflict=QingchangRentalModel.conflictFor(state,lease,{ignoreOrderId:order.id});if(conflict)throw Error(`这个账号正在订单「${conflict.order.name||'未命名订单'}」中使用`);
  if(order.status==='进行中'&&current){
   accountModal=null;openSwapAccount(order.id,{lease,startBalance,ratioWan});
   toast('已带入这个号；请先核对当前账号退出余额，再保存换号');
   return;
  }
  const next=structuredClone(state),target=next.orders.find(x=>x.id===order.id),segment=QingchangRentalModel.attachLease(QingchangOrderFlow.segment({},id()),lease,{...finance,useStartedAt:now});
  target.segments.push(segment);target.activeSegmentId=segment.id;
  if(target.status==='未开始'){
   let advanced=QingchangOrderFlow.advance(target,now);advanced=QingchangRentalModel.markUse(advanced,now);
   next.orders=next.orders.map(x=>x.id===advanced.id?advanced:x);
  }
  next.demo=false;next.selectedOrderId=order.id;
  await commitState(next);activeOrder=order.id;settlementFocus={orderId:order.id,step:2};orderRecordId=segment.id;orderEditingRecord=false;page='escort-home';accountModal=null;renderWithMotion();toast('已加入订单并开始使用这个号');
  return;
 }
 const input={name:$('#m-rental-order-name')?.value||'',accountName:QingchangRentalModel.displayName(lease),billingMode:'rental',startBalance,coinPerYuan,income:'',...finance};
 let order=QingchangOrderFlow.create(input,{orderId:id(),segmentId:id(),at:now,start:true});
 order.segments[0]=QingchangRentalModel.attachLease(order.segments[0],lease,{...finance,useStartedAt:now});
 order=QingchangRentalModel.markUse(order,now);
 await commitState({...state,demo:false,selectedOrderId:order.id,orders:[order,...state.orders]});
 activeOrder=order.id;settlementFocus={orderId:order.id,step:2};orderRecordId=order.segments[0].id;orderEditingRecord=false;page='escort-home';accountModal=null;renderWithMotion();toast('订单已保存并开始使用这个号');
}
async function saveRentalLinkModal(){
 const orderId=accountModal?.orderId,segmentId=accountModal?.segmentId,lease=rentalLeaseById($('#m-rental-link-lease')?.value);
 if(!lease)throw Error('请选择一个租号资料');
 if(orderId){const conflict=QingchangRentalModel.conflictFor(state,lease,{ignoreOrderId:orderId});if(conflict)throw Error(`这个租号正在订单「${conflict.order.name||'未命名订单'}」中使用，不能关联到这笔订单`);}
 const next=structuredClone(state),order=next.orders.find(x=>x.id===orderId),segment=order?.segments.find(x=>x.id===segmentId);
 if(!segment)throw Error('订单记录已变化，请重新打开');
 Object.assign(segment,QingchangRentalModel.linkLease(segment,lease,{at:safeNow()}));
 next.demo=false;await commitState(next);accountModal=null;render();toast('已关联租号资料；余额和金额保持原样');
}
let modalSaving=false;
async function saveModal(){
 if(commitBusy||modalSaving)return;modalSaving=true;appRoot.inert=true;
 try{await saveModalBody();}catch(error){toast('未保存：'+error.message,true);}finally{modalSaving=false;appRoot.inert=false;}
}
function readImage(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return reject(new Error('请使用 PNG、JPG 或 WebP 游戏截图'));
    if (file.size > 8 * 1024 * 1024) return reject(new Error('单张截图不能超过 8 MB'));
    const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('无法读取截图'));reader.readAsDataURL(file);
  });
}

function cropHaufcoinBalance(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth, height = image.naturalHeight;
      if (width < 400 || height < 225) return reject(new Error('截图尺寸太小，无法定位哈夫币余额'));
      const cropWidth = Math.round(width * 0.05625), cropHeight = Math.round(height * 0.0463);
      const canvas = document.createElement('canvas');
      canvas.width = cropWidth * 3; canvas.height = cropHeight * 3;
      const context = canvas.getContext('2d');
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
      context.drawImage(image, Math.round(width * 0.78125), Math.round(height * 0.02778), cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png').split(',')[1]);
    };
    image.onerror = () => reject(new Error('无法读取截图中的余额区域'));
    image.src = dataUrl;
  });
}
async function suggestHaufcoinBalance(dataUrl) {
  const rawText = await api.ocrBalance(await cropHaufcoinBalance(dataUrl));
  return window.qingchangDomain.parseOcrCoins(rawText);
}
async function startWorkflowSession(){
 if(state.stream.active||commitBusy||modalSaving)return;
 await workflowPreparation.refreshReadiness();
 const checks=workflowPreparation.status();if(checks.busy||checks.cleanupBusy){toast('准备或收尾仍在进行，请稍候再开始本场计时',true);return;}const summary=QingchangWorkflowModel.preparationSummary(checks.items);
 if((!checks.preparedAt||summary.pending)&&!confirm('请先在直播软件确认已开播。当前准备仍有未完成项，继续只会开始本场计时，不会将这些项目标记为通过。是否开始计时？'))return;
 return toggleStream();
}
async function toggleStream() {
 if(commitBusy||modalSaving)return;const H=window.QingchangHighlights,next=structuredClone(state),stopping=!!state.stream.active;
 try{if(stopping){QingchangWorkflowProgress.capture(QingchangWorkflowModel.currentSession(next),monitorStatus?.alerts);H.stop(next);}else H.start(next,id());next.demo=false;await commitState(next);workflowPhase=stopping?'wrap':'live';recoveredSession=false;if(stopping)workflowPreparation?.cleanup().catch(error=>toast(error.message,true));render();toast(stopping?'本场计时已结束并保存':'新场次已保存，开始计时');}catch(error){toast('场次未保存：'+error.message,true);}
}
async function markHighlight() {
 if(commitBusy||modalSaving)return;try{const next=structuredClone(state);window.QingchangHighlights.mark(next,id());next.demo=false;await commitState(next);render();toast('精彩标记已保存');}catch(error){toast(error.message,true);}
}
async function exportHighlights(){
 const session=window.QingchangHighlights.selected(state);if(!session)return;
 const format=$('#highlight-export-format').value;
 try{await flushSave();const result=await api.exportHighlights(session.id,format);if(!result.canceled)toast(`已导出本场 ${result.count} 个标记`);}catch(error){toast(`导出失败：${error.message}`,true);}
}
async function advanceOrder(orderId) {
 if(commitBusy||modalSaving)return;const order=state.orders.find(o=>o.id===orderId);if(!order||QingchangOrderFlow.terminal(order))return;
 if(orderScreenshotPending)return toast('截图正在读取和识别，请完成后再结束或结算',true);
 if(order.status==='未开始'){
  const segment=QingchangWorkflowProgress.currentSegment(order);
  if(segment?.rentalLeaseId){const lease=rentalLeaseById(segment.rentalLeaseId);const guard=rentalGuard(lease,{askExpired:true});if(!guard.ok){if(!String(guard.message).startsWith('已取消'))toast(guard.message,true);return;}}
  const issue=QingchangWorkflowProgress.startIssue(order);if(issue){await showOrderStage(order.id,1,{recordId:segment?.id,field:issue.includes('备注')?'accountName':issue.includes('余额')?'startBalance':'coinPerYuan'});toast(issue,true);return;}
 }
 if(order.status==='待结算'&&!validateSettlement(order))return;
 try{const at=safeNow();const updated=QingchangRentalModel.markUse(QingchangOrderFlow.advance(order,at),at);await commitState({...state,demo:false,selectedOrderId:order.id,orders:state.orders.map(o=>o.id===orderId?updated:o)});settlementErrors=[];activeOrder=order.id;orderEditingRecord=false;orderRecordId='';settlementFocus={orderId:order.id,step:updated.status==='进行中'?2:3};page=updated.status==='进行中'?'escort-home':'settlement';renderWithMotion();window.scrollTo(0,0);toast(updated.status==='进行中'?'订单已保存并开始':updated.status==='待结算'?'已结束使用，请核对收入与费用':'结算已保存，已计入净收入');}catch(error){toast('订单未完成保存：'+error.message,true);}
}
function parseCSV(text) {
  const rows=[];let row=[],field='',quoted=false;const src=String(text).replace(/^\uFEFF/,'');
  for(let i=0;i<src.length;i++){const ch=src[i],next=src[i+1];if(ch==='"'){if(quoted&&next==='"'){field+='"';i++;}else quoted=!quoted;}else if((ch===','||ch==='\n'||ch==='\r')&&!quoted){row.push(field.trim());field='';if(ch===',')continue;if(row.some(x=>x)){rows.push(row);}row=[];if(ch==='\r'&&next==='\n')i++;}else field+=ch;}
  row.push(field.trim());if(row.some(x=>x))rows.push(row);return rows;
}
function importCSV(text, fileName) {
  const rows=parseCSV(text);if(rows.length<2)return toast('CSV 文件没有可导入的账号行',true);
  const headers=rows[0].map(x=>x.toLowerCase().replace(/[\s_（）()]/g,''));
  const find=(aliases)=>headers.findIndex(h=>aliases.some(a=>h.includes(a)));
  const col={account:find(['游戏账号','账号','帐号','登录账号','account','username']),password:find(['密码','password']),owner:find(['号主','昵称','微信昵称','联系人','owner']),source:find(['来源','账号类型','类型','source']),region:find(['分区','平台区','region']),note:find(['备注','说明','note'])};
  if(col.account<0)return toast('没找到账号列。请确保表头包含“账号”或“游戏账号”。',true);
  const parsed=rows.slice(1).map((r)=>({account:r[col.account]||'',password:col.password>=0?r[col.password]||'':'',owner:col.owner>=0?r[col.owner]||'':'',source:col.source>=0?r[col.source]||'会员':'会员',region:col.region>=0?r[col.region]||'微信区':'微信区',note:col.note>=0?r[col.note]||'':'',submittedAt:safeNow()})).filter(x=>x.account);
  const seen=new Set();const items=parsed.filter(item=>{if(seen.has(item.account))return false;seen.add(item.account);return true;});
  const duplicates=items.filter(item=>state.accounts.some(a=>a.account===item.account));const fresh=items.length-duplicates.length;
  pendingImport={items,fileName};accountModal={kind:'import-review'};
  const duplicateRows=duplicates.length?`<div class="sub-card" style="margin-top:12px"><h3>检测到 ${duplicates.length} 个已存在账号</h3><div style="max-height:220px;overflow:auto">${duplicates.map(a=>{const old=state.accounts.find(x=>x.account===a.account);return `<div style="padding:8px 0;border-bottom:1px solid var(--line);font-size:11px"><b>${esc(a.owner||old?.owner||'未填写号主')}</b> · ${esc(a.account)}<span style="float:right;color:#8b98a9">${state.workspaceAccountIds.includes(old?.id)?'已在本周工作台':'历史账号'}</span></div>`;}).join('')}</div></div>`:'<div class="notice green" style="margin-top:12px">没有发现与已有档案重复的账号。</div>';
  modal('导入名单前检查',`<div class="notice"><strong>${esc(fileName)}</strong><br>将新增 ${fresh} 个账号并加入本周工作台；已有 ${duplicates.length} 个账号会用这次问卷中的资料覆盖。</div>${duplicateRows}<div class="notice" style="margin-top:12px">重复账号的上号、打过历史和当前安排状态会保留。问卷里的账号、密码、来源、号主、分区和备注会覆盖旧资料；历史账号不会自动重新排队。</div>`,'确认导入');
}
function deleteAccount(accountId) { const a=state.accounts.find(x=>x.id===accountId);if(!a)return;if(!confirm(`确定删除 ${a.owner || a.account} 的账号档案？删除后本地历史也会移除。`))return;state.accounts=state.accounts.filter(x=>x.id!==accountId);state.workspaceAccountIds=state.workspaceAccountIds.filter(x=>x!==accountId);persist();render();toast('账号档案已删除'); }
async function accountEvent(accountId, type) {
 const next=structuredClone(state),a=next.accounts.find(x=>x.id===accountId);if(!a)return;
 const key=type==='login'?'loginEvents':'playEvents';a[key]||=[];a[key].push({at:safeNow(),week:weekKey()});next.demo=false;
 try{await commitState(next);render();toast(type==='login'?'已新增一条上号记录':'已新增一条打过记录');}catch(error){toast('记录未保存：'+error.message,true);}
}

let roleEntering=false;
async function onClick(event) {
  if(commitBusy||modalSaving)return;
  const target=event.target.closest('[data-act],[data-nav],[data-role],[data-role-enter],[data-filter]');if(!target)return;
  if(orderScreenshotPending&&target.dataset.act)return toast('截图正在读取和识别，完成后即可继续此操作',true);
  if(orderCorrection&&(target.dataset.nav||target.dataset.role||target.dataset.roleEnter||target.dataset.act==='workflow-tool')){toast('请先保存或放弃结算更正',true);return;}
  if(target.dataset.nav==='highlights')return openWorkflowTool('highlights');
  if(target.dataset.nav==='tools'){rememberToolControls();toolOrigin=null;delete state.settings.toolTask;persist();}
  if(target.dataset.nav){if(page===target.dataset.nav)return;if(target.dataset.nav==='accounts'){accountReturnPage=state.role==='打手'?'escort-home':'streamer-home';accountSelectedId='';}if(target.dataset.nav==='rental')rentalSelectedId='';page=target.dataset.nav;if(page==='streamer-home')await workflowPreparation.refreshReadiness();renderWithMotion();return;}
  if(target.dataset.role){state.role=target.dataset.role;workflowPhase='';optimizationDiagnosis=null;page=`${state.role==='打手'?'escort':'streamer'}-home`;persist();renderWithMotion();return;}
  if(target.dataset.roleEnter){
    if(roleEntering)return;roleEntering=true;
    try{
      if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches&&target.animate){
        await Promise.race([target.animate([{transform:'translateY(-3px) scale(1)',backgroundColor:'#ffffff'},{transform:'translateY(0) scale(.985)',backgroundColor:'#f2f6ff'}],{duration:120,easing:'ease-out',fill:'forwards'}).finished.catch(()=>{}),new Promise(resolve=>setTimeout(resolve,160))]);
      }
      state.role=target.dataset.roleEnter;workflowPhase='';optimizationDiagnosis=null;page=`${state.role==='打手'?'escort':'streamer'}-home`;persist();renderWithMotion();
    }finally{roleEntering=false;}
    return;
  }
  if(target.dataset.act==='tools-category'){currentToolsView().category=target.dataset.category;renderWithMotion('.tools-directory');return;}
  if(target.dataset.act==='tools-reset'){Object.assign(currentToolsView(),{category:'all',search:''});render();$('#tools-search')?.focus();return;}
  if(target.dataset.filter){state.settings.setup.filter=target.dataset.filter;persist();render();return;}
  const act=target.dataset.act;
  if(act==='account-view'){accountView=target.dataset.view;accountSelectedId='';render();return;}
  if(act==='account-detail-tab'){accountDetailTab=target.dataset.tab;render();return;}
  if(act==='account-close-detail'){const oldId=accountSelectedId;accountSelectedId='';render();[...document.querySelectorAll('.account-owner')].find(n=>n.dataset.id===oldId)?.focus({preventScroll:true});return;}
  if(act==='account-reset-filter'){accountView='all';accountSearch='';accountSelectedId='';render();return;}
  if(act==='account-return'){page=accountReturnPage;renderWithMotion();return;}
  if(act==='account-edit'){const account=state.accounts.find(a=>a.id===target.dataset.id);if(account)openAccountModal(account);return;}
  if(act==='unschedule-account'||act==='schedule-account'){
   const next=structuredClone(state);if(!next.accounts.some(a=>a.id===target.dataset.id))return;
   next.workspaceAccountIds=act==='unschedule-account'?next.workspaceAccountIds.filter(x=>x!==target.dataset.id):[target.dataset.id,...next.workspaceAccountIds.filter(x=>x!==target.dataset.id)];
   try{await commitState(next);render();toast(act==='unschedule-account'?'已移出名单，账号资料与历史保留':'已加入本周工作台名单');}catch(error){toast('名单未保存：'+error.message,true);}return;
  }

  if(commitBusy)return;
  try{if(await releaseAction(act))return;}catch(error){toast(error.message,true);return;}
  try{if(await rentalAction(act,target))return;}catch(error){toast(error.message,true);return;}
  if(orderCorrection&&['switch-home','new-order','edit-order'].includes(act)&&!['edit-order'].includes(act)){toast('请先保存或放弃结算更正',true);return;}
  if(act==='tool-return')return returnFromTool();
  if(act==='handoff-confirm')return confirmOutputHandoff(target.dataset.kind);
  if(act?.startsWith('repair-'))return frameRepairPage.action(act,target);
  if(act?.startsWith('order-')){try{return await orderAction(act,target);}catch(error){toast('操作未完成：'+error.message,true);return;}}
  if(act?.startsWith('workflow-'))return workflowAction(act,target);
  if(act==='preflight-tab')return openWorkflowTool(({plan:'setup',filters:'filters',sound:'sound',network:'network'})[target.dataset.tool]);
  if(act?.startsWith('stream-filter-'))return streamFilterPage.action(act,target);
  if(act?.startsWith('preflight-'))return preflightPage.action(act);
  if(act?.startsWith('performance-'))return performancePage.action(act,target);
  if(act==='export-highlights')return exportHighlights();
  if(act==='rename-session'){const session=window.QingchangHighlights.selected(state);if(!session)return;accountModal={kind:'rename-session',id:session.id};return modal('重命名直播场次',`<div class="field"><label>场次名称</label><input id="m-session-name" maxlength="100" value="${esc(session.title)}"></div>`);}
  if(act==='delete-clip'){if(confirm('删除这个精彩时刻标记？')){state.clips=state.clips.filter(x=>x.id!==target.dataset.id);persist();render();}return;}
  if(act==='focus-clip'){document.getElementById('clip-'+target.dataset.id)?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});return;}

  if(act==='mute-monitor-alerts'){try{monitorStatus=await api.muteMonitorAlerts(!(monitorStatus?.alerts?.mutedUntil>Date.now()));updateMonitorAlertSummary();}catch(error){toast(error.message,true);}return;}
  if(act==='install-monitor-sensors'){try{await api.installMonitorSensors();toast('已打开官方 PawnIO 安装程序，完成后点击“重新读取传感器”；未使用管理员权限时需重开轻场');}catch(error){toast(error.message,true);}return;}
  if(['refresh-monitor','start-monitor','stop-monitor','save-monitor','probe-monitor','retry-frame-monitor'].includes(act))return monitorAction(act);
  if(act==='maintenance-view'){if(maintenanceView===target.dataset.view)return;maintenanceView=target.dataset.view;renderWithMotion('.background-workspace, .cache-workspace, .maintenance-nav + .card');return;}
  if(act==='optimization-tab')return openWorkflowTool(target.dataset.tab==='overview'?'optimize':target.dataset.tab);
  if(act==='refresh-maintenance')return refreshMaintenance();
  if(['start-background','stop-background','clean-memory','select-maintenance-game','inspect-cache','backup-cache','restore-cache'].includes(act))return maintenanceAction(act,target.dataset.id);
  if(act==='modal-back'){if(event.target===target&&!accountModal?.busy)closeAccountModal();return;}
  if(act==='close-modal'){if(accountModal?.busy)return;closeAccountModal();return;}
  if(act==='modal-submit')return saveModal();
  if(act==='new-account')return openAccountModal();
  if(act==='new-order')return openNewOrder();
  if(act==='clear-week'){if(confirm('只清空当前工作台列表？账号密码、上号与打过历史都会保留。')){try{await commitState({...state,workspaceAccountIds:[],workspaceWeek:weekKey()});render();toast('本周工作台已清空，账号档案与历史仍保留');}catch(error){toast('名单未清空：'+error.message,true);}}return;}
  if(act==='import-csv'){const input=document.createElement('input');input.type='file';input.accept='.csv,text/csv';input.onchange=async()=>{const file=input.files[0];if(!file)return;importCSV(await file.text(),file.name);};input.click();return;}
  if(act==='mark-login')return accountEvent(target.dataset.id,'login');
  if(act==='mark-played')return accountEvent(target.dataset.id,'played');
  if(act==='show-account'){const a=state.accounts.find(x=>x.id===target.dataset.id);if(a)showAccount(a);return;}
  if(act==='reveal'){const input=$(`#${target.dataset.target}`);input.type=input.type==='password'?'text':'password';target.textContent=input.type==='text'?'隐藏':'显示';if(target.hasAttribute('aria-label'))target.setAttribute('aria-label',target.textContent+(input.id==='detail-password'?'账号密码':'游戏账号'));return;}
  if(act==='copy-field'){const a=state.accounts.find(x=>x.id===target.dataset.id);if(a){await api.copySecret(target.dataset.kind==='password'?a.password:a.account);toast('已复制；30 秒后轻场会清除剪贴板');}return;}
  if(act==='settlement-focus')return showOrderStage(activeOrderObj()?.id,Number(target.dataset.step)||2);
  if(act==='edit-order'){if(orderCorrection)return toast('请先保存或放弃结算更正',true);settlementErrors=[];return showOrderStage(target.dataset.id);}
  if(act==='advance-order')return advanceOrder(target.dataset.id);
  if(act==='add-segment'){const o=editableOrder(target.dataset.id);if(orderWritable(o)){const wasEmpty=!o.segments.length;o.segments.push(QingchangOrderFlow.segment({},id()));orderRecordId=o.segments.at(-1).id;orderEditingRecord=true;if(wasEmpty)o.activeSegmentId=o.segments[0].id;activeOrder=o.id;persistOrder(o);render();}return;}
  if(act==='remove-segment'){const o=editableOrder(target.dataset.order);if(orderWritable(o)){if(o.activeSegmentId===target.dataset.segment&&o.segments.length>1&&o.status==='进行中')return toast('请先在陪玩工作台选择另一个当前账号，再移除此账号',true);o.segments=o.segments.filter(s=>s.id!==target.dataset.segment);if(o.activeSegmentId===target.dataset.segment)o.activeSegmentId='';persistOrder(o);render();}return;}
  if(act==='accept-ocr-balance'){const o=editableOrder(target.dataset.id);if(!orderWritable(o))return;const s=o?.segments.find(x=>x.id===target.dataset.segment);const field=target.dataset.field;if(s&&['startBalance','endBalance'].includes(field)){const suggestion=s[`${field}Suggestion`];if(suggestion){s[field]=suggestion;delete s[`${field}Suggestion`];state.demo=false;persistOrder(o);render();toast(`已确认并填入 ${suggestion}`);}}return;}
  if(act==='add-checkpoint'){if(!orderWritable(editableOrder(target.dataset.order))||orderCorrection)return toast('历史结算的截图节点保持原记录；请在更正中更新前后截图',true);return openCheckpoint(target.dataset.order,target.dataset.segment);}
  if(act==='stream-toggle')return state.stream.active?toggleStream():startWorkflowSession();
  if(act==='clip-marker')return markHighlight();
  if(act==='edit-clip'){const c=state.clips.find(x=>x.id===target.dataset.id);if(c){accountModal={kind:'clip-edit',id:c.id};modal('编辑精彩时刻说明',`<div class="form-grid"><div class="field"><label>片段名称</label><input id="m-clip-title" value="${esc(c.title)}"></div><div class="field"><label>地图 / 模式</label><input id="m-clip-map" value="${esc(c.map)}"></div><div class="field full"><label>备注</label><textarea id="m-clip-note">${esc(c.note)}</textarea></div></div><div class="notice" style="margin-top:12px">按键时刻 ${stamp(c.at)} · 时间轴窗口为前后各 5 分钟。</div>`,'保存说明');}return;}
  if(act==='export-title')return exportTitle();
  if(act==='apply-title-color')return applyTitleColor();
  if(act==='title-selection-clear'){titleSelection.start=-1;titleSelection.end=-1;renderTitleDetail();return;}
  if(act==='title-selection-reset')return resetSelectedTitleStyle();
  if(act.startsWith('title-selection-'))return toggleSelectedTitleEffect(act.slice('title-selection-'.length));
  if(act==='reset-title-colors'){state.settings.title.colors=[];persist();render();toast('已清除分段颜色');return;}
  if(act==='title-preset'){const chars=Array.from(state.settings.title.text);state.settings.title.colors=chars.map((_,i)=>i<4?'#f5dd24':i<8?'#ff432b':'#32e5f4');persist();drawTitle();toast('已应用三段游戏风配色');return;}
  if(act==='backup')return openBackup('backup');
  if(act==='restore')return openBackup('restore');
  
  if(act==='save-shortcuts'){const s=$('[data-shortcut="session"]').value;const m=$('[data-shortcut="marker"]').value;if(s===m)return toast('开播键和精彩时刻键需要使用不同按键',true);try{await commitState({...state,settings:{...state.settings,shortcuts:{session:s,marker:m}}});shortcutState=await api.shortcutStatus();render();const failed=Object.values(shortcutState).filter(x=>!x.ok);toast(failed.length?'快捷键未启用：'+failed.map(x=>x.key+' 被占用或不可用').join('、'):`快捷键已启用：${s} / ${m}`,!!failed.length);}catch(error){toast(error.message,true);}return;}
  if(act==='copy-clip-time'){const clip=state.clips.find(x=>x.id===target.dataset.id);if(clip){try{await navigator.clipboard.writeText(QingchangHighlights.format(clip.offsetMs)+' '+(clip.title||'精彩操作'));toast('时间节点已复制');}catch{toast('无法复制，请保持轻场在前台后重试，或导出时间清单',true);}}return;}
  if(act==='obs-connect')return connectOBS();
  if(act==='apply-setup')return applySetup();
  if(act==='restore-obs')return restoreOBS();
  if(act==='apply-filter')return applyFilter();
  if(act==='speed-test')return speedTest();
  if(act==='refresh-optimization'){optimizationInfo=null;optimizationError='';optimizationDiagnosis=null;render();return;}
  if(act==='toggle-opt-check'){const config=state.settings.optimization ||= {};const checks=config.checks ||= {};const roleChecks=checks[state.role] ||= {};roleChecks[target.dataset.id]=!roleChecks[target.dataset.id];persist();render();return;}
  if(act==='apply-performance-power')return applyPerformancePower();
  if(act==='restore-performance-power')return restorePerformancePower();
  if(act==='apply-opt-tweak')return applyOptimizationTweak(target.dataset.id);
  if(act==='restore-opt-tweak')return restoreOptimizationTweak(target.dataset.id);
  if(act==='sample-optimization')return sampleOptimization();
  if(act==='apply-role-optimization')return applyRoleOptimization();
  if(act==='restore-all-optimization')return restoreAllOptimization();
  if(act==='elevate-qingchang')return saveNow().then(()=>api.relaunchAdmin()).catch(error=>toast(`无法进入管理员模式：${error.message}`,true));
  if(act==='open-nvidia-app')return api.openNvidiaApp().catch(error=>toast(error.message,true));
  if(act==='select-nvidia-game')return api.selectNvidiaGame().then(file=>{if(!file)return;const config=state.settings.optimization ||= {};config.nvidiaGame=file;delete config.nvidiaPending;persist();render();}).catch(error=>toast(error.message,true));
  if(act==='prepare-nvidia')return prepareNvidiaProfile();
  if(act==='import-nvidia')return api.openNvidiaPreset(state.settings.optimization?.nvidiaPending?.file).then(()=>toast('已启动 NVIDIA 配置导入；请在驱动和游戏中检查实际结果')).catch(error=>toast(error.message,true));
  if(act==='open-nvidia-backup')return api.openNvidiaBackup(state.settings.optimization?.nvidiaBackup).catch(error=>toast(error.message,true));
  if(act==='apply-gpu-spoof')return applyGpuNameOverride();
  if(act==='restore-gpu-spoof')return restoreGpuNameOverride();
  if(act==='save-fps-comparison'){
    const before = Number($('[data-fps="before"]')?.value);
    const after = Number($('[data-fps="after"]')?.value);
    if (!Number.isInteger(before) || !Number.isInteger(after) || before < 1 || after < 1 || before > 1000 || after > 1000) return toast('请填写 1—1000 范围内的实际 FPS', true);
    const config = state.settings.optimization ||= {};
    config.fpsBefore = before; config.fpsAfter = after;
    persist(); render(); toast('帧率对比已保存'); return;
  }
  if(act==='avatar-open')return api.openAvatarControl?.();
  if(act==='avatar-output'){const result=await api.openAvatarOutput();state.settings.outputHandoffs||={};state.settings.outputHandoffs.avatar=QingchangOutputHandoff.exported(null,appInfo.runtimeId,Date.now());persist();render();return result;}
  if(act==='avatar-output-close')return api.closeAvatarOutput?.();
  if(act==='switch-home'){page='welcome';state.role='';persist();render();return;}
}

appRoot.addEventListener('click',event=>QingchangMotion.action(event,onClick).catch(error=>toast(error.message||'操作未完成，请重试',true)));
appRoot.addEventListener('change',async(event)=>{
  const target=event.target;
  if(target.matches('input.upload-file-input')){syncUploadSlots();return;}
  if(target.id==='m-rental-import-file'){
   const file=target.files?.[0];if(!file)return;
   try{const text=await readRentalImportFile(file);startRentalImportPreview(text,file.name);}catch(error){toast('文件读取失败：'+error.message,true);}
   return;
  }
  if(target.id==='m-order-rental'){
   const lease=rentalLeaseById(target.value);accountModal.rentalLeaseId=lease?.id||'';
   const copyButton=document.querySelector('[data-act="rental-copy-order"]');if(copyButton)copyButton.disabled=!lease;
   if(lease){
    $('#m-order-account-name').value=QingchangRentalModel.displayName(lease);
    $('#m-order-start-balance').value='';
    const ratio=QingchangRentalModel.ratioCoinsToWan(lease.defaultCoinPerYuan);if(ratio!=='')$('#m-order-ratio').value=ratio;
    if(lease.defaultSuitPrice!==''&&lease.defaultSuitPrice!=null)$('#m-order-suit-price').value=lease.defaultSuitPrice;
    if(lease.defaultAmmoPrice!==''&&lease.defaultAmmoPrice!=null)$('#m-order-ammo-price').value=lease.defaultAmmoPrice;
    $('#m-order-account').value='';
   }
   return;
  }
  if(target.id==='m-rental-order-mode'){
   const existing=target.value==='existing';const newBlock=document.querySelector('[data-rental-order-new]'),oldBlock=document.querySelector('[data-rental-order-existing]');
   if(newBlock)newBlock.hidden=existing;if(oldBlock)oldBlock.hidden=!existing;
   return;
  }
  if(target.id==='m-rental-order-existing'){
   const order=state.orders.find(x=>x.id===target.value),current=QingchangWorkflowProgress.currentSegment(order),note=document.querySelector('[data-rental-existing-note]');
   if(note)note.textContent=order?(current?`保存后会先结束「${current.accountName||'当前账号'}」的余额记录，再进入换号并核对这个号的开始余额。`:'这笔订单还没有当前账号；保存后会把选中的号加入并开始使用。'):'请选择一笔现有订单。';
   return;
  }
  if(target.id==='swap-rental-lease'){
   const lease=rentalLeaseById(target.value);accountModal.nextLeaseId=lease?.id||'';
   const name=$('#swap-nextName'),ratio=$('#swap-nextRatio'),start=$('#swap-nextStart'),login=$('#swap-nextLogin'),password=$('#swap-nextPassword'),saveWrap=document.querySelector('[data-swap-save-wrap]'),note=document.querySelector('[data-swap-lease-note]');
   if(lease){
    if(name)name.value=QingchangRentalModel.displayName(lease);
    if(ratio)ratio.value=QingchangRentalModel.ratioCoinsToWan(lease.defaultCoinPerYuan);
    if(start)start.value='';
    if(login){login.value=lease.loginAccount||'';login.disabled=true;}
    if(password){password.value='';password.disabled=true;password.placeholder='使用租号资料中的密码';}
    if(saveWrap)saveWrap.hidden=true;
    if(note)note.textContent='已选择租号资料；开始余额仍需核对，密码不会复制到订单。';
   }else{
    if(login){login.value='';login.disabled=false;}
    if(password){password.value='';password.disabled=false;password.placeholder='可暂缺';}
    if(saveWrap)saveWrap.hidden=false;
    if(note)note.textContent='未选择租号资料：可以临时录入；勾选保存后会把登录账号和密码存入租号管理。';
   }
   return;
  }
  if(/^m-rental-(suit|ammo)-used$/.test(target.id)){const prefix=target.id.split('-')[2];const node=document.querySelector(`[data-rental-item="${prefix}"]`);if(node)node.hidden=!target.checked;return;}
  if(target.dataset.accountSort!==undefined){accountSort=target.value;render();return;}
  if(target.hasAttribute('data-workflow-mode')){if(state.settings.setup.mode!==target.value){state.settings.setup.mode=target.value;state.settings.workflow={...QingchangWorkflowModel.preferences(state.settings.workflow),program:'',saved:false};persist();render();}return;}
  if(target.dataset.workflowPref){state.settings.workflow={...QingchangWorkflowModel.preferences(state.settings.workflow),[target.dataset.workflowPref]:target.checked};persist();return;}
  if(target.hasAttribute('data-highlight-session')){state.highlightSelectedSessionId=target.value;persist();render();return;}
  if(target.hasAttribute('data-memory-threshold'))return updateMemoryConfig({threshold:Number(target.value)});
  if(target.hasAttribute('data-memory-enabled'))return updateMemoryConfig({enabled:target.checked});
  if(target.hasAttribute('data-monitor-gpu')){const previous=monitorStatus?.config?.gpuId||'auto';target.disabled=true;try{monitorStatus=await api.configureMonitor({gpuId:target.value});state.settings.monitor=monitorStatus.config;persist();paintMonitorReadings(monitorStatus);}catch(error){target.value=previous;toast(error.message,true);}finally{target.disabled=false;}return;}
  if(target.hasAttribute('data-monitor-game')){monitorPid=Number(target.value)||0;return;}
  if(target.hasAttribute('data-live-monitor')){if(optimizationSampling)return;const cfg=state.settings.optimization ||= {};cfg.liveMonitor=target.value;optimizationDiagnosis=null;persist();render();return;}
  if(target.dataset.memoryName){const names=new Set(maintenanceStatus?.config.names||[]);target.checked?names.add(target.dataset.memoryName):names.delete(target.dataset.memoryName);return updateMemoryConfig({names:[...names]});}
  if(target.matches('#m-source')){$('#m-custom-wrap')?.classList.toggle('hidden',target.value!=='其他');return;}
  if(target.dataset.currentSegment!==undefined){const order=state.orders.find(x=>x.id===target.dataset.order);if(!order||!order.segments.some(x=>x.id===target.value))return;if(order.status!=='进行中'){target.value=order.activeSegmentId||'';toast('订单暂停或已结束时不能切换当前账号',true);return;}if(orderScreenshotPending){target.value=order.activeSegmentId||'';toast('截图正在识别，完成后再切换当前账号',true);return;}if(target.value!==order.activeSegmentId){target.value=order.activeSegmentId||'';toast('换号请使用“换号并留证”，避免覆盖旧账号余额和使用记录',true);return;}return;}
  if(target.dataset.orderSelect!==undefined){if(orderCorrection){toast('请先保存或放弃结算更正',true);render();return;}try{await flushSave();activeOrder=target.value;state.selectedOrderId=activeOrder;settlementFocus=null;orderRecordId='';orderEditingRecord=false;persist();render();window.scrollTo(0,0);}catch(error){toast('切换前保存失败：'+error.message,true);}return;}
  if(target.dataset.orderRecord!==undefined){orderRecordId=target.value;render();return;}
  if(target.dataset.orderBilling!==undefined){const order=editableOrder(target.dataset.id);if(order?.status==='未开始'){order.billingMode=target.value==='none'?'none':'rental';persistOrder(order);render();}return;}
  if(target.id==='m-order-mode'){document.querySelectorAll('[data-create-rental]').forEach(n=>n.hidden=target.value==='none');return;}
  if(target.id==='m-order-account'){const account=state.accounts.find(x=>x.id===target.value);if(account)$('#m-order-account-name').value=account.owner||account.region||'账号';return;}
  if(/^m-order-(suit|ammo)-used$/.test(target.id)){const prefix=target.id.split('-')[2];document.querySelector('[data-create-item="'+prefix+'"]').hidden=!target.checked;return;}
  if(target.dataset.setting==='goal'){state.settings.goal=Number(target.value)||0;persist();render();return;}
  if(target.dataset.itemUnused){const o=editableOrder(target.dataset.order),seg=o?.segments.find(x=>x.id===target.dataset.segment);if(seg&&orderWritable(o)){seg[target.dataset.itemUnused+'Unused']=target.checked;persistOrder(o);render();}return;}
  if(target.dataset.orderField){updateOrderInput(target);return;}
  if(target.dataset.ratioWan){updateOrderInput(target);return;}
  if(target.dataset.seg){updateOrderInput(target);return;}
  if(target.dataset.shot)return saveOrderShot(target);
  if(target.dataset.setup){const key=target.dataset.setup;if(key==='mode'){try{await flushSave();const value=await api.configureMonitor({liveSource:target.value});monitorStatus=value;state.settings.monitor=value.config;state.settings.setup.mode=value.config.liveSource;toolControlDrafts.delete('monitor');mountedToolKey='';}catch(error){toast('监测来源未切换：'+error.message,true);render();return;}}else state.settings.setup[key]=target.value;if(['mode','profile'].includes(key))render();persist();return;}
  if(target.dataset.nvidiaField){const config=state.settings.optimization ||= {};config[`nvidia${target.dataset.nvidiaField[0].toUpperCase()}${target.dataset.nvidiaField.slice(1)}`]=target.value;delete config.nvidiaPending;persist();render();return;}
  if(target.id==='obs-scene'){loadObsSources().catch(e=>toast(e.message,true));return;}
  if(target.dataset.shortcut){return;}
  if(target.dataset.titleSelection==='font'){applySelectedTitleField('font',Number(target.value));return;}
  if(target.dataset.titleField){updateTitleSetting(target);return;}
});
appRoot.addEventListener('compositionend',event=>{if(event.target.dataset.search==='tools'){currentToolsView().search=event.target.value;render();}});
appRoot.addEventListener('input',(event)=>{
  const t=event.target;
  if(updateOrderInput(t))return;
  if(t.dataset.search==='tools'){currentToolsView().search=t.value;if(!event.isComposing)render();return;}
  if(t.id==='correction-reason'&&orderCorrection){orderCorrection.reason=t.value;return;}
  if(t.id==='title-color'){applyTitleColor(false);return;}
  if(t.dataset.titleSelection==='color'){applySelectedTitleField('color',t.value);return;}
  if(t.dataset.titleField){updateTitleSetting(t);return;}
  if(t.dataset.search==='orders'){orderSearch=t.value;const pos=t.selectionStart;render();const n=$('[data-search="orders"]');n?.focus();n?.setSelectionRange(pos,pos);return;}
  if(t.dataset.search==='accounts'){accountSearch=t.value;accountSelectedId='';const pos=t.selectionStart;render();const n=$('[data-search="accounts"]');n?.focus();n?.setSelectionRange(pos,pos);return;}
  if(t.dataset.search==='rental'){rentalSearch=t.value;rentalSelectedId='';const pos=t.selectionStart;render();const n=$('[data-search="rental"]');n?.focus();n?.setSelectionRange(pos,pos);return;}
  if(t.dataset.rentalSwapSearch!==undefined){filterSwapLeases(t.value);return;}
  if(t.id==='title-text'){updateTitleText(t.value);return;}
});

appRoot.addEventListener('pointerdown',(event)=>{
  if(event.target.id!=='title-detail-canvas')return;
  const index=titleGlyphAtPointer(event,true);
  if(index<0){titleSelection.start=-1;titleSelection.end=-1;renderTitleDetail();return;}
  titleSelection.anchor=index;titleSelection.start=index;titleSelection.end=index;titleSelection.dragging=true;
  event.target.setPointerCapture(event.pointerId);event.preventDefault();renderTitleDetail();
});
appRoot.addEventListener('pointermove',(event)=>{
  if(!titleSelection.dragging||event.target.id!=='title-detail-canvas')return;
  const index=titleGlyphAtPointer(event,false);
  if(index<0)return;
  titleSelection.start=Math.min(titleSelection.anchor,index);
  titleSelection.end=Math.max(titleSelection.anchor,index);
  renderTitleDetail();
});
appRoot.addEventListener('pointerup',()=>{titleSelection.dragging=false;});
appRoot.addEventListener('pointercancel',()=>{titleSelection.dragging=false;});

function updateTitleText(nextText) {
  const title=ensureTitleSettings(state.settings.title);
  const before=Array.from(title.text||'');
  const after=Array.from(nextText);
  let prefix=0;
  while(prefix<before.length&&prefix<after.length&&before[prefix]===after[prefix])prefix++;
  let suffix=0;
  while(suffix<before.length-prefix&&suffix<after.length-prefix&&before[before.length-1-suffix]===after[after.length-1-suffix])suffix++;
  const removed=before.length-prefix-suffix;
  const added=after.length-prefix-suffix;
  title.colors.splice(prefix,removed,...Array(added).fill(undefined));
  title.charStyles.splice(prefix,removed,...Array(added).fill(undefined));
  title.text=nextText;
  titleSelection.start=-1;titleSelection.end=-1;
  persist();drawTitle();
}

function updateTitleSetting(input) {
  const key=input.dataset.titleField;
  const title=ensureTitleSettings(state.settings.title);
  const value=input.type==='checkbox'?input.checked:input.type==='number'||key==='font'?Number(input.value):input.value;
  if(typeof value==='number'&&!Number.isFinite(value))return;
  title[key]=value;if(key==='fillColor')title.colors=[];
  persist();drawTitle();
}

document.addEventListener('keydown',(event)=>{if(event.key==='Escape'&&accountModal){accountModal=null;render();}});

let titleDrawVersion = 0;
const titleSelection = { start:-1, end:-1, anchor:-1, dragging:false };
let titleDetailGeometry = null;
async function drawTitle() {
  const canvas = $('#title-canvas');
  if (!canvas) return;
  const title = ensureTitleSettings(state.settings.title);
  const revision = ++titleDrawVersion;
  const fontSpecs = new Set([`${Number(title.font)||0}:${Number(title.weight)||900}`]);
  title.charStyles.forEach((style,index)=>{if(style?.font!==undefined||style?.weight!==undefined){const effective=titleCharacterStyle(title,index);fontSpecs.add(`${effective.font}:${effective.weight}`);}});
  try { await Promise.all([...fontSpecs].map(spec=>{const [font,weight]=spec.split(':').map(Number);return document.fonts.load(`${weight} ${Number(title.size) || 88}px ${TITLE_FONTS[font][1]}`, title.text || '标题');})); }
  catch (_) { /* A missing local font falls back to the next installed font. */ }
  if (revision !== titleDrawVersion || page !== 'titles' || !canvas.isConnected) return;
  const glyphs = drawTitleCanvas(canvas, title);
  const detail = $('#title-detail-canvas');
  if (detail) {
    const cropWidth = 1000;
    const cropHeight = detail.height / 1.4;
    const cx = canvas.width * Number(title.x) / 100;
    const cy = canvas.height * Number(title.y) / 100;
    const sx = Math.max(0, Math.min(canvas.width - cropWidth, cx - cropWidth / 2));
    const sy = Math.max(0, Math.min(canvas.height - cropHeight, cy - cropHeight / 2));
    titleDetailGeometry = { sx, sy, cropWidth, cropHeight, glyphs };
    renderTitleDetail();
  }
  const fontLabel = $('#title-current-font');
  if (fontLabel) fontLabel.textContent = TITLE_FONTS[Number(title.font) || 0]?.[0] || TITLE_FONTS[0][0];
}
function titleSelectionRange() {
  if(titleSelection.start<0||titleSelection.end<0)return null;
  const length=Array.from(state.settings.title.text||'').length;
  if(titleSelection.start>=length)return null;
  return [titleSelection.start,Math.min(titleSelection.end,length-1)];
}
function renderTitleDetail() {
  const detail=$('#title-detail-canvas');const source=$('#title-canvas');const geometry=titleDetailGeometry;
  if(!detail||!source||!geometry)return;
  const ctx=detail.getContext('2d');const scale=detail.width/geometry.cropWidth;
  ctx.clearRect(0,0,detail.width,detail.height);
  ctx.drawImage(source,geometry.sx,geometry.sy,geometry.cropWidth,geometry.cropHeight,0,0,detail.width,detail.height);
  const range=titleSelectionRange();
  if(range){
    for(const glyph of geometry.glyphs){
      if(glyph.index<range[0]||glyph.index>range[1])continue;
      const b=glyph.bounds;const x=(b.left-geometry.sx)*scale;const y=(b.top-geometry.sy)*scale;const w=(b.right-b.left)*scale;const h=(b.bottom-b.top)*scale;
      ctx.fillStyle='rgba(40,105,232,.13)';ctx.strokeStyle='rgba(40,105,232,.82)';ctx.lineWidth=2;
      ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);
    }
  }
  syncTitleSelectionToolbar();
}
function titleGlyphAtPointer(event,requireClose) {
  const detail=$('#title-detail-canvas');const geometry=titleDetailGeometry;
  if(!detail||!geometry||!geometry.glyphs.length)return -1;
  const rect=detail.getBoundingClientRect();
  const px=(event.clientX-rect.left)*detail.width/rect.width;
  const py=(event.clientY-rect.top)*detail.height/rect.height;
  return titleGlyphAtDetailPoint(geometry,detail.width,px,py,requireClose);
}
function syncTitleSelectionToolbar() {
  const toolbar=$('#title-selection-toolbar');if(!toolbar)return;
  const range=titleSelectionRange();toolbar.hidden=!range;if(!range)return;
  const title=ensureTitleSettings(state.settings.title);
  const style=titleCharacterStyle(title,range[0]);
  const selected=Array.from(title.text).slice(range[0],range[1]+1).join('');
  $('#title-selection-label').textContent=`已选中 ${range[1]-range[0]+1} 字：${selected.length>18?`${selected.slice(0,18)}…`:selected}`;
  $('[data-title-selection="font"]').value=String(style.font);
  $('[data-title-selection="color"]').value=style.color;
  for(const [name,active] of Object.entries({weight:style.weight>=700,italic:style.italic,underline:style.underline,outline:Number(style.outline)>0,shadow:style.shadowEnabled})){
    const button=$(`[data-act="title-selection-${name}"]`);button?.classList.toggle('is-active',active);button?.setAttribute('aria-pressed',String(active));
  }
}
function applySelectedTitleField(key,value) {
  const range=titleSelectionRange();if(!range)return;
  const title=ensureTitleSettings(state.settings.title);
  for(let i=range[0];i<=range[1];i++){
    if(key==='color')title.colors[i]=value;
    else title.charStyles[i]={...(title.charStyles[i]||{}),[key]:value};
  }
  persist();drawTitle();
}
function toggleSelectedTitleEffect(name) {
  const range=titleSelectionRange();if(!range)return;
  const style=titleCharacterStyle(state.settings.title,range[0]);
  const changes={weight:style.weight>=700?400:900,italic:!style.italic,underline:!style.underline,outline:Number(style.outline)>0?0:4,shadowEnabled:!style.shadowEnabled};
  const key=name==='shadow'?'shadowEnabled':name;
  if(!(key in changes))return;
  applySelectedTitleField(key,changes[key]);
}
function resetSelectedTitleStyle() {
  const range=titleSelectionRange();if(!range)return;
  const title=ensureTitleSettings(state.settings.title);
  for(let i=range[0];i<=range[1];i++){delete title.charStyles[i];delete title.colors[i];}
  persist();drawTitle();
}
function applyTitleColor(notify=true) {
  const input=$('#title-text'),color=$('#title-color').value,title=ensureTitleSettings(state.settings.title);let range=titleSelectionRange();
  if(!range&&input.selectionEnd>input.selectionStart)range=[Array.from(input.value.slice(0,input.selectionStart)).length,Array.from(input.value.slice(0,input.selectionEnd)).length-1];
  if(!range){if(notify)toast('先在标题输入框或文字细节中选中要改色的文字',true);return;}
  for(let i=range[0];i<=range[1];i++)title.colors[i]=color;persist();drawTitle();if(notify)toast(`已为 ${range[1]-range[0]+1} 个字应用颜色`);
}

async function exportTitle(){const canvas=$('#title-canvas');if(!canvas)return;await drawTitle();const signature=QingchangOutputHandoff.revision(state.settings.title);try{const result=await api.saveTitle(canvas.toDataURL('image/png'));if(result.canceled)return;state.settings.outputHandoffs||={};state.settings.outputHandoffs.titles=QingchangOutputHandoff.exported(null,signature,Date.now(),result.file);persist();render();toast('标题 PNG 已保存，请在直播软件添加图片素材');}catch(error){toast('标题未导出：'+error.message,true);}}

function fillSystemInfo() {
  api.systemInfo().then(info=>{$('[data-hw="cpu"]')?.replaceChildren(document.createTextNode(`${info.cpuCores} 核`));$('[data-hw="memory"]')?.replaceChildren(document.createTextNode(`${info.memoryGb} GB`));}).catch(()=>{});
  if(state.settings.setup.mode==='obs'&&obsReady)refreshObsScenes().catch(error=>toast('OBS 场景未读取：'+error.message,true));
}
async function prepareNvidiaProfile() {
  if (optimizationApplying) return;
  const config = state.settings.optimization ||= {};
  const options = { preset: config.nvidiaPreset || (state.role === '主播' ? 'clarity' : 'performance'), model: config.nvidiaModel || (state.role === '主播' ? 'K' : 'C'), executable: config.nvidiaGame || optimizationInfo?.gamePath || '' };
  optimizationApplying = true; render();
  try {
    const result = await api.prepareNvidia(options);
    config.nvidiaPending = { file: result.file, preset: options.preset, model: options.model, createdAt: Date.now() };
    if (result.backup) config.nvidiaBackup = result.backup;
    await saveNow();
    toast('NVIDIA 配置已生成并备份；检查选择后点击“导入已生成配置”');
  } catch (error) { toast(`NVIDIA 配置未能准备完成：${error.message}`, true); }
  finally { optimizationApplying = false; if (page === 'optimize') render(); }
}
async function applyGpuNameOverride() {
  if (optimizationApplying) return;
  optimizationApplying = true; render();
  try {
    const backup = await api.gpuSpoofSnapshot();
    const config = state.settings.optimization ||= {};
    config.gpuSpoofBackup = backup;
    await saveNow();
    await api.applyGpuSpoof(backup);
    config.gpuSpoofApplied = true;
    await saveNow();
    toast('显卡显示名称已写入；重启电脑后检查');
  } catch (error) { toast(`显卡名称未能完整改写：${error.message}`, true); }
  finally { optimizationApplying = false; optimizationInfo = null; if (page === 'optimize') render(); }
}
async function restoreGpuNameOverride() {
  if (optimizationApplying) return;
  const config = state.settings.optimization || {};
  if (!config.gpuSpoofBackup) return toast('没有可恢复的显卡名称备份', true);
  optimizationApplying = true; render();
  try {
    await api.restoreGpuSpoof(config.gpuSpoofBackup);
    delete config.gpuSpoofBackup;
    delete config.gpuSpoofApplied;
    await saveNow();
    toast('已恢复原始显卡名称；重启电脑后检查');
  } catch (error) { toast(`恢复显卡名称失败：${error.message}`, true); }
  finally { optimizationApplying = false; optimizationInfo = null; if (page === 'optimize') render(); }
}
async function loadOptimizationInfo() {
  if (optimizationLoading) return;
  optimizationLoading = true;
  try { optimizationInfo = await api.optimizationInfo(); optimizationError = ''; }
  catch (error) { optimizationError = error.message || '本机检测失败，请稍后重新检测'; }
  finally { optimizationLoading = false; if (page === 'optimize') render(); }
}
async function refreshMaintenance() {
  if(maintenanceBusy)return;
  maintenanceBusy=true;maintenanceError='';render();
  try {
    const results=await Promise.allSettled([api.optimizationToolsStatus(),api.optimizationProcesses()]);
    if(results[0].status==='fulfilled')maintenanceStatus=results[0].value;else maintenanceError=results[0].reason.message;
    if(results[1].status==='fulfilled')maintenanceProcesses=results[1].value;else maintenanceError+=(maintenanceError?'；':'')+`后台程序读取失败：${results[1].reason.message}`;
  } finally {maintenanceBusy=false;if(page==='optimize')render();}
}
async function updateMemoryConfig(change) {
  if(maintenanceBusy)return;
  maintenanceBusy=true;render();
  try {maintenanceStatus=await api.configureOptimizationTools({...maintenanceStatus?.config,...change});maintenanceError='';}
  catch(error){maintenanceError=error.message;toast(error.message,true);}
  finally{maintenanceBusy=false;render();}
}
async function maintenanceAction(action,id) {
  if(maintenanceBusy)return;
  maintenanceBusy=true;maintenanceError='';render();
  try {
    if(action==='start-background'){maintenanceStatus=await api.startBackgroundResources();toast('后台资源让位已启用');}
    if(action==='stop-background'){maintenanceStatus=await api.stopBackgroundResources();toast(maintenanceStatus.resource.count?'仍有进程等待恢复，请查看提示':'后台程序已恢复',maintenanceStatus.resource.count>0);}
    if(action==='select-maintenance-game'){const file=await api.selectNvidiaGame();if(!file)return;const cfg=state.settings.optimization ||= {};cfg.nvidiaGame=file;delete cfg.nvidiaPending;await saveNow();maintenanceCache=null;}
    const executable=state.settings.optimization?.nvidiaGame||optimizationInfo?.gamePath||'';
    if(action==='clean-memory'){const result=await api.cleanOptimizationMemory();toast(`工作集减少 ${result.releasedMb} MB；${result.rows.length} 个进程参与`,result.rows.some(x=>!x.ok)||!result.rows.length);}
    if(['select-maintenance-game','inspect-cache'].includes(action))maintenanceCache=await api.inspectOptimizationCache(executable);
    if(action==='backup-cache'){await api.backupOptimizationCache(executable);maintenanceCache=await api.inspectOptimizationCache(executable);toast('PSO 缓存已备份，下次进入游戏会重新生成');}
    if(action==='restore-cache'){await api.restoreOptimizationCache(id);maintenanceCache=await api.inspectOptimizationCache(executable);toast('原 PSO 缓存已恢复');}
  } catch(error){maintenanceError=error.message;toast(error.message,true);}
  finally {try{maintenanceStatus=await api.optimizationToolsStatus();}catch(error){maintenanceError=error.message;}maintenanceBusy=false;if(page==='optimize')render();}
}
async function applyPerformancePower() {
  const previous = state.settings.optimization?.previousPowerGuid;
  try {
    const before = await api.optimizationInfo();
    if (before.highPerformance) { optimizationInfo = before; render(); toast('当前已经是 Windows 高性能电源计划'); return true; }
    state.settings.optimization = { ...(state.settings.optimization || {}), previousPowerGuid: previous || before.powerGuid };
    await saveNow();
    await api.applyPerformancePower();
    optimizationInfo = await api.optimizationInfo();
    render(); toast('已启用高性能计划；原电源计划已记下，可随时恢复'); return true;
  } catch (error) { optimizationInfo = null; optimizationError = ''; render(); toast(`未能启用高性能计划：${error.message}`, true); return false; }
}
async function restorePerformancePower() {
  const previous = state.settings.optimization?.previousPowerGuid;
  if (!previous) return toast('没有可恢复的原电源计划', true);
  try {
    await api.restorePowerPlan(previous);
    delete state.settings.optimization.previousPowerGuid;
    await saveNow();
    optimizationInfo = await api.optimizationInfo();
    render(); toast('已恢复原电源计划');
  } catch (error) { optimizationInfo = null; optimizationError = ''; render(); toast(`未能恢复原电源计划：${error.message}`, true); }
}
const OPT_GROUPS = {
  gameMode: [['gameMode', 1]], capture: [['backgroundCapture', 0], ['appCapture', 0]],
  mouse: [['mouseSpeed', '0'], ['mouseThreshold1', '0'], ['mouseThreshold2', '0']],
  keyboard: [['keyboardDelay', '0'], ['keyboardSpeed', '31']],
  startup: [['startupDelay', 0]], animation: [['windowAnimation', '0']],
  lastAccess: [['lastAccess', 0x80000003]], shortNames: [['shortNames', 1]],
  nvme: [['nvmeMemory', 1], ['nvmeLog', 0], ['nvmeIdle', 0]]
};
async function applyOptimizationTweak(group) {
  const actions = OPT_GROUPS[group];
  if (!actions) return;
  try {
    const config = state.settings.optimization ||= {};
    const backup = config.tweakBackup ||= {};
    const before = await api.optimizationInfo();
    for (const [id, value] of actions) {
      const current = before.tweaks[id];
      if (current.exists && current.value === value) continue;
      if (!backup[id]) { backup[id] = current; await saveNow(); }
      await api.setOptimization(id, value);
    }
    optimizationInfo = await api.optimizationInfo();
    const live=['mouse','keyboard'].includes(group)?await api.syncOptimizationInput(group):null;
    render(); toast(live?live.detail:'设置已应用并回读校验；原值已加密保存',live?.liveApplied===false); return true;
  } catch (error) { optimizationInfo = null; render(); toast(`应用失败：${error.message}`, true); return false; }
}
async function applyRoleOptimization() {
  if (optimizationApplying) return;
  const role = state.role;
  optimizationApplying = true;
  render();
  try {
    for (const group of ['gameMode', 'capture']) {
      if (!await applyOptimizationTweak(group)) return;
    }
    if (role === '打手' && !await applyPerformancePower()) return;
    toast(`${role === '主播' ? '主播稳播' : '陪玩高帧'}方案已应用，可在各项设置处恢复`);
  } finally { optimizationApplying = false; if (page === 'optimize') render(); }
}
async function restoreAllOptimization() {
  if (optimizationApplying) return;
  optimizationApplying = true; render();
  try {
    const config = state.settings.optimization || {};
    const entries = Object.entries(config.tweakBackup || {}).reverse();
    const inputGroups=new Set(entries.map(([id])=>id.startsWith('mouse')?'mouse':id.startsWith('keyboard')?'keyboard':'').filter(Boolean));
    for (const [id, before] of entries) {
      await api.restoreOptimization(id, before);
      delete config.tweakBackup[id];
      await saveNow();
    }
    if (config.previousPowerGuid) {
      await api.restorePowerPlan(config.previousPowerGuid);
      delete config.previousPowerGuid;
      await saveNow();
    }
    for(const group of inputGroups){const result=await api.syncOptimizationInput(group,true);if(!result.liveApplied)toast(result.detail,true);}
    optimizationInfo = await api.optimizationInfo();
    toast('轻场修改的设置已恢复');
  } catch (error) { toast(`恢复尚未完成：${error.message}`, true); }
  finally { optimizationApplying = false; optimizationInfo = null; if (page === 'optimize') render(); }
}
async function restoreOptimizationTweak(group) {
  const actions = OPT_GROUPS[group];
  if (!actions) return;
  const backup = state.settings.optimization?.tweakBackup || {};
  try {
    for (const [id] of actions.slice().reverse()) {
      if (!backup[id]) continue;
      await api.restoreOptimization(id, backup[id]);
      delete backup[id];
      await saveNow();
    }
    const live=['mouse','keyboard'].includes(group)?await api.syncOptimizationInput(group,true):null;
    optimizationInfo = await api.optimizationInfo(); render(); toast(live?`原设置已恢复；${live.detail}`:'已恢复这项设置的原值',live?.liveApplied===false);
  } catch (error) { optimizationInfo = null; render(); toast(`恢复失败：${error.message}`, true); }
}
function captureToolOrigin(){return QingchangToolTask.capture({page,role:state.role,phase:workflowPhase,orderId:page==='settlement'?activeOrder:state.selectedOrderId,step:settlementFocus?.step,recordId:orderRecordId,accountId:accountSelectedId,accountView,accountSearch,accountSort,scroll:scrollY});}
function openWorkflowTool(key){
 rememberToolControls();if(!currentToolKey()&&page!=='highlights'||!toolOrigin||toolOrigin.role!==state.role)toolOrigin=captureToolOrigin();
 if(key==='tools'){page='tools';toolOrigin=null;delete state.settings.toolTask;persist();renderWithMotion();return;}
 const target=QingchangToolsPage.route(key);if(!target)return;state.settings.toolTask=toolOrigin;persist();
 if(['network','sound'].includes(key))diagnosticOrigin=toolOrigin.page==='streamer-home'?toolOrigin.phase:'tools';
 page=target.page;if(page==='setup')setupToolTab=target.tab;if(page==='optimize'){optimizationTab=target.tab;optimizationEntry=key;}
 renderWithMotion();window.scrollTo(0,0);
 if(key==='repair')frameRepairPage.refresh();if(key==='sound')preflightPage.refresh();if(key==='comparison')performancePage.refresh();if(key==='maintenance')refreshMaintenance();
}
async function returnFromTool(){
 rememberToolControls();preflightPage?.leave();await flushSave();const task=QingchangToolTask.resolve(toolOrigin,state);state.role=task.role;page=task.page;workflowPhase=task.phase;
 if(task.orderId&&state.orders.some(o=>o.id===task.orderId)){activeOrder=task.orderId;state.selectedOrderId=task.orderId;settlementFocus={orderId:task.orderId,step:task.step};orderRecordId=task.recordId;}
 accountSelectedId=task.accountId;accountView=task.accountView;accountSearch=task.accountSearch;accountSort=task.accountSort;
 if(page==='streamer-home')await workflowPreparation.refreshReadiness();renderWithMotion();window.scrollTo(0,task.scroll);persist();if(task.missing)toast('原订单已不存在，已返回陪玩工作台',true);
}
function outputInfo(kind){const H=QingchangOutputHandoff,checks=state.settings.outputHandoffs||{};
 if(kind==='filters'){const value=state.settings.setup.streamFilter,signature=H.revision({params:QingchangStreamFilter.signature(QingchangStreamFilter.normalize(value?.params)),file:value?.lastExport?.file||''});const valid=!!value?.lastExport?.file&&value.lastExport.signature===QingchangStreamFilter.signature(QingchangStreamFilter.normalize(value.params));return {signature,check:checks.filters,valid};}
 if(kind==='titles'){const signature=H.revision(state.settings.title);return {signature,check:checks.titles,valid:!!checks.titles?.file&&checks.titles.signature===signature};}
 return {signature:appInfo.runtimeId,check:checks.avatar,valid:checks.avatar?.signature===appInfo.runtimeId,runtime:appInfo.runtimeId};
}
function mountOutputHandoff(){const key=currentToolKey();if(!['titles','filters','avatar'].includes(key))return;const info=outputInfo(key),status=QingchangOutputHandoff.status(info.check,info.signature,info.runtime),confirmed=status==='confirmed';
 const names={filters:'滤镜',titles:'标题图片',avatar:'安全输出画面'},steps={filters:['导出直播伴侣预设包，保留 ZIP 文件。','在直播伴侣的游戏素材中选择“滤镜 → 预设效果 → 导入预设”，选择刚才导出的文件。','选中轻场预设并开启滤镜，核对预览与观众画面后确认。'],titles:['导出透明背景 PNG，记住保存位置。','在直播伴侣或 OBS 中添加图片素材，选择导出的 PNG。','调整位置与大小，核对观众输出后确认。'],avatar:['打开独立安全输出画面。','在直播软件中添加窗口采集，选择轻场安全输出窗口。','切换一次安全场景，核对未暴露账号资料或玩家 ID 后确认。']};
 const node=document.createElement('section');node.className='tool-handoff'+(confirmed?' is-confirmed':'');node.innerHTML='<h2>'+names[key]+'接入确认</h2><p>'+(confirmed?'已由你确认接入，实际直播画面仍以直播软件为准。':status==='changed'?'内容已变化，请重新输出并接入。':status==='recheck'?'应用已重开，请重新核对输出窗口来源。':info.valid?'已输出，等待你在直播软件接入并核对。':'先完成输出，再到直播软件中接入。')+'</p><ol>'+steps[key].map(x=>'<li>'+x+'</li>').join('')+'</ol><button class="btn '+(confirmed?'':'primary')+'" data-act="handoff-confirm" data-kind="'+key+'" '+(!info.valid?'disabled':'')+'>'+(confirmed?'再次确认当前画面':'我已在直播软件核对')+'</button>';
 document.querySelector('[data-tool-workspace]')?.append(node);
}
async function confirmOutputHandoff(kind){const info=outputInfo(kind);if(!info.valid)return toast('请先输出当前内容，再核对接入',true);const next=structuredClone(state);next.settings.outputHandoffs||={};const check=info.check?.signature===info.signature?info.check:QingchangOutputHandoff.exported(null,info.signature,null,state.settings.setup.streamFilter?.lastExport?.file||'');next.settings.outputHandoffs[kind]=QingchangOutputHandoff.confirm(check,info.signature,Date.now(),info.runtime);await commitState(next);render();toast('已记录你对当前画面的确认');}

async function workflowAction(act,target){
 if(act==='workflow-alert-open'){const session=QingchangWorkflowModel.currentSession(state);if(QingchangWorkflowProgress.recordAction(session,target.dataset.eventKey,target.dataset.tool))persist();return openWorkflowTool(target.dataset.tool);}
 if(act==='workflow-order-step')return showOrderStage(target.dataset.id,Number(target.dataset.step)||2);
 if(act==='workflow-tool')return openWorkflowTool(target.dataset.tool);
 if(act==='workflow-swap-account')return openSwapAccount(target.dataset.id);
 if(act==='workflow-return-prepare'||act==='workflow-return-diagnostic')return returnFromTool();
 if(act==='workflow-confirm-program'){workflowPreparation.confirm('program');return;}
 if(act==='workflow-confirm-picture'){workflowPreparation.confirm('picture');return;}
 if(act==='workflow-skip-check'){workflowPreparation.skip(target.dataset.key);return;}
 if(act==='workflow-continue-session'){recoveredSession=false;render();return;}
 if(act==='workflow-phase'){if(workflowPhase===target.dataset.phase)return;workflowPhase=target.dataset.phase;if(workflowPhase==='prepare')await workflowPreparation.refreshReadiness();renderWithMotion('.workflow-focus');return;}
 if(act==='workflow-retry-cleanup')return workflowPreparation.cleanup();
 if(act==='workflow-next-stream'){workflowPhase='prepare';workflowPreparation.reset();render();return;}
 if(act==='workflow-choose-program'){try{const file=await api.pickWorkflowProgram();if(file){state.settings.workflow={...QingchangWorkflowModel.preferences(state.settings.workflow),program:file};persist();if(workflowPreparation.status().preparedAt)await workflowPreparation.prepareProgram();render();}}catch(error){toast(error.message,true);}return;}
 if(act==='workflow-save-preferences'){state.settings.workflow={...QingchangWorkflowModel.preferences(state.settings.workflow),saved:true};persist();render();return;}
 if(act==='workflow-prepare'){state.settings.workflow={...QingchangWorkflowModel.preferences(state.settings.workflow),saved:true};persist();return workflowPreparation.prepare();}
 if(act==='workflow-start-timer')return startWorkflowSession();
 if(act==='workflow-finish-stream'){if(!state.stream.active)return;return toggleStream();}
 if(act==='workflow-export-clips'){const session=QingchangWorkflowModel.currentSession(state);if(!session)return;try{await flushSave();const result=await api.exportHighlights(session.id,'csv');if(!result.canceled)toast('本场标记已导出');}catch(error){toast(error.message,true);}return;}
}
function workflowAlertMarkup(x,active){const guide=QingchangMonitorAlerts.guidance(x.id,active),session=QingchangWorkflowModel.currentSession(state),event=[...(session?.anomalyEvents||[])].reverse().find(e=>e.kind===x.id&&!e.recoveredAt);return `<div class="workflow-alert-detail"><strong>${esc(x.title)}</strong><p>${esc(x.detail)}</p><p>${esc(guide.reason)}</p><p>${esc(guide.next)}</p><button class="btn sm" data-act="workflow-alert-open" data-tool="${guide.tool}" data-event-key="${esc(event?.key||'')}">${guide.label}</button>${event?.viewedAt?'<small>已查看处理入口；仍按新数据判断是否恢复。</small>':''}</div>`;}
function captureWorkflowEvents(value){if(!state||commitBusy)return;const session=QingchangWorkflowModel.currentSession(state);if(QingchangWorkflowProgress.capture(session,value?.alerts))persist();}
function paintWorkflowLiveStatus(value){const node=$('[data-workflow-live-status]');if(!node)return;const status=QingchangWorkflowProgress.summary(value,Date.now(),state.settings.setup.mode);const html=`<div class="workflow-status-heading"><strong>${esc(status.title)}</strong><p>${esc(status.detail)}</p>${status.tool?`<button class="btn sm" data-act="workflow-tool" data-tool="${status.tool}">${status.label}</button>`:''}</div>${status.warnings.map(x=>workflowAlertMarkup(x,status.warnings)).join('')}`;if(node.innerHTML!==html){const focused=node.contains(document.activeElement)?document.activeElement:null,act=focused?.dataset.act,key=focused?.dataset.eventKey,tool=focused?.dataset.tool;node.innerHTML=html;if(focused)[...node.querySelectorAll('button')].find(x=>x.dataset.act===act&&x.dataset.eventKey===key&&x.dataset.tool===tool)?.focus({preventScroll:true});}node.classList.toggle('has-warning',status.level==='warning');node.dataset.level=status.level;}

function paintMonitorReadings(value){const gpuSelect=document.querySelector('[data-monitor-gpu]');if(gpuSelect){const signature=JSON.stringify((value?.hardware?.gpus||[]).map(g=>[g.id,g.name,g.vendor]));if(gpuSelect.dataset.devices!==signature){gpuSelect.innerHTML=QingchangToolPages.gpuOptions(value,gpuSelect.value||value?.config?.gpuId||'auto');gpuSelect.dataset.devices=signature;}}const device=document.querySelector('[data-hardware-device]');if(device)device.textContent=QingchangToolPages.hardwareDevice(value);const warnings=document.querySelector('[data-hardware-warning-summary]');if(warnings)warnings.innerHTML=QingchangToolPages.hardwareWarnings(value);const hardware=document.querySelector('[data-tool-monitor-summary]');if(hardware)hardware.innerHTML=QingchangToolPages.monitorSummary(value,state.role);const live=document.querySelector('[data-monitor-stream-readings]');if(live)live.innerHTML=QingchangToolPages.streamSummary(value);}
function monitorStatusText(value){if(!value?.enabled)return '持续监测未开启，可读取一次电脑数据';const h=value.hardware,fresh=Number.isFinite(h?.at)&&Date.now()-h.at>=0&&Date.now()-h.at<=6500;return `${value.visible?'顶部悬浮条显示中':'顶部悬浮条已隐藏'} · ${fresh?'已读取电脑数据':'等待电脑读数'}${value.game?.state==='ready'&&Number.isFinite(value.game.fps)?' · 游戏 '+value.game.fps.toFixed(0)+' FPS':''}`;}
function monitorSensorText(value){const sensor=value?.hardware?.cpuSensors;return sensor?.state==='ready'?Number.isFinite(value?.hardware?.cpuTempC)&&Number.isFinite(value?.hardware?.cpuClockMhz)?'CPU 温度与实时频率已连接':Number.isFinite(value?.hardware?.cpuTempC)?'CPU 温度已连接；此型号未上报实时频率':'CPU 实时频率已连接；此型号未上报温度':sensor?.state==='driver-missing'?'CPU 传感器需要 PawnIO 驱动，点击安装后按向导完成。':sensor?.state==='permission'?'CPU 传感器需要管理员权限，请重新打开轻场。':sensor?.state==='unsupported'?'当前 CPU 没有返回兼容的传感器读数。':sensor?.state==='error'?'CPU 传感器采集失败，请检查驱动与权限。':'开始电脑监测或点击“读取一次”，将检测 CPU 传感器状态。';}
function monitorAlertsSummary(value){
 const a=value?.alerts,active=a?.active||[];
 const stateText=!value?.enabled?'开始监测后生效':!a?.enabled?'异常提醒已关闭':a.warming?'预热中 · 前 20 秒不提醒':active.length?`${active.length} 项持续异常`:a.liveArmed||a.gameArmed||Number.isFinite(value?.hardware?.at)&&Date.now()-value.hardware.at<=6500?'监测中 · 暂无持续异常':'等待新的电脑 / 游戏 / 推流数据';
 const soundText=a?.mutedUntil>Date.now()?'提示音已静音 10 分钟':a?.config?.sound?'提示音已开启':'提示音已关闭';
 return `<div class="alert-overview ${active.length?'has-warning':''}"><span class="alert-status-dot"></span><div><b>${esc(stateText)}</b><small>${esc(soundText)}</small></div><button class="btn sm" data-act="mute-monitor-alerts" ${!value?.enabled?'disabled':''}>${a?.mutedUntil>Date.now()?'取消静音':'静音 10 分钟'}</button></div>${active.map(x=>workflowAlertMarkup(x,active)).join('')}<details class="monitor-alert-history"><summary>本次提醒记录（${a?.history?.length||0}）</summary>${a?.history?.length?a.history.map(x=>`<p><time>${new Date(x.at).toLocaleTimeString('zh-CN',{hour12:false})}</time><span>${esc(x.title)}</span></p>`).join(''):'<p>尚无提醒记录，重新开始监测时清空。</p>'}</details>`;
}
function renderMonitorAlerts(cfg){const a=QingchangMonitorAlerts.normalize(cfg.alerts);return `<section class="monitor-alert-settings"><div class="monitor-alert-heading"><h3>异常提醒</h3><span>电脑硬件 · 游戏与推流</span></div><div data-monitor-alert-status aria-live="polite">${monitorAlertsSummary(monitorStatus)}</div><details class="monitor-options"><summary>提醒项目与阈值</summary><div class="monitor-alert-switches">${[['enabled','开启异常提醒'],['live','推流码率、帧率、OBS 跳帧及数据中断'],['hardware','硬件温度与持续高占用'],['game','游戏低帧率与数据中断'],['sound','播放系统提示音']].map(([key,label])=>`<label class="monitor-field-option"><input type="checkbox" data-alert-option="${key}" ${a[key]?'checked':''}>${label}</label>`).join('')}</div><div class="monitor-options-grid">${[['minBitrateKbps','码率下限（Kbps）',100,100000],['minStreamFps','推流帧率下限',1,120],['minGameFps','游戏帧率下限',1,500],['holdSeconds','游戏 / 推流持续秒数',4,60],['maxCpuTempC','CPU 温度提醒线（°C）',50,115],['maxGpuTempC','GPU 核心温度提醒线（°C）',50,110],['maxCpuPercent','CPU 占用提醒线（%）',50,100],['maxGpuPercent','GPU 占用提醒线（%）',50,100],['maxMemoryPercent','内存占用提醒线（%）',50,100],['maxVramPercent','显存占用提醒线（%）',50,100],['temperatureHoldSeconds','温度持续秒数',4,60],['hardwareHoldSeconds','高占用持续秒数',10,120]].map(([key,label,min,max])=>`<label>${label}<input class="input" type="number" data-alert-value="${key}" min="${min}" max="${max}" value="${a[key]}"></label>`).join('')}</div><p class="optimize-help">硬件默认提醒线：CPU 90°C、GPU 核心 85°C，持续 10 秒；CPU / 内存 90%、GPU / 显存 95%，持续 30 秒。它们是可调整的提醒线，不是所有型号统一的温度安全上限。核显的共享内存不计作独立显存容量。</p><p class="optimize-help">温度下降到提醒线以下 3°C、占用下降 5 个百分点，并稳定 5 秒后解除；缺失或过期数据停止判断，不能当作已经恢复正常。</p><p class="optimize-help">下限由你调整，并非自动判断最佳码率。修改后点击“保存监测条设置”。低值需持续达到设定秒数，且至少有 3 组新数据；恢复稳定 5 秒后解除。首次 20 秒不提醒，同一异常未恢复前不重复响铃，提示音至少间隔 60 秒。</p></details><p class="optimize-help">先取得本次新数据才判断中断；连续约 16 秒无新数据时提示，不把缺失值当成零。OBS 区分渲染跳帧、编码跳帧与网络丢帧，显示最近采样区间的增量；未推流不判断低码率。切屏、加载或主动下播也可能产生提醒，离开前可停止监测或关闭对应项目。</p></section>`;}
function updateMonitorAlertSummary(){const node=$('[data-monitor-alert-status]');if(!node)return;const html=monitorAlertsSummary(monitorStatus);if(node.dataset.lastMarkup!==html){const expanded=node.querySelector('details')?.open;node.innerHTML=html;node.dataset.lastMarkup=html;if(expanded)node.querySelector('details').open=true;}}
function readMonitorOptions(){return {gpuId:document.querySelector('[data-monitor-gpu]')?.value||monitorStatus?.config?.gpuId||'auto',liveSource:document.querySelector('[data-monitor-source]')?.value||'douyin',fields:[...document.querySelectorAll('[data-monitor-field]:checked')].map(x=>x.dataset.monitorField),displayId:$('#monitor-display').value,top:Number($('#monitor-top').value),opacity:Number($('#monitor-opacity').value),shortcut:$('#monitor-shortcut').value.trim(),alerts:Object.fromEntries([...document.querySelectorAll('[data-alert-option]')].map(x=>[x.dataset.alertOption,x.checked]).concat([...document.querySelectorAll('[data-alert-value]')].map(x=>[x.dataset.alertValue,Number(x.value)]))) };}
function renderMonitorControls(){const cfg=monitorStatus?.config||state.settings.monitor||{displayId:'primary',opacity:1,top:0,shortcut:'Ctrl+Shift+F10'};const source=cfg.liveSource||state.settings.setup.mode||'douyin';const disabled=monitorBusy?'disabled':'';return `<section class="card realtime-monitor-card"><div class="card-head"><div><h2>游戏与直播实时监测</h2><p>按需勾选游戏、硬件和直播指标；顶部居中显示，鼠标点击穿透。</p></div><span class="pill ${monitorStatus?.enabled?'green':'blue'}">${monitorStatus?.enabled?'运行中':'顶部悬浮条'}</span></div><div class="monitor-sensor-setup"><span data-monitor-sensor-status>${esc(monitorSensorText(monitorStatus))}</span><div><button class="btn sm" data-act="retry-frame-monitor" ${monitorBusy||!monitorStatus?.enabled?'disabled':''}>重新检测游戏帧</button><button class="btn sm" data-act="probe-monitor" ${disabled}>检测 / 重新读取传感器</button><button class="btn sm" data-act="install-monitor-sensors">安装 CPU 传感器驱动</button><button class="btn sm" data-act="elevate-qingchang">以管理员身份重新打开</button></div></div><details class="monitor-optional"><summary>直播软件统计（可选）</summary><div data-monitor-stream-readings>${QingchangToolPages.streamSummary(monitorStatus)}</div><div class="monitor-source-row"><label>推流监测来源<select class="select" data-monitor-source ${disabled}><option value="douyin" ${source==='douyin'?'selected':''}>抖音直播伴侣</option><option value="obs" ${source==='obs'?'selected':''}>OBS Studio</option></select></label><button class="btn sm" data-act="workflow-tool" data-tool="setup">OBS 连接设置</button><span>OBS 地址和密码在开播方案中保存；选择来源后保存或开始监测。</span></div></details><details class="monitor-options"><summary>游戏进程与帧率采集</summary><div class="monitor-controls-row"><label>游戏进程<select class="select" data-monitor-game ${disabled}><option value="0">自动识别三角洲 / 暂只监测推流</option>${monitorProcesses.map(x=>`<option value="${x.pid}" ${monitorPid===x.pid?'selected':''}>${esc(x.name)} · ${x.pid}</option>`).join('')}</select></label><button class="btn" data-act="refresh-monitor" ${disabled}>刷新进程</button></div></details><p class="monitor-current-status" data-monitor-status>${esc(monitorStatusText(monitorStatus))}</p>${monitorError?`<div class="notice warn">${esc(monitorError)}</div>`:''}${monitorStatus?.game?.state==='permission'?'<button class="btn sm" data-act="elevate-qingchang">以管理员身份重新打开，启用游戏 FPS</button>':''}<details class="monitor-options"><summary>更多 CPU 与游戏帧读数</summary><div class="monitor-diagnostics">${QingchangMonitorDiagnostics.readings(monitorStatus).map(x=>`<div class="monitor-diagnostic" data-diagnostic="${x.key}">${QingchangMonitorHelp.label(x.key,x.label)}<strong>${esc(x.value)}</strong><small>${esc(x.reason)}</small></div>`).join('')}</div></details><details class="monitor-options"><summary>硬件、游戏与推流异常提醒</summary>${renderMonitorAlerts(cfg)}</details><details class="monitor-options"><summary>悬浮条显示指标</summary><div class="monitor-field-settings"><h3>显示指标</h3><div class="monitor-field-grid">${['hardware','game','live'].map(group=>`<div><span class="monitor-group-label">${{game:'游戏',hardware:'电脑硬件',live:'推流与 OBS'}[group]}</span>${QingchangMonitorFields.fields.filter(x=>x.group===group).map(x=>`<label class="monitor-field-option"><input type="checkbox" data-monitor-field="${x.key}" ${QingchangMonitorFields.normalize(cfg.fields).includes(x.key)?'checked':''} ${disabled}>${x.key==='streamFps'&&source==='obs'?'OBS 渲染 FPS':x.label}</label>`).join('')}</div>`).join('')}</div><p class="optimize-help">勾选后点击下方保存，运行中的悬浮条会立即更新。1% Low 为最近 30 秒最慢 1% 帧的平均帧时间换算，至少积累 100 帧后显示。支持检测 NVIDIA、AMD、英特尔显卡；实际温度、频率与占用取决于该型号和驱动。硬件不支持或数据过期时显示 —。</p><p class="optimize-help">原生帧读取模拟节奏或上报帧类型；生成帧只按明确上报的补帧类型统计，无法识别时显示“未上报”，不代表已关闭补帧。CPU 温度和实时频率使用本机传感器，频率为各核心平均值。</p></div></details><details class="monitor-options"><summary>位置、透明度与快捷键</summary><div class="monitor-options-grid"><label>显示器<select class="select" id="monitor-display"><option value="primary">主显示器</option>${(monitorStatus?.displays||[]).map(x=>`<option value="${esc(x.id)}" ${String(cfg.displayId)===x.id?'selected':''}>${esc(x.label)}</option>`).join('')}</select></label><label>顶部间距<input class="input" id="monitor-top" type="number" min="0" max="100" value="${cfg.top??0}"></label><label>不透明度<input class="input" id="monitor-opacity" type="number" min="0.4" max="1" step="0.05" value="${cfg.opacity??1}"></label><label>显示 / 隐藏快捷键<input class="input" id="monitor-shortcut" value="${esc(cfg.shortcut||'Ctrl+Shift+F10')}"></label></div></details><details class="monitor-options monitor-glossary"><summary>看懂这些监测名词</summary><div class="monitor-glossary-list">${Object.entries(QingchangMonitorHelp.terms).map(([key,entry])=>`<div><b>${QingchangMonitorHelp.label(key,entry.title)}</b><p>${esc(entry.text[0])}</p></div>`).join('')}</div></details><button class="btn sm monitor-save" data-act="save-monitor" ${disabled}>保存监测条设置</button><p class="optimize-help">${esc(cfg.shortcut||'Ctrl+Shift+F10')} 显示 / 隐藏。最小化轻场仍运行，关闭轻场停止采集。建议游戏使用无边框全屏；游戏 FPS 按实际提交画面的间隔计算，可能与补帧后的显示帧率不同。</p></section>`;}
async function refreshMonitorControls(){const result=await Promise.allSettled([api.monitorStatus(),api.monitorProcesses()]);if(result[0].status==='fulfilled')monitorStatus=result[0].value;if(result[1].status==='fulfilled')monitorProcesses=result[1].value;monitorError=result[0].status==='rejected'?result[0].reason.message:result[1].status==='rejected'?'游戏进程列表暂不可用，仍可监测电脑。':'';if(page==='optimize')render();}
async function monitorAction(action){if(monitorBusy)return;const options=['save-monitor','start-monitor'].includes(action)?readMonitorOptions():null;monitorBusy=true;render();try{if(action==='refresh-monitor')await refreshMonitorControls();if(options){toolControlDrafts.delete('monitor');mountedToolKey='';monitorStatus=await api.configureMonitor(options);state.settings.monitor=monitorStatus.config;state.settings.setup.mode=monitorStatus.config.liveSource;persist();}if(action==='start-monitor')monitorStatus=await api.startMonitor(monitorPid);if(action==='retry-frame-monitor')monitorStatus=await api.startMonitor(monitorStatus?.selected?.pid||monitorPid);if(action==='stop-monitor')monitorStatus=await api.stopMonitor();if(action==='probe-monitor')monitorStatus=await api.probeMonitor();monitorError='';}catch(error){monitorError=error.message;toast(error.message,true);}finally{monitorBusy=false;render();}}
function renderMateDiagnosis(result) {
  if(!result.available)return `<section class="live-monitor-result"><h3>抖音直播伴侣</h3><div class="notice">${esc(result.message)} 本次没有用历史记录补齐，也没有将缺失值计为零。</div></section>`;
  const value=(n,unit='')=>Number.isFinite(n)?`${Number(n.toFixed(1))}${unit}`:'未提供';
  return `<section class="live-monitor-result"><div class="live-monitor-result-head"><h3>抖音直播伴侣 · 本次推流统计</h3><span class="pill ${result.partial||result.lastAtExpired?'orange':'blue'}">${result.samples} 组新数据</span></div><div class="grid four"><div class="metric"><div class="metric-label">平均输出帧率</div><strong>${value(result.outputFpsAvg,' FPS')}</strong><small>最低 ${value(result.outputFpsMin,' FPS')}</small></div><div class="metric"><div class="metric-label">最低编码输入帧率</div><strong>${value(result.encodingFpsMin,' FPS')}</strong><small>编码端接收的帧率</small></div><div class="metric"><div class="metric-label">平均实际码率</div><strong>${value(result.bitrateAvg,' kbps')}</strong><small>本机推流统计</small></div><div class="metric"><div class="metric-label">推流掉帧速率峰值</div><strong>${value(result.dropRateMax,' 帧/秒')}</strong><small>编码掉帧速率 ${value(result.encodeDropRateMax,' 帧/秒')}</small></div></div><p class="optimize-help">本地日志约每 2 秒更新；掉帧速率由 SDK 日志给出，缺失时显示“未提供”，不等同于网络丢包率。${result.partial?' 本次新数据较少，请在持续推流时重新检查。':''}${result.lastAtExpired?' 最近一组数据已经过期，请检查推流是否继续。':''}</p></section>`;
}
async function sampleOptimization() {
  if (optimizationSampling) return;
  const samplingRole=state.role;
  optimizationSampling = true;
  optimizationDiagnosis = null;
  render();
  try {
    const useMate=state.role==='主播'&&(state.settings.optimization?.liveMonitor||'douyin')==='douyin';
    const obsStart = state.role === '主播' && !useMate && obsReady ? await obsRequest('GetStats').catch(() => null) : null;
    const samples = [],mateSamples=[],startedAt=Date.now();
    for (let i = 0; i < 7; i++) {
      if(i)await new Promise(resolve=>setTimeout(resolve,Math.max(0,startedAt+i*2000-Date.now())));
      const [hardware,mate]=await Promise.all([api.optimizationSample(),useMate?api.douyinTelemetry().catch(error=>({available:false,message:`日志读取失败：${error.message}`})):null]);
      samples.push(hardware);if(mate)mateSamples.push(mate);
    }
    const obsEnd = obsStart && obsReady ? await obsRequest('GetStats').catch(() => null) : null;
    const max = values => values.length ? Math.max(...values) : null;
    const nums = key => samples.map(x => x[key]).filter(x => Number.isFinite(x));
    const gpuNums = key => samples.map(x => x.gpu?.[key]).filter(x => Number.isFinite(x));
    if(state.role!==samplingRole)return;
    optimizationDiagnosis = {
      cpuMax: max(nums('cpuPercent')), memoryMax: max(nums('memoryUsedPercent')),
      gpuMax: max(gpuNums('utilization')), tempMax: max(gpuNums('temperatureC')),
      obs: obsStart && obsEnd ? {
        renderSkipped: Math.max(0, obsEnd.renderSkippedFrames - obsStart.renderSkippedFrames),
        outputSkipped: Math.max(0, obsEnd.outputSkippedFrames - obsStart.outputSkippedFrames),
        fps: Number(obsEnd.activeFps || 0).toFixed(1)
      } : null,
      mate:useMate?await api.summarizeDouyinTelemetry(mateSamples,startedAt):null
    };
    if(useMate){const cfg=state.settings.optimization ||= {};cfg.lastMateCheck={at:Date.now(),...optimizationDiagnosis.mate};persist();}
    toast('运行检查已完成');
  } catch (error) { toast(`运行检查失败：${error.message}`, true); }
  finally { optimizationSampling = false; if (page === 'optimize') render(); }
}
function obsSend(op,d) { if(!obsSocket||obsSocket.readyState!==WebSocket.OPEN)throw new Error('OBS 尚未连接');obsSocket.send(JSON.stringify({op,d})); }
function obsRequest(requestType,requestData={}) {
  return new Promise((resolve,reject)=>{if(!obsReady)return reject(new Error('OBS 尚未完成连接'));const requestId=`qingchang-${++obsReqId}`;const timer=setTimeout(()=>{obsPending.delete(requestId);reject(new Error(`OBS 请求超时：${requestType}`));},6000);obsPending.set(requestId,{resolve,reject,timer,requestType});obsSend(6,{requestType,requestId,requestData});});
}
function hashB64(value) { return crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)).then(hash=>btoa(String.fromCharCode(...new Uint8Array(hash)))); }
async function connectOBS() {
  const status=$('[data-obs-status]');const cfg=state.settings.setup;cfg.obsUrl=$('[data-setup="obsUrl"]')?.value||cfg.obsUrl;cfg.obsPassword=$('[data-setup="obsPassword"]')?.value??cfg.obsPassword??'';persist();
  if(obsSocket)try{obsSocket.close();}catch{}obsReady=false;if(status){status.textContent='连接中…';status.className='pill orange';}
  try {
    await new Promise((resolve,reject)=>{
      const ws=new WebSocket(cfg.obsUrl,'obswebsocket.json');obsSocket=ws;const timeout=setTimeout(()=>{try{ws.close();}catch{}reject(new Error('连接 OBS 超时，请确认 OBS WebSocket 已启用，默认端口为 4455。'));},5000);
      ws.onmessage=async(ev)=>{let msg;try{msg=JSON.parse(ev.data);}catch{return;}
        if(msg.op===0){try{const d=msg.d;let auth;if(d.authentication){const secret=await hashB64(cfg.obsPassword+d.authentication.salt);auth=await hashB64(secret+d.authentication.challenge);}obsSend(1,{rpcVersion:d.rpcVersion, ...(auth?{authentication:auth}:{}),eventSubscriptions:0});}catch(e){clearTimeout(timeout);reject(e);} }
        if(msg.op===2){obsReady=true;clearTimeout(timeout);resolve();}
        if(msg.op===7){const pending=obsPending.get(msg.d.requestId);if(pending){clearTimeout(pending.timer);obsPending.delete(msg.d.requestId);msg.d.requestStatus?.result?pending.resolve(msg.d.responseData||{}):pending.reject(new Error(msg.d.requestStatus?.comment||`OBS 请求失败：${pending.requestType}`));}}
      };
      ws.onerror=()=>{clearTimeout(timeout);reject(new Error('无法连接 OBS。请在 OBS「工具 → WebSocket 服务器设置」中开启连接。'));};
      ws.onclose=()=>{obsReady=false;if(status){status.textContent='已断开';status.className='pill';}};
    });
    const version=await obsRequest('GetVersion');const video=await obsRequest('GetVideoSettings');const sceneData=await obsRequest('GetSceneList');
    const statusText=$('[data-obs-status]');if(statusText){statusText.textContent=`已连接 · OBS ${version.obsVersion||''}`;statusText.className='pill green';}
    const sceneSelect=$('#obs-scene');if(sceneSelect)sceneSelect.innerHTML=(sceneData.scenes||[]).map(s=>`<option>${esc(s.sceneName)}</option>`).join('')||'<option>未发现场景</option>';
    await loadObsSources();state.settings.setup.obsDetectedVideo=video;persist();toast('OBS 已连接并读取当前画质与场景');
  } catch(error) { obsReady=false;if(status){status.textContent='连接失败';status.className='pill red';}toast(error.message||'OBS 连接失败',true); }
}
async function refreshObsScenes(){
 if(!obsReady)return;const select=$('#obs-scene');if(!select)return;const selected=select.value,scenes=await obsRequest('GetSceneList');if(!$('#obs-scene'))return;
 select.innerHTML=(scenes.scenes||[]).map(scene=>`<option ${scene.sceneName===selected?'selected':''}>${esc(scene.sceneName)}</option>`).join('')||'<option>未发现场景</option>';await loadObsSources();
}
async function loadObsSources() {
  if(!obsReady)return;const sceneName=$('#obs-scene')?.value;const scenes=await obsRequest('GetSceneList');const scene=(scenes.scenes||[]).find(s=>s.sceneName===sceneName)||scenes.scenes?.[0];if(!scene)return;
  const items=await obsRequest('GetSceneItemList',{sceneName:scene.sceneName});const select=$('#obs-source');if(select)select.innerHTML=(items.sceneItems||[]).map(x=>`<option value="${esc(x.sourceName)}">${esc(x.sourceName)}</option>`).join('')||'<option>此场景没有来源</option>';
}
async function applySetup() {
  if(state.settings.setup.mode==='douyin') { accountModal={kind:'setup-guide'};modal('抖音直播伴侣开播清单',`<div class="notice"><strong>画质参考：${esc(state.settings.setup.profile)}</strong><br>${renderSetupPlan()}<br>1. 在直播伴侣「直播设置」里选择对应分辨率、帧率和编码。<br>2. 上行码率根据刚刚测速和平台建议填写。<br>3. 添加安全场景，设置伴侣自己的场景快捷键。<br>4. 捕获轻场的安全直播画面窗口。<br>5. 开播前进行 60 秒试播检查。</div>`, '知道了');return; }
  if(!obsReady)return toast('请先连接 OBS',true);
  try {
    const [backup, profileList]=await Promise.all([obsRequest('GetVideoSettings'),obsRequest('GetProfileList')]);state.settings.setup.obsBackup={at:safeNow(),video:backup,profileName:profileList.currentProfileName||''};persist();
    try { await obsRequest('CreateProfile',{profileName:'轻场开播方案'}); } catch {}
    try { await obsRequest('SetCurrentProfile',{profileName:'轻场开播方案'}); } catch {}
    const p=state.settings.setup.profile;const resolution=p==='stable'?{baseWidth:1280,baseHeight:720,outputWidth:1280,outputHeight:720,fpsNumerator:30,fpsDenominator:1}:{baseWidth:1920,baseHeight:1080,outputWidth:1920,outputHeight:1080,fpsNumerator:60,fpsDenominator:1};
    await obsRequest('SetVideoSettings',resolution);toast('当前 OBS 画质和配置名称已备份，轻场配置已应用。请回 OBS 核对输出与编码器。');render();
  } catch(error) { toast(`OBS 配置未完成：${error.message}`,true); }
}
async function restoreOBS() {
  const backup=state.settings.setup.obsBackup;if(!backup)return toast('没有 OBS 画质备份',true);if(!obsReady)return toast('请先连接 OBS',true);
  try { if(backup.profileName)await obsRequest('SetCurrentProfile',{profileName:backup.profileName});await obsRequest('SetVideoSettings',backup.video);toast('已恢复之前备份的 OBS 画质'); }
  catch(error) { toast(`恢复 OBS 画质失败：${error.message}`,true); }
}
async function applyFilter() {
  const filter=FILTERS.find(x=>x.id===state.settings.setup.filter);if(state.settings.setup.mode==='douyin')return toast('抖音直播伴侣请在游戏画面滤镜或来源设置中按方案手动配置');
  if(!obsReady)return toast('请先连接 OBS 并读取游戏采集源',true);
  const source=$('#obs-source')?.value;if(!source||source.startsWith('此场景'))return toast('先选择 OBS 场景里的游戏采集源',true);
  try {
    const defaults=await obsRequest('GetSourceFilterDefaultSettings',{filterKind:'color_filter_v2'});const settings={...(defaults.defaultSettings||{})};
    if(filter.id==='cool'){if('hue_shift'in settings)settings.hue_shift=14;if('saturation'in settings)settings.saturation=-0.08;if('brightness'in settings)settings.brightness=-0.02;}
    if(filter.id==='contrast'){if('brightness'in settings)settings.brightness=-0.06;if('contrast'in settings)settings.contrast=0.22;if('gamma'in settings)settings.gamma=0.06;}
    const filterName=`轻场-${filter.title}`;try{await obsRequest('CreateSourceFilter',{sourceName:source,filterName,filterKind:'color_filter_v2',filterSettings:settings});}catch{await obsRequest('SetSourceFilterSettings',{sourceName:source,filterName,filterSettings:settings,overlay:true});}
    toast(`已在「${source}」上设置 ${filter.title}；只影响该游戏采集源`);
  } catch(error) { toast(`滤镜没有应用：${error.message}`,true); }
}
let speedTestRunning=false;
async function speedTest({signal,onProgress=()=>{},quiet=false}={}) {
 if(speedTestRunning||signal?.aborted)return false;
 speedTestRunning=true;const status=$('[data-speed-status]');const buttons=$$('[data-act="speed-test"]');buttons.forEach(b=>b.disabled=true);
 const progress=text=>{onProgress(text);const current=$('[data-speed-status]');if(current){current.className='notice';current.textContent=text;}};
 state.settings.setup.lastUploadAt=0;persist();workflowPreparation.updateNetwork();
 const requestSignal=()=>AbortSignal.any([AbortSignal.timeout(20000),...(signal?[signal]:[])]);
 try{
  progress('正在连接测速端点，随后检测 3 轮上传，约发送 12 MB 测试数据…');
  const started=performance.now(),response=await fetch(`https://speed.cloudflare.com/__down?bytes=2500000&ts=${Date.now()}`,{cache:'no-store',signal:requestSignal()});if(!response.ok)throw Error('测速端点暂不可用');
  const data=await response.arrayBuffer(),down=data.byteLength*8/((performance.now()-started)/1000)/1e6;
  const payload=new Uint8Array(4000000);for(let offset=0;offset<payload.length;offset+=65536)crypto.getRandomValues(payload.subarray(offset,Math.min(offset+65536,payload.length)));
  let uploadMs=0;
  for(let round=0;round<3;round++){
   if(signal?.aborted)throw new DOMException('已停止测速','AbortError');
   progress(`正在检测上传速度 · 第 ${round+1} / 3 轮`);
   const start=performance.now(),upload=await fetch('https://speed.cloudflare.com/__up',{method:'POST',body:payload,cache:'no-store',signal:requestSignal()});if(!upload.ok)throw Error('上传测试端点暂不可用');await upload.arrayBuffer();uploadMs+=performance.now()-start;
  }
  if(signal?.aborted)throw new DOMException('已停止测速','AbortError');
  const up=payload.byteLength*3*8/(uploadMs/1000)/1e6;if(!Number.isFinite(up)||up<=0)throw Error('未获得有效上传数据');
  Object.assign(state.settings.setup,{lastUploadAt:Date.now(),lastUploadMbps:Number(up.toFixed(2)),lastDownloadMbps:Number(down.toFixed(2))});persist();workflowPreparation.updateNetwork();
  if(!quiet){render();toast(`上行 ${up.toFixed(1)} Mbps · ${QingchangPreflightModel.uploadAssessment(up,state.settings.setup.lastUploadAt).title}`);}return true;
 }catch(error){
  state.settings.setup.lastUploadAt=0;persist();workflowPreparation.updateNetwork();
  if(!signal?.aborted){progress('测速未完成：'+error.message+'。请检查连接后重试。');if(!quiet)toast('上传测速未完成，请重试',true);}return false;
 }finally{speedTestRunning=false;buttons.forEach(b=>{if(b.isConnected)b.disabled=false;});}
}
async function boot() {
  let loaded;try{loaded=await api.load();}catch(error){toast(error.message||'无法读取本地数据库',true);}
  state=loaded?.data||emptyData();initializeSaving();appInfo=await api.appInfo?.()||{};shortcutState=await api.shortcutStatus?.()||{};window.QingchangHighlights.migrate(state);const rentalMigrated=QingchangRentalModel.migrate(state);const activityMigrated=QingchangWorkflowProgress.migrate(state);const demoMigrated=migrateDemoLabels(state);if(!loaded?.error&&(QingchangAccountActivity.rollover(state)||rentalMigrated||activityMigrated||demoMigrated))persist();if(loaded?.error)toast(`本地数据读取失败，已停止写入：${loaded.error}`,true);else if(!loaded?.data){state.demo=true;try{await saveNow();}catch(e){toast(e.message||'本机加密保存不可用',true);}}
  if(!loaded?.error&&appInfo.runtimeId&&state.settings.workflowOwnerId!==appInfo.runtimeId){Object.assign(state.settings,{workflowOwnerId:appInfo.runtimeId,workflowOwnedMonitor:false,workflowOwnedPicture:false});persist();}
  workflowPreparation=QingchangWorkflowModel.createPreparation({api,getState:()=>state,save:persist,onChange:requestWorkflowPaint,assessNetwork:workflowNetworkAssessment,enumerate:async()=>(await navigator.mediaDevices.enumerateDevices()).filter(x=>x.kind==='audioinput')});
  preflightPage=QingchangPreflightPage.create({api,toast,getUpload:()=>({mbps:state.settings.setup.lastUploadMbps,at:state.settings.setup.lastUploadAt}),getNetworkCheck:()=>state.settings.workflowNetworkCheck,getSoundCheck:()=>state.settings.workflowSoundCheck,getMicId:()=>state.settings.workflowMicId||'',onDeviceChange:value=>{state.settings.workflowMicId=value;persist();},getOrigin:()=>diagnosticOrigin,measureUpload:options=>speedTest({...options,quiet:true}),repaint:requestDiagnosticPaint,onNetworkResult:check=>{state.settings.workflowNetworkCheck=check;persist();workflowPreparation.updateNetwork();},onSoundResult:check=>{state.settings.workflowSoundCheck=check;persist();workflowPreparation.updateSound(check);}});
  streamFilterPage=QingchangStreamFilterPage.create({api,getState:()=>state,save:persist,repaint:()=>{if(page==='setup'&&setupToolTab==='filters')render();},toast});
  performancePage=QingchangPerformancePage.create({api,toast,repaint:()=>{if(page==='optimize'&&optimizationTab==='comparison')render();},getContext:()=>({role:state.role==='主播'?'主播':'陪玩',liveSource:state.role==='主播'?((state.settings.monitor?.liveSource||state.settings.setup.mode)==='obs'?'obs':'douyin'):'none'})});
  frameRepairPage=QingchangFrameRepairPage.create({api,toast,repaint:()=>{if(page==='repair')render();},getContext:()=>({role:state.role==='主播'?'主播':'陪玩',liveSource:state.role==='主播'?((state.settings.monitor?.liveSource||state.settings.setup.mode)==='obs'?'obs':'douyin'):'none'})});
  toolOrigin=state.settings.toolTask||null;page=loaded?.error?'settings':state.stream.active?'streamer-home':'welcome';recoveredSession=!!state.stream.active;workflowPhase=state.stream.active?'live':'prepare';activeOrder=state.selectedOrderId||state.orders.find(o=>o.status!=='已完成')?.id||state.orders[0]?.id||'';lastTimer=Date.now();render();
  if(page==='streamer-home'&&!state.stream.active)workflowPreparation.refreshReadiness().catch(()=>{});
  api.onHotkey((key)=>{if(key==='session'){if(state.stream.active)toggleStream();else startWorkflowSession();}if(key==='marker')markHighlight();});
  api.onOptimizationToolsStatus?.(value=>{maintenanceStatus=value;if(page==='optimize'&&optimizationTab==='maintenance'&&!maintenanceBusy)render();});
  api.monitorStatus().then(value=>{monitorStatus=value;paintWorkflowLiveStatus(value);}).catch(()=>{});
  api.onMonitorUpdate?.(value=>{captureWorkflowEvents(value);monitorStatus=value;paintMonitorReadings(value);paintWorkflowLiveStatus(value);updateMonitorAlertSummary();for(const metric of QingchangMonitorDiagnostics.readings(value)){const node=$('[data-diagnostic="'+metric.key+'"]');if(node){node.querySelector('strong').textContent=metric.value;node.querySelector('small').textContent=metric.reason;}}const sensorLabel=$('[data-monitor-sensor-status]');if(sensorLabel)sensorLabel.textContent=monitorSensorText(value);const label=$('[data-monitor-status]');if(label)label.textContent=monitorStatusText(value);const card=$('.realtime-monitor-card');if(card&&value.game?.state==='permission'&&!card.querySelector('[data-act="elevate-qingchang"]')){const button=document.createElement('button');button.className='btn sm';button.dataset.act='elevate-qingchang';button.textContent='以管理员身份重新打开，启用游戏 FPS';card.querySelector('.monitor-options')?.before(button);}});
  let lastMonitorPaint=0;setInterval(()=>{if(state&&currentToolKey()==='monitor'&&Date.now()-lastMonitorPaint>2000){lastMonitorPaint=Date.now();paintMonitorReadings(monitorStatus);}if(state?.stream?.active&&Date.now()-lastTimer>900){lastTimer=Date.now();const clock=$('[data-live-clock]');if(clock)clock.textContent=duration(Date.now()-new Date(state.stream.startedAt).getTime());}},500);
}
boot().then(async()=>{if(await api.repairResumeRequested()){toolOrigin=state.settings.toolTask||null;page='repair';render();frameRepairPage.refresh();}});
