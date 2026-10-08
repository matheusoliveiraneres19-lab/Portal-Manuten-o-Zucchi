/**
 * Executa o `<script>` INTEIRO do `Analise_MRP_Compacto (1).html` num sandbox
 * `vm`, com a MESMA SheetJS embutida nele (0.18.5, decodificada do XLSX_B64) e
 * um DOM mínimo simulado. É a referência de paridade da Análise MRP: os testes
 * comparam o Portal com o que o HTML realmente faz (receberArquivos, trocarAba,
 * reatribuir, processar, importarBase…), e não com uma releitura do código.
 *
 * Diferenças em relação ao navegador, todas inofensivas para a importação:
 *   - FileReader é síncrono (no navegador a ordem de leitura de vários arquivos
 *     depende de qual termina primeiro; aqui é a ordem da lista);
 *   - localStorage vazio (nenhuma base/análise salva), setTimeout/alert inertes;
 *   - o DOM guarda só value/checked/innerHTML/classes — o suficiente para os
 *     campos que a lógica lê (fDep, bAreaPadrao, tp*, sh*…).
 *
 * Cada `createHtmlRuntime()` é um sandbox novo (estado zerado, como abrir o HTML).
 * Só para scripts — nunca importar em src/.
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { resolveHtmlPath } from "./html-reference";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type HtmlRuntimeFile = { name: string; data: Buffer | Uint8Array };

export type HtmlRuntime = {
  /** Versão da SheetJS embutida no HTML. */
  xlsxVersion: string;
  /** Funções e constantes ORIGINAIS do HTML. */
  fn: Any;
  /** receberArquivos(files) — detecção + encaixe nos slots. */
  receber(files: HtmlRuntimeFile[]): void;
  /** `arquivos` = { base, est, cmp } depois do encaixe. */
  arquivos(): Any;
  setDeposit(value: string): void;
  setDefaultArea(value: string): void;
  reatribuir(kind: string, destino: string): void;
  trocarAba(kind: string, sheet: string): void;
  /** Estado da trava (btnProc / lockMsg) depois de atualizarSlots(). */
  lock(): { disabled: boolean; message: string };
  /** processar() — retorna o estado que ele deixou (estoque, compras, base…). */
  processar(): Any;
  /** XLSX.read(...) com as opções do HTML. */
  readWorkbook(data: Buffer | Uint8Array): Any;
};

type Prepared = { lib: string; app: string; defaults: Record<string, string>; version: string };
const cache = new Map<string, Prepared>();

function prepare(path: string): Prepared {
  const hit = cache.get(path);
  if (hit) return hit;
  const html = readFileSync(path, "utf8").replace(/\r\n/g, "\n");

  const start = html.indexOf("<script>") + "<script>".length;
  const end = html.lastIndexOf("</script>");
  let app = html.slice(start, end);

  const b64Line = app.split("\n").find((l) => l.startsWith("const XLSX_B64"));
  if (!b64Line) throw new Error("XLSX_B64 não encontrado no HTML.");
  const b64 = b64Line.slice(b64Line.indexOf('"') + 1, b64Line.lastIndexOf('"'));
  const lib = Buffer.from(b64, "base64").toString("utf8");
  const version = /XLSX\.version\s*=\s*"([^"]+)"/.exec(lib)?.[1] ?? /version="(0\.\d+\.\d+)"/.exec(lib)?.[1] ?? "?";

  // Remove o boot (Blob/URL/<script>) — o lib já é avaliado diretamente.
  const boot = app.lastIndexOf("\nbootXLSX(");
  if (boot < 0) throw new Error("bootXLSX(...) não encontrado no HTML.");
  app = app.slice(0, boot);

  // Valores iniciais do markup: <input value="…"> e 1ª <option> de cada <select>.
  const defaults: Record<string, string> = {};
  for (const m of Array.from(html.matchAll(/<input[^>]*\bid="([^"]+)"[^>]*\bvalue="([^"]*)"/g))) defaults[m[1]] = m[2];
  for (const m of Array.from(html.matchAll(/<select[^>]*\bid="([^"]+)"[^>]*>\s*(?:<option value="([^"]*)")?/g))) {
    if (m[2] !== undefined) defaults[m[1]] = m[2];
  }

  const prepared = { lib, app, defaults, version };
  cache.set(path, prepared);
  return prepared;
}

const FAKE_DOM = `
class __El {
  constructor(id){ this.id=id; this.value=''; this.checked=false; this.innerHTML=''; this.textContent='';
    this.className=''; this.disabled=false; this.style={}; this.options=[]; const cls=new Set(); this._cls=cls;
    this.classList={ add:(...c)=>c.forEach(x=>cls.add(x)), remove:(...c)=>c.forEach(x=>cls.delete(x)),
      toggle:(c,f)=>{ const on=f===undefined?!cls.has(c):!!f; if(on) cls.add(c); else cls.delete(c); return on; },
      contains:(c)=>cls.has(c) }; }
  appendChild(o){ this.options.push(o); return o; }
  addEventListener(){} click(){}
}
const __els = new Map();
var document = {
  getElementById(id){ let e=__els.get(id); if(!e){ e=new __El(id); if(Object.prototype.hasOwnProperty.call(__DEFAULTS,id)) e.value=__DEFAULTS[id]; __els.set(id,e); } return e; },
  createElement(){ return new __El(''); },
  head:{ appendChild(){} }
};
var window = { scrollTo(){} };
var localStorage = { getItem(){ return null; }, setItem(){}, removeItem(){} };
function alert(){}
function setTimeout(){ return 0; }
function clearTimeout(){}
class FileReader { readAsArrayBuffer(f){ this.onload({ target:{ result:f.__ab } }); } }
`;

const HARNESS = `
globalThis.__mrp = {
  receber(files){ receberArquivos(files); },
  arquivos(){ return arquivos; },
  setDeposit(v){ document.getElementById('fDep').value=v; },
  setDefaultArea(v){ document.getElementById('bAreaPadrao').value=v; },
  reatribuir(kind,destino){ document.getElementById('tp'+SUF[kind]).value=destino; reatribuir(kind); },
  trocarAba(kind,nome){ document.getElementById('sh'+SUF[kind]).value=nome; trocarAba(kind); },
  lock(){ return { disabled: !!document.getElementById('btnProc').disabled, message: document.getElementById('lockMsg').innerHTML }; },
  processar(){
    processar();
    return { estoque, compras, infoEst, infoCmp, depFiltro, depInfo, baseCustom, baseInfo, analysis,
             upMsg: document.getElementById('upMsg').innerHTML };
  },
  readWorkbook(ab){ return XLSX.read(ab,{type:'array',cellDates:true,raw:false}); },
  fn: { norm, cleanCode, cleanText, parseNum, parseData, isoOf, dataBR, detectCol, sheetToAOA, scoreHeader,
        findHeaderRow, pontuar, analisarArquivo, colunasOk, famDe, isSemMovTxt, cmpStatus, cmpOrdem, ALIAS, FAMS,
        obsDe, contar, materiais(){ _mats=null; return materiais(); },
        /* analisar() sobre estoque/compras arbitrários (sem passar pelos arquivos) */
        renderAreasHtml(){ renderAreas(); return { area: document.getElementById('cardsArea').innerHTML, fam: document.getElementById('cardsFam').innerHTML }; },
        setChecked(id, v){ document.getElementById(id).checked = !!v; },
        renderTransitoHtml(lim){ limTrans = lim || 200; renderTransito(); return { kpis: document.getElementById('kpisTrans').innerHTML, table: document.getElementById('tblTrans').innerHTML }; },
        setCompras(list){ compras = list; _cmpIdx=null; _pendIdx=null; },
        renderParadoHtml(lim){ limParado = lim || 200; renderParado(); return { kpis: document.getElementById('kpisParado').innerHTML, table: document.getElementById('tblParado').innerHTML }; },
        setValue(id, v){ document.getElementById(id).value = v; },
        filtrarCompra(){ return filtrarCompra(); },
        bgStatus(a){ return bgStatus(a); },
        setBase(list){ baseCustom = list && list.length ? list : null; _mats=null; },
        analisarCom(est, cmp){ estoque=est; compras=cmp; _cmpIdx=null; _pendIdx=null; analisar(); return analysis; },
        importarBase(wb,nome){ return importarBase(wb,nome,true); },
        baseCustom(){ return baseCustom; },
        comprasIndex(list){ compras=list; _cmpIdx=null; _pendIdx=null; return comprasIndex(); } }
};
`;

export function createHtmlRuntime(): HtmlRuntime {
  const prepared = prepare(resolveHtmlPath());
  const sandbox: Record<string, unknown> = { console, __DEFAULTS: prepared.defaults };
  vm.createContext(sandbox);
  vm.runInContext(prepared.lib, sandbox, { filename: "sheetjs-embutida.js" });
  vm.runInContext(FAKE_DOM, sandbox, { filename: "fake-dom.js" });
  vm.runInContext(prepared.app + "\n" + HARNESS, sandbox, { filename: "Analise_MRP_Compacto.html#script" });

  const api = sandbox.__mrp as Any;
  // ArrayBuffer criado DENTRO do sandbox (instanceof/realm iguais aos do navegador).
  const makeU8 = vm.runInContext("(n) => new Uint8Array(n)", sandbox) as (n: number) => Uint8Array;
  const toAB = (data: Buffer | Uint8Array) => {
    const u8 = makeU8(data.byteLength);
    u8.set(data);
    return u8.buffer;
  };

  return {
    xlsxVersion: prepared.version,
    fn: api.fn,
    receber: (files) => api.receber(files.map((f) => ({ name: f.name, __ab: toAB(f.data) }))),
    arquivos: () => api.arquivos(),
    setDeposit: (v) => api.setDeposit(v),
    setDefaultArea: (v) => api.setDefaultArea(v),
    reatribuir: (k, d) => api.reatribuir(k, d),
    trocarAba: (k, s) => api.trocarAba(k, s),
    lock: () => api.lock(),
    processar: () => api.processar(),
    readWorkbook: (data) => api.readWorkbook(toAB(data))
  };
}
