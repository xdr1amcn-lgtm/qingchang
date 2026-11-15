(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.QingchangSave=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 function create({write,getState,onStatus=()=>{},delay=180}){
  let revision=0,saved=0,timer=null,chain=Promise.resolve(),error='';
  const notify=phase=>onStatus({phase,error,dirty:revision>saved});
  function flush(){clearTimeout(timer);timer=null;const r=revision,snapshot=JSON.parse(JSON.stringify(getState()));
   const job=chain.catch(()=>{}).then(async()=>{if(r<=saved)return;notify('saving');try{const result=await write(snapshot);saved=Math.max(saved,r);error='';notify(revision>saved?'pending':'saved');return result;}catch(e){error=e.message||'本地保存失败';notify('error');throw e;}});
   chain=job;return job;
  }
  function mark(){revision++;error='';notify('pending');clearTimeout(timer);timer=setTimeout(()=>flush().catch(()=>{}),delay);}
  // Explicit commits are serialized after pending edits; callers commit UI state only after success.
  async function commit(snapshot){clearTimeout(timer);await flush();const job=chain.catch(()=>{}).then(async()=>{notify('saving');try{const result=await write(JSON.parse(JSON.stringify(snapshot)));error='';notify('saved');return result;}catch(e){error=e.message||'本地保存失败';notify('error');throw e;}});chain=job;return job;}
  return {mark,flush,commit,status:()=>({dirty:revision>saved,error}),cancel:()=>{clearTimeout(timer);}};
 }
 return {create};
});
