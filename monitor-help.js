(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./ui-icons'):root.QingchangIcons);if(typeof module==='object'&&module.exports)module.exports=api;else{root.QingchangMonitorHelp=api;api.mount(root.document);}})(typeof globalThis!=='undefined'?globalThis:this,Icons=>{
 const terms={
  cpuTemp:{title:'CPU 温度',text:['CPU 是处理器，负责运行程序。这里显示处理器传感器返回的温度，单位为 °C（摄氏度）。','温度和占用是两项不同读数。缺少传感器驱动或管理员权限时，温度显示“—”，下方会说明原因。']},
  cpu:{title:'CPU 占用',text:['CPU 是处理器。占用百分比表示整台电脑的处理器在这段时间内有多忙，不是轻场一个软件的占用。','第一次采样需要等待下一次数据才能计算。高占用本身不能直接证明电脑出了故障，还要结合卡顿与帧率观察。']},
  gpuTemp:{title:'GPU 温度',text:['GPU 是显卡里的图形处理器，负责处理画面。这里是显卡传感器返回的温度，单位为 °C。','检测 NVIDIA、AMD、英特尔显卡；这里显示所选显卡的核心温度，不混用热点或显存温度。驱动未上报时显示“—”。']},
  gpu:{title:'GPU 占用',text:['GPU 是显卡里的图形处理器。这个百分比表示显卡的忙碌情况，不是显存容量。','游戏画面和其他图形任务都会影响它。部分显卡显示最忙 GPU 引擎的使用率，读数下方会注明；不同来源不直接等同。高占用需结合卡顿判断。']},
  memory:{title:'内存占用',text:['内存是程序运行时临时存放数据的地方。这里显示整台电脑物理内存已使用的比例。','它与硬盘空间、显卡的显存是不同的资源；关闭程序后，内存占用可能下降。']},
  vram:{title:'显存占用',text:['显存是显卡用于存放纹理、画面等数据的内存。这里显示已用显存占总显存的比例。','下方“已用 / 总量”是显卡接口返回的独立显存容量；核显共享系统内存不会冒充独立显存总量。显存占用和 GPU 占用不是同一个指标。']},
  fps:{title:'游戏 FPS',text:['FPS 表示每秒产生多少帧画面，是观察游戏流畅度的一个指标。','轻场按游戏提交画面的间隔采集 FPS，可能与开启补帧后的显示帧率不同；还需要结合帧时间是否稳定。']},
  low1:{title:'1% Low',text:['用来观察较慢帧的表现，帮助发现平均 FPS 没有体现出来的卡顿。它不是整段时间里的最低 FPS。','轻场取最近 30 秒中最慢 1% 帧的平均帧时间，再换算成帧率；至少有 100 帧有效样本后才显示。']},
  frameMs:{title:'帧时间',text:['这里是相邻两次提交画面的间隔，单位为 ms（毫秒）。1000 毫秒等于 1 秒。','约 16.7 ms 对应 60 FPS，约 8.3 ms 对应 120 FPS。间隔突然变长时，可能感觉到卡顿。']},
  nativeFps:{title:'原生帧 FPS',text:['用来观察没有把生成帧混入时的帧率来源。当前可根据明确上报的原生帧类型，或游戏上报的模拟帧节奏读取。','具体来源看读数下方说明；没有上报时保持未知，不按补帧倍数反推。']},
  generatedFps:{title:'生成帧 FPS',text:['生成帧是补帧技术产生的额外画面。轻场只在采集源能明确识别帧类型时统计。','“未上报”表示没有取得可识别的数据，不表示游戏已经关闭补帧。']},
  cpuClock:{title:'CPU 实时频率',text:['表示处理器当前的工作频率，单位为 MHz。1000 MHz 等于 1 GHz。','这里取已读取的各核心实时频率平均值。频率会随负载和节能状态变化；需要 CPU 传感器驱动和相应权限。']},
  gpuClock:{title:'GPU 频率',text:['表示显卡图形核心的工作频率，单位为 MHz；它不是显存容量。','频率会随当前负载变化，不能只看这一个数字判断游戏是否流畅。']},
  streamFps:{title:'推流 FPS / OBS 渲染 FPS',text:['选择直播伴侣时读取推流帧率；选择 OBS 时读取 OBS 正在渲染画面的帧率，页面会区分名称。','这些是本机软件统计，不能直接代表每一位观众实际收到的画面帧率。']},
  bitrate:{title:'直播码率',text:['表示每秒发送的直播数据量，常用单位是 Kbps 和 Mbps。1 Mbps 等于 1000 Kbps。','这里显示采集到的实际码率，不是上传测速结果，也不是直播软件中设置的目标码率。']},
  obsRender:{title:'OBS 渲染跳帧',text:['表示 OBS 渲染线程没有及时完成的帧。轻场显示最近一个采样区间新增的数量。','首个样本、重新连接或计数清零后，先等待下一次采样；不能仅凭渲染跳帧认定是网络故障。']},
  obsEncode:{title:'OBS 编码输出跳帧',text:['表示 OBS 输出线程跳过的帧。轻场显示区间新增数量，可能涉及其他同时运行的输出。','请结合 OBS 的统计窗口核对编码负载；这个数字与推流网络丢帧分开显示。']},
  obsNetwork:{title:'OBS 网络丢帧',text:['表示 OBS 推流输出报告的丢帧。轻场显示最近采样区间的新增数量。','它需要结合 OBS 网络提示和连接情况判断；只有取得连续的新数据后，才会触发相应的持续异常提醒。']}
 };
 const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function label(key,text){const entry=terms[key];return `<span class="monitor-term-label">${esc(text??entry?.title??key)}${entry?`<button type="button" class="monitor-term-help" data-monitor-help="${key}" aria-label="查看${esc(entry.title)}说明" aria-haspopup="dialog" aria-controls="monitor-term-popover">${Icons.icon('help')}</button>`:''}</span>`;}
 function mount(doc){if(!doc||doc.getElementById('monitor-term-popover'))return;const panel=doc.createElement('div');panel.id='monitor-term-popover';panel.className='monitor-help-popover';panel.setAttribute('popover','auto');panel.setAttribute('role','dialog');panel.setAttribute('aria-labelledby','monitor-term-title');panel.innerHTML=`<header><b id="monitor-term-title"></b><button type="button" aria-label="关闭指标说明" autofocus>${Icons.icon('close')}</button></header><div class="monitor-help-copy"></div>`;doc.body.append(panel);let current='',anchor=null,returnFocus=true;
  const visibleAnchor=()=>[...doc.querySelectorAll('[data-monitor-help]')].find(n=>n.dataset.monitorHelp===current&&n.getClientRects().length);
  function position(){const button=anchor?.isConnected?anchor:visibleAnchor();if(!button){returnFocus=false;panel.hidePopover();return;}anchor=button;const r=button.getBoundingClientRect(),box=panel.getBoundingClientRect();panel.style.left=Math.max(12,Math.min(innerWidth-box.width-12,r.left-12))+'px';panel.style.top=Math.max(12,r.bottom+8+box.height<=innerHeight-12?r.bottom+8:r.top-box.height-8)+'px';}
  doc.addEventListener('click',event=>{const button=event.target.closest?.('[data-monitor-help]');if(!button)return;const key=button.dataset.monitorHelp,entry=terms[key];if(!entry)return;if(panel.matches(':popover-open')&&current===key){panel.hidePopover();return;}current=key;anchor=button;returnFocus=true;panel.querySelector('b').textContent=entry.title;const copy=panel.querySelector('.monitor-help-copy');copy.replaceChildren(...entry.text.map(text=>{const p=doc.createElement('p');p.textContent=text;return p;}));if(!panel.matches(':popover-open'))panel.showPopover();position();panel.querySelector('button').focus({preventScroll:true});});
  panel.querySelector('button').addEventListener('click',()=>panel.hidePopover());panel.addEventListener('toggle',event=>{if(event.newState==='closed'&&returnFocus)visibleAnchor()?.focus({preventScroll:true});});window.addEventListener('resize',()=>{if(panel.matches(':popover-open'))position();});window.addEventListener('scroll',()=>{if(panel.matches(':popover-open'))position();},{passive:true});const app=doc.getElementById('app');if(app)new MutationObserver(()=>{if(panel.matches(':popover-open'))position();}).observe(app,{childList:true});
 }
 return {terms,label,mount};
});
