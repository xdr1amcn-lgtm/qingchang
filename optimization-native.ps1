param([ValidateSet('input','processes','trim','game-running','resource-snapshot','resource-apply','resource-restore','resource-watch','game-processes')][string]$Action)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class QingchangWin {
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
 [DllImport("user32.dll", EntryPoint="SystemParametersInfoW", SetLastError=true)] public static extern bool Mouse(uint action,uint param,int[] values,uint flags);
 [DllImport("user32.dll", EntryPoint="SystemParametersInfoW", SetLastError=true)] public static extern bool Keyboard(uint action,uint param,IntPtr value,uint flags);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
 [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode,SetLastError=true)] public static extern bool QueryFullProcessImageName(IntPtr h,uint flags,StringBuilder path,ref uint size);
 [DllImport("psapi.dll",SetLastError=true)] public static extern bool EmptyWorkingSet(IntPtr handle);
 [StructLayout(LayoutKind.Sequential)] public struct PowerState { public uint Version, ControlMask, StateMask; }
 [DllImport("kernel32.dll",SetLastError=true)] public static extern uint GetPriorityClass(IntPtr h);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool SetPriorityClass(IntPtr h,uint value);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool GetProcessInformation(IntPtr h,int type,ref PowerState state,uint size);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool SetProcessInformation(IntPtr h,int type,ref PowerState state,uint size);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool GetProcessTimes(IntPtr h,out long created,out long exited,out long kernel,out long user);
}
'@
function ProtectedName([string]$name) {
 return $name -match '^(System|Idle|Registry|Memory Compression|smss|csrss|wininit|winlogon|services|lsass|svchost|dwm|explorer|audiodg|conhost|powershell|pwsh|electron|obs.*|livehime.*|douyin.*|直播伴侣.*|轻场|qingchang|deltaforce.*|wegame.*|qq.*|discord.*|voicemeeter.*|1U|PresentMon|QingchangSensors|PawnIO_setup)$'
}
if ($Action -like 'resource-*') {
 [uint32]$foreground=0
 [QingchangWin]::GetWindowThreadProcessId([QingchangWin]::GetForegroundWindow(),[ref]$foreground) | Out-Null
 $foregroundProcess=Get-Process -Id $foreground -ErrorAction SilentlyContinue
 $session=(Get-Process -Id $PID).SessionId
 $rows=@()
 $items=if($Action -eq 'resource-snapshot') {@(Get-Process -ErrorAction SilentlyContinue | Where-Object { $payload.names -contains ($_.ProcessName+'.exe').ToLowerInvariant() })} else {@($payload.records)}
 foreach($item in $items) {
  $h=[IntPtr]::Zero
  $row=@{pid=[int]$item.pid;ok=$false;done=$false;error=''}
  try {
   $processId=if($Action -eq 'resource-snapshot'){$item.Id}else{[int]$item.pid}
   $p=Get-Process -Id $processId -ErrorAction SilentlyContinue
   if(-not $p){$row.ok=$true;$row.done=$true;$rows+=$row;continue}
   $name=$p.ProcessName+'.exe';$row.name=$name;$row.pid=$processId
   if($p.SessionId -ne $session -or (ProtectedName $p.ProcessName) -or $processId -eq $payload.ownerPid){throw '此程序受保护，未修改'}
   if($Action -eq 'resource-watch' -and $p.ProcessName -ne $foregroundProcess.ProcessName){$row.ok=$true;$rows+=$row;continue}
   if($Action -in @('resource-snapshot','resource-apply') -and $p.ProcessName -eq $foregroundProcess.ProcessName){throw '此程序正在前台，未修改'}
   $h=[QingchangWin]::OpenProcess(0x600,$false,$processId)
   if($h -eq [IntPtr]::Zero){throw '无权限读取或修改此进程'}
   $buf=New-Object System.Text.StringBuilder 2048;[uint32]$len=2048
   [long]$created=0;[long]$exited=0;[long]$kernel=0;[long]$user=0
   if(-not [QingchangWin]::QueryFullProcessImageName($h,0,$buf,[ref]$len) -or -not [QingchangWin]::GetProcessTimes($h,[ref]$created,[ref]$exited,[ref]$kernel,[ref]$user)){throw '无法确认进程身份'}
   if([IO.Path]::GetFileName($buf.ToString()) -ne $name){throw '进程名称已改变'}
   if($Action -ne 'resource-snapshot' -and ($item.created -ne $created.ToString() -or $item.path -ne $buf.ToString())){$row.ok=$true;$row.done=$true;$row.error='原进程已退出，未修改新进程';$rows+=$row;continue}
   $priority=[QingchangWin]::GetPriorityClass($h)
   if(-not $priority){throw '无法读取调度优先级'}
   $power=New-Object QingchangWin+PowerState;$power.Version=1
   $supported=[QingchangWin]::GetProcessInformation($h,4,[ref]$power,12)
   if($Action -eq 'resource-snapshot') {
    $rows+=@{pid=$processId;name=$name;path=$buf.ToString();created=$created.ToString();priority=$priority;powerSupported=$supported;control=$power.ControlMask;state=$power.StateMask;ok=$true}
    continue
   }
   if($Action -eq 'resource-apply') {
    if($priority -ne $item.priority -or ($item.powerSupported -and (-not $supported -or $power.ControlMask -ne $item.control -or $power.StateMask -ne $item.state))){throw '程序设置已改变，请重新选择并启动'}
    # Keep already low/idle priorities; never raise a background process.
    $targetPriority=if($item.priority -in @(64,16384)){[uint32]$item.priority}else{[uint32]16384}
    if(-not [QingchangWin]::SetPriorityClass($h,$targetPriority)){throw 'Windows 未应用优先级'}
    if($item.powerSupported) {
     $power.ControlMask=$power.ControlMask -bor 1;$power.StateMask=$power.StateMask -bor 1
     if(-not [QingchangWin]::SetProcessInformation($h,4,[ref]$power,12)){[QingchangWin]::SetPriorityClass($h,[uint32]$item.priority)|Out-Null;throw '效率模式未应用，已尝试回退优先级'}
    }
    $row.ok=$true;$row.eco=[bool]$item.powerSupported
   } else {
    $targetPriority=if($item.priority -in @(64,16384)){[uint32]$item.priority}else{[uint32]16384}
    if($priority -eq $targetPriority){if(-not [QingchangWin]::SetPriorityClass($h,[uint32]$item.priority)){throw '优先级恢复失败'}}
    if($item.powerSupported) {
     if(-not $supported){throw '无法读取效率模式，请稍后重试恢复'}
     if(($power.ControlMask -band 1) -eq 1 -and ($power.StateMask -band 1) -eq 1) {
      $power.ControlMask=($power.ControlMask -band [uint32]4294967294) -bor ([uint32]$item.control -band 1)
      $power.StateMask=($power.StateMask -band [uint32]4294967294) -bor ([uint32]$item.state -band 1)
      if(-not [QingchangWin]::SetProcessInformation($h,4,[ref]$power,12)){throw '效率模式恢复失败'}
     }
    }
    $row.ok=$true;$row.done=$true
   }
  } catch {$row.error=$_.Exception.Message}
  finally {if($h -ne [IntPtr]::Zero){[QingchangWin]::CloseHandle($h)|Out-Null}}
  $rows+=$row
 }
 ConvertTo-Json -InputObject $rows -Depth 4 -Compress
 exit
}
switch ($Action) {
 'game-processes' {
  $items=@(Get-Process -ErrorAction SilentlyContinue | Where-Object {($_.MainWindowHandle -ne 0 -or $_.ProcessName -like 'DeltaForce*') -and $_.ProcessName -notmatch '^(轻场|electron|PresentMon|powershell|pwsh|System|Idle|dwm)$'} | ForEach-Object { $started=$null;try{$started=$_.StartTime.ToUniversalTime().Ticks.ToString()}catch{};@{pid=$_.Id;name=$_.ProcessName+'.exe';started=$started} })
  ConvertTo-Json -InputObject $items -Compress
 }
 'input' {
  $ok=$true
  if ($payload.group -eq 'mouse') {
   $r=Get-ItemProperty -LiteralPath 'HKCU:\Control Panel\Mouse'
   if ($null -eq $r.MouseThreshold1 -or $null -eq $r.MouseThreshold2 -or $null -eq $r.MouseSpeed) { $ok=$false }
   else { $ok=[QingchangWin]::Mouse(4,0,[int[]]@([int]$r.MouseThreshold1,[int]$r.MouseThreshold2,[int]$r.MouseSpeed),2) }
  } elseif ($payload.group -eq 'keyboard') {
   $r=Get-ItemProperty -LiteralPath 'HKCU:\Control Panel\Keyboard'
   if ($null -eq $r.KeyboardDelay -or $null -eq $r.KeyboardSpeed) { $ok=$false }
   else { $a=[QingchangWin]::Keyboard(23,[uint32]$r.KeyboardDelay,[IntPtr]::Zero,2); $b=[QingchangWin]::Keyboard(11,[uint32]$r.KeyboardSpeed,[IntPtr]::Zero,2); $ok=$a -and $b }
  } else { throw '未知的输入设备设置' }
  @{liveApplied=[bool]$ok;detail=$(if($ok){'已通知 Windows 即时应用'}else{'注册表已保存，Windows 即时应用未完成；请重新登录后检查'})} | ConvertTo-Json -Compress
 }
 'game-running' { @{running=[bool](@(Get-Process -ErrorAction SilentlyContinue | Where-Object {$_.ProcessName -like 'DeltaForce*'}).Count)} | ConvertTo-Json -Compress }
 default {
  [uint32]$foreground=0
  [QingchangWin]::GetWindowThreadProcessId([QingchangWin]::GetForegroundWindow(),[ref]$foreground) | Out-Null
  $session=(Get-Process -Id $PID).SessionId
  $names=@($payload.names | ForEach-Object { ([string]$_).ToLowerInvariant().Replace('.exe','') })
  $rows=@()
  foreach($p in @(Get-Process -ErrorAction SilentlyContinue)) {
   $selected=$false
   try {
    $selected=$names -contains $p.ProcessName.ToLowerInvariant()
    if($Action -eq 'trim' -and -not $selected) {continue}
    if ($p.SessionId -ne $session -or $p.Id -eq $foreground -or (ProtectedName $p.ProcessName) -or $p.Id -eq $payload.ownerPid) { continue }
    $before=[long]$p.WorkingSet64
    if ($Action -eq 'processes') { if($before -ge 16MB) { $rows+=@{name=$p.ProcessName+'.exe';pid=$p.Id;memoryMb=[math]::Round($before/1MB,1)} }; continue }
    if ($names -notcontains $p.ProcessName.ToLowerInvariant()) {continue}
    $h=[QingchangWin]::OpenProcess(0x500,$false,$p.Id)
    if($h -eq [IntPtr]::Zero) { $rows+=@{name=$p.ProcessName+'.exe';pid=$p.Id;ok=$false;releasedMb=0;error='无权限访问此进程'};continue }
    try {
     $buf=New-Object System.Text.StringBuilder 2048;[uint32]$len=2048
     if(-not [QingchangWin]::QueryFullProcessImageName($h,0,$buf,[ref]$len)) { throw '无法确认进程身份' }
     $actual=[IO.Path]::GetFileNameWithoutExtension($buf.ToString())
     if($actual -ne $p.ProcessName -or (ProtectedName $actual)) {throw '进程身份已改变'}
     $ok=[QingchangWin]::EmptyWorkingSet($h)
     $p.Refresh();$after=[long]$p.WorkingSet64
     $rows+=@{name=$actual+'.exe';pid=$p.Id;ok=[bool]$ok;releasedMb=[math]::Round([math]::Max(0,$before-$after)/1MB,1);error=$(if($ok){''}else{'Windows 未完成清理'})}
    } finally { [QingchangWin]::CloseHandle($h) | Out-Null }
   } catch { if($Action -eq 'trim' -and $selected) { $rows+=@{name=$p.ProcessName+'.exe';pid=$p.Id;ok=$false;releasedMb=0;error=$_.Exception.Message} } }
  }
  ConvertTo-Json -InputObject $rows -Depth 4 -Compress
 }
}
