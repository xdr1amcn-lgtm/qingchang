(function () {
  const SPEECH_SILENCE_HOLD_MS = 3000;
  const ECHO_MIN_DELAY_MS = 35;
  const ECHO_MAX_DELAY_MS = 260;
  const ECHO_HISTORY_MS = 520;
  const ECHO_HOLD_MS = 2400;
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode') === 'output' ? 'output' : 'control';
  const root = document.getElementById('live-root');
  let currentState = {
    speaker: 'idle',
    speakers: { streamer: false, hamster: false },
    intensity: 1,
    audio: {
      enabled: false,
      micLevel: 0,
      desktopLevel: 0,
      micVoice: false,
      desktopVoice: false,
      micEcho: false,
      message: '未开启自动识别'
    }
  };
  let unsubscribe = null;
  let audioLoop = null;
  let mouthTimer = null;
  let mouthOpen = false;
  let lastMouthMode = null;
  let selectedMicId = '';
  try { selectedMicId = localStorage.getItem('che-live-mic-device') || ''; } catch (_error) {}
  let selectedMixDeviceId = '';
  try { selectedMixDeviceId = localStorage.getItem('che-live-mix-device') || ''; } catch (_error) {}
  let recognitionMode = 'mixed';
  try { recognitionMode = localStorage.getItem('che-live-recognition-mode-v2') === 'split' ? 'split' : 'mixed'; } catch (_error) {}
  let selectedDesktopSourceId = '';
  try { selectedDesktopSourceId = localStorage.getItem('che-live-desktop-source') || ''; } catch (_error) {}

  const speakerNames = {
    idle: '待机中',
    streamer: '主播说话',
    hamster: '哈基蜂说话',
    both: '主播与哈基蜂同时说话'
  };

  function sceneMarkup() {
    return `
      <div class="scene-stage${mode === 'output' ? ' output-stage' : ''}" data-intensity="medium">
        <div class="scene-character streamer" aria-label="主播角色">
          <div class="character-motion">
            <img class="character-frame frame-closed" src="../assets/主播角色-持枪闭嘴.png" alt="" draggable="false" loading="eager" decoding="sync" />
            <img class="character-frame frame-open" src="../assets/主播角色-持枪张嘴.png" alt="" draggable="false" loading="eager" decoding="sync" />
          </div>
        </div>
        <div class="scene-character hamster" aria-label="哈基蜂角色">
          <div class="character-motion">
            <img class="character-frame frame-closed" src="../assets/哈基蜂角色-闭嘴.png" alt="" draggable="false" loading="eager" decoding="sync" />
            <img class="character-frame frame-open" src="../assets/哈基蜂角色-张嘴.png" alt="" draggable="false" loading="eager" decoding="sync" />
          </div>
        </div>
      </div>
    `;
  }

  function meterBars(kind) {
    return Array.from({ length: 20 }, (_, index) => `<i data-meter-bar="${kind}" data-index="${index}"></i>`).join('');
  }

  function legacyControlMarkup() {
    return `
      <main class="control-shell">
        <header class="control-header">
          <div>
            <p class="kicker">LOCAL LIVESTREAM DESK</p>
            <h1>轻场 · 直播形象助手 <span class="brand-byline">繁琐退场，精彩上场。</span></h1>
            <p>v0.4.1 · 3D-Speaker CAM++ 中文声纹 · 本地运行</p>
          </div>
        </header>
        <section class="control-grid">
          <div class="preview-panel">
            <div class="panel-heading"><h2>直播画面预览</h2><span data-scene-status>待机中</span></div>
            ${sceneMarkup()}
            <div class="workspace-deck">
              <section class="deck-card deck-status-card">
                <div class="deck-card-top"><span class="deck-icon">⏻</span><div><small>当前状态</small><strong data-deck-speaker>待机中</strong></div></div>
                <p data-deck-status-detail>尚未开始直播形象输出</p>
                <div class="deck-divider"></div>
                <div class="deck-meta"><span>◷　运行时长</span><b>00:00:00</b></div>
                <div class="deck-meta"><span>▧　当前场景</span><b>直播伴侣</b></div>
              </section>
              <section class="deck-card deck-output-card">
                <div class="deck-card-top"><span class="deck-icon">▣</span><div><small>直播输出</small><strong data-deck-output>窗口未打开</strong></div></div>
                <p data-deck-output-detail>请先打开直播画面窗口</p>
                <div class="deck-actions">
                  <button class="deck-button" data-open-output>打开直播画面窗口</button>
                  <button class="deck-button secondary" data-close-output>关闭直播画面窗口</button>
                </div>
              </section>
              <section class="deck-card deck-audio-card">
                <div class="deck-card-top"><span class="deck-icon audio">〽</span><div><small>声音检测</small><strong data-deck-audio-status>未开启</strong></div></div>
                <div class="deck-meter-row"><span data-deck-mic-label>♩　主播匹配度</span><b data-deck-mic-percent>0%</b></div>
                <div class="deck-meter"><div class="deck-meter-bars">${meterBars('mic')}</div></div>
                <div class="deck-meter-row"><span data-deck-desktop-label>▱　采集卡混合声音</span><b data-deck-desktop-percent>0%</b></div>
                <div class="deck-meter"><div class="deck-meter-bars">${meterBars('desktop')}</div></div>
              </section>
            </div>
          </div>
          <aside class="settings-panel">
            <div class="settings-block">
              <div class="settings-label"><strong>说话状态</strong><span>手动预览或自动识别</span></div>
              <div class="speaker-buttons">
                <button class="speaker-button" data-speaker="idle"><span class="speaker-dot"></span><b>待机</b><small>无说话</small></button>
                <button class="speaker-button" data-speaker="streamer"><span class="speaker-dot"></span><b>主播说话</b><small>威龙</small></button>
                <button class="speaker-button" data-speaker="hamster"><span class="speaker-dot"></span><b>哈基蜂说话</b><small>其他人声</small></button>
              </div>
            </div>
            <div class="settings-block">
              <div class="settings-label"><strong>动画强度</strong><span>只影响说话时的轻微动作</span></div>
              <label class="range-row"><span>弱</span><input type="range" min="0.55" max="1.35" step="0.05" value="1" data-intensity /><span>强</span><b class="range-value" data-intensity-value>1.00</b></label>
            </div>
            <div class="settings-block">
              <div class="settings-label"><strong>直播输出</strong><span>独立本地窗口</span></div>
              <button class="output-button" data-open-output>打开直播画面窗口</button>
              <button class="output-button secondary" data-close-output>关闭直播画面窗口</button>
            </div>
            <div class="settings-block">
              <div class="settings-label"><strong>自动声音检测</strong><span>区分主播与其他人声</span></div>
              <button class="output-button audio-detect-button" data-toggle-audio>开启自动识别</button>
              <div class="mic-picker">
                <label for="recognition-mode-select">识别方式</label>
                <select id="recognition-mode-select" data-mode-select>
                  <option value="mixed">双机推流 · 采集卡混合声音</option>
                  <option value="split">分轨 · 麦克风和电脑声音</option>
                </select>
              </div>
              <div class="mic-picker" data-mixed-controls>
                <label for="mix-device-select">采集卡声音来源</label>
                <div class="mic-picker-row">
                  <select id="mix-device-select" data-mix-select>
                    <option value="">请选择采集卡音频设备</option>
                    <option value="loopback">系统声音（已监听采集卡时）</option>
                  </select>
                  <button class="mic-refresh" type="button" data-refresh-mics>刷新</button>
                </div>
                <button class="mic-refresh calibrate-button" type="button" data-calibrate-speaker>第1步：录入主播（约15秒）</button>
                <button class="mic-refresh calibrate-button" type="button" data-verify-speaker>第2步：验证主播（约6秒）</button>
                <small class="calibrate-tip">先开启自动识别，让主播单独连续说话；校准时保持与直播相同的采集卡声音来源。</small>
                <div class="calibration-result" role="status" data-calibration-status>尚未就绪：正在读取声纹状态…</div>
                <button class="mic-refresh calibrate-button" type="button" data-reconnect-audio>重新连接声音</button>
              </div>
              <div data-split-controls>
              <div class="mic-picker">
                <label for="mic-device-select">主播麦克风</label>
                <div class="mic-picker-row">
                  <select id="mic-device-select" data-mic-select>
                    <option value="">系统默认麦克风</option>
                  </select>
                  <button class="mic-refresh" type="button" data-refresh-mics>刷新</button>
                </div>
              </div>
              <div class="mic-picker">
                <label for="desktop-source-select">电脑声音来源</label>
                <div class="mic-picker-row">
                  <select id="desktop-source-select" data-desktop-select>
                    <option value="">整个电脑（默认）</option>
                  </select>
                  <button class="mic-refresh" type="button" data-refresh-desktop>刷新</button>
                </div>
              </div>
              </div>
              <div class="audio-channels" aria-live="polite">
                <div class="audio-channel">
                  <div class="audio-channel-head"><span data-mic-channel-label>主播匹配度</span><b data-mic-level>未连接</b></div>
                  <div class="audio-meter"><i data-mic-meter></i></div>
                  <small data-mic-state>用采集卡录音中的主播声纹识别威龙</small>
                </div>
                <div class="audio-channel">
                  <div class="audio-channel-head"><span data-desktop-channel-label>采集卡混合声音</span><b data-desktop-level>未连接</b></div>
                  <div class="audio-meter desktop"><i data-desktop-meter></i></div>
                  <small data-desktop-state>主播以外的人声 → 哈基蜂</small>
                </div>
              </div>
              <div class="audio-state" data-audio-message>未开启自动识别</div>
            </div>
          </aside>
        </section>
      </main>
    `;
  }

  function controlMarkup() {
    if(params.get('theme')!=='qingchang')return legacyControlMarkup();
    const legacy=legacyControlMarkup(),label=legacy.indexOf('<div class="settings-label"><strong>自动声音检测'),start=legacy.lastIndexOf('<div class="settings-block">',label),audio=legacy.slice(start,legacy.indexOf('</aside>',label));
    return `<main class="control-shell"><header class="avatar-topbar"><div><b>轻场</b><span>主播工作台 / 直播形象助手</span></div><button class="mic-refresh" data-back-workspace>返回工作台</button></header><div class="avatar-heading"><div><h1>直播形象助手</h1><p>用虚拟形象保持互动，让组队与账号信息留在你的屏幕里。</p></div><span class="avatar-local-tag">声音识别仅在本机运行</span></div><section class="control-grid"><div class="avatar-preview-column"><section class="preview-panel"><div class="panel-heading"><h2>安全直播画面</h2><span data-scene-status>待机中</span></div>${sceneMarkup()}<div class="avatar-output-toolbar"><div><strong data-deck-output>窗口未打开</strong><p data-deck-output-detail>在直播伴侣或 OBS 中捕获独立安全画面窗口。</p></div><button class="deck-button" data-open-output>打开安全画面</button><button class="deck-button secondary" data-close-output>关闭安全画面</button></div></section><section class="avatar-manual-panel"><div class="panel-heading"><h2>形象与动作预览</h2><span>手动试一下</span></div><div class="speaker-buttons"><button class="speaker-button" data-speaker="idle"><span class="speaker-dot"></span><b>待机</b></button><button class="speaker-button" data-speaker="streamer"><span class="speaker-dot"></span><b>主播说话</b></button><button class="speaker-button" data-speaker="hamster"><span class="speaker-dot"></span><b>水友说话</b></button></div><label class="range-row"><span>动作强度</span><input type="range" min="0.55" max="1.35" step="0.05" value="1" data-intensity><b class="range-value" data-intensity-value>1.00</b></label><p class="avatar-scene-help">切换到安全场景的快捷键，请在直播伴侣或 OBS 中设置。退出按钮和设置面板不会出现在独立输出画面中。</p></section></div><aside class="settings-panel">${audio}</aside></section></main>`;
  }

  function setState(patch) {
    currentState = { ...currentState, ...patch };
    if (window.liveDesk) window.liveDesk.setState(patch);
    applyState();
  }

  function setAudioState(patch) {
    currentState.audio = { ...currentState.audio, ...patch };
    if (window.liveDesk) window.liveDesk.setState({ audio: patch });
    applyAudioState();
  }

  function applyState() {
    const stage = root.querySelector('.scene-stage');
    if (!stage) return;
    const speaker = currentState.speaker;
    const speakers = currentState.speakers || {
      streamer: speaker === 'streamer' || speaker === 'both',
      hamster: speaker === 'hamster' || speaker === 'both'
    };
    const streamerTalking = Boolean(speakers.streamer);
    const hamsterTalking = Boolean(speakers.hamster);
    const streamer = stage.querySelector('.streamer');
    const hamster = stage.querySelector('.hamster');
    const statusNodes = root.querySelectorAll('[data-scene-status]');
    const intensity = currentState.intensity < .82 ? 'low' : currentState.intensity > 1.15 ? 'high' : 'medium';

    stage.dataset.intensity = intensity;
    streamer.classList.toggle('is-talking', streamerTalking);
    streamer.classList.toggle('is-muted', !streamerTalking && hamsterTalking);
    hamster.classList.toggle('is-talking', hamsterTalking);
    hamster.classList.toggle('is-muted', !hamsterTalking && streamerTalking);
    statusNodes.forEach((node) => {
      node.textContent = speakerNames[speaker];
      node.classList.toggle('streamer', streamerTalking && !hamsterTalking);
      node.classList.toggle('hamster', hamsterTalking && !streamerTalking);
      node.classList.toggle('both', streamerTalking && hamsterTalking);
    });

    const deckSpeaker = root.querySelector('[data-deck-speaker]');
    const deckStatusDetail = root.querySelector('[data-deck-status-detail]');
    const deckOutput = root.querySelector('[data-deck-output]');
    const deckOutputDetail = root.querySelector('[data-deck-output-detail]');
    if (deckSpeaker) deckSpeaker.textContent = speakerNames[speaker];
    if (deckSpeaker) {
      deckSpeaker.classList.toggle('streamer', streamerTalking && !hamsterTalking);
      deckSpeaker.classList.toggle('hamster', hamsterTalking && !streamerTalking);
      deckSpeaker.classList.toggle('both', streamerTalking && hamsterTalking);
    }
    if (deckStatusDetail) deckStatusDetail.textContent = speaker === 'idle' ? '尚未开始直播形象输出' : speaker === 'both' ? '主播与哈基蜂正在同时说话' : `${speakerNames[speaker]} · 正在输出动画`;
    if (deckOutput) deckOutput.textContent = currentState.outputOpen ? '窗口已打开' : '窗口未打开';
    if (deckOutputDetail) deckOutputDetail.textContent = currentState.outputOpen ? '可在抖音直播伴侣中添加窗口捕获' : '请先打开直播画面窗口';

    root.querySelectorAll('[data-speaker]').forEach((button) => {
      button.classList.toggle('active', button.dataset.speaker === speaker);
    });
    const range = root.querySelector('[data-intensity]');
    const value = root.querySelector('[data-intensity-value]');
    if (range) range.value = String(currentState.intensity);
    if (value) value.textContent = Number(currentState.intensity).toFixed(2);
    const mouthMode = `${streamerTalking ? '1' : '0'}${hamsterTalking ? '1' : '0'}`;
    if (lastMouthMode !== mouthMode) {
      lastMouthMode = mouthMode;
      restartMouthAnimation();
    }
    applyAudioState();
  }

  function restartMouthAnimation() {
    if (mouthTimer) clearTimeout(mouthTimer);
    mouthTimer = null;
    mouthOpen = false;
    root.querySelectorAll('.scene-character').forEach((character) => character.classList.remove('mouth-open'));
    const hasTalkingCharacter = Boolean(currentState.speakers?.streamer || currentState.speakers?.hamster || currentState.speaker !== 'idle');
    if (!hasTalkingCharacter) return;
    const step = () => {
      const speakers = currentState.speakers || {
        streamer: currentState.speaker === 'streamer' || currentState.speaker === 'both',
        hamster: currentState.speaker === 'hamster' || currentState.speaker === 'both'
      };
      if (!speakers.streamer && !speakers.hamster) {
        root.querySelectorAll('.scene-character').forEach((character) => character.classList.remove('mouth-open'));
        mouthTimer = null;
        return;
      }
      mouthOpen = !mouthOpen;
      root.querySelectorAll('.scene-character').forEach((character) => {
        const isTalking = character.classList.contains('streamer') ? speakers.streamer : speakers.hamster;
        character.classList.toggle('mouth-open', isTalking && mouthOpen);
      });
      // 一开一合约 2.4 秒，保留明显停顿，适合直播画面中的角色说话动作。
      mouthTimer = setTimeout(step, mouthOpen ? 1000 : 1400);
    };
    mouthTimer = setTimeout(step, 80);
  }

  function applyAudioState() {
    const audio = currentState.audio || {};
    const button = root.querySelector('[data-toggle-audio]');
    const message = root.querySelector('[data-audio-message]');
    const micMeter = root.querySelector('[data-mic-meter]');
    const desktopMeter = root.querySelector('[data-desktop-meter]');
    const micLevel = root.querySelector('[data-mic-level]');
    const desktopLevel = root.querySelector('[data-desktop-level]');
    const micState = root.querySelector('[data-mic-state]');
    const desktopState = root.querySelector('[data-desktop-state]');
    const calibrateButton = root.querySelector('[data-calibrate-speaker]');
    const enabled = Boolean(audio.enabled);
    const mixed = recognitionMode === 'mixed';
    const micValue = Math.round((Number(audio.micLevel) || 0) * 100);
    const desktopValue = Math.round((Number(audio.desktopLevel) || 0) * 100);
    if (button) {
      button.textContent = enabled ? '关闭自动识别' : '开启自动识别';
      button.classList.toggle('is-on', enabled);
    }
    if (calibrateButton) calibrateButton.disabled = !audioLoop || audioLoop.mode !== 'mixed' || Boolean(audioLoop.calibrating);
    const verifyButton = root.querySelector('[data-verify-speaker]');
    if (verifyButton) verifyButton.disabled = !audioLoop || audioLoop.mode !== 'mixed' || Boolean(audioLoop.calibrating);
    if (message) message.textContent = audio.message || (enabled ? (mixed ? '正在识别采集卡混合声音' : '正在监听麦克风和电脑音频') : '未开启自动识别');
    if (micMeter) micMeter.style.width = `${micValue}%`;
    if (desktopMeter) desktopMeter.style.width = `${desktopValue}%`;
    if (micLevel) micLevel.textContent = enabled ? `${micValue}%` : '未连接';
    if (desktopLevel) desktopLevel.textContent = enabled ? `${desktopValue}%` : '未连接';
    if (micState) micState.textContent = mixed
      ? (audio.micVoice ? '声纹匹配主播 · 威龙说话' : '从混合声音比对主播声纹')
      : (audio.micVoice ? '检测到主播人声 · 威龙说话' : '麦克风人声 → 威龙');
    if (desktopState) desktopState.textContent = mixed
      ? (audio.desktopVoice ? '识别到其他人声 · 哈基蜂说话' : '主播以外的人声 → 哈基蜂')
      : audio.micEcho
        ? '检测到主播监听回放 · 已过滤，不触发哈基蜂'
        : audio.desktopVoice
          ? '检测到其他人声 · 哈基蜂说话'
          : '其他人声 → 哈基蜂；游戏音效不触发';
    const deckAudioStatus = root.querySelector('[data-deck-audio-status]');
    const deckMicPercent = root.querySelector('[data-deck-mic-percent]');
    const deckDesktopPercent = root.querySelector('[data-deck-desktop-percent]');
    if (deckAudioStatus) deckAudioStatus.textContent = enabled ? (mixed ? '声纹识别中' : audio.micEcho ? '监听过滤中' : '自动识别中') : '未开启';
    if (deckMicPercent) deckMicPercent.textContent = `${micValue}%`;
    if (deckDesktopPercent) deckDesktopPercent.textContent = `${desktopValue}%`;
    root.querySelectorAll('[data-meter-bar="mic"]').forEach((bar, index) => bar.classList.toggle('active', enabled && index < Math.ceil(micValue / 5)));
    root.querySelectorAll('[data-meter-bar="desktop"]').forEach((bar, index) => bar.classList.toggle('active', enabled && index < Math.ceil(desktopValue / 5)));
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function applyRecognitionModeUI() {
    const mixed = recognitionMode === 'mixed';
    const modeSelect = root.querySelector('[data-mode-select]');
    if (modeSelect) modeSelect.value = recognitionMode;
    const mixedControls = root.querySelector('[data-mixed-controls]');
    const splitControls = root.querySelector('[data-split-controls]');
    if (mixedControls) mixedControls.hidden = !mixed;
    if (splitControls) splitControls.hidden = mixed;
    const labels = {
      '[data-mic-channel-label]': mixed ? '主播匹配度' : '主播麦克风',
      '[data-desktop-channel-label]': mixed ? '采集卡混合声音' : '电脑音频',
      '[data-deck-mic-label]': mixed ? '♩　主播匹配度' : '♩　主播麦克风',
      '[data-deck-desktop-label]': mixed ? '▱　采集卡混合声音' : '▱　电脑音频'
    };
    for (const [selector, label] of Object.entries(labels)) {
      const node = root.querySelector(selector);
      if (node) node.textContent = label;
    }
    applyAudioState();
  }

  async function refreshMicrophones() {
    const select = root.querySelector('[data-mic-select]');
    const mixSelect = root.querySelector('[data-mix-select]');
    if ((!select && !mixSelect) || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((device) => device.kind === 'audioinput');
      if (select) select.innerHTML = '<option value="">系统默认麦克风</option>';
      if (mixSelect) mixSelect.innerHTML = '<option value="">请选择采集卡音频设备</option><option value="loopback">系统声音（已监听采集卡时）</option>';
      inputs.forEach((device, index) => {
        for (const target of [select, mixSelect]) {
          if (!target) continue;
          const option = document.createElement('option');
          option.value = device.deviceId;
          option.textContent = device.label || `音频输入 ${index + 1}`;
          target.appendChild(option);
        }
      });
      if (select) select.value = selectedMicId && inputs.some((device) => device.deviceId === selectedMicId) ? selectedMicId : '';
      if (mixSelect) mixSelect.value = selectedMixDeviceId === 'loopback' || inputs.some((device) => device.deviceId === selectedMixDeviceId) ? selectedMixDeviceId : '';
    } catch (_error) {
      // 设备列表不可用时保留系统默认选项，不影响手动预览。
    }
  }

  async function refreshDesktopSources() {
    const select = root.querySelector('[data-desktop-select]');
    if (!select || !window.liveDesk?.getDesktopSources) return;
    try {
      const sources = await window.liveDesk.getDesktopSources();
      const current = selectedDesktopSourceId || select.value;
      select.innerHTML = '<option value="">整个电脑（默认）</option>';
      sources.forEach((source) => {
        const option = document.createElement('option');
        option.value = source.id;
        option.textContent = source.kind === 'screen' ? `整个电脑 · ${source.name}` : `窗口 · ${source.name}`;
        select.appendChild(option);
      });
      if (current && sources.some((source) => source.id === current)) {
        selectedDesktopSourceId = current;
        select.value = current;
      } else {
        selectedDesktopSourceId = '';
        select.value = '';
      }
      await window.liveDesk.setDesktopSource(selectedDesktopSourceId);
    } catch (_error) {
      // 桌面来源读取失败时保留整个电脑默认选项。
    }
  }

  function makeAudioDetector(context, stream, kind) {
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.62;
    analyser.minDecibels = -100;
    analyser.maxDecibels = -10;
    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    return {
      kind,
      analyser,
      timeData: new Float32Array(analyser.fftSize),
      freqData: new Uint8Array(analyser.frequencyBinCount),
      sampleRate: context.sampleRate,
      noiseFloor: 0.002,
      voiceFrames: 0,
      lastVoiceAt: 0,
      talkingUntil: 0,
      lastProfile: { level: 0, voice: false, liveVoice: false },
      frameHistory: []
    };
  }

  function periodicity(detector) {
    const data = detector.timeData;
    const sampleRate = detector.sampleRate;
    const minLag = Math.max(2, Math.floor(sampleRate / 420));
    const maxLag = Math.min(Math.floor(sampleRate / 75), data.length - 2);
    let best = 0;
    for (let lag = minLag; lag <= maxLag; lag += 3) {
      let sum = 0;
      let energyA = 0;
      let energyB = 0;
      for (let i = 0; i < data.length - lag; i += 4) {
        const a = data[i];
        const b = data[i + lag];
        sum += a * b;
        energyA += a * a;
        energyB += b * b;
      }
      if (energyA > 0 && energyB > 0) best = Math.max(best, sum / Math.sqrt(energyA * energyB));
    }
    return clamp(best, 0, 1);
  }

  function inspectAudio(detector) {
    const { analyser, timeData, freqData } = detector;
    analyser.getFloatTimeDomainData(timeData);
    analyser.getByteFrequencyData(freqData);
    let energy = 0;
    let crossings = 0;
    for (let i = 0; i < timeData.length; i += 2) {
      const sample = timeData[i];
      energy += sample * sample;
      if (i > 1 && (sample >= 0) !== (timeData[i - 2] >= 0)) crossings += 1;
    }
    const rms = Math.sqrt(energy / Math.ceil(timeData.length / 2));
    const nyquist = detector.sampleRate / 2;
    let total = 0;
    let speechBand = 0;
    let lowBand = 0;
    let highBand = 0;
    for (let i = 0; i < freqData.length; i += 1) {
      const hz = (i / freqData.length) * nyquist;
      const value = freqData[i] / 255;
      total += value;
      if (hz >= 120 && hz <= 4200) speechBand += value;
      if (hz >= 80 && hz < 280) lowBand += value;
      if (hz > 5200) highBand += value;
    }
    const speechRatio = total ? speechBand / total : 0;
    const lowRatio = speechBand ? lowBand / speechBand : 0;
    const highRatio = total ? highBand / total : 0;
    const zeroCrossRate = crossings / Math.ceil(timeData.length / 2);
    const voiced = periodicity(detector);
    const voiceScore = (speechRatio * 0.42) + (clamp(voiced, 0, 1) * 0.42) + (clamp(lowRatio * 2, 0, 1) * 0.12) + (clamp((0.26 - highRatio) * 4, 0, 1) * 0.04);
    const speechShape = speechRatio > 0.3 && zeroCrossRate > 0.008 && zeroCrossRate < 0.3 && voiceScore > 0.43;
    // Never learn sustained speech as background noise. This detector is used for
    // split-channel mode and calibration feedback; mixed-mode decisions use neural VAD.
    if (!speechShape || rms < detector.noiseFloor) {
      detector.noiseFloor = clamp(detector.noiseFloor * 0.98 + rms * 0.02, 0.0003, 0.004);
    }
    const threshold = Math.max(0.006, detector.noiseFloor * 2);
    const voiceLike = rms > threshold && speechShape;
    const now = performance.now();
    if (voiceLike) {
      detector.voiceFrames = Math.min(4, detector.voiceFrames + 1);
      detector.lastVoiceAt = now;
      if (detector.voiceFrames >= 2) detector.talkingUntil = now + SPEECH_SILENCE_HOLD_MS;
    } else {
      detector.voiceFrames = Math.max(-4, detector.voiceFrames - 1);
    }
    // 说话中的短暂停顿不立即结束状态，避免角色闪退、变淡或突然坐回去。
    const voice = now < detector.talkingUntil;
    const level = clamp(rms * 7.5, 0, 1);
    detector.lastProfile = { level, voice, liveVoice: voiceLike, rms, speechRatio, voiceScore, at: now };
    if (detector.kind === 'mic') {
      detector.frameHistory.push({
        at: now,
        timeData: new Float32Array(timeData),
        freqData: new Uint8Array(freqData),
        voiceScore,
        liveVoice: voiceLike
      });
      while (detector.frameHistory.length && now - detector.frameHistory[0].at > ECHO_HISTORY_MS) {
        detector.frameHistory.shift();
      }
    }
    return detector.lastProfile;
  }

  function normalizedCorrelation(first, second, requestedMaxLag = 1400) {
    const length = Math.min(first.length, second.length);
    let best = 0;
    const maxLag = Math.min(requestedMaxLag, length - 64);
    for (let lag = -maxLag; lag <= maxLag; lag += 12) {
      const firstStart = lag < 0 ? -lag : 0;
      const secondStart = lag > 0 ? lag : 0;
      const overlap = length - Math.max(firstStart, secondStart);
      let sum = 0;
      let firstEnergy = 0;
      let secondEnergy = 0;
      for (let offset = 0; offset < overlap; offset += 4) {
        const a = first[firstStart + offset];
        const b = second[secondStart + offset];
        sum += a * b;
        firstEnergy += a * a;
        secondEnergy += b * b;
      }
      if (firstEnergy > 0 && secondEnergy > 0) best = Math.max(best, Math.abs(sum) / Math.sqrt(firstEnergy * secondEnergy));
    }
    return best;
  }

  function spectralSimilarity(first, second) {
    const length = Math.min(first.length, second.length);
    let dot = 0;
    let firstEnergy = 0;
    let secondEnergy = 0;
    for (let i = 2; i < length * 0.8; i += 2) {
      const a = first[i] / 255;
      const b = second[i] / 255;
      dot += a * b;
      firstEnergy += a * a;
      secondEnergy += b * b;
    }
    return firstEnergy > 0 && secondEnergy > 0 ? dot / Math.sqrt(firstEnergy * secondEnergy) : 0;
  }

  function delayedEchoMatch(micDetector, desktopDetector, desktopProfile) {
    const now = performance.now();
    let best = { score: 0, time: 0, spectrum: 0, feature: 0, delay: 0 };
    for (const frame of micDetector.frameHistory) {
      const delay = now - frame.at;
      if (delay < ECHO_MIN_DELAY_MS || delay > ECHO_MAX_DELAY_MS || !frame.liveVoice) continue;
      const time = normalizedCorrelation(frame.timeData, desktopDetector.timeData, 1400);
      const spectrum = spectralSimilarity(frame.freqData, desktopDetector.freqData);
      const feature = 1 - Math.min(1, Math.abs(frame.voiceScore - desktopProfile.voiceScore));
      const score = time * 0.62 + spectrum * 0.28 + feature * 0.1;
      if (score > best.score) best = { score, time, spectrum, feature, delay };
    }
    return best;
  }

  function isMicEcho(micProfile, desktopProfile, micDetector, desktopDetector) {
    if (!micProfile.liveVoice || !desktopProfile.liveVoice) return false;
    const match = delayedEchoMatch(micDetector, desktopDetector, desktopProfile);
    return (match.time > 0.27 && match.spectrum > 0.56 && match.feature > 0.5)
      || (match.time > 0.22 && match.spectrum > 0.7 && match.feature > 0.68);
  }

  function stopAudioDetection(message = '未开启自动识别') {
    if (!audioLoop) {
      setAudioState({ enabled: false, micLevel: 0, desktopLevel: 0, micVoice: false, desktopVoice: false, micEcho: false, message });
      setState({ speaker: 'idle', speakers: { streamer: false, hamster: false } });
      return;
    }
    clearTimeout(audioLoop.timer);
    if (audioLoop.processor) {
      audioLoop.processor.onaudioprocess = null;
      audioLoop.processor.disconnect();
    }
    audioLoop.source?.disconnect();
    audioLoop.micStream?.getTracks().forEach((track) => track.stop());
    audioLoop.desktopStream?.getTracks().forEach((track) => track.stop());
    audioLoop.mixedStream?.getTracks().forEach((track) => track.stop());
    audioLoop.context?.close();
    audioLoop = null;
    setAudioState({ enabled: false, micLevel: 0, desktopLevel: 0, micVoice: false, desktopVoice: false, micEcho: false, message });
    setState({ speaker: 'idle', speakers: { streamer: false, hamster: false } });
  }

  function runAudioLoop() {
    if (!audioLoop) return;
    if (audioLoop.mode === 'mixed') {
      runMixedAudioLoop(audioLoop);
      return;
    }
    const mic = inspectAudio(audioLoop.mic);
    const desktop = audioLoop.desktop ? inspectAudio(audioLoop.desktop) : { level: 0, voice: false };
    const micEcho = audioLoop.desktop ? isMicEcho(mic, desktop, audioLoop.mic, audioLoop.desktop) : false;
    const now = performance.now();
    if (micEcho) audioLoop.echoFrames = Math.min(3, audioLoop.echoFrames + 1);
    else audioLoop.echoFrames = Math.max(0, audioLoop.echoFrames - 1);
    if (audioLoop.echoFrames >= 2) audioLoop.echoUntil = now + ECHO_HOLD_MS;
    const echoActive = now < (audioLoop.echoUntil || 0);
    const echoPending = audioLoop.echoFrames > 0;
    const streamerTalking = mic.voice;
    const hamsterTalking = desktop.voice && !echoActive && !echoPending;
    const speaker = streamerTalking && hamsterTalking
      ? 'both'
      : streamerTalking
        ? 'streamer'
        : hamsterTalking
          ? 'hamster'
          : 'idle';
    const nextSpeakers = { streamer: streamerTalking, hamster: hamsterTalking };
    const currentSpeakers = currentState.speakers || { streamer: false, hamster: false };
    const message = echoActive || echoPending
      ? '检测到主播监听回放，电脑通道已过滤'
      : speaker === 'both'
        ? '主播与其他人声同时说话'
        : speaker === 'streamer'
          ? '已识别主播人声 · 威龙说话'
          : speaker === 'hamster'
            ? '已识别其他人声 · 哈基蜂说话'
            : audioLoop.desktop
              ? '正在监听：游戏音效不会直接触发'
              : '麦克风已连接，电脑音频未连接';
    if (currentState.speaker !== speaker || currentSpeakers.streamer !== nextSpeakers.streamer || currentSpeakers.hamster !== nextSpeakers.hamster) {
      setState({ speaker, speakers: nextSpeakers });
    }
    setAudioState({
      enabled: true,
      micLevel: mic.level,
      desktopLevel: desktop.level,
      micVoice: streamerTalking,
      desktopVoice: hamsterTalking,
      micEcho: echoActive,
      message
    });
    audioLoop.timer = setTimeout(runAudioLoop, 80);
  }

  function mixedAudioWindow(loop) {
    const length = 48000;
    if (loop.filled < length) return null;
    const result = new Float32Array(length);
    const start = (loop.writeIndex - length + loop.sampleBuffer.length) % loop.sampleBuffer.length;
    const firstLength = Math.min(length, loop.sampleBuffer.length - start);
    result.set(loop.sampleBuffer.subarray(start, start + firstLength));
    if (firstLength < length) result.set(loop.sampleBuffer.subarray(0, length - firstLength), firstLength);
    return result;
  }

  function updateMixedSpeaker(loop, speaker) {
    const nextSpeakers = { streamer: speaker === 'streamer' || speaker === 'both', hamster: speaker === 'hamster' || speaker === 'both' };
    if (currentState.speaker !== speaker || currentState.speakers?.streamer !== nextSpeakers.streamer || currentState.speakers?.hamster !== nextSpeakers.hamster) {
      setState({ speaker, speakers: nextSpeakers });
    }
  }

  function runMixedAudioLoop(loop) {
    const sound = inspectAudio(loop.desktop);
    const now = performance.now();
    const freshSamples = now - loop.lastSampleAt < 2000;
    if (!freshSamples) {
      loop.message = '没有收到新的声音数据，请检查采集卡或点击“重新连接声音”';
      updateMixedSpeaker(loop, 'idle');
      if (loop.context?.state === 'suspended') loop.context.resume().catch(() => {});
    }
    if (loop.calibrating && freshSamples) updateMixedSpeaker(loop, sound.voice ? 'streamer' : 'idle');
    if (freshSamples && !loop.calibrating && loop.filled >= 48000 && !loop.classifying && now - loop.lastClassifiedAt >= 900) {
      const windowSamples = mixedAudioWindow(loop);
      const windowAt = loop.lastSampleAt;
      const generation = loop.generation;
      loop.classifying = true;
      loop.lastClassifiedAt = now;
      window.liveDesk.classifySpeaker(windowSamples, selectedMixDeviceId).then((result) => {
        if (audioLoop !== loop || generation !== loop.generation || loop.calibrating || performance.now() - loop.lastSampleAt >= 2000) return;
        loop.speakerScore = clamp(result.score, 0, 1);
        if (!result.voice) {
          loop.message = '声音已连接 · 暂未检测到人声';
          return;
        }
        loop.lastLiveVoiceAt = Math.max(loop.lastLiveVoiceAt, windowAt - (3 - result.speechEnd) * 1000);
        if (performance.now() - loop.lastLiveVoiceAt >= SPEECH_SILENCE_HOLD_MS) return;
        if (result.speaker === 'uncertain') {
          loop.message = result.reason || `人声身份待确认 · 主播相似度 ${Math.round(result.score * 100)} 分；≤${Math.round(result.otherThreshold * 100)} 为其他人，≥${Math.round(result.hostThreshold * 100)} 为主播（不是音量）`;
          loop.candidate = '';
          loop.candidateFrames = 0;
          if (loop.lastRecognizedAt && performance.now() - loop.lastRecognizedAt >= SPEECH_SILENCE_HOLD_MS) {
            updateMixedSpeaker(loop, 'idle');
          }
          return;
        }
        if (loop.candidate === result.speaker) loop.candidateFrames += 1;
        else {
          loop.candidate = result.speaker;
          loop.candidateFrames = 1;
        }
        if (result.speaker === 'hamster' && loop.candidateFrames < 2) {
          loop.message = `检测到其他人声，正在确认 1/2 · 主播相似度 ${Math.round(result.score * 100)} 分`;
          return;
        }
        loop.lastRecognizedAt = performance.now();
        loop.message = result.speaker === 'streamer'
          ? `主播相似度 ${Math.round(result.score * 100)} 分 · 威龙说话`
          : `已确认其他人声 · 主播相似度 ${Math.round(result.score * 100)} 分 · 哈基蜂说话`;
        updateMixedSpeaker(loop, result.speaker);
      }).catch((error) => {
        if (audioLoop === loop && generation === loop.generation) loop.message = `声纹识别出错：${error.message}`;
      }).finally(() => {
        loop.classifying = false;
      });
    }
    if (!loop.calibrating && loop.lastLiveVoiceAt && now - loop.lastLiveVoiceAt >= SPEECH_SILENCE_HOLD_MS) {
      loop.lastRecognizedAt = 0;
      loop.lastLiveVoiceAt = 0;
      loop.candidate = '';
      loop.candidateFrames = 0;
      updateMixedSpeaker(loop, 'idle');
    }
    setAudioState({
      enabled: true,
      micLevel: loop.speakerScore,
      desktopLevel: sound.level,
      micVoice: currentState.speakers?.streamer || false,
      desktopVoice: currentState.speakers?.hamster || false,
      micEcho: false,
      message: loop.message
    });
    loop.timer = setTimeout(runAudioLoop, 100);
  }

  async function calibrateCurrentSpeaker(verifyOnly = false) {
    const loop = audioLoop;
    if (!loop || loop.mode !== 'mixed' || loop.calibrating) return;
    loop.calibrating = true;
    loop.generation += 1;
    const steps = verifyOnly ? 2 : 5;
    const action = verifyOnly ? '主播验证' : '主播录入';
    const status = root.querySelector('[data-calibration-status]');
    loop.message = `${action}中：请只有主播连续说话`;
    if (status) { status.dataset.state = 'working'; status.textContent = loop.message; }
    applyAudioState();
    try {
      const windows = [];
      for (let step = 1; step <= steps; step += 1) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        if (audioLoop !== loop) throw new Error('音频来源已切换，校准取消');
        if (loop.filled < 48000 || performance.now() - loop.lastSampleAt > 2000) throw new Error('音频数据中断，请检查采集卡音源');
        windows.push(mixedAudioWindow(loop));
        loop.message = `${action}中 ${step}/${steps} · 请继续单独说话`;
        if (status) status.textContent = loop.message;
      }
      if (status) status.textContent = `${action}：正在计算声纹，请稍候…`;
      const result = verifyOnly
        ? await window.liveDesk.verifySpeaker(windows, selectedMixDeviceId)
        : await window.liveDesk.calibrateSpeaker(windows, selectedMixDeviceId);
      if (audioLoop !== loop) return;
      loop.candidate = '';
      loop.candidateFrames = 0;
      loop.lastRecognizedAt = 0;
      loop.lastLiveVoiceAt = 0;
      loop.message = verifyOnly ? (result.verified ? '主播验证通过，自动识别已启用' : '主播验证未通过，请重新录入') : '主播录入完成，请继续第2步验证';
      showSpeakerProfile(result);
      if (verifyOnly && !result.verified && status) {
        status.dataset.state = 'error';
        status.textContent = `验证失败：两段匹配得分 ${result.scores.map((score) => Math.round(score * 100)).join(' / ')}，需要达到 ${Math.round(result.hostThreshold * 100)}。请确认只有主播说话后重新录入；当前不分配角色。`;
      }
    } catch (error) {
      if (audioLoop === loop) {
        loop.message = `${action}失败：${error.message}`;
        if (status) { status.dataset.state = 'error'; status.textContent = loop.message; }
      }
    } finally {
      loop.calibrating = false;
      loop.generation += 1;
      loop.lastClassifiedAt = 0;
      if (audioLoop === loop) { updateMixedSpeaker(loop, 'idle'); applyAudioState(); }
    }
  }

  function showSpeakerProfile(result) {
    const status = root.querySelector('[data-calibration-status]');
    if (!status) return;
    status.dataset.state = result.verified ? 'ready' : 'pending';
    status.textContent = result.verified ? '验证通过 · 主播声纹已保存，自动识别已就绪' :
      !result.calibrated ? '尚未录入 · 请先开启识别，再完成第1步和第2步' :
        !result.sourceMatches ? '声音来源已改变 · 请在当前音源重新录入并验证' : '录入完成，尚未验证 · 请点击第2步，单独说一句新的话';
  }

  async function startMixedAudioDetection() {
    if (!selectedMixDeviceId) {
      setAudioState({ enabled: false, message: '请先选择采集卡音频设备' });
      return;
    }
    let stream;
    let context;
    try {
      if (selectedMixDeviceId === 'loopback') {
        await window.liveDesk.setDesktopSource(selectedDesktopSourceId);
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        stream.getVideoTracks().forEach((track) => track.stop());
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: selectedMixDeviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
          video: false
        });
      }
      if (!stream.getAudioTracks().length) throw new Error('选定来源没有音频轨道');
      context = new AudioContext({ sampleRate: 16000, latencyHint: 'interactive' });
      if (context.state === 'suspended') await context.resume();
      if (context.sampleRate !== 16000) throw new Error('无法建立 16 kHz 声纹采集通道');
      const processor = context.createScriptProcessor(2048, 1, 1);
      const source = context.createMediaStreamSource(stream);
      const loop = {
        mode: 'mixed', context, processor, source, mixedStream: stream,
        desktop: makeAudioDetector(context, stream, 'desktop'),
        sampleBuffer: new Float32Array(64000), writeIndex: 0, filled: 0,
        classifying: false, lastClassifiedAt: 0, lastRecognizedAt: 0, lastLiveVoiceAt: 0,
        lastSampleAt: performance.now(), generation: 0,
        candidate: '', candidateFrames: 0, speakerScore: 0,
        message: `已连接：${stream.getAudioTracks()[0].label || '采集卡声音'} · 正在收集说话片段`, timer: null
      };
      processor.onaudioprocess = (event) => {
        loop.lastSampleAt = performance.now();
        const samples = event.inputBuffer.getChannelData(0);
        for (let i = 0; i < samples.length; i += 1) {
          loop.sampleBuffer[loop.writeIndex] = samples[i];
          loop.writeIndex = (loop.writeIndex + 1) % loop.sampleBuffer.length;
        }
        loop.filled = Math.min(loop.sampleBuffer.length, loop.filled + samples.length);
        event.outputBuffer.getChannelData(0).fill(0);
      };
      source.connect(processor);
      processor.connect(context.destination);
      audioLoop = loop;
      setAudioState({ enabled: true, message: loop.message });
      runAudioLoop();
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      context?.close();
      setAudioState({ enabled: false, message: `采集卡声音连接失败：${error.message}` });
    }
  }

  async function startAudioDetection() {
    if (audioLoop) return;
    if (recognitionMode === 'mixed') {
      await startMixedAudioDetection();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !navigator.mediaDevices?.getDisplayMedia) {
      setAudioState({ enabled: false, message: '当前系统不支持音频采集' });
      return;
    }
    try {
      await window.liveDesk.setDesktopSource(selectedDesktopSourceId);
      const micConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      };
      if (selectedMicId) micConstraints.deviceId = { exact: selectedMicId };
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: micConstraints,
        video: false
      });
      await refreshMicrophones();
      let desktopStream = null;
      try {
        desktopStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        });
        desktopStream.getVideoTracks().forEach((track) => track.stop());
      } catch (_error) {
        desktopStream = null;
      }
      const context = new AudioContext({ latencyHint: 'interactive' });
      if (context.state === 'suspended') await context.resume();
      audioLoop = {
        context,
        micStream,
        desktopStream,
        mic: makeAudioDetector(context, micStream, 'mic'),
        desktop: desktopStream?.getAudioTracks().length ? makeAudioDetector(context, desktopStream, 'desktop') : null,
        echoUntil: 0,
        echoFrames: 0,
        timer: null
      };
      setAudioState({ enabled: true, message: audioLoop.desktop ? '麦克风和电脑音频已连接' : '麦克风已连接，电脑音频未连接' });
      runAudioLoop();
    } catch (error) {
      setAudioState({ enabled: false, message: error?.name === 'NotAllowedError' ? '未允许麦克风权限' : '音频连接失败，请重试' });
    }
  }

  async function toggleAudioDetection() {
    if (audioLoop) stopAudioDetection();
    else await startAudioDetection();
  }

  async function changeMicrophone(deviceId) {
    selectedMicId = deviceId || '';
    try {
      if (selectedMicId) localStorage.setItem('che-live-mic-device', selectedMicId);
      else localStorage.removeItem('che-live-mic-device');
    } catch (_error) {}
    if (audioLoop) {
      stopAudioDetection('正在切换麦克风');
      await startAudioDetection();
    }
  }

  async function changeMixSource(deviceId) {
    selectedMixDeviceId = deviceId || '';
    try {
      if (selectedMixDeviceId) localStorage.setItem('che-live-mix-device', selectedMixDeviceId);
      else localStorage.removeItem('che-live-mix-device');
    } catch (_error) {}
    window.liveDesk.getSpeakerStatus(selectedMixDeviceId).then(showSpeakerProfile).catch(() => {});
    if (audioLoop) {
      stopAudioDetection('正在切换采集卡声音来源');
      await startAudioDetection();
    }
  }

  async function changeRecognitionMode(mode) {
    recognitionMode = mode === 'split' ? 'split' : 'mixed';
    try { localStorage.setItem('che-live-recognition-mode-v2', recognitionMode); } catch (_error) {}
    const wasRunning = Boolean(audioLoop);
    if (wasRunning) stopAudioDetection('正在切换识别方式');
    applyRecognitionModeUI();
    if (wasRunning) await startAudioDetection();
  }

  async function changeDesktopSource(sourceId) {
    selectedDesktopSourceId = sourceId || '';
    try {
      if (selectedDesktopSourceId) localStorage.setItem('che-live-desktop-source', selectedDesktopSourceId);
      else localStorage.removeItem('che-live-desktop-source');
    } catch (_error) {}
    await window.liveDesk.setDesktopSource(selectedDesktopSourceId);
    if (audioLoop) {
      stopAudioDetection('正在切换电脑声音来源');
      await startAudioDetection();
    }
  }

  function bindControlEvents() {
    root.addEventListener('click', async (event) => {
      if(event.target.closest('[data-back-workspace]')){await window.liveDesk.returnToWorkspace?.();return;}
      const speakerButton = event.target.closest('[data-speaker]');
      if (speakerButton) {
        if (audioLoop) stopAudioDetection('已切换到手动预览');
        const manualSpeaker = speakerButton.dataset.speaker;
        setState({
          speaker: manualSpeaker,
          speakers: { streamer: manualSpeaker === 'streamer', hamster: manualSpeaker === 'hamster' }
        });
        return;
      }
      if (event.target.closest('[data-toggle-audio]')) {
        await toggleAudioDetection();
        return;
      }
      if (event.target.closest('[data-calibrate-speaker]')) {
        await calibrateCurrentSpeaker();
        return;
      }
      if (event.target.closest('[data-verify-speaker]')) {
        await calibrateCurrentSpeaker(true);
        return;
      }
      if (event.target.closest('[data-reconnect-audio]')) {
        stopAudioDetection('正在重新连接声音');
        await startAudioDetection();
        return;
      }
      if (event.target.closest('[data-refresh-mics]')) {
        await refreshMicrophones();
        return;
      }
      if (event.target.closest('[data-refresh-desktop]')) {
        await refreshDesktopSources();
        return;
      }
      if (event.target.closest('[data-open-output]')) {
        await window.liveDesk.openOutput();
        return;
      }
      if (event.target.closest('[data-close-output]')) {
        await window.liveDesk.closeOutput();
      }
    });
    const range = root.querySelector('[data-intensity]');
    range?.addEventListener('input', () => setState({ intensity: Number(range.value) }));
    root.querySelector('[data-mic-select]')?.addEventListener('change', (event) => changeMicrophone(event.target.value));
    root.querySelector('[data-mix-select]')?.addEventListener('change', (event) => changeMixSource(event.target.value));
    root.querySelector('[data-mode-select]')?.addEventListener('change', (event) => changeRecognitionMode(event.target.value));
    root.querySelector('[data-desktop-select]')?.addEventListener('change', (event) => changeDesktopSource(event.target.value));
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshMicrophones);
    refreshMicrophones();
    refreshDesktopSources();
  }

  async function boot() {
    if (mode === 'output') {
      document.body.className = 'output-body';
      root.innerHTML = sceneMarkup();
    } else {
      if(params.get('theme')==='qingchang')document.body.classList.add('qingchang-avatar');
      root.innerHTML = controlMarkup();
      bindControlEvents();
      applyRecognitionModeUI();
      window.liveDesk.getSpeakerStatus(selectedMixDeviceId).then(showSpeakerProfile).catch((error) => {
        const status = root.querySelector('[data-calibration-status]');
        if (status) status.textContent = `声纹引擎未就绪：${error.message}`;
      });
    }

    currentState = await window.liveDesk.getState();
    applyState();
    unsubscribe = window.liveDesk.onState((state) => {
      currentState = state;
      applyState();
    });
    window.addEventListener('beforeunload', () => {
      unsubscribe?.();
      stopAudioDetection();
      if (mouthTimer) clearTimeout(mouthTimer);
    });
  }

  boot();
})();
