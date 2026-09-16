/**
 * LIMPEZA DAS NOMENCLATURAS LEGADAS DO PC-FACTORY.
 *
 *   npm run cleanup:pc-factory-legacy -- --dry-run    (só relatório; padrão)
 *   npm run cleanup:pc-factory-legacy -- --confirm    (grava backup e EXCLUI)
 *
 * Sem `--confirm` nada é apagado — a exclusão é definitiva e não pode depender de
 * um comando digitado por engano.
 *
 * O QUE ELE FAZ, NESTA ORDEM
 *  1. casa as nomenclaturas da lista contra os nomes reais da base (só trim/caixa,
 *     ver src/config/pc-factory-excluded-resources.ts — nenhum casamento aproximado);
 *  2. imprime o relatório pré-delete por recurso: registros, horas e período;
 *  3. grava o backup JSON dos registros que serão removidos, FORA do repositório;
 *  4. mede os indicadores ANTES;
 *  5. exclui em transação, só os ids do backup;
 *  6. mede os indicadores DEPOIS e confirma COUNT = 0 por nome;
 *  7. registra a operação em AuditLog.
 *
 * O backup vai para a pasta do sistema (TEMP/local app data), nunca para dentro do
 * projeto: são dados de produção e não podem entrar no Git por descuido.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import {
  PC_FACTORY_BLOCKED_LEGACY_RESOURCES,
  isBlockedLegacyPcFactoryResource,
  matchBlockedLegacyResource
} from "../src/config/pc-factory-excluded-resources";

const prisma = new PrismaClient();

/** Colunas levadas para o backup — tudo que identifica e reconstrói a linha. */
const backupSelect = {
  id: true,
  resourceCode: true,
  resourceName: true,
  statusRaw: true,
  statusCode: true,
  statusCategory: true,
  availabilityBucket: true,
  maintenanceType: true,
  startDateTime: true,
  endDateTime: true,
  durationMinutes: true,
  durationHours: true,
  realDurationMinutes: true,
  realDurationHours: true,
  operatorName: true,
  initialResponsible: true,
  finalResponsible: true,
  orderNumber: true,
  operationCode: true,
  operationName: true,
  rootCause: true,
  observation: true,
  importBatch: true,
  createdAt: true
} satisfies Prisma.PcFactoryRecordSelect;

type Indicadores = {
  registros: number;
  maquinas: number;
  tempoTotal: number;
  manutencao: number;
};

async function medirIndicadores(): Promise<Indicadores> {
  const [registros, maquinas, horas, manutencao] = await Promise.all([
    prisma.pcFactoryRecord.count(),
    prisma.pcFactoryRecord.findMany({ select: { resourceName: true }, distinct: ["resourceName"] }),
    prisma.pcFactoryRecord.aggregate({ _sum: { durationHours: true } }),
    prisma.pcFactoryRecord.aggregate({ where: { isMaintenanceKpi: true }, _sum: { durationHours: true } })
  ]);

  return {
    registros,
    maquinas: maquinas.length,
    tempoTotal: horas._sum.durationHours ?? 0,
    manutencao: manutencao._sum.durationHours ?? 0
  };
}

const h = (value: number) => value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const int = (value: number) => value.toLocaleString("pt-BR");
const dia = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : "—");

async function main() {
  const args = process.argv.slice(2);
  const confirm = args.includes("--confirm");
  if (!confirm && !args.includes("--dry-run")) {
    console.log("Nenhum modo informado — assumindo --dry-run (nada será excluído).\n");
  }

  /* --- 1. Casamento das nomenclaturas contra os nomes reais --------------- */
  const nomesNaBase = await prisma.pcFactoryRecord.findMany({
    select: { resourceName: true },
    distinct: ["resourceName"]
  });

  const encontrados = new Map<string, string[]>(); // solicitado -> nomes reais
  for (const { resourceName } of nomesNaBase) {
    const solicitado = isBlockedLegacyPcFactoryResource(resourceName)
      ? matchBlockedLegacyResource(resourceName)
      : null;
    if (!solicitado) continue;
    encontrados.set(solicitado, [...(encontrados.get(solicitado) ?? []), resourceName]);
  }

  const naoEncontrados = PC_FACTORY_BLOCKED_LEGACY_RESOURCES.filter((nome) => !encontrados.has(nome));
  const nomesReais = Array.from(encontrados.values()).flat();

  /* --- 2. Relatório pré-delete ------------------------------------------- */
  console.log("=== NOMENCLATURAS LEGADAS DO PC-FACTORY ===\n");
  console.log(
    ["Recurso na base".padEnd(24), "Solicitado como".padEnd(22), "Registros".padStart(10), "Horas".padStart(12), "Primeiro".padStart(12), "Último".padStart(12)].join(" ")
  );

  let totalRegistros = 0;
  let totalHoras = 0;

  for (const nomeReal of nomesReais.sort()) {
    const [contagem, soma, periodo] = await Promise.all([
      prisma.pcFactoryRecord.count({ where: { resourceName: nomeReal } }),
      prisma.pcFactoryRecord.aggregate({ where: { resourceName: nomeReal }, _sum: { durationHours: true } }),
      prisma.pcFactoryRecord.aggregate({
        where: { resourceName: nomeReal },
        _min: { startDateTime: true },
        _max: { startDateTime: true }
      })
    ]);
    const horas = soma._sum.durationHours ?? 0;
    totalRegistros += contagem;
    totalHoras += horas;

    console.log(
      [
        nomeReal.slice(0, 23).padEnd(24),
        (matchBlockedLegacyResource(nomeReal) ?? "").slice(0, 21).padEnd(22),
        int(contagem).padStart(10),
        h(horas).padStart(12),
        dia(periodo._min.startDateTime).padStart(12),
        dia(periodo._max.startDateTime).padStart(12)
      ].join(" ")
    );
  }

  console.log("");
  console.log(`Nomenclaturas solicitadas ....... ${PC_FACTORY_BLOCKED_LEGACY_RESOURCES.length}`);
  console.log(`Encontradas na base ............. ${encontrados.size}`);
  console.log(`NÃO encontradas ................. ${naoEncontrados.length}`);
  if (naoEncontrados.length) {
    for (const nome of naoEncontrados) console.log(`   • ${nome} → NÃO ENCONTRADO (nada será excluído por este nome)`);
  }
  console.log(`Registros que serão excluídos ... ${int(totalRegistros)}`);
  console.log(`Horas que serão retiradas ....... ${h(totalHoras)} h`);

  if (totalRegistros === 0) {
    console.log("\nNada a excluir.");
    return;
  }

  if (!confirm) {
    console.log("\n--- DRY-RUN: nenhuma linha foi apagada. Use --confirm para executar. ---");
    return;
  }

  /* --- 3. Backup FORA do repositório -------------------------------------- */
  const registros = await prisma.pcFactoryRecord.findMany({
    where: { resourceName: { in: nomesReais } },
    select: backupSelect
  });

  const destino = path.join(tmpdir(), "portal-zucchi-backups");
  mkdirSync(destino, { recursive: true });
  const arquivo = path.join(destino, `pc-factory-legacy-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(
    arquivo,
    JSON.stringify(
      {
        geradoEm: new Date().toISOString(),
        motivo: "Remoção de nomenclaturas antigas com dados incorretos, validada pela gestão.",
        nomenclaturasSolicitadas: PC_FACTORY_BLOCKED_LEGACY_RESOURCES,
        nomesEncontrados: nomesReais,
        naoEncontrados,
        totalRegistros: registros.length,
        registros
      },
      null,
      2
    ),
    "utf8"
  );
  console.log(`\nBackup gravado em: ${arquivo}`);
  console.log("(fora do projeto, de propósito — não entra no Git)");

  /* --- 4. Indicadores ANTES ---------------------------------------------- */
  const antes = await medirIndicadores();

  /* --- 5. Exclusão em transação ------------------------------------------ */
  const ids = registros.map((registro) => registro.id);
  const [removidos] = await prisma.$transaction([
    prisma.pcFactoryRecord.deleteMany({ where: { id: { in: ids } } }),
    prisma.auditLog.create({
      data: {
        action: "PC_FACTORY_DATA_CLEANUP",
        module: "PC_FACTORY",
        entityName: "PcFactoryRecord",
        details: {
          motivo: "Remoção de nomenclaturas antigas com dados incorretos, validada pela gestão.",
          nomenclaturasSolicitadas: PC_FACTORY_BLOCKED_LEGACY_RESOURCES.length,
          nomenclaturasEncontradas: encontrados.size,
          naoEncontradas: naoEncontrados,
          recursosRemovidos: nomesReais,
          registrosRemovidos: registros.length,
          horasRemovidas: Number(totalHoras.toFixed(2)),
          backup: arquivo
        }
      }
    })
  ]);
  console.log(`\nRegistros excluídos: ${int(removidos.count)}`);

  /* --- 6. Confirmação e comparação --------------------------------------- */
  const restantes = await prisma.pcFactoryRecord.count({ where: { resourceName: { in: nomesReais } } });
  console.log(`COUNT restante para os nomes removidos: ${restantes} ${restantes === 0 ? "(OK)" : "(FALHOU)"}`);

  const depois = await medirIndicadores();
  console.log("\n=== ANTES → DEPOIS ===");
  console.log(`Registros PC-Factory  ${int(antes.registros).padStart(10)} → ${int(depois.registros)}`);
  console.log(`Máquinas              ${int(antes.maquinas).padStart(10)} → ${int(depois.maquinas)}`);
  console.log(`Tempo Total           ${h(antes.tempoTotal).padStart(10)} → ${h(depois.tempoTotal)} h`);
  console.log(`Manutenção            ${h(antes.manutencao).padStart(10)} → ${h(depois.manutencao)} h`);
}

main()
  .catch((error) => {
    console.error("Falha na limpeza:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
