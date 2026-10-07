/**
 * Carrega o HTML de referência `Analise_MRP_Compacto (1).html` e executa o
 * PRÓPRIO código dele (num sandbox `vm`) — para que os scripts de validação da
 * Análise MRP comparem o Portal com a fonte de verdade, e não com uma cópia.
 *
 * O HTML NÃO faz parte do repositório (1,6 MB, SheetJS em base64). Caminho:
 *   --html="C:\...\Analise_MRP_Compacto (1).html"   ou   env MRP_HTML_REF
 * Na ausência, usa a pasta do OneDrive da Manutenção.
 *
 * Só para scripts. Nunca importar em src/ (o HTML não vai para o frontend).
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";

const DEFAULT_HTML_PATH = join(
  homedir(),
  "OneDrive - granitozucchi.com.br",
  "Manutenção - Documentos Manutenção",
  "Restrito",
  "Manutenção",
  "MRP Sap novo",
  "Analise_MRP_Compacto (1).html"
);

export const HTML_FILE_NAME = "Analise_MRP_Compacto (1).html";

export function resolveHtmlPath(): string {
  const fromArg = process.argv.find((a) => a.startsWith("--html="))?.slice(7);
  const path = fromArg || process.env.MRP_HTML_REF || DEFAULT_HTML_PATH;
  if (!existsSync(path)) {
    throw new Error(`HTML de referência não encontrado: ${path}. Informe --html="..." ou MRP_HTML_REF.`);
  }
  return path;
}

/** Linhas cruas da base embutida, exatamente como no HTML. */
export type HtmlSeedRow = (string | number | null)[];

export type HtmlReferenceMaterial = {
  codigo: string;
  descricao: string;
  grupo: string;
  min: number;
  max: number;
  um: string;
  statusMrp: string;
  familia: string;
  area: string;
};

export type HtmlReference = {
  path: string;
  seedMan: HtmlSeedRow[];
  seedEle: HtmlSeedRow[];
  /** Funções ORIGINAIS do HTML, executadas no sandbox. */
  fn: {
    norm: (v: unknown) => string;
    cleanCode: (v: unknown) => string;
    cleanText: (v: unknown) => string;
    parseNum: (v: unknown) => number;
    famDe: (v: unknown) => string;
    isSemMovTxt: (v: unknown) => boolean;
    materiais: () => HtmlReferenceMaterial[];
  };
};

function extractSeed(html: string, name: "SEED_MAN" | "SEED_ELE"): { line: string; rows: HtmlSeedRow[] } {
  const line = html.split("\n").find((l) => l.startsWith(`const ${name}=`));
  if (!line) throw new Error(`${name} não encontrado no HTML.`);
  const json = line.slice(`const ${name}=`.length).replace(/;\s*$/, "");
  // A base embutida é JSON puro (strings, números, null) — parse sem eval.
  return { line, rows: JSON.parse(json) as HtmlSeedRow[] };
}

/**
 * Bloco de código do HTML entre "UTILITÁRIOS" e "ESTADO": norm, cleanCode,
 * cleanText, parseNum, parseData, famDe, isSemMovTxt e materiais().
 */
function extractUtilities(html: string): string {
  const start = html.indexOf("const nf = new Intl.NumberFormat");
  const endMarker = html.indexOf("ESTADO\n", start);
  if (start < 0 || endMarker < 0) throw new Error("Bloco de utilitários não encontrado no HTML.");
  const end = html.lastIndexOf("/*", endMarker);
  return html.slice(start, end);
}

export function loadHtmlReference(): HtmlReference {
  const path = resolveHtmlPath();
  const html = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  const man = extractSeed(html, "SEED_MAN");
  const ele = extractSeed(html, "SEED_ELE");
  const code = [
    man.line,
    ele.line,
    extractUtilities(html),
    "globalThis.__ref = { norm, cleanCode, cleanText, parseNum, famDe, isSemMovTxt, materiais };"
  ].join("\n");

  const sandbox: Record<string, unknown> = { Intl, String, Number, Math, Date, Map, Object, isFinite, parseFloat };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "Analise_MRP_Compacto.html#script" });

  return {
    path,
    seedMan: man.rows,
    seedEle: ele.rows,
    fn: sandbox.__ref as HtmlReference["fn"]
  };
}
