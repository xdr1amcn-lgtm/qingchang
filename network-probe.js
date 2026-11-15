const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const path=require('node:path');
const targets={cloudflare:{ip:'1.1.1.1',label:'Cloudflare 公共 DNS'},alibaba:{ip:'223.5.5.5',label:'阿里公共 DNS'}};
function parseReply(stdout){const text=String(stdout),match=text.match(/([=<])\s*(\d+(?:\.\d+)?)\s*ms\b/i);if(!/TTL\s*=/i.test(text)||!match)return {ok:false,rttMs:null,reason:'目标未返回可识别的 ICMP 回应'};return {ok:true,rttMs:match[1]==='<'?Number(match[2])*.5:Number(match[2]),lessThan:match[1]==='<'};}
function createProbe(run=promisify(execFile),clock=Date.now){let running=false;return async key=>{if(!Object.hasOwn(targets,key))throw Error('请选择支持的诊断目标');if(running)throw Error('上一次网络探测尚未完成');running=true;try{const {stdout}=await run(path.join(process.env.WINDIR||'C:\\Windows','System32','ping.exe'),['-4','-n','1','-w','1000',targets[key].ip],{windowsHide:true,timeout:1800,maxBuffer:16384});return {...parseReply(stdout),at:clock()};}catch(error){if(typeof error.stdout==='string'){const reply=parseReply(error.stdout);if(reply.ok)return {...reply,at:clock()};}return {ok:false,rttMs:null,at:clock(),reason:error.code==='ENOENT'?'系统 ping 程序不可用':error.killed?'探测超时':'本次探测未收到回应'};}finally{running=false;}};}
module.exports={targets,parseReply,createProbe};
