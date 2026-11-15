using System;
using System.Linq;
using System.Threading;
using System.Security.Principal;
using System.Web.Script.Serialization;
using System.Collections.Generic;
using System.Management;
using LibreHardwareMonitor.Hardware;
class HardwareSensor {
 static volatile bool running=true;
 static readonly JavaScriptSerializer json=new JavaScriptSerializer();
 // All sensor operations are read-only. No fan control, clock or driver writes.
 static readonly string[] gpuTypes={"GpuNvidia","GpuAmd","GpuIntel"};
 static string Vendor(string value){var s=(value??"").ToUpperInvariant();return s.Contains("VEN_10DE")||s.Contains("NVIDIA")?"NVIDIA":s.Contains("VEN_1002")||s.Contains("AMD")||s.Contains("RADEON")?"AMD":s.Contains("VEN_8086")||s.Contains("INTEL")?"Intel":"Unknown";}
 static double? Reading(IEnumerable<ISensor> sensors,SensorType type,string name,double min,double max){var s=sensors.FirstOrDefault(x=>x.SensorType==type&&x.Name.Equals(name,StringComparison.OrdinalIgnoreCase)&&x.Value.HasValue&&x.Value.Value>=min&&x.Value.Value<=max);return s==null?(double?)null:Math.Round(s.Value.Value,2);}
 static List<Dictionary<string,object>> Inventory(){var list=new List<Dictionary<string,object>>();try{using(var search=new ManagementObjectSearcher("SELECT Name,PNPDeviceID FROM Win32_VideoController")){foreach(ManagementObject item in search.Get()){var name=Convert.ToString(item["Name"]);var device=Convert.ToString(item["PNPDeviceID"]);var vendor=Vendor(device+" "+name);if(vendor=="Unknown"||!device.StartsWith("PCI\\",StringComparison.OrdinalIgnoreCase))continue;list.Add(new Dictionary<string,object>{{"id","windows:"+device},{"deviceId",device},{"name",name},{"vendor",vendor},{"source","Windows 设备识别"},{"state","unsupported"}});}}}catch{}return list;}
 static string DeviceId(IHardware hardware){try{var p=hardware.GetType().GetProperty("DeviceId");return p==null?"":Convert.ToString(p.GetValue(hardware,null));}catch{return "";}}
 static string StableId(IHardware hardware){var device=DeviceId(hardware);return device.StartsWith("PCI\\",StringComparison.OrdinalIgnoreCase)?"pci:"+device.ToUpperInvariant():hardware.Identifier.ToString();}
 static string Pnp(string s){return System.Text.RegularExpressions.Regex.Replace(s??"","[^a-zA-Z0-9]","").ToLowerInvariant();}
 static List<Dictionary<string,object>> Gpus(Computer computer,List<Dictionary<string,object>> inventory){var list=new List<Dictionary<string,object>>();foreach(var h in computer.Hardware.Where(x=>gpuTypes.Contains(x.HardwareType.ToString()))){try{h.Update();var sensors=h.Sensors;var temp=Reading(sensors,SensorType.Temperature,"GPU Core",1,149);var load=Reading(sensors,SensorType.Load,"GPU Core",0,100);var loadSource="GPU Core";
   if(!load.HasValue){var engines=sensors.Where(x=>x.SensorType==SensorType.Load&&x.Value.HasValue&&x.Value>=0&&x.Value<=100&&!x.Name.Contains("Memory"));if(engines.Any()){load=Math.Round(engines.Max(x=>(double)x.Value.Value),2);loadSource="最忙 GPU 引擎";}}
   var used=Reading(sensors,SensorType.SmallData,"GPU Memory Used",0,1048576)??Reading(sensors,SensorType.SmallData,"D3D Dedicated Memory Used",0,1048576);var total=Reading(sensors,SensorType.SmallData,"GPU Memory Total",1,1048576)??Reading(sensors,SensorType.SmallData,"D3D Dedicated Memory Total",1,1048576);
   list.Add(new Dictionary<string,object>{{"id",StableId(h)},{"deviceId",DeviceId(h)},{"name",h.Name},{"vendor",h.HardwareType==HardwareType.GpuAmd?"AMD":h.HardwareType==HardwareType.GpuIntel?"Intel":"NVIDIA"},{"source","LibreHardwareMonitor"},{"state",temp.HasValue||load.HasValue?"ready":"unsupported"},{"temperatureC",temp},{"temperatureSource",temp.HasValue?"GPU Core":null},{"utilization",load},{"utilizationSource",load.HasValue?loadSource:null},{"clockMhz",Reading(sensors,SensorType.Clock,"GPU Core",1,20000)},{"memoryUsedMb",used},{"memoryTotalMb",total},{"sharedMemoryUsedMb",Reading(sensors,SensorType.SmallData,"D3D Shared Memory Used",0,1048576)},{"sharedMemoryTotalMb",Reading(sensors,SensorType.SmallData,"D3D Shared Memory Total",1,1048576)}});
  }catch{list.Add(new Dictionary<string,object>{{"id",StableId(h)},{"name",h.Name},{"vendor",Vendor(h.HardwareType.ToString())},{"source","LibreHardwareMonitor"},{"state","error"}});}}
  foreach(var item in inventory){var device=Pnp((string)item["deviceId"]);var same=list.Any(x=>{var actual=Pnp(x.ContainsKey("deviceId")?Convert.ToString(x["deviceId"]):"");return actual.Length>12&&(actual.Contains(device)||device.Contains(actual));});if(!same){var name=(string)item["name"];same=list.Count(x=>Convert.ToString(x["name"]).Equals(name,StringComparison.OrdinalIgnoreCase))==1&&inventory.Count(x=>Convert.ToString(x["name"]).Equals(name,StringComparison.OrdinalIgnoreCase))==1;}if(!same)list.Add(item);}
  return list;
 }
 static void Main(string[] args){
  bool once=args.Contains("--once");
  bool admin=new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator);
  bool installed=LibreHardwareMonitor.PawnIo.PawnIo.IsInstalled;
  var inventory=Inventory();Computer computer=new Computer{IsCpuEnabled=installed&&admin,IsGpuEnabled=true};string openError=null;
  if(!once)ThreadPool.QueueUserWorkItem(_=>{try{while(Console.ReadLine()!=null){} }catch{}finally{running=false;}});
  try {
   try{computer.Open();}catch(Exception e){openError=e.GetType().Name;}
   // Delta-based GPU load needs two updates, including a one-shot probe.
   if(once){foreach(var h in computer.Hardware){try{h.Update();}catch{}}Thread.Sleep(150);}
   do {
    var temps=new List<ISensor>();var clocks=new List<ISensor>();bool cpuError=false;
    foreach(var h in computer.Hardware.Where(x=>x.HardwareType==HardwareType.Cpu)){try{h.Update();foreach(var s in h.Sensors){if(!s.Value.HasValue)continue;if(s.SensorType==SensorType.Temperature&&s.Name.IndexOf("Distance",StringComparison.OrdinalIgnoreCase)<0&&s.Value>0&&s.Value<150)temps.Add(s);if(s.SensorType==SensorType.Clock&&s.Name.IndexOf("Core",StringComparison.OrdinalIgnoreCase)>=0&&s.Value>0&&s.Value<12000)clocks.Add(s);}}catch{cpuError=true;}}
    var preferred=temps.FirstOrDefault(s=>s.Name=="CPU Package")??temps.FirstOrDefault(s=>s.Name.IndexOf("Tctl",StringComparison.OrdinalIgnoreCase)>=0)??temps.OrderByDescending(s=>s.Value).FirstOrDefault();
    double? temp=preferred==null?(double?)null:Math.Round(preferred.Value.Value,1);
    double? clock=clocks.Count==0?(double?)null:Math.Round(clocks.Average(s=>(double)s.Value.Value));
    string state=!installed?"driver-missing":!admin?"permission":temp.HasValue||clock.HasValue?"ready":cpuError||openError!=null?"error":"unsupported";
    Console.WriteLine(json.Serialize(new{state,driverInstalled=installed,admin,cpuTempC=temp,cpuClockMhz=clock,tempSource=preferred==null?null:preferred.Name,clockSource="各核心实时频率平均值",cpuName=String.Join(" / ",computer.Hardware.Where(h=>h.HardwareType==HardwareType.Cpu).Select(h=>h.Name)),gpus=Gpus(computer,inventory),gpuError=openError}));Console.Out.Flush();
    if(once)break;Thread.Sleep(2000);
   }while(running);
  }catch(Exception e){Console.WriteLine(json.Serialize(new{state="error",driverInstalled=installed,admin,cpuTempC=(double?)null,cpuClockMhz=(double?)null,gpus=inventory,message=e.GetType().Name}));}
  finally{try{computer.Close();}catch{}}
 }
}
