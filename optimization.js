const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const optimizationTools = require('./optimization-tools');

const execFileAsync = promisify(execFile);
const HIGH_PERFORMANCE_GUID = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';
const GPU_NAME_TARGET = 'NVIDIA GeForce GTX 1050 Ti';
const TWEAKS = Object.freeze({
  gameMode: { key: 'HKCU\\Software\\Microsoft\\GameBar', name: 'AutoGameModeEnabled', value: 1 },
  backgroundCapture: { key: 'HKCU\\System\\GameConfigStore', name: 'GameDVR_Enabled', value: 0 },
  appCapture: { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', name: 'AppCaptureEnabled', value: 0 },
  mouseSpeed: { key: 'HKCU\\Control Panel\\Mouse', name: 'MouseSpeed', type: 'REG_SZ', value: '0' },
  mouseThreshold1: { key: 'HKCU\\Control Panel\\Mouse', name: 'MouseThreshold1', type: 'REG_SZ', value: '0' },
  mouseThreshold2: { key: 'HKCU\\Control Panel\\Mouse', name: 'MouseThreshold2', type: 'REG_SZ', value: '0' },
  keyboardDelay: { key: 'HKCU\\Control Panel\\Keyboard', name: 'KeyboardDelay', type: 'REG_SZ', value: '0' },
  keyboardSpeed: { key: 'HKCU\\Control Panel\\Keyboard', name: 'KeyboardSpeed', type: 'REG_SZ', value: '31' },
  startupDelay: { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Serialize', name: 'StartupDelayInMSec', value: 0 },
  windowAnimation: { key: 'HKCU\\Control Panel\\Desktop\\WindowMetrics', name: 'MinAnimate', type: 'REG_SZ', value: '0' },
  lastAccess: { key: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem', name: 'NtfsDisableLastAccessUpdate', value: 0x80000003 },
  shortNames: { key: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem', name: 'NtfsDisable8dot3NameCreation', value: 1 },
  nvmeMemory: { key: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\stornvme\\Parameters\\Device', name: 'ContiguousMemoryFromAnyNode', value: 1 },
  nvmeLog: { key: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\stornvme\\Parameters\\Device', name: 'LogSize', value: 0 },
  nvmeIdle: { key: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\stornvme\\Parameters\\Device', name: 'IdlePowerMode', value: 0 }
});

async function run(file, args, timeout = 6000) {
  const { stdout } = await execFileAsync(file, args, { windowsHide: true, timeout, maxBuffer: 128 * 1024 });
  return String(stdout || '').trim();
}

function powerGuid(output) {
  return String(output).match(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/i)?.[0]?.toLowerCase() || '';
}

async function activePowerGuid() {
  const guid = powerGuid(await run('powercfg.exe', ['/getactivescheme']));
  if (!guid) throw new Error('未能读取当前 Windows 电源计划');
  return guid;
}

async function gpuNames() {
  try {
    const output = await run('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
      "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; @(Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name) | ConvertTo-Json -Compress"
    ], 9000);
    const parsed = JSON.parse(output);
    return (Array.isArray(parsed) ? parsed : [parsed]).filter(Boolean).map(String);
  } catch {}
  try {
    const output = await run('nvidia-smi.exe', ['--query-gpu=name', '--format=csv,noheader']);
    return output.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  } catch {}
  try {
    const output = await run('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
      "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; @(Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Video\\*\\0000' -ErrorAction SilentlyContinue | ForEach-Object { $_.'HardwareInformation.AdapterString' } | Where-Object { $_ }) | ConvertTo-Json -Compress"
    ]);
    const parsed = JSON.parse(output);
    return [...new Set((Array.isArray(parsed) ? parsed : [parsed]).filter(Boolean).map(String))];
  } catch { return []; }
}

async function getOptimizationInfo() {
  if (process.platform !== 'win32') throw new Error('游戏与电脑优化当前支持 Windows');
  const [power, gpus, tweakEntries, elevated, gamePath] = await Promise.all([activePowerGuid(), gpuNames(), Promise.all(Object.keys(TWEAKS).map(async id => [id, await readTweak(id)])), isElevated(), deltaGamePath()]);
  return {
    cpu: os.cpus()[0]?.model?.trim() || '未识别',
    cpuCores: os.cpus().length,
    memoryGb: Math.round(os.totalmem() / 1024 ** 3),
    gpus,
    powerGuid: power,
    highPerformance: power === HIGH_PERFORMANCE_GUID,
    elevated,
    gamePath,
    tweaks: Object.fromEntries(tweakEntries)
  };
}

async function deltaGamePath() {
  for (const root of ['HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\三角洲行动', 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\三角洲行动']) {
    try {
      const output = await run('reg.exe', ['query', root, '/v', 'UninstallString']);
      const uninstall = output.match(/^\s*UninstallString\s+REG_SZ\s+(.+?)\s*$/im)?.[1]?.replace(/^"|"$/g, '');
      if (!uninstall) continue;
      const game = path.join(path.dirname(uninstall), 'DeltaForce', 'Binaries', 'Win64', 'DeltaForceClient-Win64-Shipping.exe');
      if (fs.existsSync(game)) return game;
    } catch {}
  }
  return '';
}

async function isElevated() {
  try {
    const output = await run('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
      '([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)']);
    return output.toLowerCase() === 'true';
  } catch { return false; }
}

async function readRegistryString(key, name) {
  try {
    const output = await run('reg.exe', ['query', key, '/v', name]);
    const match = output.match(new RegExp(`^\\s*${name}\\s+REG_SZ\\s+(.+?)\\s*$`, 'im'));
    if (!match) throw new Error(`无法读取 ${name}`);
    return { exists: true, value: match[1] };
  } catch (error) {
    if (error.code === 1) return { exists: false, value: '' };
    throw error;
  }
}

async function gpuSpoofSnapshot() {
  if (process.platform !== 'win32') throw new Error('显卡名称改写仅支持 Windows');
  const raw = await run('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
    "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; @(Get-CimInstance Win32_VideoController | Where-Object { $_.PNPDeviceID -like 'PCI\\VEN_10DE*' } | Select-Object Name,PNPDeviceID) | ConvertTo-Json -Compress"], 12000);
  const parsed = JSON.parse(raw);
  const gpu = (Array.isArray(parsed) ? parsed : [parsed])[0];
  const id = String(gpu?.PNPDeviceID || '');
  if (!/^PCI\\VEN_10DE&[A-Z0-9_&.-]+\\[A-Z0-9_&.-]+$/i.test(id)) throw new Error('没有识别到可修改的 NVIDIA 显卡设备');
  const enumKey = `HKLM\\SYSTEM\\CurrentControlSet\\Enum\\${id}`;
  const driver = await readRegistryString(enumKey, 'Driver');
  if (!driver.exists || !/^\{4d36e968-e325-11ce-bfc1-08002be10318\}\\\d{4}$/i.test(driver.value)) throw new Error('未找到该显卡的显示驱动注册表位置');
  const classKey = `HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\${driver.value}`;
  return {
    pnpId: id,
    name: String(gpu.Name || ''),
    enumKey,
    classKey,
    friendlyName: await readRegistryString(enumKey, 'FriendlyName'),
    driverDesc: await readRegistryString(classKey, 'DriverDesc')
  };
}

function validGpuBackup(backup) {
  return backup && /^PCI\\VEN_10DE&[A-Z0-9_&.-]+\\[A-Z0-9_&.-]+$/i.test(backup.pnpId) &&
    backup.enumKey === `HKLM\\SYSTEM\\CurrentControlSet\\Enum\\${backup.pnpId}` &&
    /^HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\\{4d36e968-e325-11ce-bfc1-08002be10318\}\\\d{4}$/i.test(backup.classKey) &&
    typeof backup.friendlyName?.exists === 'boolean' && typeof backup.driverDesc?.exists === 'boolean';
}

async function applyGpuSpoof(backup) {
  if (!await isElevated()) throw new Error('请先以管理员身份启动轻场');
  if (!validGpuBackup(backup)) throw new Error('显卡原始信息备份无效');
  const current = await gpuSpoofSnapshot();
  if (current.pnpId !== backup.pnpId || current.classKey !== backup.classKey ||
      JSON.stringify(current.friendlyName) !== JSON.stringify(backup.friendlyName) ||
      JSON.stringify(current.driverDesc) !== JSON.stringify(backup.driverDesc)) throw new Error('显卡信息已变化，请重新检测并备份');
  await run('reg.exe', ['add', backup.enumKey, '/v', 'FriendlyName', '/t', 'REG_SZ', '/d', GPU_NAME_TARGET, '/f']);
  await run('reg.exe', ['add', backup.classKey, '/v', 'DriverDesc', '/t', 'REG_SZ', '/d', GPU_NAME_TARGET, '/f']);
  const after = await gpuSpoofSnapshot();
  if (after.friendlyName.value !== GPU_NAME_TARGET || after.driverDesc.value !== GPU_NAME_TARGET) throw new Error('显卡名称写入后校验失败；原值已保存，可执行恢复');
  return { applied: true, rebootRequired: true, target: GPU_NAME_TARGET };
}

async function restoreGpuSpoof(backup) {
  if (!await isElevated()) throw new Error('请先以管理员身份启动轻场');
  if (!validGpuBackup(backup)) throw new Error('显卡原始信息备份无效');
  const current = await gpuSpoofSnapshot();
  if (current.pnpId !== backup.pnpId || current.classKey !== backup.classKey) throw new Error('显卡设备或驱动位置已经变化，未覆盖当前设置');
  for (const [key, name, original, now] of [
    [backup.enumKey, 'FriendlyName', backup.friendlyName, current.friendlyName],
    [backup.classKey, 'DriverDesc', backup.driverDesc, current.driverDesc]
  ]) {
    if (now.exists && now.value !== GPU_NAME_TARGET && JSON.stringify(now) !== JSON.stringify(original)) throw new Error(`${name} 已由其他程序修改，未覆盖`);
    if (original.exists) await run('reg.exe', ['add', key, '/v', name, '/t', 'REG_SZ', '/d', original.value, '/f']);
    else if (now.exists) await run('reg.exe', ['delete', key, '/v', name, '/f']);
  }
  const after = await gpuSpoofSnapshot();
  if (JSON.stringify(after.friendlyName) !== JSON.stringify(backup.friendlyName) || JSON.stringify(after.driverDesc) !== JSON.stringify(backup.driverDesc)) throw new Error('显卡名称恢复后校验失败');
  return { restored: true, rebootRequired: true };
}

async function readTweak(id) {
  const item = TWEAKS[id];
  if (!item) throw new Error('未知的系统设置');
  try {
    const output = await run('reg.exe', ['query', item.key, '/v', item.name]);
    const match = output.match(new RegExp(`^\\s*${item.name}\\s+(REG_DWORD|REG_SZ)\\s+(.+?)\\s*$`, 'im'));
    if (!match) throw new Error(`无法解析 ${item.name} 的当前值`);
    return { exists: true, type: match[1].toUpperCase(), value: match[1].toUpperCase() === 'REG_DWORD' ? Number(match[2]) : match[2] };
  } catch (error) {
    if (error.code === 1) return { exists: false, type: null, value: null };
    throw error;
  }
}

async function setTweak(id, value) {
  const item = TWEAKS[id];
  if (!item || value !== item.value) throw new Error('系统设置参数无效');
  const before = await readTweak(id);
  if (before.exists && before.value === value && before.type === (item.type || 'REG_DWORD')) return { changed: false, before };
  await run('reg.exe', ['add', item.key, '/v', item.name, '/t', item.type || 'REG_DWORD', '/d', String(value), '/f']);
  const after = await readTweak(id);
  if (!after.exists || after.value !== value || after.type !== (item.type || 'REG_DWORD')) throw new Error(`${item.name} 应用后校验失败`);
  return { changed: true, before };
}
async function syncInputGroup(group) {
  if(!['mouse','keyboard'].includes(group))throw new Error('未知的输入设备设置');
  try { return await optimizationTools.runNative('input', {group}); }
  catch(error) {return {liveApplied:false,detail:`注册表已保存，即时生效失败：${error.message}`};}
}

async function restoreTweak(id, before) {
  const item = TWEAKS[id];
  if (!item || !before || typeof before.exists !== 'boolean') throw new Error('恢复数据无效');
  const current = await readTweak(id);
  if (!current.exists || current.value !== item.value || current.type !== (item.type || 'REG_DWORD')) throw new Error('此项已由其他程序修改，未覆盖它的设置');
  if (before.exists) {
    if (!['REG_DWORD', 'REG_SZ'].includes(before.type || 'REG_DWORD') || !['string', 'number'].includes(typeof before.value)) throw new Error('原设置值无效');
    await run('reg.exe', ['add', item.key, '/v', item.name, '/t', before.type || 'REG_DWORD', '/d', String(before.value), '/f']);
  } else if (current.exists) {
    await run('reg.exe', ['delete', item.key, '/v', item.name, '/f']);
  }
  const after = await readTweak(id);
  if (after.exists !== before.exists || (before.exists && (after.value !== before.value || after.type !== (before.type || 'REG_DWORD')))) throw new Error('恢复后校验失败');
  return { ok: true };
}

function createPerformanceSampler() {
let previousCpu = null;
return async function performanceSample() {
  const cpus = os.cpus();
  const total = cpus.reduce((sum, cpu) => sum + Object.values(cpu.times).reduce((a, b) => a + b, 0), 0);
  const idle = cpus.reduce((sum, cpu) => sum + cpu.times.idle, 0);
  const cpuPercent = previousCpu && total > previousCpu.total
    ? Math.round(100 * (1 - (idle - previousCpu.idle) / (total - previousCpu.total))) : null;
  previousCpu = { total, idle };
  let gpu = null,gpus=[];
  try {
    const raw = await run('nvidia-smi.exe', ['--query-gpu=uuid,name,utilization.gpu,memory.used,memory.total,temperature.gpu,clocks.gr', '--format=csv,noheader,nounits'], 5000);
    gpus=raw.split(/\r?\n/).map(line=>{const parts=line.split(',').map(x=>x.trim());if(parts.length!==7)return null;const nums=parts.slice(2).map(x=>x&&Number.isFinite(Number(x))?Number(x):null);return {id:'nvidia:'+parts[0],name:parts[1],vendor:'NVIDIA',source:'NVIDIA SMI',state:'ready',utilization:nums[0],memoryUsedMb:nums[1],memoryTotalMb:nums[2],temperatureC:nums[3],temperatureSource:'GPU Core',utilizationSource:'GPU Core',clockMhz:nums[4]};}).filter(Boolean);gpu=gpus[0]||null;
  } catch {}
  return { at: Date.now(), cpuPercent, memoryUsedPercent: Math.round(100 * (1 - os.freemem() / os.totalmem())), gpu,gpus };
}

}
const performanceSample=createPerformanceSampler();

async function applyPerformancePower() {
  const before = await activePowerGuid();
  if (before === HIGH_PERFORMANCE_GUID) return { changed: false, previousGuid: before };
  await run('powercfg.exe', ['/setactive', HIGH_PERFORMANCE_GUID]);
  if (await activePowerGuid() !== HIGH_PERFORMANCE_GUID) throw new Error('Windows 未切换到高性能电源计划');
  return { changed: true, previousGuid: before };
}

async function restorePowerPlan(guid) {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(String(guid))) throw new Error('原电源计划无效');
  if (await activePowerGuid() !== HIGH_PERFORMANCE_GUID) throw new Error('当前电源计划已由其他程序更改，未覆盖你的设置');
  await run('powercfg.exe', ['/setactive', guid]);
  if (await activePowerGuid() !== guid.toLowerCase()) throw new Error('Windows 未恢复原电源计划');
  return { ok: true };
}

module.exports = { deltaGamePath, getOptimizationInfo, applyPerformancePower, restorePowerPlan, readTweak, setTweak, restoreTweak, syncInputGroup, performanceSample, createPerformanceSampler, powerGuid, HIGH_PERFORMANCE_GUID, GPU_NAME_TARGET, gpuSpoofSnapshot, applyGpuSpoof, restoreGpuSpoof };
