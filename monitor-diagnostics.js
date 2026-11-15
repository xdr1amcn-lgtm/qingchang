(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.QingchangMonitorDiagnostics=value;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 function readings(data,now=Date.now()){
  const hardware=data?.hardware,fresh=hardware&&now-hardware.at>=0&&now-hardware.at<=6500,h=fresh?hardware:{},sensor=h.cpuSensors||{},game=data?.game||{};
  const number=(n,suffix)=>Number.isFinite(n)?n.toFixed(suffix==='°C'?1:0)+suffix:null;
  const cpuReason=sensor.state==='driver-missing'?'需要安装 CPU 传感器驱动':sensor.state==='permission'?'请以管理员身份重新打开轻场':sensor.state==='unsupported'?'当前硬件没有返回兼容读数':sensor.state==='error'?'读取失败，可重新检测':sensor.state==='stale'||hardware&&!fresh?'上次读数已过期':'点击检测传感器，或开始实时监测';
  const gameReason=game.state==='permission'?'采集需要管理员权限':game.captureMode==='basic'?game.advancedRequested===false?'勾选原生帧或生成帧后保存，启用高级采集':'高级数据不可用，基础 FPS 仍可使用':game.state==='ready'?'游戏或驱动未提供可识别的补帧数据':'请先启动游戏并开始监测';
  return [{key:'cpuTemp',label:'CPU 温度',value:number(h.cpuTempC,'°C')||'—',reason:Number.isFinite(h.cpuTempC)?sensor.tempSource||'CPU 传感器':cpuReason,ready:Number.isFinite(h.cpuTempC)},{key:'cpuClock',label:'CPU 实时频率',value:number(h.cpuClockMhz,' MHz')||'—',reason:Number.isFinite(h.cpuClockMhz)?'各核心传感器读数的平均值':Number.isFinite(h.cpuTempC)?'当前 CPU 未上报核心实时频率':cpuReason,ready:Number.isFinite(h.cpuClockMhz)},{key:'nativeFps',label:'原生帧 FPS',value:game.state==='ready'?number(game.nativeFps,'')||'—':'—',reason:game.state==='ready'&&Number.isFinite(game.nativeFps)?game.nativeSource==='simulation'?'游戏上报的模拟帧节奏':'已识别的原生帧类型':gameReason,ready:game.state==='ready'&&Number.isFinite(game.nativeFps)},{key:'generatedFps',label:'生成帧 FPS',value:game.state==='ready'?number(game.generatedFps,'')||'—':'—',reason:game.state==='ready'&&Number.isFinite(game.generatedFps)?'已识别的生成帧；未通过倍数推算':gameReason,ready:game.state==='ready'&&Number.isFinite(game.generatedFps)}];
 }
 return {readings};
});
