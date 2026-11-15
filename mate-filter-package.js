const crypto=require('node:crypto');
const M=require('./stream-filter-model');
const sha1=value=>crypto.createHash('sha1').update(value).digest('hex');
function crc32(buffer){let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
// Small, deterministic ZIP writer. All member paths are controlled ASCII names.
function zip(files){const local=[],central=[];let offset=0;for(const [name,value] of files){const filename=Buffer.from(name),data=Buffer.from(value),crc=crc32(data);const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(0x800,6);h.writeUInt16LE(33,12);h.writeUInt32LE(crc,14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(filename.length,26);local.push(h,filename,data);const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);h.copy(c,6,4,30);c.writeUInt32LE(offset,42);central.push(c,filename);offset+=h.length+filename.length+data.length;}const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,directory,end]);}
function create(params,name='轻场 · 游戏调色 '+new Date().toLocaleString('zh-CN',{hour12:false})){
 const data=Buffer.from(M.cube(params)),filename='qingchang.cube';
 const files=[{basename:filename,path:`./files/${filename}`,fileSign:sha1(data)}];
 const filterTempList=[{id:crypto.randomUUID(),name,filterDataList:[{id:crypto.randomUUID(),type:12,payload:{file:`./files/${filename}`,amount:1},name:'轻场调色 LUT'}]}];
 const config={APP_VERSION:'13.1.1',filterTempList,filesSign:sha1(JSON.stringify(files)),configSign:sha1(JSON.stringify(filterTempList)),files,errorFiles:[]};
 return {config,buffer:zip([['config.json',JSON.stringify(config)],['files/'+filename,data]])};
}
module.exports={create,sha1,crc32};
