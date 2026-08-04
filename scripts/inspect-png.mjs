import { readFileSync } from "fs";
const f = process.argv[2];
const b = readFileSync(f);
const sig = b.subarray(0,8).toString("hex");
console.log("PNG?", sig === "89504e470d0a1a0a");
// IHDR starts at byte 8: length(4)+"IHDR"(4)+width(4)+height(4)+bitdepth(1)+colortype(1)
const width = b.readUInt32BE(16);
const height = b.readUInt32BE(20);
const bitDepth = b.readUInt8(24);
const colorType = b.readUInt8(25);
const types = {0:"Grayscale",2:"RGB",3:"Palette",4:"Grayscale+Alpha",6:"RGBA"};
console.log("Dimensoes:", width+"x"+height);
console.log("BitDepth:", bitDepth, "ColorType:", colorType, "("+(types[colorType]||"?")+")");
console.log("Tem canal alfa?", colorType===4||colorType===6 ? "SIM (pode ter transparencia)" : "NAO (fundo opaco/branco)");
console.log("Tamanho arquivo:", (b.length/1024).toFixed(1), "KB");
