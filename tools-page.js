/* One catalog supplies the overview, sidebar shortcuts and existing tool routes. */
window.QingchangToolsPage=(()=>{
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const paths={
  gauge:'M3 17a10 10 0 1 1 18 0 M12 13l5-5 M6 17h12',
  activity:'M2 12h5l3-8 4 16 3-8h5',
  mic:'M9 4a3 3 0 0 1 6 0v8a3 3 0 0 1-6 0z M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M9 22h6',
  network:'M2 8a16 16 0 0 1 20 0 M5 12a11 11 0 0 1 14 0 M8 16a6 6 0 0 1 8 0 M12 20h.01',
  grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  right:'m9 5 7 7-7 7',search:'M16 16l5 5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  sliders:'M5 3v5 M5 13v8 M12 3v10 M12 18v3 M19 3v2 M19 10v11 M2 8h6v5H2z M9 13h6v5H9z M16 5h6v5h-6z',
  image:'M3 3h18v18H3z M3 16l6-6 5 5 3-3 4 4 M17 7h.01',text:'M4 4h16 M12 4v17 M8 21h8 M4 4v4 M20 4v4',
  camera:'M3 6h13v12H3z m13 4 5-3v10l-5-3z',
  wrench:'M14 4a6 6 0 0 0-7 7L2 16a3 3 0 0 0 4 4l5-5a6 6 0 0 0 9-7l-4 4-4-4z',
  compare:'M3 20V9h5v11 M10 20V4h5v16 M17 20V12h4v8',layers:'M2 7l10-5 10 5-10 5z M2 12l10 5 10-5 M2 17l10 5 10-5',
  chip:'M5 5h14v14H5z M9 9h6v6H9z M8 2v3 M16 2v3 M8 19v3 M16 19v3 M2 8h3 M2 16h3 M19 8h3 M19 16h3'
 };
 const icon=key=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[key]||paths.grid}"/></svg>`;
 const items=[
  {key:'monitor',title:'运行监测',description:'电脑温度、硬件占用与持续异常提醒',escortDescription:'电脑温度、硬件占用与游戏帧率',icon:'activity',group:'stream',keywords:'CPU GPU 内存 显存 实时频率 FPS 帧时间 温度 悬浮条 码率 bitrate',page:'optimize',tab:'overview'},
  {key:'sound',title:'声音诊断',description:'10 秒试音，检查音量、底噪与爆音',icon:'mic',group:'stream',keywords:'麦克风 录音 人声 试听',page:'setup',tab:'sound'},
  {key:'network',title:'网络诊断',description:'上传测速、延迟波动与连接建议',icon:'network',group:'stream',keywords:'网速 丢包 网络延迟 上传 带宽 ping',page:'setup',tab:'network'},
  {key:'setup',title:'开播方案',description:'准备推流设置，管理 OBS 连接',icon:'sliders',group:'stream',keywords:'直播伴侣 OBS 画质 分辨率',page:'setup',tab:'plan'},
  {key:'filters',title:'直播画面滤镜',description:'预览调色，导出给直播伴侣的游戏素材',icon:'image',group:'content',keywords:'LUT 调色 亮度 清晰 预设 导入',page:'setup',tab:'filters'},
  {key:'titles',title:'标题制作',description:'编辑文字样式，导出透明背景图片',icon:'text',group:'content',keywords:'字体 颜色 PNG 描边',page:'titles'},
  {key:'avatar',title:'直播形象助手',description:'配置角色、声音识别与安全画面',icon:'camera',group:'content',keywords:'虚拟形象 声纹 隐私 防泄露',page:'avatar'},
  {key:'optimize',title:'游戏与电脑优化',description:'查看当前配置，应用并恢复系统设置',icon:'gauge',group:'game',keywords:'稳播 高帧 方案 系统 游戏模式',page:'optimize',tab:'overview'},
  {key:'repair',title:'卡顿与掉帧修复',description:'检查游戏、修复缓存与运行环境',icon:'wrench',group:'game',keywords:'三角洲 着色器 DX 运行库 重建',page:'repair'},
  {key:'comparison',title:'优化前后对比',description:'在相同场景采样，比较实际表现',icon:'compare',group:'game',keywords:'FPS 报告 帧率 1% low',page:'optimize',tab:'comparison'},
  {key:'maintenance',title:'后台与维护',description:'查看后台资源，管理内存与缓存',icon:'layers',group:'game',keywords:'进程 CPU 内存占用 清理 后台让位',page:'optimize',tab:'maintenance'},
  {key:'nvidia',title:'显卡与 DLSS',description:'选择驱动方案，核对模型和导入步骤',icon:'chip',group:'game',keywords:'NVIDIA N卡 伪装显卡 模型预设',page:'optimize',tab:'nvidia'},
  {key:'advanced',title:'高级系统设置',description:'鼠标、键盘、电源与更多系统调校',icon:'sliders',group:'game',keywords:'高性能 输入延迟 NVMe',page:'optimize',tab:'advanced'}
 ];
 const sectionInfo={stream:{title:'开播与监测',description:'检查声音和网络，观察直播运行状态'},content:{title:'直播画面与内容',description:'需要时调整，保存后继续使用'},game:{title:'游戏与电脑',description:'主动优化，也可以在遇到问题时排查'}};
 function catalog(role){return items.filter(t=>role!=='打手'||t.group==='game'||t.key==='monitor').map(t=>({...t,group:role==='打手'?'game':t.group,description:role==='打手'&&t.escortDescription?t.escortDescription:t.description}));}
 function groups(role){const available=catalog(role);return Object.entries(sectionInfo).map(([key,info])=>({key,...info,items:available.filter(t=>t.group===key)})).filter(g=>g.items.length);}
 function route(key){return items.find(t=>t.key===key)||(key==='highlights'?{key,title:'直播记录',page:'highlights'}:null);}
 function currentKey({page,optimizationTab,optimizationEntry,setupToolTab}){
  if(page==='setup')return ({sound:'sound',network:'network',filters:'filters',plan:'setup'})[setupToolTab]||'setup';
  if(page==='optimize')return optimizationTab==='overview'?(optimizationEntry==='monitor'?'monitor':'optimize'):route(optimizationTab)?.key||'optimize';
  return ['repair','titles','avatar'].includes(page)?page:null;
 }
 function sidebar(role,{key,page}){
  const keys=role==='打手'?['optimize','monitor','repair']:['optimize','monitor','sound','network'];
  const overview=page==='tools'||!!key&&!keys.includes(key);
  return `<nav class="nav-section tools-side-nav" aria-label="常用工具"><div class="nav-label">常用工具</div>${keys.map(k=>{const t=route(k);return `<button class="nav-link${k===key?' is-active':''}" data-act="workflow-tool" data-tool="${k}" ${k===key?'aria-current="page"':''}>${icon(t.icon)}<span>${t.title}</span></button>`;}).join('')}<button class="nav-link${overview?' is-active':''}" data-nav="tools" ${overview?'aria-current="page"':''}>${icon('grid')}<span>工具总览</span></button></nav>`;
 }
 function render(role,view={}){
  const all=groups(role),category=all.some(g=>g.key===view.category)?view.category:'all',query=String(view.search||'').trim().toLocaleLowerCase();
  const shown=all.filter(g=>category==='all'||g.key===category).map(g=>({...g,items:g.items.filter(t=>!query||`${t.title} ${t.description} ${t.keywords}`.toLocaleLowerCase().includes(query))})).filter(g=>g.items.length);
  const count=shown.reduce((n,g)=>n+g.items.length,0);
  return `<div class="tools-workspace" data-tools-role="${role==='打手'?'打手':'主播'}"><header class="tools-page-head"><div><h1>工具总览</h1><p>${role==='打手'?'监测游戏帧率、优化电脑、排查卡顿，随时从这里打开。':'准备开播、调整画面、优化电脑，随时从这里打开。'}</p></div><label class="tools-search">${icon('search')}<input id="tools-search" class="input" type="search" data-search="tools" aria-label="搜索工具或想解决的问题" placeholder="搜索工具或想解决的问题" value="${esc(view.search)}"></label></header><nav class="tools-category-tabs" aria-label="工具分类">${[{key:'all',title:'全部工具',items:all.flatMap(g=>g.items)},...all].map(g=>`<button class="${category===g.key?'active':''}" data-act="tools-category" data-category="${g.key}" aria-pressed="${category===g.key}">${g.title}<small>${g.items.length}</small></button>`).join('')}</nav>${query?`<div class="tools-search-summary" role="status">找到 ${count} 项工具<button class="btn quiet sm" data-act="tools-reset">清除搜索和筛选</button></div>`:''}<div class="tools-directory">${shown.length?shown.map(g=>`<section class="tools-section" aria-labelledby="tools-group-${g.key}"><header class="tools-section-head"><h2 id="tools-group-${g.key}">${g.title}</h2><p>${g.description}</p></header><div class="tools-list">${g.items.map(t=>`<button class="tools-entry" data-act="workflow-tool" data-tool="${t.key}"><span class="tools-entry-icon">${icon(t.icon)}</span><span class="tools-entry-copy"><b>${t.title}</b><span>${t.description}</span></span><span class="tools-entry-open">打开 ${icon('right')}</span></button>`).join('')}</div></section>`).join(''):`<div class="tools-empty"><h2>没有找到对应工具</h2><p>试试搜索“网络”“帧率”或“滤镜”，也可以查看全部工具。</p><button class="btn" data-act="tools-reset">查看全部工具</button></div>`}</div><footer class="tools-page-footer"><span>修改设置前保存原值；应用状态和实测结果分别展示。</span><button class="btn quiet sm" data-nav="settings">数据安全与设置</button></footer></div>`;
 }
 return {catalog,groups,route,currentKey,sidebar,render};
})();
