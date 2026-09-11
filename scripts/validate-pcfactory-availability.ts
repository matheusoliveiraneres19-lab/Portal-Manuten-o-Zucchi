/**
 * Confere a Disponibilidade do portal contra o relatório oficial G0009/G0134.
 *
 *   npm run validate:pc-factory                      → invariantes sobre o banco
 *   npm run validate:pc-factory -- "<arquivo.csv>"   → + confronto com o oficial
 *
 * Só leitura: nenhuma linha é escrita.
 *
 * POR QUE DOIS MODOS
 * O G0134 de referência é de UMA extração (Zucchi, agosto/2026). O banco guarda o
 * que foi importado por último — hoje, jan–ago — e aí a janela de agosto inclui
 * pedaços de registros que começaram em julho, então os totais não são os mesmos
 * do relatório. Comparar o banco com o oficial mediria a diferença entre as duas
 * extrações, não a fórmula.
 *
 * Então: com o arquivo da MESMA extração do relatório, o confronto é exato. Sem
 * arquivo, o script verifica o que tem de valer sempre, em qualquer recorte.
 */
import fs from "fs";
import path from "path";
import type { PcFactoryPageData, PcFactoryQueryParams } from "../src/types/pc-factory";
import { readPcFactorySource, buildPcFactoryRecords } from "../src/services/importacao/pc-factory-import.service";
import { classifyAvailabilityBucket, maintenanceKind } from "../src/utils/pc-factory-normalizer";

// O service usa `cache()` do React para deduplicar a carga dentro de um render.
// Fora do Next essa função não existe, então aqui ela vira identidade.
const react = require("react") as { cache?: <T>(fn: T) => T };
if (typeof react.cache !== "function") react.cache = (fn) => fn;

// Importado só DEPOIS do shim: o módulo chama cache() ao ser carregado.
const { getPcFactoryPageData } = require("../src/services/pc-factory.service") as {
  getPcFactoryPageData: (params: PcFactoryQueryParams) => Promise<PcFactoryPageData>;
};

const AGOSTO: PcFactoryQueryParams = { startDate: "2026-08-01", endDate: "2026-08-31" };

/** G0134 oficial — Zucchi, agosto/2026. */
const OFICIAL = {
  totalHours: 30504.0,
  outOfShiftHours: 9160.42,
  unscheduledResourceHours: 10142.24,
  loadHours: 11201.34,
  setupPlannedStopHours: 1435.8,
  operationalHours: 9765.54,
  MECANICA: 641.04,
  AGUARDANDO: 231.17,
  PLANEJADA: 47.34,
  ELETRICA: 31.47,
  AUTOMACAO: 8.65,
  TERCEIROS: 5.34,
  maintenanceHours: 965.01,
  availabilityPercent: 90.12
};

/** As duas extrações diferem em ~0,4 h no total; 1,5 h cobre o arrasto disso. */
const TOL_HORAS = 1.5;
const TOL_PP = 0.05;

let falhas = 0;

function conferir(rotulo: string, obtido: number, esperado: number, tol: number, unidade: string) {
  const diff = obtido - esperado;
  const ok = Math.abs(diff) <= tol;
  if (!ok) falhas += 1;
  console.log(
    `  ${ok ? "✓" : "✗"} ${rotulo.padEnd(26)} ${obtido.toFixed(2).padStart(10)}${unidade}` +
      `  oficial ${esperado.toFixed(2).padStart(10)}${unidade}  dif ${diff.toFixed(2).padStart(7)}`
  );
}

/* -------------------------------------------------------------------------- */
/*  Modo 1 — confronto exato com o oficial, a partir do arquivo da extração    */
/* -------------------------------------------------------------------------- */

async function confrontarComOficial(arquivo: string) {
  const fileName = path.basename(arquivo);
  const read = readPcFactorySource(fs.readFileSync(arquivo), { fileName });
  const { records } = await buildPcFactoryRecords(read.rows, { fileName }, read.sheetUsed, new Map(), read.layoutType, read);

  let total = 0;
  let outOfShift = 0;
  let unscheduled = 0;
  let setup = 0;
  const manutencao: Record<string, number> = {};

  for (const record of records) {
    const hours = record.durationHours;
    total += hours;

    // As MESMAS funções que o dashboard usa — é isso que torna o teste válido.
    const bucket = classifyAvailabilityBucket({
      statusCode: record.statusCode,
      statusRaw: record.statusRaw,
      classificationRef: record.classificationRef
    });
    if (bucket === "FORA_DE_TURNO") outOfShift += hours;
    else if (bucket === "RECURSO_NAO_PROGRAMADO") unscheduled += hours;
    else if (bucket === "PARADA_PLANEJADA") setup += hours;

    const kind = maintenanceKind(record.statusRaw);
    if (kind) manutencao[kind] = (manutencao[kind] ?? 0) + hours;
  }

  const load = total - outOfShift - unscheduled;
  const operational = load - setup;
  const manutencaoTotal = Object.values(manutencao).reduce((a, b) => a + b, 0);

  console.log(`=== CONFRONTO COM O G0134 OFICIAL (${fileName}) ===`);
  conferir("Tempo Total", total, OFICIAL.totalHours, TOL_HORAS, " h");
  conferir("− Fora de Turno", outOfShift, OFICIAL.outOfShiftHours, TOL_HORAS, " h");
  conferir("− Recurso Não Programado", unscheduled, OFICIAL.unscheduledResourceHours, TOL_HORAS, " h");
  conferir("= Tempo de Carga", load, OFICIAL.loadHours, TOL_HORAS, " h");
  conferir("− Setup", setup, OFICIAL.setupPlannedStopHours, TOL_HORAS, " h");
  conferir("= Tempo Operacional", operational, OFICIAL.operationalHours, TOL_HORAS, " h");
  conferir("Manut. Mecânica", manutencao.MECANICA ?? 0, OFICIAL.MECANICA, TOL_HORAS, " h");
  conferir("Manut. Aguardando", manutencao.AGUARDANDO ?? 0, OFICIAL.AGUARDANDO, TOL_HORAS, " h");
  conferir("Manut. Planejada", manutencao.PLANEJADA ?? 0, OFICIAL.PLANEJADA, TOL_HORAS, " h");
  conferir("Manut. Elétrica", manutencao.ELETRICA ?? 0, OFICIAL.ELETRICA, TOL_HORAS, " h");
  conferir("Manut. Automação", manutencao.AUTOMACAO ?? 0, OFICIAL.AUTOMACAO, TOL_HORAS, " h");
  conferir("Manut. Terceiros", manutencao.TERCEIROS ?? 0, OFICIAL.TERCEIROS, TOL_HORAS, " h");
  conferir("Manutenção TOTAL", manutencaoTotal, OFICIAL.maintenanceHours, TOL_HORAS, " h");

  if (operational <= 0) {
    falhas += 1;
    console.log("  ✗ DISPONIBILIDADE — sem Tempo Operacional no arquivo.");
    return;
  }
  conferir("DISPONIBILIDADE", ((operational - manutencaoTotal) / operational) * 100, OFICIAL.availabilityPercent, TOL_PP, " %");
}

/* -------------------------------------------------------------------------- */
/*  Modo 2 — invariantes sobre o banco, em vários recortes                     */
/* -------------------------------------------------------------------------- */

/**
 * No modo oficial o banco PODE ser comparado com o relatório: os dois agrupam o
 * registro pelo período em que ele começou. O que sobra de diferença é entre as
 * extrações (a janela de agosto no banco tem ~15 h a mais que o export usado no
 * relatório), então as horas usam tolerância larga e o que se cobra de perto é a
 * disponibilidade e a manutenção.
 */
async function confrontarBancoNoModoOficial() {
  const a = (await getPcFactoryPageData({ ...AGOSTO, mode: "G0134_OFICIAL" })).dataQuality.availabilityAudit;
  console.log("=== BANCO NO MODO OFICIAL G0134 (agosto/2026) ===");
  conferir("Tempo Total", a.totalHours, OFICIAL.totalHours, 20, " h");
  conferir("= Tempo de Carga", a.loadHours, OFICIAL.loadHours, 20, " h");
  conferir("− Setup", a.setupPlannedStopHours, OFICIAL.setupPlannedStopHours, TOL_HORAS, " h");
  conferir("= Tempo Operacional", a.operationalHours, OFICIAL.operationalHours, 20, " h");
  conferir("Manutenção TOTAL", a.maintenanceHours, OFICIAL.maintenanceHours, TOL_HORAS, " h");
  if (a.availabilityPercent === null) {
    falhas += 1;
    console.log("  ✗ DISPONIBILIDADE veio null.");
    return;
  }
  conferir("DISPONIBILIDADE", a.availabilityPercent, OFICIAL.availabilityPercent, TOL_PP, " %");
}

async function verificarInvariantes() {
  const page = await getPcFactoryPageData(AGOSTO);
  const maquina = page.criticalResources[0]?.resourceName;

  const SEMANA = { startDate: "2026-08-04", endDate: "2026-08-10" };
  const recortes: Array<[string, PcFactoryQueryParams]> = [
    ["agosto/2026", AGOSTO],
    ["agosto (real)", { ...AGOSTO, mode: "INTERVALO_REAL" }],
    ["1 semana", SEMANA],
    ["1 semana (real)", { ...SEMANA, mode: "INTERVALO_REAL" }],
    ...(maquina
      ? ([
          ["1 máquina", { ...AGOSTO, resources: [maquina] }],
          ["máquina + semana", { ...SEMANA, resources: [maquina] }],
          ["máquina (real)", { ...AGOSTO, resources: [maquina], mode: "INTERVALO_REAL" }]
        ] as Array<[string, PcFactoryQueryParams]>)
      : [])
  ];

  console.log("=== INVARIANTES DA FÓRMULA (valem em qualquer recorte) ===");
  for (const [rotulo, params] of recortes) {
    const dados = rotulo === "agosto/2026" ? page : await getPcFactoryPageData(params);
    const a = dados.dataQuality.availabilityAudit;

    const somaSubtipos =
      a.maintenanceMechanicalHours +
      a.maintenanceElectricalHours +
      a.maintenanceAutomationHours +
      a.maintenancePlannedHours +
      a.maintenanceThirdPartyHours +
      a.maintenanceWaitingHours;

    // A tabela "Confiabilidade por Máquina" tem de fechar com a conta central:
    // a soma das Paradas de todas as máquinas é a Manutenção do recorte, e cada
    // linha usa o mesmo Tempo Operacional (Carga − Setup) da auditoria.
    const linhas = dados.reliabilityByMachine;
    const somaParadas = linhas.reduce((soma, linha) => soma + linha.downtimeHours, 0);
    const linhasFinitas = linhas.every((linha) =>
      [linha.mtbf, linha.mttr, linha.mtta, linha.availability].every((v) => v === null || Number.isFinite(v))
    );
    const mtbfCoerente = linhas.every(
      (linha) => linha.mtbf === null || linha.failureEvents <= 0 || linha.mtbf > 0
    );
    // Paradas = os SEIS subtipos, mas o MTTR é ESTRITAMENTE corretivo: a Planejada
    // entra nas Paradas e fica fora do MTTR. Se alguém somar a Planejada de volta ao
    // numerador do MTTR, esta checagem quebra.
    const paradasCompostas = linhas.every(
      (linha) =>
        Math.abs(
          linha.repairHours + linha.plannedMaintenanceHours + linha.waitingMaintenanceHours - linha.maintenanceDowntimeHours
        ) <= 0.05
    );
    const mttrCorretivo = linhas.every((linha) =>
      linha.repairHours > 0 && linha.failureEvents > 0
        ? linha.mttr !== null && Math.abs(linha.mttr - linha.repairHours / linha.failureEvents) <= 0.02
        : linha.mttr === null
    );
    const mttaSoAguardando = linhas.every((linha) =>
      linha.waitingMaintenanceHours > 0 && linha.failureEvents > 0
        ? linha.mtta !== null && Math.abs(linha.mtta - linha.waitingMaintenanceHours / linha.failureEvents) <= 0.02
        : linha.mtta === null
    );

    const checagens: Array<[string, boolean]> = [
      ["tabela: soma das Paradas = Manutenção do recorte", Math.abs(somaParadas - a.maintenanceHours) <= 0.05],
      ["tabela: sem NaN/Infinity em MTBF/MTTR/MTTA/Disponib.", linhasFinitas],
      ["tabela: MTBF positivo onde há quebras", mtbfCoerente],
      ["tabela: Paradas = corretiva + planejada + aguardando", paradasCompostas],
      ["tabela: MTTR = reparo corretivo / quebras (sem Planejada)", mttrCorretivo],
      ["tabela: MTTA = aguardando / quebras", mttaSoAguardando],
      ["Carga = Total − Fora de Turno − Não Programado", Math.abs(a.loadHours - (a.totalHours - a.outOfShiftHours - a.unscheduledResourceHours)) <= 0.05],
      ["Operacional = Carga − Setup", Math.abs(a.operationalHours - (a.loadHours - a.setupPlannedStopHours)) <= 0.05],
      ["Manutenção = soma dos 6 subtipos", Math.abs(somaSubtipos - a.maintenanceHours) <= 0.05],
      ["card Horas de Manutenção = fórmula", Math.abs(dados.kpis.maintenanceHours - a.maintenanceHours) <= 0.05],
      ["sem NaN/Infinity", a.availabilityPercent === null || Number.isFinite(a.availabilityPercent)],
      ["disponibilidade entre 0 e 100", a.availabilityPercent === null || (a.availabilityPercent >= 0 && a.availabilityPercent <= 100)]
    ];

    const todasOk = checagens.every(([, ok]) => ok);
    if (!todasOk) falhas += 1;
    console.log(
      `  ${todasOk ? "✓" : "✗"} ${rotulo.padEnd(18)} [${a.mode === "G0134_OFICIAL" ? "oficial" : "real   "}] disponibilidade ${a.availabilityPercent === null ? "null" : `${a.availabilityPercent.toFixed(2)}%`}` +
        ` | operacional ${a.operationalHours.toFixed(2)} h | manutenção ${a.maintenanceHours.toFixed(2)} h`
    );
    for (const [nome, ok] of checagens) if (!ok) console.log(`      ✗ ${nome}`);
  }

  const a = page.dataQuality.availabilityAudit;
  console.log("=== AGOSTO/2026 NO BANCO (cadeia completa) ===");
  console.log(`    Tempo Total ................. ${a.totalHours.toFixed(2)} h`);
  console.log(`  − Fora de Turno ............... ${a.outOfShiftHours.toFixed(2)} h`);
  console.log(`  − Recurso Não Programado ...... ${a.unscheduledResourceHours.toFixed(2)} h`);
  console.log(`  = Tempo de Carga .............. ${a.loadHours.toFixed(2)} h`);
  console.log(`  − Setup ....................... ${a.setupPlannedStopHours.toFixed(2)} h`);
  console.log(`  = Tempo Operacional ........... ${a.operationalHours.toFixed(2)} h`);
  console.log(`  − Manutenção .................. ${a.maintenanceHours.toFixed(2)} h`);
  console.log(`  = DISPONIBILIDADE ............. ${a.availabilityPercent === null ? "null" : `${a.availabilityPercent.toFixed(2)}%`}`);
  console.log(
    `    (ficam no Operacional, não subtraem: paradas não planejadas ${a.unplannedStopHours.toFixed(2)} h,` +
      ` produção ${a.productiveHours.toFixed(2)} h, não apontado ${a.notPointedHours.toFixed(2)} h)`
  );
}

async function main() {
  const arquivo = process.argv[2];
  if (arquivo) {
    if (!fs.existsSync(arquivo)) {
      console.error(`Arquivo não encontrado: ${arquivo}`);
      process.exitCode = 1;
      return;
    }
    await confrontarComOficial(arquivo);
    console.log("");
  }

  await confrontarBancoNoModoOficial();
  console.log("");
  await verificarInvariantes();

  console.log("");
  if (falhas > 0) {
    console.log(`✗ ${falhas} verificação(ões) falharam.`);
    process.exitCode = 1;
    return;
  }
  console.log("✓ Disponibilidade consistente com a regra do G0009/G0134.");
}

main().catch((error) => {
  console.error("Falha ao validar:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
