/**
 * TESTE FUNCIONAL — Ordens de Serviço vinculadas à justificativa de baixa
 * disponibilidade do PC-Factory.
 *
 *   npm run validate:pc-factory-note-os
 *   npm run validate:pc-factory-note-os -- --machine="Multifio 04 - BM"
 *
 * Roteiro (setembro/2026):
 *   1. buscar OS reais da máquina (autocomplete) e vincular UMA;
 *   2. reconsultar (equivale ao F5) — o vínculo continua, apontando para a OS real;
 *   3. vincular uma SEGUNDA — as duas permanecem;
 *   4. remover a primeira — só o VÍNCULO some; a ServiceOrder fica bit a bit igual;
 *   5. número inexistente é recusado ("não encontrada na base atual") sem gravar nada;
 *   6. agosto/2026 não enxerga as OS de setembro (sem mistura entre períodos);
 *   7. Horas de Parada, Tempo Total, Disponibilidade, MTBF, MTTR e MTTA idênticos.
 *
 * ESCREVE NO BANCO só em PcFactoryAvailabilityNote / PcFactoryAvailabilityNoteServiceOrder
 * e apaga o que criou. Só usa janela LIVRE (sem justificativa da gestão) — nunca
 * edita texto de um gestor (ver o incidente registrado em
 * validate-pcfactory-availability-notes.ts).
 */
import type { PcFactoryPageData, PcFactoryQueryParams, PcFactoryReliabilityRow } from "../src/types/pc-factory";
import { normalizeMachineName } from "../src/utils/technical-object-normalizer";

// O service do PC-Factory usa `cache()` do React; fora do Next ele não existe.
const react = require("react") as { cache?: <T>(fn: T) => T };
if (typeof react.cache !== "function") react.cache = (fn) => fn;

const { getPcFactoryPageData } = require("../src/services/pc-factory.service") as {
  getPcFactoryPageData: (params: PcFactoryQueryParams) => Promise<PcFactoryPageData>;
};
const notes = require("../src/services/pc-factory-availability-notes.service") as typeof import("../src/services/pc-factory-availability-notes.service");
const lookup = require("../src/services/service-order-lookup.service") as typeof import("../src/services/service-order-lookup.service");
const { prisma } = require("../src/lib/prisma") as typeof import("../src/lib/prisma");

const SETEMBRO: PcFactoryQueryParams = { startDate: "2026-09-01", endDate: "2026-09-30" };
const AGOSTO: PcFactoryQueryParams = { startDate: "2026-08-01", endDate: "2026-08-31" };
const AUTOR = { id: "script-validacao-os", name: "Script de validação (OS)" };

let falhas = 0;
function checar(rotulo: string, ok: boolean, detalhe = "") {
  if (!ok) falhas += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${rotulo}${detalhe ? `  — ${detalhe}` : ""}`);
}

function arg(name: string): string | undefined {
  const found = process.argv.slice(2).find((value) => value.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : undefined;
}

/** Todos os números que um vínculo de OS jamais pode mexer. */
function numeros(row: PcFactoryReliabilityRow | undefined) {
  return row
    ? JSON.stringify({
        downtimeHours: row.downtimeHours,
        periodHours: row.periodHours,
        availability: row.availability,
        mtbf: row.mtbf,
        mttr: row.mttr,
        mtta: row.mtta
      })
    : "ausente";
}

/** Retrato das linhas de uma OS na tabela ServiceOrder (para provar que nada mudou). */
async function retratoOS(osNumber: string) {
  const rows = await prisma.serviceOrder.findMany({ where: { osNumber }, orderBy: { operationCode: "asc" } });
  return JSON.stringify(rows);
}

async function main() {
  console.log("\nOS VINCULADAS À JUSTIFICATIVA — teste funcional\n");
  const pedida = (arg("machine") ?? "Multifio 04 - BM").toLowerCase();

  const antes = await getPcFactoryPageData(SETEMBRO);
  const alvo = antes.reliabilityByMachine.find(
    (row) => row.machineName.toLowerCase() === pedida || (normalizeMachineName(row.machineName) || "").toLowerCase() === pedida
  );
  if (!alvo) {
    console.log(`  ! Máquina "${pedida}" sem dados em setembro/2026.`);
    process.exitCode = 1;
    return;
  }
  const machine = alvo.machineName;
  const start = new Date(`${SETEMBRO.startDate}T00:00:00.000Z`);
  const end = new Date(`${SETEMBRO.endDate}T00:00:00.000Z`);

  const ocupada = await prisma.pcFactoryAvailabilityNote.findUnique({
    where: { resourceName_periodStart_periodEnd: { resourceName: machine, periodStart: start, periodEnd: end } }
  });
  if (ocupada) {
    console.log(`  ! Já existe justificativa da gestão para ${machine} em setembro/2026 — o teste não escreve por cima. Abortado.`);
    process.exitCode = 1;
    return;
  }
  console.log(`  Máquina: ${machine} · Período: 01/09/2026 a 30/09/2026 (janela livre)\n`);

  const busca = await lookup.searchServiceOrders({ machine, dateFrom: SETEMBRO.startDate, dateTo: SETEMBRO.endDate, scope: "machine", limit: 10 });
  checar(`busca encontra OS reais da máquina (${busca.items.length}) · TAG ${busca.machineTags.join(", ")}`, busca.items.length >= 2);
  checar("sugestões priorizam mesma máquina", busca.items.every((item) => item.sameMachine));
  const [os1, os2] = busca.items;
  if (!os1 || !os2) {
    process.exitCode = 1;
    return;
  }
  const retrato1 = await retratoOS(os1.osNumber);
  const retrato2 = await retratoOS(os2.osNumber);
  const base = {
    resourceName: machine,
    resourceCode: alvo.machineCode,
    periodStart: SETEMBRO.startDate!,
    periodEnd: SETEMBRO.endDate!,
    cause: "Teste automatizado — motivo",
    reason: "Teste automatizado de vínculo de OS. Será apagado ao final."
  };

  let noteId: string | null = null;
  try {
    // 1. Vincular UMA OS.
    const r1 = await notes.saveAvailabilityNote({ ...base, serviceOrderNumbers: [os1.osNumber] }, AUTOR);
    noteId = r1.note.id;
    checar(`vincula 1 OS (${os1.osNumber})`, r1.note.serviceOrders.length === 1 && r1.linkChanges.added[0] === os1.osNumber);

    // 2. "F5": relê do banco.
    let periodo = await notes.listAvailabilityNotesForPeriod(SETEMBRO.startDate!, SETEMBRO.endDate!);
    let nota = periodo.find((n) => n.resourceName === machine);
    const link1 = nota?.serviceOrders[0];
    const ref = link1?.serviceOrderId
      ? await prisma.serviceOrder.findUnique({ where: { id: link1.serviceOrderId }, select: { osNumber: true } })
      : null;
    checar("após recarregar, o vínculo continua", nota?.serviceOrders.length === 1 && link1?.osNumber === os1.osNumber);
    checar("vínculo aponta para a ServiceOrder real (serviceOrderId → mesmo osNumber)", ref?.osNumber === os1.osNumber);
    checar("dados da OS lidos da base, não copiados", link1?.found === true && link1.title === os1.title);
    checar("Motivo gravado separado da Justificativa", nota?.cause === base.cause && nota?.reason === base.reason);

    // 3. Segunda OS.
    const r2 = await notes.saveAvailabilityNote({ ...base, serviceOrderNumbers: [os1.osNumber, os2.osNumber] }, AUTOR);
    checar(`vincula a 2ª OS (${os2.osNumber}) — as duas permanecem`, r2.note.serviceOrders.length === 2 && r2.linkChanges.added.join() === os2.osNumber);
    periodo = await notes.listAvailabilityNotesForPeriod(SETEMBRO.startDate!, SETEMBRO.endDate!);
    nota = periodo.find((n) => n.resourceName === machine);
    checar("após recarregar, 2 OS vinculadas", nota?.serviceOrders.map((o) => o.osNumber).sort().join() === [os1.osNumber, os2.osNumber].sort().join());

    // 4. Remover a primeira: só o vínculo.
    const r3 = await notes.saveAvailabilityNote({ ...base, serviceOrderNumbers: [os2.osNumber] }, AUTOR);
    checar("remove só o vínculo da 1ª", r3.note.serviceOrders.length === 1 && r3.linkChanges.removed.join() === os1.osNumber);
    checar("ServiceOrder da OS desvinculada intacta (todas as operações, bit a bit)", (await retratoOS(os1.osNumber)) === retrato1);
    checar("ServiceOrder da OS ainda vinculada intacta", (await retratoOS(os2.osNumber)) === retrato2);

    // 5. Número inexistente.
    let recusada = "";
    try {
      await notes.saveAvailabilityNote({ ...base, serviceOrderNumbers: [os2.osNumber, "999999999"] }, AUTOR);
    } catch (error) {
      recusada = error instanceof Error ? error.message : String(error);
    }
    checar("OS inexistente recusada", /não encontrada na base atual/i.test(recusada), recusada);
    periodo = await notes.listAvailabilityNotesForPeriod(SETEMBRO.startDate!, SETEMBRO.endDate!);
    nota = periodo.find((n) => n.resourceName === machine);
    checar("recusa não gravou nada (continua só a 2ª)", nota?.serviceOrders.map((o) => o.osNumber).join() === os2.osNumber);

    // 6. Outro período não enxerga estas OS.
    const agosto = await notes.listAvailabilityNotesForPeriod(AGOSTO.startDate!, AGOSTO.endDate!);
    const agostoOS = agosto.flatMap((n) => (n.resourceName === machine ? n.serviceOrders.map((o) => o.osNumber) : []));
    checar("agosto não mostra as OS de setembro", !agostoOS.includes(os1.osNumber) && !agostoOS.includes(os2.osNumber));

    // 7. Nenhum cálculo mudou.
    const depois = await getPcFactoryPageData(SETEMBRO);
    const linhaDepois = depois.reliabilityByMachine.find((row) => row.machineName === machine);
    checar("Horas de Parada, Tempo Total, Disponibilidade, MTBF, MTTR, MTTA idênticos", numeros(alvo) === numeros(linhaDepois), numeros(linhaDepois));
    checar("KPIs gerais idênticos", JSON.stringify(antes.kpis) === JSON.stringify(depois.kpis));
  } finally {
    if (noteId) {
      const links = await prisma.pcFactoryAvailabilityNoteServiceOrder.deleteMany({ where: { availabilityNoteId: noteId } });
      await prisma.pcFactoryAvailabilityNote.deleteMany({ where: { id: noteId, createdById: AUTOR.id } });
      console.log(`\n  Limpeza: nota de teste e ${links.count} vínculo(s) removidos.`);
    }
    checar("ServiceOrder intactas após a limpeza", (await retratoOS(os1.osNumber)) === retrato1 && (await retratoOS(os2.osNumber)) === retrato2);
  }

  console.log(falhas === 0 ? "\nTODOS OS PASSOS PASSARAM" : `\n${falhas} FALHA(S)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
