/**
 * TESTE FUNCIONAL das justificativas de baixa disponibilidade do PC-Factory.
 *
 *   npm run validate:pc-factory-notes
 *   npm run validate:pc-factory-notes -- --machine="Multifio 02 - Gasp"
 *
 * Reproduz, sem navegador, o roteiro combinado com a gestão:
 *
 *   1. ler horas de parada e disponibilidade de agosto/2026;
 *   2. registrar a justificativa;
 *   3. reconsultar (equivale ao F5) — a justificativa continua lá;
 *   4. pedir setembro/2026 — a justificativa de agosto NÃO aparece;
 *   5. voltar a agosto — a justificativa volta;
 *   6. editar o texto — a autoria original é preservada e `updatedBy` muda;
 *   7. conferir que Horas de Parada, Tempo Total e Disponibilidade são
 *      BIT A BIT os mesmos de antes de existir justificativa.
 *
 * O passo 7 é o motivo deste script existir: uma justificativa é texto
 * gerencial e não pode encostar em nenhum número.
 *
 * ESCREVE NO BANCO, mas só na tabela `PcFactoryAvailabilityNote`, e limpa o que
 * criou ao final. Nenhum `PcFactoryRecord` é lido para escrita nem alterado.
 *
 * ⚠ PROTEÇÃO CONTRA SOBRESCRITA (adicionada em 2026-09-21, depois de o script
 * ter apagado uma justificativa REAL de agosto/2026).
 *
 * O teste grava em (máquina + período) — a mesma chave única que a gestão usa.
 * Se já houver justificativa ali, o `upsert` EDITA o texto do gestor, e a
 * limpeza final não o restaura, porque o filtro de limpeza é pelo autor e o
 * `createdById` original é preservado na edição. Resultado: texto perdido, sem
 * recuperação (o AuditLog não guarda o conteúdo).
 *
 * Agora o script só usa uma máquina cuja janela esteja LIVRE nos dois períodos
 * que ele toca, e ainda assim tira um retrato de qualquer nota pré-existente e
 * a restaura no `finally`. Se nenhuma máquina estiver livre, ele aborta em vez
 * de escrever por cima.
 */
import type { PcFactoryPageData, PcFactoryQueryParams, PcFactoryReliabilityRow } from "../src/types/pc-factory";
import { normalizeMachineName } from "../src/utils/technical-object-normalizer";

// O service usa `cache()` do React para deduplicar a carga dentro de um render.
// Fora do Next essa função não existe, então aqui ela vira identidade.
const react = require("react") as { cache?: <T>(fn: T) => T };
if (typeof react.cache !== "function") react.cache = (fn) => fn;

// Importados só DEPOIS do shim: os módulos chamam cache() ao serem carregados.
const { getPcFactoryPageData } = require("../src/services/pc-factory.service") as {
  getPcFactoryPageData: (params: PcFactoryQueryParams) => Promise<PcFactoryPageData>;
};
const notesService = require("../src/services/pc-factory-availability-notes.service") as typeof import("../src/services/pc-factory-availability-notes.service");
const { prisma } = require("../src/lib/prisma") as typeof import("../src/lib/prisma");

const AGOSTO: PcFactoryQueryParams = { startDate: "2026-08-01", endDate: "2026-08-31" };
const SETEMBRO: PcFactoryQueryParams = { startDate: "2026-09-01", endDate: "2026-09-30" };

const REASON = "Quebra do redutor principal. Máquina aguardou componente de reposição durante quatro dias.";
const REASON_EDITADA = "Quebra do redutor principal. Peça importada chegou no quinto dia.";

const AUTOR = { id: "script-validacao", name: "Script de validação" };
const AUTOR_2 = { id: "script-validacao-2", name: "Script de validação (edição)" };

let falhas = 0;

function checar(rotulo: string, ok: boolean, detalhe = "") {
  if (!ok) falhas += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${rotulo}${detalhe ? `  — ${detalhe}` : ""}`);
}

/** Os TRÊS números que uma justificativa jamais pode mexer. */
function numeros(row: PcFactoryReliabilityRow) {
  return {
    downtimeHours: row.downtimeHours,
    periodHours: row.periodHours,
    availability: row.availability
  };
}

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

async function main() {
  console.log("\nJUSTIFICATIVA DE BAIXA DISPONIBILIDADE — teste funcional\n");

  /* --- 1. estado ANTES de qualquer justificativa -------------------------- */
  const antes = await getPcFactoryPageData(AGOSTO);
  if (antes.reliabilityByMachine.length === 0) {
    console.log("  ! Sem máquinas em agosto/2026 no banco. Importe a planilha antes de rodar este teste.");
    process.exitCode = 1;
    return;
  }

  // A tela EXIBE o nome normalizado ("Multifio 02 - Gasp"), mas a chave gravada é o
  // `resourceName` cru da planilha ("Multfio 02 - Gasp" — o typo está na origem).
  // Aceitar os dois evita que quem lê a tabela erre o parâmetro.
  const nomes = (row: PcFactoryReliabilityRow) => [row.machineName, normalizeMachineName(row.machineName) || row.machineName];

  const pedida = arg("machine");
  const escolhida = pedida
    ? antes.reliabilityByMachine.find((row) => nomes(row).some((nome) => nome.toLowerCase() === pedida.toLowerCase()))
    : undefined;
  if (pedida && !escolhida) {
    console.log(`  ! Máquina "${pedida}" não existe no recorte. Máquinas disponíveis:`);
    for (const row of antes.reliabilityByMachine) console.log(`      ${nomes(row)[1]}`);
    process.exitCode = 1;
    return;
  }
  /**
   * Uma janela está LIVRE quando não existe justificativa da gestão nela. O
   * teste só escreve em janelas livres — escrever numa ocupada editaria o texto
   * de um gestor, que é irrecuperável.
   */
  async function janelaLivre(resourceName: string): Promise<boolean> {
    const conflitos = await prisma.pcFactoryAvailabilityNote.count({
      where: {
        resourceName,
        OR: [
          { periodStart: new Date(`${AGOSTO.startDate}T00:00:00.000Z`), periodEnd: new Date(`${AGOSTO.endDate}T00:00:00.000Z`) },
          { periodStart: new Date(`${SETEMBRO.startDate}T00:00:00.000Z`), periodEnd: new Date(`${SETEMBRO.endDate}T00:00:00.000Z`) }
        ]
      }
    });
    return conflitos === 0;
  }

  const preferida =
    escolhida ?? antes.reliabilityByMachine.find((row) => nomes(row).some((nome) => /mult.?fio 02/i.test(nome)));

  let alvo: PcFactoryReliabilityRow | undefined;
  if (preferida && (await janelaLivre(preferida.machineName))) {
    alvo = preferida;
  } else {
    if (preferida) {
      console.log(
        `  ! "${nomes(preferida)[1]}" já tem justificativa da gestão em agosto ou setembro/2026.\n` +
          "    O teste NÃO escreve por cima: procurando outra máquina com a janela livre.\n"
      );
    }
    for (const row of antes.reliabilityByMachine) {
      if (await janelaLivre(row.machineName)) {
        alvo = row;
        break;
      }
    }
  }

  if (!alvo) {
    console.log(
      "  ! Todas as máquinas do recorte já têm justificativa em agosto ou setembro/2026.\n" +
        "    O teste foi abortado para não sobrescrever texto da gestão.\n" +
        "    Rode com --machine=<máquina de um recorte sem justificativas> ou em um banco de teste.\n"
    );
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  const janela = antes.periodWindow;
  console.log(`  Máquina: ${nomes(alvo)[1]}  (chave gravada: "${alvo.machineName}")`);
  console.log(`  Período: ${janela.label}  (${janela.startDate} → ${janela.endDate})`);
  console.log(
    `  Horas de Parada: ${alvo.downtimeHours} h | Tempo Total: ${alvo.periodHours} h | ` +
      `Disponibilidade: ${alvo.availability === null ? "—" : `${alvo.availability.toFixed(4)}%`}\n`
  );

  const numerosAntes = numeros(alvo);

  // Deixa o terreno limpo caso uma execução anterior tenha morrido no meio.
  await prisma.pcFactoryAvailabilityNote.deleteMany({
    where: { resourceName: alvo.machineName, createdById: { in: [AUTOR.id, AUTOR_2.id] } }
  });

  // Rede de segurança: mesmo tendo escolhido uma janela livre, guarda um
  // retrato do que existir nas chaves que o teste vai tocar. Se algo aparecer
  // (corrida com um gestor salvando agora), o `finally` restaura palavra por
  // palavra em vez de deixar o texto dele perdido.
  const snapshot = await prisma.pcFactoryAvailabilityNote.findMany({
    where: { resourceName: alvo.machineName }
  });

  try {
    /* --- 2. registrar a justificativa ------------------------------------- */
    const criada = await notesService.upsertAvailabilityNote(
      {
        resourceName: alvo.machineName,
        resourceCode: alvo.machineCode,
        periodStart: janela.startDate,
        periodEnd: janela.endDate,
        reason: REASON,
        actionPlan: "Antecipar compra de redutor reserva.",
        responsible: "Manutenção Mecânica",
        availabilitySnapshot: alvo.availability,
        downtimeHoursSnapshot: alvo.downtimeHours
      },
      AUTOR
    );
    checar("justificativa salva", criada.reason === REASON);
    checar("auditoria de criação gravada", criada.createdById === AUTOR.id && Boolean(criada.createdAt));

    /* --- 3. reconsultar a página (equivale ao F5) ------------------------- */
    const depois = await getPcFactoryPageData(AGOSTO);
    const noteAgosto = depois.availabilityNotes.find((note) => note.resourceName === alvo.machineName);
    checar("justificativa persiste após recarregar agosto", noteAgosto?.reason === REASON);

    /* --- 4. setembro NÃO pode herdar a justificativa de agosto ------------ */
    const setembro = await getPcFactoryPageData(SETEMBRO);
    const vazouParaSetembro = setembro.availabilityNotes.some((note) => note.resourceName === alvo.machineName);
    checar(
      "justificativa de agosto NÃO aparece em setembro",
      !vazouParaSetembro,
      `janela de setembro: ${setembro.periodWindow.startDate} → ${setembro.periodWindow.endDate}`
    );

    /* --- 5. voltar para agosto -------------------------------------------- */
    const voltou = await getPcFactoryPageData(AGOSTO);
    const linhaVoltou = voltou.reliabilityByMachine.find((row) => row.machineName === alvo.machineName);
    checar(
      "justificativa volta ao reselecionar agosto",
      voltou.availabilityNotes.some((note) => note.resourceName === alvo.machineName && note.reason === REASON)
    );

    /* --- 6. editar: autoria original preservada --------------------------- */
    const editada = await notesService.upsertAvailabilityNote(
      {
        resourceName: alvo.machineName,
        periodStart: janela.startDate,
        periodEnd: janela.endDate,
        reason: REASON_EDITADA
      },
      AUTOR_2
    );
    checar("edição grava o novo texto", editada.reason === REASON_EDITADA);
    checar("autor ORIGINAL preservado na edição", editada.createdById === AUTOR.id);
    checar("autor da ALTERAÇÃO registrado", editada.updatedById === AUTOR_2.id);
    checar("chave (máquina+período) não duplicou", editada.id === criada.id);

    /* --- 7. os números não podem ter mudado ------------------------------- */
    const numerosDepois = linhaVoltou ? numeros(linhaVoltou) : null;
    checar(
      "Horas de Parada idênticas antes/depois",
      numerosDepois?.downtimeHours === numerosAntes.downtimeHours,
      `${numerosAntes.downtimeHours} → ${numerosDepois?.downtimeHours}`
    );
    checar(
      "Tempo Total idêntico antes/depois",
      numerosDepois?.periodHours === numerosAntes.periodHours,
      `${numerosAntes.periodHours} → ${numerosDepois?.periodHours}`
    );
    checar(
      "Disponibilidade idêntica antes/depois",
      numerosDepois?.availability === numerosAntes.availability,
      `${numerosAntes.availability} → ${numerosDepois?.availability}`
    );
    checar(
      "total de máquinas na tabela inalterado",
      voltou.reliabilityByMachine.length === antes.reliabilityByMachine.length,
      `${antes.reliabilityByMachine.length} → ${voltou.reliabilityByMachine.length}`
    );

    /* --- 8. histórico guarda cada período na janela dele ------------------ */
    await notesService.upsertAvailabilityNote(
      {
        resourceName: alvo.machineName,
        periodStart: SETEMBRO.startDate as string,
        periodEnd: SETEMBRO.endDate as string,
        reason: "Falha elétrica no painel principal."
      },
      AUTOR
    );
    const historico = await notesService.listAvailabilityNoteHistory(alvo.machineName);
    checar("histórico mantém as DUAS janelas", historico.length >= 2, `${historico.length} registro(s)`);
    checar(
      "agosto continua com o texto de agosto",
      historico.some((note) => note.periodStart === janela.startDate && note.reason === REASON_EDITADA)
    );
    checar(
      "setembro tem o texto de setembro",
      historico.some((note) => note.periodStart === SETEMBRO.startDate && note.reason.includes("Falha elétrica"))
    );
  } finally {
    // Limpa só o que este script criou.
    const removidas = await prisma.pcFactoryAvailabilityNote.deleteMany({
      where: { resourceName: alvo.machineName, createdById: { in: [AUTOR.id, AUTOR_2.id] } }
    });
    console.log(`\n  (limpeza: ${removidas.count} justificativa(s) de teste removida(s))`);

    // Restaura, palavra por palavra, qualquer justificativa da gestão que
    // existisse nesta máquina antes do teste. Em operação normal o snapshot
    // está vazio (a janela escolhida era livre) e isto não faz nada.
    let restauradas = 0;
    for (const original of snapshot) {
      const atual = await prisma.pcFactoryAvailabilityNote.findUnique({ where: { id: original.id } });
      const intacta =
        atual &&
        atual.reason === original.reason &&
        atual.actionPlan === original.actionPlan &&
        atual.responsible === original.responsible;
      if (intacta) continue;

      const { id, ...campos } = original;
      await prisma.pcFactoryAvailabilityNote.upsert({
        where: { id },
        create: { id, ...campos },
        update: campos
      });
      restauradas += 1;
    }
    if (restauradas > 0) {
      console.log(`  (restauradas ${restauradas} justificativa(s) da gestão que o teste havia tocado)`);
    }

    await prisma.$disconnect();
  }

  console.log(falhas === 0 ? "\nTODAS AS VERIFICAÇÕES PASSARAM.\n" : `\n${falhas} VERIFICAÇÃO(ÕES) FALHARAM.\n`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exitCode = 1;
});
