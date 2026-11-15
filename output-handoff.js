(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.QingchangOutputHandoff=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 function revision(value){return JSON.stringify(value);}
 function exported(previous,signature,at,file=''){return {signature,exportedAt:at,file,confirmedAt:null,confirmedRuntime:null};}
 function status(check,signature,runtime){if(!check)return 'missing';if(check.signature!==signature)return 'changed';if(!check.confirmedAt)return 'pending';if(runtime&&check.confirmedRuntime!==runtime)return 'recheck';return 'confirmed';}
 function confirm(check,signature,at,runtime){if(!check||check.signature!==signature)throw Error('当前内容还没有导出或已修改，请先重新输出');return {...check,confirmedAt:at,...(runtime?{confirmedRuntime:runtime}:{})};}
 return {revision,exported,status,confirm};
});
