/* 陪玩租号资料与订单占用的纯逻辑；可在浏览器和 Node 测试中共用。 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.QingchangRentalModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const PLATFORMS=['微信区','QQ区','Steam','其他'];
 const ACTIVE_STATUSES=['进行中','已暂停'];
 const FIELD_LABELS=[
  ['remark',['备注名','备注','名称','remark']],
  ['loginAccount',['登录账号','游戏账号','账号','帐号','account','username']],
  ['password',['密码','password']],
  ['platform',['登录平台','平台','platform']],
  ['region',['区服','分区','服务器','region']],
  ['source',['租号来源','来源','source']],
  ['rentedAt',['租用时间','起租时间','起租','租用日期','rentedAt']],
  ['expiresAt',['到期时间','到期日','到期','expiresAt']],
  ['ratio',['默认比例','兑换比例','比例','万每元','1元兑换','ratio']],
  ['suitPrice',['六套单价','六套','suitPrice']],
  ['ammoPrice',['子弹单价','AWM子弹','AWM','ammoPrice']],
  ['note',['说明','note']]
 ];

 const text=v=>String(v??'').trim();
 const raw=v=>String(v??'');
 const has=v=>text(v)!=='';
 function makeId(){try{if(typeof crypto!=='undefined'&&crypto.randomUUID)return crypto.randomUUID();}catch(_){}return 'lease-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);}
 function dayKey(date=new Date()){const d=date instanceof Date?date:new Date(date);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
 function maskAccount(value){
  const s=text(value);
  if(!s)return '未填写账号';
  const chars=Array.from(s);
  if(chars.length<=1)return '••';
  if(chars.length===2)return `•${chars[1]}`;
  if(chars.length<=6)return `${chars[0]}••••${chars.at(-1)}`;
  return `${chars.slice(0,2).join('')}••••${chars.slice(-2).join('')}`;
 }
 function displayName(lease){return text(lease?.remark)||maskAccount(lease?.loginAccount)||'未命名账号';}
 function normalizePlatform(value){
  const s=text(value);
  if(!s)return '';
  if(/微信/.test(s))return '微信区';
  if(/qq/i.test(s))return 'QQ区';
  if(/steam/i.test(s))return 'Steam';
  if(/其他|其它/.test(s))return '其他';
  return s;
 }
 function identity(value){return [text(value?.platform),text(value?.region),text(value?.loginAccount)].join('\u241f');}
 function normalizeDate(value){
  const s=text(value);
  if(!s)return '';
  const match=s.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/);
  if(!match)return '';
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  const d=new Date(year,month-1,day);
  if(d.getFullYear()!==year||d.getMonth()!==month-1||d.getDate()!==day)return '';
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
 }
 function ratioWanToCoins(value){
  const s=text(value);
  if(!s)return '';
  const n=Number(s);
  if(!Number.isFinite(n)||n<0)return '';
  return Math.round(n*10000*1000000)/1000000;
 }
 function ratioCoinsToWan(value){const n=Number(value);return Number.isFinite(n)&&n>0?Number((n/10000).toFixed(8)):'';}
 function priceValue(value){const s=text(value);if(!s)return '';const n=Number(s);return Number.isFinite(n)&&n>=0?n:'';}
 function isExpired(lease,todayKey=dayKey()){return !!lease?.expiresAt&&lease.expiresAt<todayKey;}

 function currentSegment(order){
  const rows=order?.segments||[];
  if(Object.hasOwn(order||{},'activeSegmentId'))return rows.find(x=>x.id===order.activeSegmentId)||null;
  if(rows.length===1)return rows[0];
  if(rows.length>1&&rows.slice(0,-1).every(x=>has(x.endBalance)))return rows.at(-1);
  return null;
 }
 function leaseById(state,id){return (state?.rentalLeases||[]).find(x=>x.id===id)||null;}
 function segmentIdentity(state,segment){
  if(!segment)return '';
  if(segment.rentalLeaseId){const lease=leaseById(state,segment.rentalLeaseId);if(lease)return identity(lease);}
  if(has(segment.rentalLoginAccount)||has(segment.rentalPlatform)||has(segment.rentalRegion))return identity({platform:segment.rentalPlatform,region:segment.rentalRegion,loginAccount:segment.rentalLoginAccount});
  if(segment.rentalLeaseId)return `lease:${segment.rentalLeaseId}`;
  return '';
 }
 function occupancy(state){
  const map=new Map();
  for(const order of state?.orders||[]){
   if(!ACTIVE_STATUSES.includes(order.status))continue;
   const segment=currentSegment(order);if(!segment)continue;
   if(segment.rentalLeaseId&&!map.has(`lease:${segment.rentalLeaseId}`))map.set(`lease:${segment.rentalLeaseId}`,{order,segment});
   const key=segmentIdentity(state,segment);if(key&&!map.has(key))map.set(key,{order,segment});
  }
  return map;
 }
 function status(state,lease,{todayKey=dayKey()}={}){
  if(!lease)return {key:'missing',label:'资料已删除',pill:'red',selectable:false};
  if(lease.archivedAt)return {key:'archived',label:'已归档',pill:'',selectable:false};
  if(lease.returnedAt)return {key:'returned',label:'已归还',pill:'',selectable:false};
  const map=occupancy(state),occupied=map.get(`lease:${lease.id}`)||map.get(identity(lease));
  if(occupied){
   const paused=occupied.order.status==='已暂停';
   return {key:'in-use',label:paused?'使用中 · 订单已暂停':'使用中',pill:'blue',order:occupied.order,segment:occupied.segment,selectable:false};
  }
  if(isExpired(lease,todayKey))return {key:'available',label:'可使用',note:'已到期',pill:'orange',expired:true,selectable:true};
  return {key:'available',label:'可使用',pill:'green',selectable:true};
 }
 function conflictFor(state,lease,{ignoreOrderId=''}={}){
  if(!lease)return null;
  const map=occupancy(state),hit=map.get(`lease:${lease.id}`)||map.get(identity(lease));
  if(!hit||hit.order.id===ignoreOrderId)return null;
  return hit;
 }
 function availableLeases(state,{forOrderId=''}={}){
  return (state?.rentalLeases||[]).filter(lease=>{
   const s=status(state,lease);
   if(!s.selectable)return false;
   const conflict=conflictFor(state,lease,{ignoreOrderId:forOrderId});
   return !conflict;
  });
 }
 function findDuplicate(state,candidate,{excludeId=''}={}){
  const key=identity(candidate);if(!text(candidate?.loginAccount))return null;
  return (state?.rentalLeases||[]).find(x=>x.id!==excludeId&&identity(x)===key)||null;
 }
 function currentRental(state,candidate){
  const key=identity(candidate);
  return (state?.rentalLeases||[])
   .filter(x=>identity(x)===key&&!x.returnedAt&&!x.archivedAt)
   .sort((a,b)=>Date.parse(b.updatedAt||b.createdAt||0)-Date.parse(a.updatedAt||a.createdAt||0))[0]||null;
 }

 function leaseFromRow(row={},{now=new Date().toISOString(),idFactory=makeId}={}){
  return {
   id:row.id||idFactory(),
   remark:text(row.remark),
   loginAccount:text(row.loginAccount),
   password:raw(row.password),
   platform:normalizePlatform(row.platform),
   region:text(row.region),
   source:text(row.source),
   rentedAt:normalizeDate(row.rentedAt),
   expiresAt:normalizeDate(row.expiresAt),
   note:text(row.note),
   defaultCoinPerYuan:ratioWanToCoins(row.ratio??row.defaultRatioWan),
   defaultSuitPrice:priceValue(row.suitPrice),
   defaultAmmoPrice:priceValue(row.ammoPrice),
   returnedAt:'',
   archivedAt:'',
   createdAt:now,
   updatedAt:now
  };
 }
 function updateFromRow(lease,row,{now=new Date().toISOString()}={}){
  const candidate=Object.hasOwn(row||{},'defaultCoinPerYuan')?row:leaseFromRow(row,{now,idFactory:()=>lease.id});
  for(const key of ['remark','platform','region','source','rentedAt','expiresAt','note','defaultCoinPerYuan','defaultSuitPrice','defaultAmmoPrice']){
   const value=candidate[key];
   if(value!==''&&value!=null)lease[key]=value;
  }
  lease.updatedAt=now;
  return lease;
 }

 function attachLease(segment,lease,values={}){
  const next={...segment};
  next.accountName=text(values.accountName)||displayName(lease);
  next.rentalLeaseId=lease.id;
  next.rentalPlatform=text(lease.platform);
  next.rentalRegion=text(lease.region);
  next.rentalLoginAccount=text(lease.loginAccount);
  next.rentalSource=text(lease.source);
  next.rentalRemark=text(lease.remark);
  next.rentalRentedAt=lease.rentedAt||'';
  for(const key of ['startBalance','endBalance','coinPerYuan','suitStart','suitEnd','suitPrice','suitUnused','ammoStart','ammoEnd','ammoPrice','ammoUnused','beforeShot','afterShot']){
   if(Object.hasOwn(values,key))next[key]=values[key];
  }
  next.useStartedAt=values.useStartedAt||next.useStartedAt||'';
  next.useEndedAt='';
  return next;
 }
 function linkLease(segment,lease,{at=new Date().toISOString()}={}){
  const next={...segment};
  next.rentalLeaseId=lease.id;
  next.rentalPlatform=text(lease.platform);
  next.rentalRegion=text(lease.region);
  next.rentalLoginAccount=text(lease.loginAccount);
  next.rentalSource=text(lease.source);
  next.rentalRemark=text(lease.remark);
  next.rentalRentedAt=lease.rentedAt||'';
  next.rentalLinkedAt=at;
  return next;
 }
 function markUse(order,at){
  const active=currentSegment(order);if(!active)return order;
  const field=order.status==='进行中'?'useStartedAt':['待结算','已取消','已完成'].includes(order.status)?'useEndedAt':'';
  if(!field||active[field])return order;
  return {...order,segments:(order.segments||[]).map(s=>s.id===active.id?{...s,[field]:at}:s)};
 }
 function usageRecords(state,lease){
  const rows=[];
  for(const order of state?.orders||[]){
   for(const segment of order.segments||[]){
    if(segment.rentalLeaseId===lease.id)rows.push({order,segment});
   }
  }
  return rows.sort((a,b)=>Date.parse(a.segment.useStartedAt||a.order.createdAt||0)-Date.parse(b.segment.useStartedAt||b.order.createdAt||0));
 }

 function splitDelimited(line,delimiter){
  const out=[];let current='',quoted=false;
  for(let i=0;i<line.length;i++){
   const ch=line[i],next=line[i+1];
   if(ch==='"'){
    if(quoted&&next==='"'){current+='"';i++;}
    else quoted=!quoted;
   }else if(ch===delimiter&&!quoted){out.push(current);current='';}
   else current+=ch;
  }
  out.push(current);return out;
 }
 function detectDelimiter(line){if(line.includes('\t'))return '\t';if(line.includes(','))return ',';return '';}
 function headerColumn(headers,aliases){
  return headers.findIndex(header=>aliases.some(alias=>header.includes(alias.toLowerCase())));
 }
 function headerRow(line){
  if(!detectDelimiter(line)||/^\s*(?:登录)?账号\s*[：:]/.test(line))return null;
  const delimiter=detectDelimiter(line),cells=splitDelimited(line,delimiter).map(x=>text(x).toLowerCase().replace(/[\s_（）()]/g,''));
  const first=cells[0]||'';
  const firstIsAccount=['账号','登录账号','游戏账号','account','username'].includes(first)||first.startsWith('登录账号')||first.startsWith('游戏账号');
  if(!firstIsAccount)return null;
  const others=cells.slice(1);
  const isHeaderLike=cell=>{
   if(!cell)return false;
   if(['password','platform','region','source','remark','note'].includes(cell))return true;
   return ['密码','平台','区服','分区','来源','备注','到期','比例','六套','子弹','租用'].some(x=>cell.includes(x));
  };
  const headerLikeCount=others.filter(isHeaderLike).length;
  const hasPasswordHeader=others.some(cell=>cell==='密码'||cell==='password');
  if(headerLikeCount<1&&!hasPasswordHeader)return null;
  return {delimiter,headers:cells};
 }
 function mapHeaderRow(cells,headers,delimiter){
  const columns={};for(const [key,aliases] of FIELD_LABELS)columns[key]=headerColumn(headers,aliases);
  const row={};
  for(const [key,index] of Object.entries(columns)){if(index>=0)row[key]=key==='password'?raw(cells[index]):text(cells[index]);}
  if(!row.loginAccount)row.loginAccount='';
  if(row.password==null)row.password='';
  return row;
 }
 function labeledField(line){
  for(const [key,labels] of FIELD_LABELS){
   for(const label of labels){
    const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const match=line.match(new RegExp('^\\s*'+escaped+'\\s*[：:]([\\s\\S]*)$','i'));
    if(match)return {key,value:key==='password'?raw(match[1]):text(match[1])};
   }
  }
  return null;
 }

 function parseImport(source){
  const issues=[];const rows=[];
  const lines=String(source??'').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n');
  const indexed=lines.map((line,index)=>({line,number:index+1})).filter(x=>text(x.line)!=='');
  if(!indexed.length)return {rows,issues:[{line:0,message:'没有可解析的内容'}],stats:{recognized:0,missingLogin:0,missingPassword:0}};
  const header=headerRow(indexed[0].line);
  if(header){
   const headerInfo=headerRow(indexed[0].line);
   for(const entry of indexed.slice(1)){
    const cells=splitDelimited(entry.line,headerInfo.delimiter);
    if(!cells.some(cell=>text(cell)!==''))continue;
    const row=mapHeaderRow(cells,headerInfo.headers,headerInfo.delimiter);
    row.sourceLine=entry.number;rows.push(row);
   }
  }else if(indexed.some(x=>labeledField(x.line))){
   let current=null;
   const flush=()=>{if(current&&Object.keys(current).some(key=>key!=='sourceLine')){rows.push(current);}current=null;};
   for(const entry of indexed){
    const field=labeledField(entry.line);
    if(!field){
     issues.push({line:entry.number,message:'这一行不是“字段：内容”格式，未导入'});
     continue;
    }
    if(field.key==='loginAccount'&&current&&has(current.loginAccount))flush();
    if(!current)current={sourceLine:entry.number};
    if(!current.sourceLine)current.sourceLine=entry.number;
    current[field.key]=field.value;
   }
   flush();
  }else{
   for(const entry of indexed){
    const delimiter=detectDelimiter(entry.line);
    const cells=delimiter?splitDelimited(entry.line,delimiter):[entry.line];
    const keys=['loginAccount','password','platform','region','source','note','rentedAt','expiresAt','ratio','suitPrice','ammoPrice'];
    const row={sourceLine:entry.number};
    keys.forEach((key,index)=>{if(index<cells.length)row[key]=key==='password'?raw(cells[index]):text(cells[index]);});
    rows.push(row);
   }
  }
  for(const row of rows){
   if(!text(row.loginAccount)){row.missingLogin=true;issues.push({line:row.sourceLine,message:'缺少登录账号，确认前需要补齐'});}
   if(!raw(row.password)){row.missingPassword=true;}
   for(const [key,label] of [['rentedAt','租用时间'],['expiresAt','到期时间']]){
    if(has(row[key])&&!normalizeDate(row[key]))issues.push({line:row.sourceLine,message:`${label}格式无法识别，已留空`});
   }
   if(has(row.ratio)&&ratioWanToCoins(row.ratio)==='')issues.push({line:row.sourceLine,message:'默认比例无法识别，已留空'});
  }
  return {rows,issues,stats:{recognized:rows.length,missingLogin:rows.filter(x=>x.missingLogin).length,missingPassword:rows.filter(x=>x.missingPassword).length}};
 }

 function analyzeImport(state,rows){
  const incoming=new Map();
  return rows.map((row,index)=>{
   const candidate=leaseFromRow(row,{now:'2000-01-01T00:00:00.000Z',idFactory:()=>`incoming-${index}`});
   const existing=text(candidate.loginAccount)?findDuplicate(state,candidate):null;
   const inBatch=text(candidate.loginAccount)?incoming.get(identity(candidate)):null;
   if(!row.skip&&!existing&&!inBatch&&text(candidate.loginAccount))incoming.set(identity(candidate),index);
   return {...row,duplicate:existing,inBatchDuplicate:inBatch==null?null:inBatch,missingLogin:!text(candidate.loginAccount),missingPassword:!raw(row.password)};
  });
 }

 function applyImport(state,rows,{now=new Date().toISOString(),idFactory=makeId}={}){
  const next=JSON.parse(JSON.stringify(state));if(!Array.isArray(next.rentalLeases))next.rentalLeases=[];
  let added=0,updated=0,skipped=0;const errors=[];
  rows.forEach((row,index)=>{
   if(row.skip){skipped++;return;}
   const candidate=leaseFromRow(row,{now,idFactory});
   if(!candidate.loginAccount){errors.push(`第 ${index+1} 行缺少登录账号`);return;}
   const duplicate=findDuplicate(next,candidate);
   if(duplicate){
    if(row.resolution==='new'){
     next.rentalLeases.unshift({...candidate,id:idFactory()});added++;
    }else if(row.resolution==='update'){
     const current=currentRental(next,candidate);
     if(!current){errors.push(`第 ${index+1} 行没有可更新的当前租用资料，请改为登记新一轮租用`);return;}
     updateFromRow(current,candidate,{now});updated++;
    }else skipped++;
   }else{
    next.rentalLeases.unshift({...candidate,id:idFactory()});added++;
   }
  });
  if(errors.length)return {ok:false,errors,added:0,updated:0,skipped:0};
  return {ok:true,state:next,added,updated,skipped};
 }

 function migrate(state){
  if(!state||typeof state!=='object')return false;
  if(!Array.isArray(state.rentalLeases)){state.rentalLeases=[];return true;}
  return false;
 }

 return {
  PLATFORMS,ACTIVE_STATUSES,dayKey,maskAccount,displayName,identity,normalizePlatform,normalizeDate,
  ratioWanToCoins,ratioCoinsToWan,isExpired,currentSegment,leaseById,segmentIdentity,occupancy,status,
  conflictFor,availableLeases,findDuplicate,currentRental,leaseFromRow,updateFromRow,attachLease,linkLease,
  markUse,usageRecords,parseImport,analyzeImport,applyImport,migrate
 };
});
