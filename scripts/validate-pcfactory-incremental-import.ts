/**
 * TESTE CRÍTICO da importação INCREMENTAL do PC-Factory.
 *
 *   npm run validate:pc-factory-incremental
 *   npm run validate:pc-factory-incremental -- --keep   (não limpa no fim)
 *
 * O QUE ESTE SCRIPT PROVA
 * -----------------------
 *   1. importar setembro NÃO apaga janeiro–agosto (contagem mês a mês idêntica);
 *   2. setembro entra na base e passa a aparecer no período disponível;
 *   3. reimportar o MESMO setembro não duplica (0 inseridos);
 *   4. REPLACE_PERIOD troca só setembro — jan–ago intactos e sem soma de v1+v2;
 *   5. recursos legados bloqueados continuam fora;
 *   6. as justificativas de disponibilidade sobrevivem a tudo isso;
 *   7. nenhuma outra tabela é tocada.
 *
 * COMO RODA SEM MEXER NA BASE REAL
 * --------------------------------
 * Os registros de teste são sintéticos e vivem num mês que a base não usa
 * (dezembro/2027, `TEST_MONTH`). Toda linha criada carrega `importBatch` com o
 * prefixo `TESTE-INCREMENTAL`, e a limpeza final apaga EXATAMENTE isso —
 * `deleteMany` com filtro, nunca global. A contagem real de jan–set é lida
 * antes e depois e precisa bater.
 *
 * O caminho exercitado é o de produção: `buildPcFactoryRecords` (as mesmas
 * regras de parser e bloqueio de legados) + `persistRecords` via
 * `importPcFactoryRecords`, e a lógica de período/duplicidade de
 * `pc-factory-staging.service`.
 */
import { ImportStatus, ImportType } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { buildPcFactoryRecordFingerprint } from "../src/utils/pc-factory-fingerprint";
import {
  buildPcFactoryRecords,
  importPcFactoryRecords
} from "../src/services/importacao/pc-factory-import.service";
import * as stagingService from "../src/services/importacao/pc-factory-staging.service";
import type { PcFactoryExcelRow } from "../src/types/pc-factory";

/** Mês sintético: fora de qualquer dado real da Zucchi. */
const TEST_YEAR = 2027;
const TEST_MONTH = 12;
const BATCH_PREFIX = "TESTE-INCREMENTAL";
const KEEP = process.argv.includes("--keep");

/** Uma das nomenclaturas legadas bloqueadas — precisa continuar fora da base. */
const LEGACY_RESOURCE = "Multifio3";

let falhas = 0;

function checar(rotulo: string, ok: boolean, detalhe = "") {
  if (!ok) falhas += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${rotulo}${detalhe ? `  — ${detalhe}` : ""}`);
}

/** Contagem por mês civil de startDateTime. */
async function countByMonth(): Promise<Record<string, number>> {
  const rows = await prisma.$queryRawUnsafe<Array<{ month: string | null; count: bigint }>>(
    `select to_char("startDateTime", 'YYYY-MM') as month, count(*)::bigint as count
       from "PcFactoryRecord" group by 1 order by 1`
  );
  const out: Record<string, number> = {};
  for (const row of rows) out[row.month ?? "(sem data)"] = Number(row.count);
  return out;
}

/**
 * Linhas no layout `Import_PC_FACTORY`, que é o que o parser de produção lê.
 * `day` e `count` variam para produzir eventos distintos e datados.
 */
function buildRows(params: {
  day: number;
  count: number;
  durationMinutes: number;
  includeLegacy?: boolean;
}): PcFactoryExcelRow[] {
  const rows: PcFactoryExcelRow[] = [];
  const pad = (n: number) => String(n).padStart(2, "0");

  for (let i = 0; i < params.count; i += 1) {
    const hour = pad(i % 24);
    const minute = pad((i * 7) % 60);
    const start = `${TEST_YEAR}-${pad(TEST_MONTH)}-${pad(params.day)}T${hour}:${minute}:00.000Z`;
    const end = new Date(new Date(start).getTime() + params.durationMinutes * 60_000).toISOString();

    // Nomes de campo do layout `Import_PC_FACTORY`, que é o que `parseRow` lê:
    // `status` (não statusRaw) e `startDate`/`endDate` (data+hora num campo só).
    rows.push({
      resourceName: `MAQ-TESTE-${pad(i % 5)}`,
      resourceCode: `T${pad(i % 5)}`,
      statusCode: "0201",
      status: "Manutenção Mecânica",
      startDate: start,
      endDate: end,
      durationMinutes: params.durationMinutes,
      orderNumber: `OP-${pad(params.day)}-${i}`,
      operationCode: `OPER-${i}`
    } as PcFactoryExcelRow);
  }

  if (params.includeLegacy) {
    const start = `${TEST_YEAR}-${pad(TEST_MONTH)}-${pad(params.day)}T23:00:00.000Z`;
    rows.push({
      resourceName: LEGACY_RESOURCE,
      statusCode: "0201",
      status: "Manutenção Mecânica",
      startDate: start,
      endDate: new Date(new Date(start).getTime() + 30 * 60_000).toISOString(),
      durationMinutes: 30,
      orderNumber: "OP-LEGADO"
    } as PcFactoryExcelRow);
  }

  return rows;
}

async function importar(rows: PcFactoryExcelRow[], label: string) {
  return importPcFactoryRecords(rows, {
    fileName: `${BATCH_PREFIX}-${label}.xlsx`,
    importedBy: BATCH_PREFIX,
    importBatch: `${BATCH_PREFIX}-${label}`
  });
}

/**
 * Monta uma importação REAL no staging (ImportHistory + ImportStagingRow) para
 * exercitar `finishPcFactoryImport` — o caminho que o portal usa e onde ficava
 * o `deleteMany({})` global. As linhas passam pelo parser de produção antes.
 */
async function criarStaging(rows: PcFactoryExcelRow[], label: string): Promise<string> {
  const { records } = await buildPcFactoryRecords(
    rows,
    { fileName: `${BATCH_PREFIX}-${label}.xlsx`, importBatch: `${BATCH_PREFIX}-${label}` },
    null,
    new Map(),
    "PC_FACTORY_IMPORT"
  );

  const history = await prisma.importHistory.create({
    data: {
      type: ImportType.PC_FACTORY,
      fileName: `${BATCH_PREFIX}-${label}.xlsx`,
      importedBy: BATCH_PREFIX,
      status: ImportStatus.EM_PROCESSAMENTO,
      stage: "VALIDATING",
      totalRows: records.length,
      validRows: records.length,
      startedAt: new Date()
    },
    select: { id: true }
  });

  await prisma.importStagingRow.createMany({
    data: records.map((record, i) => ({
      importHistoryId: history.id,
      module: ImportType.PC_FACTORY,
      rowNumber: i + 1,
      raw: {} as object,
      // Mesmo formato de `serializeRecord`: datas em ISO (JSONB não tem data).
      normalized: {
        ...record,
        startDateTime: record.startDateTime ? new Date(record.startDateTime as Date).toISOString() : null,
        endDateTime: record.endDateTime ? new Date(record.endDateTime as Date).toISOString() : null
      } as object,
      status: "VALID"
    }))
  });

  return history.id;
}

/** Apaga SOMENTE o que este script criou. Filtrado, nunca global. */
async function limpar(): Promise<number> {
  const { count } = await prisma.pcFactoryRecord.deleteMany({
    where: { importBatch: { startsWith: BATCH_PREFIX } }
  });
  await prisma.importHistory.deleteMany({ where: { importedBy: BATCH_PREFIX } });
  return count;
}

async function main() {
  console.log("\nIMPORTAÇÃO INCREMENTAL DO PC-FACTORY — teste crítico\n");

  // Restos de uma execução interrompida.
  await limpar();

  /* ---- ANTES: retrato do histórico real ---------------------------------- */
  const antes = await countByMonth();
  const totalAntes = await prisma.pcFactoryRecord.count();
  const mesesReais = Object.keys(antes).filter((m) => m.startsWith("2026-")).sort();
  const janAgoAntes = mesesReais
    .filter((m) => m >= "2026-01" && m <= "2026-08")
    .reduce((sum, m) => sum + antes[m], 0);

  console.log("  ANTES");
  for (const m of mesesReais) console.log(`    ${m}: ${antes[m].toLocaleString("pt-BR")}`);
  console.log(`    Jan–Ago: ${janAgoAntes.toLocaleString("pt-BR")}  |  TOTAL: ${totalAntes.toLocaleString("pt-BR")}\n`);

  const notasAntes = await prisma.pcFactoryAvailabilityNote.count();

  try {
    /* ---- 1. importar "setembro" (o mês sintético) ------------------------ */
    const v1 = await importar(buildRows({ day: 5, count: 40, durationMinutes: 30, includeLegacy: true }), "v1");

    const depoisV1 = await countByMonth();
    const janAgoDepoisV1 = mesesReais
      .filter((m) => m >= "2026-01" && m <= "2026-08")
      .reduce((sum, m) => sum + (depoisV1[m] ?? 0), 0);

    checar(
      "Jan–Ago INALTERADO após importar o mês novo",
      janAgoDepoisV1 === janAgoAntes,
      `${janAgoAntes.toLocaleString("pt-BR")} → ${janAgoDepoisV1.toLocaleString("pt-BR")}`
    );
    checar(
      "cada mês de 2026 manteve a contagem exata",
      mesesReais.every((m) => antes[m] === depoisV1[m]),
      mesesReais.map((m) => `${m}:${antes[m]}→${depoisV1[m] ?? 0}`).join(" ")
    );
    checar("registros históricos removidos = 0", v1.replacedRows === 0, `replacedRows=${v1.replacedRows}`);

    const testKey = `${TEST_YEAR}-${String(TEST_MONTH).padStart(2, "0")}`;
    checar(
      "o mês novo aparece na base",
      (depoisV1[testKey] ?? 0) > 0,
      `${testKey}: ${(depoisV1[testKey] ?? 0).toLocaleString("pt-BR")} registro(s)`
    );
    checar("40 registros inseridos", v1.createdRows === 40, `createdRows=${v1.createdRows}`);

    /* ---- 2. recurso legado continua bloqueado ---------------------------- */
    const legado = await prisma.pcFactoryRecord.count({ where: { resourceName: LEGACY_RESOURCE } });
    checar("recurso legado NÃO foi reintroduzido", legado === 0, `${LEGACY_RESOURCE}: ${legado}`);

    /* ---- 3. reimportar o MESMO arquivo não duplica ----------------------- */
    const contagemAposV1 = await prisma.pcFactoryRecord.count();
    const v1bis = await importar(
      buildRows({ day: 5, count: 40, durationMinutes: 30, includeLegacy: true }),
      "v1"
    );
    const contagemAposV1bis = await prisma.pcFactoryRecord.count();

    checar(
      "reimportar o mesmo arquivo NÃO duplica",
      contagemAposV1bis === contagemAposV1,
      `${contagemAposV1.toLocaleString("pt-BR")} → ${contagemAposV1bis.toLocaleString("pt-BR")}`
    );
    checar(
      "a reimportação reconhece os registros existentes",
      v1bis.createdRows === 0 && v1bis.updatedRows === 40,
      `criados=${v1bis.createdRows} reconhecidos=${v1bis.updatedRows}`
    );

    /* ---- 4. fingerprint é estável entre execuções ------------------------ */
    const amostra = await prisma.pcFactoryRecord.findFirst({
      where: { importBatch: { startsWith: BATCH_PREFIX } },
      select: {
        fingerprint: true,
        resourceName: true,
        resourceCode: true,
        statusCode: true,
        statusRaw: true,
        startDateTime: true,
        endDateTime: true,
        durationMinutes: true,
        orderNumber: true,
        operationCode: true
      }
    });
    checar(
      "fingerprint recalculada bate com a gravada",
      Boolean(amostra) && amostra!.fingerprint === buildPcFactoryRecordFingerprint({ ...amostra!, occurrence: 0 }),
      amostra?.fingerprint?.slice(0, 12) ?? "-"
    );

    /* ---- 5. FLUXO DE STAGING (o caminho de produção) --------------------- */
    // É AQUI que vivia o `deleteMany({})` global. O teste passa pelo mesmo
    // `finishPcFactoryImport` que o portal chama, com staging de verdade.

    // 5a) INCREMENTAL sobre um mês já carregado: não pode inserir nem remover.
    const stagingIncremental = await criarStaging(
      buildRows({ day: 5, count: 40, durationMinutes: 30 }),
      "staging-incremental"
    );
    const rIncremental = await stagingService.finishPcFactoryImport({ importId: stagingIncremental });

    const depoisStaging = await countByMonth();
    const janAgoStaging = mesesReais
      .filter((m) => m >= "2026-01" && m <= "2026-08")
      .reduce((sum, m) => sum + (depoisStaging[m] ?? 0), 0);

    checar(
      "STAGING/INCREMENTAL: Jan–Ago intacto",
      janAgoStaging === janAgoAntes,
      `${janAgoAntes.toLocaleString("pt-BR")} → ${janAgoStaging.toLocaleString("pt-BR")}`
    );
    checar(
      "STAGING/INCREMENTAL: 0 removidos, 0 inseridos (tudo já existia)",
      rIncremental.replacedRows === 0 && rIncremental.appliedRows === 0 && rIncremental.duplicateRows === 40,
      `inseridos=${rIncremental.appliedRows} duplicados=${rIncremental.duplicateRows} removidos=${rIncremental.replacedRows}`
    );
    checar(
      "STAGING: período detectado corretamente",
      rIncremental.period.months.length === 1 && rIncremental.period.months[0] === testKey,
      `meses=${rIncremental.period.months.join(",")} singleMonth=${rIncremental.period.singleMonth}`
    );

    // 5b) REPLACE_PERIOD com a v2: 25 eventos em OUTRO DIA do mesmo mês e com
    //     outra duração — ou seja, fingerprints novas e nenhuma sobreposição
    //     com as linhas da v1. Em INCREMENTAL isso somaria 40+25.
    //
    //     O dia diferente é de propósito: é o caso real do arquivo corrigido,
    //     que quase nunca tem a mesma primeira/última linha do anterior. A
    //     janela de substituição é o MÊS CIVIL (ver resolveReplacementWindow),
    //     então a v1 sai inteira mesmo estando em outro dia. Se a janela fosse
    //     o min/max das linhas, sobrariam os 40 registros errados da v1.
    const stagingReplace = await criarStaging(
      buildRows({ day: 9, count: 25, durationMinutes: 45 }),
      "staging-replace"
    );
    const preview = await stagingService.previewPcFactoryImport(stagingReplace);
    checar(
      "PRÉVIA avisa que o período já tem dados",
      preview.existingInPeriod === 40 && preview.suggestedMode === "REPLACE_PERIOD",
      `existentesNoPeriodo=${preview.existingInPeriod} sugestão=${preview.suggestedMode} novos=${preview.newRecords}`
    );

    const rReplace = await stagingService.finishPcFactoryImport({
      importId: stagingReplace,
      mode: "REPLACE_PERIOD"
    });

    const depoisV2 = await countByMonth();
    const janAgoDepoisV2 = mesesReais
      .filter((m) => m >= "2026-01" && m <= "2026-08")
      .reduce((sum, m) => sum + (depoisV2[m] ?? 0), 0);

    checar(
      "REPLACE_PERIOD manteve Jan–Ago intacto",
      janAgoDepoisV2 === janAgoAntes,
      `${janAgoAntes.toLocaleString("pt-BR")} → ${janAgoDepoisV2.toLocaleString("pt-BR")}`
    );
    checar(
      "REPLACE_PERIOD deixou só a v2 (não v1+v2)",
      (depoisV2[testKey] ?? 0) === 25,
      `${testKey}: ${depoisV2[testKey] ?? 0} (removidos ${rReplace.replacedRows}, inseridos ${rReplace.appliedRows})`
    );

    /* ---- 6. justificativas e outras tabelas intactas --------------------- */
    const notasDepois = await prisma.pcFactoryAvailabilityNote.count();
    checar(
      "justificativas de disponibilidade preservadas",
      notasDepois === notasAntes,
      `${notasAntes} → ${notasDepois}`
    );
  } finally {
    if (KEEP) {
      console.log("\n  (--keep: registros de teste MANTIDOS na base)");
    } else {
      const removidas = await limpar();
      console.log(`\n  (limpeza: ${removidas} registro(s) de teste removido(s))`);
    }

    /* ---- DEPOIS: o histórico real tem de estar idêntico ------------------ */
    const depois = await countByMonth();
    const totalDepois = await prisma.pcFactoryRecord.count();
    const janAgoDepois = mesesReais
      .filter((m) => m >= "2026-01" && m <= "2026-08")
      .reduce((sum, m) => sum + (depois[m] ?? 0), 0);

    console.log("\n  DEPOIS");
    for (const m of mesesReais) {
      const igual = antes[m] === depois[m];
      console.log(`    ${m}: ${(depois[m] ?? 0).toLocaleString("pt-BR")} ${igual ? "=" : `✗ (era ${antes[m]})`}`);
    }
    console.log(`    Jan–Ago: ${janAgoDepois.toLocaleString("pt-BR")}  |  TOTAL: ${totalDepois.toLocaleString("pt-BR")}`);

    checar(
      "\n  REGISTROS HISTÓRICOS REMOVIDOS: 0",
      !KEEP && totalDepois === totalAntes,
      `${totalAntes.toLocaleString("pt-BR")} → ${totalDepois.toLocaleString("pt-BR")}`
    );

    await prisma.$disconnect();
  }

  console.log(falhas === 0 ? "\nTODAS AS VERIFICAÇÕES PASSARAM.\n" : `\n${falhas} VERIFICAÇÃO(ÕES) FALHARAM.\n`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
