import sharp from "sharp";
const f = process.argv[2];
const img = sharp(f);
const { width, height } = await img.metadata();
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
const ch = info.channels;
function px(x,y){const i=(y*width+x)*ch;return [data[i],data[i+1],data[i+2],ch>3?data[i+3]:255];}
const corners = {
  topLeft: px(2,2), topRight: px(width-3,2),
  botLeft: px(2,height-3), botRight: px(width-3,height-3),
  center: px(width>>1,height>>1)
};
console.log("channels:", ch);
for (const [k,v] of Object.entries(corners)) console.log(k, "RGBA=", v);
// % de pixels totalmente transparentes
let transp=0, white=0, total=width*height;
for(let i=0;i<total;i++){const o=i*ch;const a=ch>3?data[o+3]:255;if(a===0)transp++;else if(data[o]>245&&data[o+1]>245&&data[o+2]>245)white++;}
console.log("transparentes:", (transp/total*100).toFixed(1)+"%", "| brancos opacos:", (white/total*100).toFixed(1)+"%");
