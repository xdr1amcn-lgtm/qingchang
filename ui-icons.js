(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.QingchangIcons=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const paths={
  check:'m5 12 4 4L19 6',warning:'m12 3 10 18H2L12 3z M12 9v5 M12 17h.01',
  clock:'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M12 6v6l4 2',
  network:'M2 8a16 16 0 0 1 20 0 M5 12a11 11 0 0 1 14 0 M8 16a6 6 0 0 1 8 0 M12 20h.01',
  mic:'M9 4a3 3 0 0 1 6 0v8a3 3 0 0 1-6 0z M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M9 22h6',
  clipboard:'M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3 M9 2h6v5H9z m-1 12 3 3 5-6',
  broadcast:'M6 5a9 9 0 0 0 0 14 M18 5a9 9 0 0 1 0 14 M9 8a5 5 0 0 0 0 8 M15 8a5 5 0 0 1 0 8 M13 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0',
  list:'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  help:'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.3-3 4 M12 17h.01',
  info:'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M12 11v6 M12 7h.01',
  close:'m6 6 12 12 M6 18 18 6',chevron:'m9 5 7 7-7 7',activity:'M2 12h5l3-8 4 16 3-8h5',minus:'M5 12h14'
 };
 function icon(name){const key=Object.hasOwn(paths,name)?name:'info';return `<svg class="qc-icon" data-icon="${key}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${paths[key]}"/></svg>`;}
 return {icon};
});
