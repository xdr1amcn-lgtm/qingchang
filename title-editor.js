const TITLE_FONTS = [
  ['得意黑 · 游戏斜体', '"Qingchang Smiley Sans"'],
  ['思源黑体 · 厚重', '"Qingchang Noto Sans SC"'],
  ['思源宋体 · 锐利', '"Qingchang Noto Serif SC"'],
  ['马善政 · 题字', '"Qingchang Ma Shan Zheng"'],
  ['龙藏 · 手写', '"Qingchang Long Cang"'],
  ['志莽行书 · 奔放', '"Qingchang Zhi Mang Xing"'],
  ['刘建毛草 · 动感', '"Qingchang Liu Jian Mao Cao"'],
  ['微软雅黑 · 清晰', '"Microsoft YaHei"'],
  ['黑体 · 硬朗', 'SimHei'],
  ['楷体 · 书写', 'KaiTi']
];

function ensureTitleSettings(title) {
  if (!title.editorV2) {
    title.outline = 0;
    title.editorV2 = true;
  }
  const defaults = {
    weight: 900, italic: false, underline: false, align: 'center',
    lineHeight: 120, x: 50, y: 50, rotation: 0, opacity: 100,
    fillColor: '#2869e8', outlineColor: '#172033',
    shadowEnabled: false, shadowColor: '#172033', shadowBlur: 12,
    shadowX: 4, shadowY: 6
  };
  for (const [key, value] of Object.entries(defaults)) {
    if (title[key] === undefined || title[key] === null) title[key] = value;
  }
  if (!Number.isInteger(Number(title.font)) || Number(title.font) < 0 || Number(title.font) >= TITLE_FONTS.length) title.font = 0;
  if (!Array.isArray(title.colors)) title.colors = [];
  if (!Array.isArray(title.charStyles)) title.charStyles = [];
  return title;
}

function titleCharacterStyle(title, index) {
  const local = title.charStyles?.[index] || {};
  return {
    font: Number.isInteger(local.font) && TITLE_FONTS[local.font] ? local.font : Number(title.font) || 0,
    weight: local.weight ?? Number(title.weight) ?? 900,
    italic: local.italic ?? !!title.italic,
    underline: local.underline ?? !!title.underline,
    outline: local.outline ?? Number(title.outline) ?? 0,
    shadowEnabled: local.shadowEnabled ?? !!title.shadowEnabled,
    color: title.colors?.[index] || title.fillColor || '#2869e8'
  };
}

function titleGlyphAtDetailPoint(geometry, detailWidth, px, py, requireClose = true) {
  if (!geometry?.glyphs?.length) return -1;
  const scale = detailWidth / geometry.cropWidth;
  let best = -1;
  let distance = Infinity;
  for (const glyph of geometry.glyphs) {
    const b = glyph.bounds;
    const left = (b.left - geometry.sx) * scale;
    const right = (b.right - geometry.sx) * scale;
    const top = (b.top - geometry.sy) * scale;
    const bottom = (b.bottom - geometry.sy) * scale;
    const dx = Math.max(left - px, 0, px - right);
    const dy = Math.max(top - py, 0, py - bottom);
    const currentDistance = Math.hypot(dx, dy);
    if (currentDistance < distance) { distance = currentDistance; best = glyph.index; }
  }
  return requireClose && distance > 36 ? -1 : best;
}

function titleNumber(label, field, value, min, max, step = 1, suffix = '') {
  return `<label class="title-control"><span>${label}</span><div class="title-number"><input type="number" data-title-field="${field}" min="${min}" max="${max}" step="${step}" value="${value}"><small>${suffix}</small></div></label>`;
}

function titleColor(label, field, value) {
  return `<label class="title-control"><span>${label}</span><input type="color" data-title-field="${field}" value="${value}"></label>`;
}

function renderTitleEditor(title) {
  const t = ensureTitleSettings(title);
  return `${heading('STREAM TITLE DESIGNER', '直播标题制作', '所见即所得编辑文字，导出透明背景 PNG。', '<button class="btn primary" data-act="export-title">导出透明 PNG</button>')}
    <div class="title-layout title-editor-layout">
      <section class="card title-editor-panel">
        <div class="card-head"><div><h2>文字编辑</h2><p>先写标题，再调整字体与样式。</p></div></div>
        <details class="title-accordion" open><summary><span>文字与字体</span><small>常用</small></summary><div class="title-accordion-body">
          <div class="field"><label for="title-text">直播标题</label><textarea id="title-text" placeholder="输入直播标题">${esc(t.text)}</textarea></div>
          <label class="title-control"><span>字体</span><select id="title-font" data-title-field="font">${TITLE_FONTS.map((f, i) => `<option value="${i}" ${Number(t.font) === i ? 'selected' : ''}>${esc(f[0])}</option>`).join('')}</select></label>
          <div class="title-controls-grid">
            ${titleNumber('字号', 'size', t.size, 18, 220, 1, 'px')}
            ${titleNumber('字间距', 'spacing', t.spacing, -10, 50, 1, 'px')}
            ${titleNumber('字重', 'weight', t.weight, 100, 900, 100)}
            ${titleColor('文字颜色', 'fillColor', t.fillColor)}
          </div>
          <div class="title-inline-options">
            <label><input type="checkbox" data-title-field="italic" ${t.italic ? 'checked' : ''}> 斜体</label>
            <label><input type="checkbox" data-title-field="underline" ${t.underline ? 'checked' : ''}> 下划线</label>
          </div>
        </div></details>
        <details class="title-accordion"><summary><span>局部配色与效果</span><small>选填</small></summary><div class="title-accordion-body">
          <div class="title-control"><span>局部改色</span><div class="title-local-color"><input id="title-color" type="color" value="${t.fillColor}"><button class="btn sm" data-act="apply-title-color">应用到选中文字</button></div></div>
          <div class="title-inline-options title-color-actions"><button class="btn sm" data-act="reset-title-colors">统一文字颜色</button><button class="btn sm" data-act="title-preset">套用游戏风配色</button></div>
          <div class="title-controls-grid">
            ${titleNumber('描边粗细 · 0 为关闭', 'outline', t.outline, 0, 20, 1, 'px')}
            ${titleColor('描边颜色', 'outlineColor', t.outlineColor)}
          </div>
          <label class="title-switch"><input type="checkbox" data-title-field="shadowEnabled" ${t.shadowEnabled ? 'checked' : ''}> 启用投影</label>
          <div class="title-controls-grid">
            ${titleColor('投影颜色', 'shadowColor', t.shadowColor)}
            ${titleNumber('模糊', 'shadowBlur', t.shadowBlur, 0, 60, 1, 'px')}
            ${titleNumber('水平偏移', 'shadowX', t.shadowX, -40, 40, 1, 'px')}
            ${titleNumber('垂直偏移', 'shadowY', t.shadowY, -40, 40, 1, 'px')}
          </div>
        </div></details>
        <details class="title-accordion"><summary><span>位置与高级排版</span><small>选填</small></summary><div class="title-accordion-body">
          <label class="title-control"><span>对齐方式</span><select data-title-field="align"><option value="left" ${t.align === 'left' ? 'selected' : ''}>左对齐</option><option value="center" ${t.align === 'center' ? 'selected' : ''}>居中</option><option value="right" ${t.align === 'right' ? 'selected' : ''}>右对齐</option></select></label>
          <div class="title-controls-grid">
          ${titleNumber('行距', 'lineHeight', t.lineHeight, 70, 220, 5, '%')}
          ${titleNumber('水平位置', 'x', t.x, 0, 100, 1, '%')}
          ${titleNumber('垂直位置', 'y', t.y, 0, 100, 1, '%')}
          ${titleNumber('旋转', 'rotation', t.rotation, -45, 45, 1, '°')}
          ${titleNumber('不透明度', 'opacity', t.opacity, 0, 100, 1, '%')}
          </div>
        </div></details>
        <p class="title-license-note">内置 7 款开源字体，可离线预览和导出；另有 3 款 Windows 系统字体。开源字体授权文件随软件附带。</p>
      </section>
      <section class="card title-preview-panel"><div class="card-head"><div><h2>标题预览</h2><p>画布显示为白色；导出的 PNG 背景透明。</p></div><span class="pill blue">实时预览</span></div>
        <div class="title-preview-label"><strong>完整画布</strong><span>1400 × 500 px</span></div>
        <div class="title-preview"><canvas id="title-canvas" width="1400" height="500"></canvas></div>
        <div class="title-detail-head"><div><h3>文字细节</h3><p>单击选字，或按住鼠标拖动选择一段文字，再设置局部样式。</p></div><span>1.4×</span></div>
        <div class="title-detail-preview"><canvas id="title-detail-canvas" width="1400" height="360"></canvas></div>
        <div id="title-selection-toolbar" class="title-selection-toolbar" hidden>
          <div class="title-selection-heading"><strong id="title-selection-label">已选中文字</strong><button class="btn sm quiet" data-act="title-selection-clear">取消选择</button></div>
          <div class="title-selection-controls">
            <label class="title-control"><span>局部字体</span><select data-title-selection="font">${TITLE_FONTS.map((f, i) => `<option value="${i}">${esc(f[0])}</option>`).join('')}</select></label>
            <label class="title-control"><span>局部颜色</span><input type="color" data-title-selection="color" value="${t.fillColor}"></label>
          </div>
          <div class="title-selection-effects" aria-label="局部文字效果">
            <button class="btn sm" data-act="title-selection-weight">加粗</button>
            <button class="btn sm" data-act="title-selection-italic">斜体</button>
            <button class="btn sm" data-act="title-selection-underline">下划线</button>
            <button class="btn sm" data-act="title-selection-outline">描边</button>
            <button class="btn sm" data-act="title-selection-shadow">投影</button>
            <button class="btn sm quiet" data-act="title-selection-reset">清除局部样式</button>
          </div>
        </div>
        <div class="title-preview-foot"><span>选中字体：<b id="title-current-font">${esc(TITLE_FONTS[Number(t.font) || 0]?.[0] || TITLE_FONTS[0][0])}</b></span><span>适用于直播伴侣或 OBS 图片源</span></div>
      </section>
    </div>`;
}

function drawTitleCanvas(canvas, title) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const text = String(title.text || '');
  const glyphs = [];
  if (!text) return glyphs;
  const size = Number(title.size) || 88;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const spacing = Number(title.spacing) || 0;
  const lines = text.split('\n');
  const lineHeight = size * (Number(title.lineHeight) || 120) / 100;
  const firstY = -((lines.length - 1) * lineHeight) / 2;
  let characterIndex = 0;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, Number(title.opacity) / 100));
  ctx.translate(canvas.width * Number(title.x) / 100, canvas.height * Number(title.y) / 100);
  ctx.rotate(Number(title.rotation || 0) * Math.PI / 180);
  lines.forEach((line, lineIndex) => {
    const chars = Array.from(line);
    const widths = chars.map((ch, index) => {
      const style = titleCharacterStyle(title, characterIndex + index);
      ctx.font = `${style.weight} ${size}px ${TITLE_FONTS[style.font][1]}`;
      return ctx.measureText(ch).width;
    });
    const totalWidth = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, chars.length - 1) * spacing;
    let x = title.align === 'left' ? -canvas.width * .42 : title.align === 'right' ? canvas.width * .42 - totalWidth : -totalWidth / 2;
    const y = firstY + lineIndex * lineHeight;
    chars.forEach((ch, index) => {
      const style = titleCharacterStyle(title, characterIndex);
      ctx.save();
      ctx.translate(x, y);
      if (style.italic) ctx.transform(1, 0, -0.32, 1, 0, 0);
      ctx.font = `${style.weight} ${size}px ${TITLE_FONTS[style.font][1]}`;
      ctx.fillStyle = style.color;
      if (style.shadowEnabled) {
        ctx.shadowColor = title.shadowColor || '#172033';
        ctx.shadowBlur = Number(title.shadowBlur) || 0;
        ctx.shadowOffsetX = Number(title.shadowX) || 0;
        ctx.shadowOffsetY = Number(title.shadowY) || 0;
      }
      const matrix = ctx.getTransform();
      const corners = [[-size * .08, -size * .56], [widths[index] + size * .08, -size * .56], [widths[index] + size * .08, size * .56], [-size * .08, size * .56]].map(([px, py]) => matrix.transformPoint({ x: px, y: py }));
      glyphs.push({ index: characterIndex, bounds: { left: Math.min(...corners.map(p => p.x)), right: Math.max(...corners.map(p => p.x)), top: Math.min(...corners.map(p => p.y)), bottom: Math.max(...corners.map(p => p.y)) } });
      if (Number(style.outline) > 0) {
        ctx.lineWidth = Number(style.outline);
        ctx.strokeStyle = title.outlineColor || '#172033';
        ctx.strokeText(ch, 0, 0);
      }
      ctx.fillText(ch, 0, 0);
      if (style.underline && ch.trim()) ctx.fillRect(0, size * .43, widths[index], Math.max(2, size * .035));
      ctx.restore();
      x += widths[index] + spacing;
      characterIndex++;
    });
    characterIndex++;
  });
  ctx.restore();
  return glyphs;
}
