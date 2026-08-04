import sharp from "sharp";
const SRC = process.argv[2];
const OUT = process.argv[3];
const THRESH = 236;       // RGB >= isto é considerado "fundo branco"
const img = sharp(SRC).ensureAlpha();
const { width, height } = await img.metadata();
const { data } = await img.raw().toBuffer({ resolveWithObject: true });
const N = width * height;
const isBg = (i) => data[i*4] >= THRESH && data[i*4+1] >= THRESH && data[i*4+2] >= THRESH;
const visited = new Uint8Array(N);
const stack = [];
// Semeia a partir de TODA a borda
for (let x = 0; x < width; x++) { stack.push(x); stack.push((height-1)*width + x); }
for (let y = 0; y < height; y++) { stack.push(y*width); stack.push(y*width + width-1); }
while (stack.length) {
  const p = stack.pop();
  if (visited[p]) continue;
  visited[p] = 1;
  if (!isBg(p)) continue;          // só propaga por pixels de fundo branco
  data[p*4+3] = 0;                  // torna transparente
  const x = p % width, y = (p - x) / width;
  if (x>0) stack.push(p-1);
  if (x<width-1) stack.push(p+1);
  if (y>0) stack.push(p-width);
  if (y<height-1) stack.push(p+width);
}
// Feather leve: pixels brancos opacos restantes vizinhos de transparente viram semi-transparentes (anti-halo)
const out = Buffer.from(data);
for (let p = 0; p < N; p++) {
  if (out[p*4+3] === 0) continue;
  const x = p % width, y = (p - x) / width;
  const near = [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>{const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=width||ny>=height)return false;return data[(ny*width+nx)*4+3]===0;});
  if (near && data[p*4]>=THRESH && data[p*4+1]>=THRESH && data[p*4+2]>=THRESH) out[p*4+3] = 90;
}
await sharp(out, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toFile(OUT);
let transp=0; for(let p=0;p<N;p++) if(out[p*4+3]===0) transp++;
console.log(`Gerado ${OUT} — ${width}x${height}, ${(transp/N*100).toFixed(1)}% transparente`);
