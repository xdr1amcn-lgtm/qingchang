(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.QingchangHardwareView=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 function readings(data,now=Date.now()){
  const raw=data?.hardware,fresh=Number.isFinite(raw?.at)&&now-raw.at>=0&&now-raw.at<=6500,h=fresh?raw:{},gpu=h.gpu||{},sensor=h.cpuSensors||{};
  const value=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max?n:null;
  const waiting=!data?.enabled?'开始监测后显示实时读数':raw&&!fresh?'读数已过期，等待重新采集':'正在等待硬件读数';
  const cpuReason=sensor.state==='driver-missing'?'需要安装 CPU 传感器驱动':sensor.state==='permission'?'需要管理员权限读取传感器':sensor.state==='unsupported'?'当前 CPU 没有返回兼容温度':sensor.state==='error'?'传感器读取失败，可重新检测':sensor.state==='stale'?'CPU 传感器读数已过期，等待重新采集':waiting;
  const vram=value(gpu.memoryUsedMb,0,1e6)!==null&&value(gpu.memoryTotalMb,1,1e6)!==null&&gpu.memoryUsedMb<=gpu.memoryTotalMb?gpu.memoryUsedMb/gpu.memoryTotalMb*100:null;
  return [{key:'cpuTemp',label:'CPU 温度',number:value(h.cpuTempC,1,149),unit:'°C',digits:1,reason:value(h.cpuTempC,1,149)!==null?sensor.tempSource||'CPU 传感器':cpuReason},
   {key:'cpu',label:'CPU 占用',number:value(h.cpuPercent,0,100),unit:'%',digits:0,reason:value(h.cpuPercent,0,100)!==null?'整机 CPU 使用率':fresh?'首次采样，等待下一次计算占用':waiting},
   {key:'gpuTemp',label:'GPU 温度',number:value(gpu.temperatureC,1,149),unit:'°C',digits:0,reason:value(gpu.temperatureC,1,149)!==null?'显卡传感器':fresh?h.gpuSelectionMissing?'所选显卡未检测到，请重新选择':'此显卡未上报核心温度，检查驱动与支持':waiting},
   {key:'gpu',label:'GPU 占用',number:value(gpu.utilization,0,100),unit:'%',digits:0,reason:value(gpu.utilization,0,100)!==null?gpu.utilizationSource==='最忙 GPU 引擎'?'最忙 GPU 引擎使用率':'显卡使用率':fresh?'未取得显卡占用，检查驱动与采集支持':waiting},
   {key:'memory',label:'内存占用',number:value(h.memoryUsedPercent,0,100),unit:'%',digits:0,reason:value(h.memoryUsedPercent,0,100)!==null?'整机物理内存使用率':waiting},
   {key:'vram',label:'显存占用',number:vram,unit:'%',digits:0,reason:vram!==null?`${Math.round(gpu.memoryUsedMb)} / ${Math.round(gpu.memoryTotalMb)} MB`:fresh?'当前采集未取得显存数据':waiting}].map(item=>({...item,ready:item.number!==null,value:item.number===null?'—':item.number.toFixed(item.digits)}));
 }
 return {readings};
});
