import { chromium } from "playwright";
const BASE = (process.argv[2] || "https://portal-manutencao-zucchi.netlify.app").replace(/\/$/,"");
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:1440,height:900}, ignoreHTTPSErrors:true });
const p = await ctx.newPage();
const pageErrors=[], failed=[], statuses={};
p.on("pageerror", e=>pageErrors.push(e.message));
p.on("response", r=>{ const u=r.url(); if(u.includes("zucchi-logo-oficial")) statuses.logo=r.status(); if(r.status()>=500) failed.push(`${r.status()} ${u}`); });
let mainStatus=0;
try { const resp = await p.goto(`${BASE}/login`, { waitUntil:"networkidle", timeout:45000 }); mainStatus=resp?.status()??0; } catch(e){ console.log("NAV ERROR:", e.message); }
await p.waitForTimeout(1500);
const body = await p.locator("body").innerText().catch(()=> "");
// verifica que a <img> da logo carregou de fato (naturalWidth>0)
const logo = await p.evaluate(()=>{ const img=[...document.images].find(i=>i.src.includes("zucchi-logo-oficial")); return img?{src:img.src,natW:img.naturalWidth,natH:img.naturalHeight,visible:img.getBoundingClientRect().width>0}:null; });
await p.screenshot({ path:"./.shots/prod-login.png" });
await b.close();
console.log("GET /login status:", mainStatus);
console.log("Asset logo status:", statuses.logo ?? "(nao requisitado)");
console.log("Logo <img>:", JSON.stringify(logo));
console.log("Titulo presente:", /Portal de Gest[aã]o da Manuten/i.test(body));
console.log("Campos Login/Senha:", /Login/i.test(body) && /Senha/i.test(body));
console.log("Botao Entrar:", /Entrar/i.test(body));
console.log("Rodape Stones Luxury:", /Stones Luxury/i.test(body));
console.log("pageerrors:", pageErrors.length?pageErrors:"nenhum");
console.log("5xx:", failed.length?failed:"nenhum");
