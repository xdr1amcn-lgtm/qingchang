param([ValidateSet('inspect','signature','install')][string]$Action)
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.Encoding]::UTF8
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$taskInput = [Console]::In.ReadToEnd() | ConvertFrom-Json
if ($Action -eq 'inspect') {
  $taskProcesses = @(Get-Process -ErrorAction SilentlyContinue | Select-Object ProcessName,Id,Path)
  $taskSteam = @()
  foreach ($taskKey in @('HKCU:\Software\Valve\Steam','HKLM:\SOFTWARE\WOW6432Node\Valve\Steam')) {
    $taskItem = Get-ItemProperty -LiteralPath $taskKey -ErrorAction SilentlyContinue
    if ($taskItem.SteamPath) { $taskSteam += $taskItem.SteamPath }
    if ($taskItem.InstallPath) { $taskSteam += $taskItem.InstallPath }
  }
  $taskRuntime = @{}
  foreach ($taskArch in @('x64','x86')) {
    $taskEntry = Get-ItemProperty -LiteralPath "HKLM:\SOFTWARE\WOW6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\$taskArch" -ErrorAction SilentlyContinue
    if (-not $taskEntry) { $taskEntry = Get-ItemProperty -LiteralPath "HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\$taskArch" -ErrorAction SilentlyContinue }
    $taskRuntime[$taskArch] = @{installed=($taskEntry.Installed -eq 1);version=[string]$taskEntry.Version}
  }
  @{gameRunning=(@($taskProcesses | Where-Object ProcessName -Like 'DeltaForce*').Count -gt 0);steamRunning=(@($taskProcesses | Where-Object ProcessName -EQ 'steam').Count -gt 0);steamRoots=@($taskSteam | Select-Object -Unique);launchers=@($taskProcesses | Where-Object {$_.ProcessName -in @('wegame','steam')} | ForEach-Object {$_.Path} | Where-Object {$_});runtimes=$taskRuntime} | ConvertTo-Json -Depth 5 -Compress
  exit
}
$taskFile = [IO.Path]::GetFullPath([string]$taskInput.file)
if (-not (Test-Path -LiteralPath $taskFile -PathType Leaf) -or [IO.Path]::GetFileName($taskFile) -notmatch '^vc_redist\.(x64|x86)\.exe$') { throw '运行库安装包无效' }
$taskSignature = Get-AuthenticodeSignature -LiteralPath $taskFile
$taskValid = $taskSignature.Status -eq 'Valid' -and $taskSignature.SignerCertificate.Subject -match '(^|,\s*)O=Microsoft Corporation(,|$)'
if ($Action -eq 'signature') { @{valid=$taskValid;publisher=[string]$taskSignature.SignerCertificate.Subject} | ConvertTo-Json -Compress; exit }
if (-not $taskValid) { throw '安装包不是有效微软签名，已停止安装' }
if ($taskInput.mode -notin @('repair','install')) { throw '运行库操作无效' }
$taskArguments = @(('/'+[string]$taskInput.mode),'/passive','/norestart')
$taskProcess = Start-Process -FilePath $taskFile -ArgumentList $taskArguments -Verb RunAs -WindowStyle Hidden -PassThru -Wait
@{exitCode=$taskProcess.ExitCode;rebootRequired=($taskProcess.ExitCode -eq 3010)} | ConvertTo-Json -Compress
