(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.QingchangStreamFilter=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const fields=[['brightness','亮度'],['contrast','对比度'],['saturation','饱和度'],['temperature','色温'],['tint','色调'],['shadows','阴影'],['highlights','高光']];
 const channels=[['red','红',0],['orange','橙',30],['yellow','黄',60],['green','绿',120],['cyan','青',180],['blue','蓝',210],['indigo','靛',240],['purple','紫',300]];
 const defaults={strength:100,brightness:0,contrast:0,saturation:0,temperature:0,tint:0,shadows:0,highlights:0,hsl:{}};
 const presets=[{id:'natural',name:'原色',detail:'保持原始颜色',values:{}},{id:'clear',name:'通透',detail:'轻提暗部，适量增强色彩',values:{contrast:12,saturation:10,shadows:18,highlights:-10}},{id:'shadow',name:'暗部舒展',detail:'提亮阴影，压住高光',values:{brightness:3,contrast:4,shadows:38,highlights:-20,saturation:4}},{id:'cool',name:'冷调',detail:'稍偏冷，保留中性色层次',values:{temperature:-18,tint:3,contrast:10,saturation:6,shadows:12,highlights:-8}}];
 const clamp=(x,min=0,max=1)=>Math.min(max,Math.max(min,x));
 function normalize(value={}){if(!value||typeof value!=='object')value={};const out={...defaults,hsl:{}};for(const key of ['strength',...fields.map(x=>x[0])]){const n=Number(value[key]??defaults[key]);if(!Number.isFinite(n)||n<(key==='strength'?0:-100)||n>100)throw Error('滤镜参数超出范围');out[key]=n;}for(const [key]of channels){const v=value.hsl?.[key]||{};out.hsl[key]={};for(const item of ['hue','saturation','lightness']){const n=Number(v[item]??0);if(!Number.isFinite(n)||Math.abs(n)>100)throw Error('分色参数超出范围');out.hsl[key][item]=n;}}return out;}
 function preset(id){const p=presets.find(x=>x.id===id);if(!p)throw Error('未知滤镜方案');return normalize(p.values);}
 function rgbToHsl(r,g,b){const hi=Math.max(r,g,b),lo=Math.min(r,g,b),d=hi-lo,l=(hi+lo)/2;if(!d)return [0,0,l];const s=d/(1-Math.abs(2*l-1));let h=hi===r?(g-b)/d%6:hi===g?(b-r)/d+2:(r-g)/d+4;return [((h*60)%360+360)%360,s,l];}
 function hslToRgb(h,s,l){const a=s*Math.min(l,1-l),f=n=>{const k=(n+h/30)%12;return l-a*Math.max(-1,Math.min(k-3,9-k,1));};return [f(0),f(8),f(4)];}
 function compile(value){const p=normalize(value),active=channels.filter(([key])=>Object.values(p.hsl[key]).some(x=>x!==0)),contrast=Math.pow(2,p.contrast/100),strength=p.strength/100;
  return function transform(r,g,b){const original=[r,g,b],lum=.2126*r+.7152*g+.0722*b,shift=p.brightness/400+p.shadows/100*.32*Math.pow(1-lum,2)+p.highlights/100*.32*lum*lum;
   r=((r+shift)*(1+p.temperature/100*.15+p.tint/100*.05)-.5)*contrast+.5;g=((g+shift)*(1-p.tint/100*.1)-.5)*contrast+.5;b=((b+shift)*(1-p.temperature/100*.15+p.tint/100*.05)-.5)*contrast+.5;
   const y=.2126*r+.7152*g+.0722*b,sat=1+p.saturation/100;r=y+(r-y)*sat;g=y+(g-y)*sat;b=y+(b-y)*sat;
   if(active.length){let [h,s,l]=rgbToHsl(clamp(r),clamp(g),clamp(b)),dh=0,ds=0,dl=0;for(const [key,,center]of active){const d=Math.min(Math.abs(h-center),360-Math.abs(h-center)),w=Math.max(0,1-d/45)*Math.min(1,s/.2);dh+=p.hsl[key].hue/100*30*w;ds+=p.hsl[key].saturation/100*w;dl+=p.hsl[key].lightness/100*.25*w;}[r,g,b]=hslToRgb((h+dh+360)%360,clamp(s+ds),clamp(l+dl));}
   return [r,g,b].map((x,i)=>clamp(original[i]+(clamp(x)-original[i])*strength));
  };
 }
 function createLut(value,size=33){if(![17,33].includes(size))throw Error('不支持的 LUT 尺寸');const transform=compile(value),data=new Float32Array(size**3*3);let offset=0;for(let b=0;b<size;b++)for(let g=0;g<size;g++)for(let r=0;r<size;r++){const rgb=transform(r/(size-1),g/(size-1),b/(size-1));for(const n of rgb)data[offset++]=n;}return {size,data};}
 function cube(value){const {size,data}=createLut(value),lines=['# Qingchang livestream color LUT','# Import at amount 1.0; strength is already included.','TITLE "Qingchang Stream Filter"',`LUT_3D_SIZE ${size}`,'DOMAIN_MIN 0.0 0.0 0.0','DOMAIN_MAX 1.0 1.0 1.0'];for(let i=0;i<data.length;i+=3)lines.push(`${data[i].toFixed(7)} ${data[i+1].toFixed(7)} ${data[i+2].toFixed(7)}`);return lines.join('\n')+'\n';}
 function sample(lut,r,g,b){const n=lut.size,coords=[r,g,b].map(x=>clamp(x)*(n-1)),base=coords.map(Math.floor),frac=coords.map((x,i)=>x-base[i]),out=[0,0,0];for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++){const w=(x?frac[0]:1-frac[0])*(y?frac[1]:1-frac[1])*(z?frac[2]:1-frac[2]),index=((Math.min(n-1,base[2]+z)*n+Math.min(n-1,base[1]+y))*n+Math.min(n-1,base[0]+x))*3;for(let c=0;c<3;c++)out[c]+=lut.data[index+c]*w;}return out;}
 function processPixels(pixels,lut){const out=new Uint8ClampedArray(pixels.length);for(let i=0;i<pixels.length;i+=4){const rgb=sample(lut,pixels[i]/255,pixels[i+1]/255,pixels[i+2]/255);out[i]=Math.round(rgb[0]*255);out[i+1]=Math.round(rgb[1]*255);out[i+2]=Math.round(rgb[2]*255);out[i+3]=pixels[i+3];}return out;}
 function signature(value){return JSON.stringify(normalize(value));}
 return {fields,channels,defaults,presets,normalize,preset,compile,createLut,cube,sample,processPixels,signature};
});
