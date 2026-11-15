import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('assets');
const ico=fs.readFileSync(path.join(root,'qingchang.ico'));
if(ico.readUInt16LE(2)!==1)throw new Error('ICO 类型不是图标');
const count=ico.readUInt16LE(4);
const sizes=[];
for(let i=0;i<count;i++){
 const offset=6+i*16;
 const width=ico.readUInt8(offset)||256;
 const height=ico.readUInt8(offset+1)||256;
 const bits=ico.readUInt16LE(offset+6);
 const bytes=ico.readUInt32LE(offset+8);
 if(width!==height)throw new Error(`非方形图标：${width}×${height}`);
 if(bits!==32)throw new Error(`非 32 位图标：${bits}`);
 sizes.push(`${width}×${height} / ${bytes} bytes`);
}
const png=fs.readFileSync(path.join(root,'qingchang-icon.png'));
if(png.readUInt32BE(16)!==512||png.readUInt32BE(20)!==512)throw new Error('512px PNG 尺寸不对');
console.log(`ICO 条目：${count}`);
console.log(sizes.join('\n'));
console.log('512px PNG：正常');
