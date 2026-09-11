/**
 * Diagnóstico de um arquivo do PC-Factory, sem tocar no banco.
 *
 *   npm run debug:pc-factory -- "C:/caminho/G0015_2026-01_a_2026-08.xlsx"
 *
 * Responde, em ordem, as perguntas que aparecem quando uma importação falha:
 * quais abas o arquivo tem, se o sheetjs conseguiu montar cada uma, quantas
 * células de data vazias foram reparadas, qual layout saiu e o que as regras
 * oficiais produzem. Use ANTES de mexer em código — na maioria das vezes o
 * arquivo responde sozinho.
 *
 * O arquivo analisado NÃO entra no repositório: passe o caminho por argumento.
 */
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import {
  buildLayoutDiagnostic,
  buildPcFactoryRecords,
  readPcFactorySource,
  repairWorkbookBuffer
} from "../src/services/importacao/pc-factory-import.service";

/** Conta as células que derrubam o parse: tipadas como data com `<v>` vazio. */
function countEmptyDateCells(buffer: Buffer): number {
  const container = XLSX.CFB.read(buffer, { type: "buffer" });
  let found = 0;

  for (const entry of container.FileIndex) {
    if (!/sheet\d*\.xml$/i.test(entry.name) || !entry.content || !entry.size) continue;
    const xml = Buffer.from(entry.content).toString("utf8");
    const cells = xml.match(/<c\b[^>]*\bt="d"[^>]*>(?:(?!<\/c>)[\s\S])*?<\/c>/g) ?? [];
    found += cells.filter((cell) => /<v\s*\/>|<v>\s*<\/v>/.test(cell) || !/<v/.test(cell)).length;
  }
  return found;
}

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('Informe o arquivo: npm run debug:pc-factory -- "C:/caminho/arquivo.xlsx"');
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(target)) {
    console.error(`Arquivo não encontrado: ${target}`);
    process.exitCode = 1;
    return;
  }

  const fileName = path.basename(target);
  const buffer = fs.readFileSync(target);
  const isXlsx = /\.(xlsx|xlsm|xls)$/i.test(fileName);

  console.log("=== ARQUIVO ===");
  console.log(`  nome .................. ${fileName}`);
  console.log(`  tamanho ............... ${(buffer.length / 1048576).toFixed(2)} MB`);

  // Estado CRU, antes de qualquer reparo: é aqui que se vê a aba que o sheetjs
  // lista em SheetNames mas não entrega em Sheets.
  if (isXlsx) {
    const raw = XLSX.read(buffer, { type: "buffer", cellDates: false });
    const missing = raw.SheetNames.filter((name) => !raw.Sheets[name]);

    console.log("=== LEITURA CRUA (sem reparo) ===");
    console.log(`  SheetNames ............ ${JSON.stringify(raw.SheetNames)}`);
    console.log(`  abas sem conteúdo ..... ${missing.length ? JSON.stringify(missing) : "(nenhuma)"}`);
    console.log(`  células de data vazias  ${countEmptyDateCells(buffer)}`);

    if (missing.length > 0) {
      const repair = repairWorkbookBuffer(buffer);
      console.log(
        repair
          ? `  reparo ................ ${repair.repaired} célula(s) neutralizada(s)`
          : "  reparo ................ nada a reparar (o problema é outro)"
      );
    }
  }

  const read = readPcFactorySource(buffer, { fileName });
  console.log("=== LEITURA OFICIAL ===");
  console.log(`  lido como ............. ${read.readAs}${read.readAs === "csv" ? ` (separador "${read.delimiterUsed}")` : ""}`);
  console.log(`  abas do arquivo ....... ${read.sheetNames.length ? read.sheetNames.join(", ") : "(n/a — CSV)"}`);
  console.log(`  aba usada ............. ${read.sheetUsed ?? "(n/a)"}`);
  console.log(`  células reparadas ..... ${read.repairedCells}`);
  console.log(`  layout ................ ${read.layoutType}`);
  console.log(`  linhas ................ ${read.rows.length.toLocaleString("pt-BR")}`);
  console.log(`  colunas (${read.headers.length}) .......... ${read.headers.join(", ")}`);

  if (read.layoutType === "UNKNOWN") {
    console.log("=== LAYOUT NÃO RECONHECIDO ===");
    console.log(buildLayoutDiagnostic(read, { fileName }));
    process.exitCode = 1;
    return;
  }

  // Sem cores de status (Map vazio): o custo aqui é do exceljs e não muda nada
  // no diagnóstico. As regras abaixo são as MESMAS da importação real.
  const { records, result } = await buildPcFactoryRecords(
    read.rows,
    { fileName },
    read.sheetUsed,
    new Map(),
    read.layoutType,
    read
  );

  const naoFinito = records.filter((record) => !Number.isFinite(record.durationHours)).length;

  console.log("=== REGRAS OFICIAIS ===");
  console.log(`  registros válidos ..... ${records.length.toLocaleString("pt-BR")}`);
  console.log(`  ignoradas / com erro .. ${result.ignoredRows} / ${result.errorRows}`);
  console.log(`  máquinas / status ..... ${result.resourcesDetected} / ${result.statusDetected.length}`);
  console.log(`  período ............... ${result.periodDetected.start} → ${result.periodDetected.end}`);
  console.log(`  duração total ......... ${result.totalHours.toFixed(2)} h`);
  console.log(`  fim inválido / deduzido ${result.invalidEndDatesCount} / ${result.derivedEndDatesCount}`);
  console.log(`  intervalos multi-mês .. ${result.multiMonthIntervals}`);
  console.log(`  original × segmentado . ${result.originalVsSegmentedDifference.toFixed(4)} h`);
  console.log(`  durationHours NaN/Inf . ${naoFinito}`);

  // O limite de 0,01 h é a mesma trava que a auditoria mostra no modal.
  if (result.originalVsSegmentedDifference > 0.01) {
    console.log("✗ Segmentação divergiu do total original acima de 0,01 h.");
    process.exitCode = 1;
    return;
  }
  console.log("✓ Arquivo válido para importação.");
}

main().catch((error) => {
  console.error("Falha ao diagnosticar o arquivo:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
