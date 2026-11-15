/* Page compositions added to the Adminator v4 shell. These only rearrange the
   renderer's existing controls; business data and handlers stay in app.js. */
function enhanceUI(currentPage, currentState) {
  const root = document.querySelector('.q-content');
  if (!root) return;
  const heading = root.querySelector('.heading');

  if (currentPage === 'settlement' && heading && !root.querySelector('[data-order-flow]')) {
    const steps = document.createElement('div');
    steps.className = 'q-steps';
    const selected=root.querySelector('[data-order-select]')?.value;
    const order=currentState.orders.find(x=>x.id===selected);
    const stage=!order?1:['待结算','已完成'].includes(order.status)?3:typeof settlementFocus!=='undefined'&&settlementFocus?.orderId===order.id?settlementFocus.step:2;
    steps.innerHTML=[['选择订单与账号','settlement-selector'],['填写使用记录','settlement-records'],[order?.status==='已完成'?'查看已完成结算':'核对并结算','settlement-review']].map(([label,target],i)=>`${i?'<b></b>':''}<button class="${i+1<stage||order?.status==='已完成'?'done':i+1===stage?'active':''}" data-act="settlement-focus" data-target="${target}" data-step="${i+1}" ${!order&&i?'disabled':''} aria-current="${i+1===stage?'step':'false'}"><i>${i+1<stage||order?.status==='已完成'?'✓':i+1}</i> ${label}</button>`).join('');
    heading.after(steps);
  }

  if (currentPage === 'avatar') {
    const preview = root.querySelector('div[style*="height:280px"]');
    if (preview) {
      preview.className = 'q-safe-preview';
      preview.removeAttribute('style');
      preview.innerHTML = '<img src="./media/safe-scene.png" alt="主播和水友的安全直播场景"><span class="q-safe-label">安全直播画面 · 仅输出虚拟形象</span><span class="q-safe-mask">水友 ID　••••••　已遮挡</span>';
    }
  }

  if (currentPage === 'streamer-home') {
    const quickTools = [...root.querySelectorAll('.card')].find(el => el.querySelector('h2')?.textContent === '开播快捷工具');
    quickTools?.querySelector('.card-head')?.insertAdjacentHTML('beforeend', '<button class="btn sm" data-nav="settings">设置快捷键</button>');
  }

  if (currentPage === 'titles') {
    const title = [...root.querySelectorAll('.card h2')].find(el => el.textContent === '透明画面预览');
    if (title) title.textContent = '标题预览';
  }

  if (currentPage === 'setup') {
    const filters = [...root.querySelectorAll('.card')].find(el => el.querySelector('h2')?.textContent === '游戏画面滤镜');
    const grid = filters?.querySelector('.grid.half');
    if (grid) grid.classList.add('q-filter-grid');
  }
}
