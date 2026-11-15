const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const TOOL_NAME = 'nvidiaProfileInspector.exe';
const PROFILE_NAME = 'Delta Force';

// NVIDIA DRS setting IDs are public in NvApiDriverSettings.h. The values below
// are the two documented 1U preset targets, restricted to the named settings.
const COMMON = Object.freeze({
  1675263: 1, 1686376: 1, 3066610: 0, 5912412: 2525368439,
  6600001: 1, 6714153: 0, 8102046: 1, 8703344: 1,
  10011052: 0, 11041231: 138504007, 11306135: 4294967295,
  15151633: 1, 269553971: 1, 274197361: 1, 276089202: 0,
  277041154: 0, 550932728: 0, 553505273: 0, 6524559: 0
});
const PRESETS = Object.freeze({
  performance: Object.freeze({ ...COMMON, 13510289: 20, 276652957: 0, 279476652: 1, 279476687: 1, 549528094: 2 }),
  clarity: Object.freeze({ ...COMMON, 13510289: 0, 276652957: 2, 279476652: 0, 279476687: 0, 549528094: 0 })
});
const DLSS_MODEL = Object.freeze({ off: 0, C: 3, K: 11 });
const DLSS_OVERRIDE_ID = 0x10e41e01;
const DLSS_PRESET_ID = 0x10e41df3;

function xmlEscape(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
}

function profileXml(name, executables, settings) {
  return `  <Profile>\r\n    <ProfileName>${xmlEscape(name)}</ProfileName>\r\n    <Executeables>${executables.map(x => `<string>${xmlEscape(x)}</string>`).join('')}</Executeables>\r\n    <Settings>\r\n${Object.entries(settings).map(([id, value]) => `      <ProfileSetting><SettingNameInfo /><SettingID>${id}</SettingID><SettingValue>${value}</SettingValue><ValueType>Dword</ValueType></ProfileSetting>`).join('\r\n')}\r\n    </Settings>\r\n  </Profile>`;
}

function buildNip({ preset, model, executable }) {
  if (!Object.hasOwn(PRESETS, preset)) throw new Error('未知的 NVIDIA 驱动方案');
  if (!Object.hasOwn(DLSS_MODEL, model)) throw new Error('未知的 DLSS 模型');
  const exe = path.basename(String(executable || ''));
  if (!/^[\w. -]+\.exe$/i.test(exe) || exe.length > 100) throw new Error('请先选择三角洲游戏的可执行文件');
  const dlss = { [DLSS_OVERRIDE_ID]: model === 'off' ? 0 : 1, [DLSS_PRESET_ID]: DLSS_MODEL[model] };
  const xml = `<?xml version="1.0" encoding="utf-16"?>\r\n<ArrayOfProfile>\r\n${profileXml('Base Profile', [], PRESETS[preset])}\r\n${profileXml(PROFILE_NAME, [exe], dlss)}\r\n</ArrayOfProfile>\r\n`;
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, 'utf16le')]);
}

function toolSource() {
  return path.join(__dirname, 'vendor', 'nvidia-profile-inspector');
}

function prepareTool(userDataPath) {
  const source = toolSource();
  const target = path.join(userDataPath, 'nvidia-profile-inspector');
  fs.mkdirSync(target, { recursive: true });
  for (const filename of [TOOL_NAME, `${TOOL_NAME}.config`, 'Reference.xml', 'LICENSE.txt']) {
    const from = path.join(source, filename);
    if (!fs.existsSync(from)) throw new Error('轻场缺少 NVIDIA 配置工具文件，请重新安装完整版本');
    const to = path.join(target, filename);
    if (!fs.existsSync(to) || fs.statSync(from).size !== fs.statSync(to).size) fs.copyFileSync(from, to);
  }
  return { executable: path.join(target, TOOL_NAME), folder: target };
}

async function runTool(executable, folder, args, timeout = 60000) {
  await execFileAsync(executable, args, { cwd: folder, windowsHide: true, timeout, maxBuffer: 64 * 1024 });
}

async function exportCustomized(tool) {
  const before = new Set(fs.readdirSync(tool.folder).filter(x => x.toLowerCase().endsWith('.nip')));
  await runTool(tool.executable, tool.folder, ['-exportCustomized']);
  let created = [];
  for (let attempt = 0; attempt < 150; attempt++) {
    created = fs.readdirSync(tool.folder).filter(x => x.toLowerCase().endsWith('.nip') && !before.has(x));
    if (created.length) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  return created.map(x => path.join(tool.folder, x)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || '';
}

async function prepareNvidiaPreset(userDataPath, options) {
  if (process.platform !== 'win32' || !fs.existsSync(path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'nvapi64.dll'))) {
    throw new Error('当前电脑没有可用的 NVIDIA 驱动');
  }
  if (!fs.existsSync(options.executable) || path.extname(options.executable).toLowerCase() !== '.exe') {
    throw new Error('找不到所选的游戏程序');
  }
  const tool = prepareTool(userDataPath);
  const backup = await exportCustomized(tool);
  const dir = path.join(userDataPath, 'nvidia-presets');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `qingchang-${options.preset}-${options.model}-${Date.now()}.nip`);
  fs.writeFileSync(file, buildNip(options));
  return { file, backup, tool: tool.executable, scope: 'NVIDIA 全局驱动参数 + 三角洲专用 DLSS 模型' };
}

async function openPresetInInspector(userDataPath, file) {
  const tool = prepareTool(userDataPath);
  const dir = path.join(userDataPath, 'nvidia-presets');
  if (!path.isAbsolute(file) || path.dirname(file) !== dir || !fs.existsSync(file)) throw new Error('NVIDIA 预设文件无效');
  // The file argument starts Profile Inspector's import path. Its exit code
  // does not prove the NVIDIA driver accepted the profile.
  const { spawn } = require('node:child_process');
  await new Promise((resolve, reject) => {
    const child = spawn(tool.executable, [file], { cwd: tool.folder, detached: true, stdio: 'ignore', windowsHide: false });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
  return { opened: true };
}

module.exports = { buildNip, prepareNvidiaPreset, openPresetInInspector, PRESETS, DLSS_MODEL };
