function createShortcutManager(shortcut,send){
 let keys={},result={};
 function apply(settings={},force=false){
  const next={session:settings.session||'F8',marker:settings.marker||'F9'};
  if(!force&&next.session===keys.session&&next.marker===keys.marker&&Object.values(result).every(x=>x.ok))return result;
  for(const key of Object.values(keys))try{shortcut.unregister(key);}catch(_){}
  keys=next;result={};
  for(const [action,key] of Object.entries(next)){let ok=false;try{ok=shortcut.register(key,()=>send(action));}catch(_){}result[action]={key,ok,message:ok?'已启用':'按键被占用或不可用，请换一个按键后重试'};}
  return result;
 }
 return {apply,status:()=>result};
}
module.exports={createShortcutManager};
