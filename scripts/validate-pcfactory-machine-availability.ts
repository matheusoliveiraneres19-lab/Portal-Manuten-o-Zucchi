/**
 * VARREDURA DA DISPONIBILIDADE POR MÁQUINA CONTRA O G0134 OFICIAL.
 *
 *   npm run validate:pc-factory-machines -- "<planilha.xlsx>" --month 2026-08
 *
 * Compara TODAS as máquinas da planilha oficial (não uma lista fixa) com o que o portal
 * calcula no mesmo mês. Só leitura: nenhuma linha é escrita.
 *
 * COLUNAS LIDAS DA PLANILHA (aba `ag-grid`):
 *   Nome Recurso | Cód. Nível Selecionado | G0134.LOADTIME | Tempo de Manutenção |
 *   Tempo Ag. Manutenção | Disponibilidade | MÊS
 *
 * A coluna `Disponibilidade` entra só como CONFERÊNCIA da fórmula (etapa 1). A
 * disponibilidade oficial usada na comparação com o portal é recalculada dos insumos do
 * relatório, pela mesma função central do portal:
 *
 *   (LOADTIME − (Tempo de Manutenção + Tempo Ag. Manutenção)) / LOADTIME × 100
 *
 * UNIDADE: as colunas de tempo da planilha vêm em DIAS (serial de tempo do Excel) e aqui
 * viram horas (× 24), para comparar com as horas do portal. A disponibilidade é uma
 * razão e não depende disso; o relatório de horas, sim.
 *
 * COMO LER O RESULTADO
 * Uma diferença entre portal e relatório pode ter origens muito diferentes, e o script
 * separa cada uma em vez de jogar tudo em "divergiu":
 *
 *   FORMULA          A conta do portal não reproduz a fórmula com os insumos do próprio
 *                    portal. É bug — e é o único caso que REPROVA a varredura.
 *   INSUMO           A conta está certa dos dois lados, mas LOADTIME/manutenção diferem
 *                    entre as duas extrações. Mostra o delta para investigar.
 *   RELATORIO        O LOADTIME oficial é o PERÍODO CHEIO (ex.: 31,0000 dias num mês de
 *                    31), isto é, o relatório não descontou nada — nem quando o próprio
 *                    export traz centenas de horas de "Recurso Não Programado" naquela
 *                    máquina. Defeito do calendário do recurso na origem.
 *   NOMES_AGRUPADOS  Dois códigos oficiais compartilham o mesmo nome de recurso na base,
 *                    então o portal soma as duas máquinas numa linha só.
 */
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import type { PcFactoryQueryParams, PcFactoryReliabilityRow } from "../src/types/pc-factory";
import { calculateFleetG0134Availability, calculateMachineG0134Availability } from "../src/utils/pc-factory-normalizer";

// O service usa `cache()` do React para deduplicar a carga dentro de um render.
// Fora do Next essa função não existe, então aqui ela vira identidade.
const react = require("react") as { cache?: <T>(fn: T) => T };
if (typeof react.cache !== "function") react.cache = (fn) => fn;

type LinhaPortal = {
  machineName: string;
  machineCode: string | null;
  loadTimeHours: number;
  maintenanceHours: number;
  waitingMaintenanceHours: number;
  totalMaintenanceForAvailability: number;
  availabilityPercent: number | null;
  loadHours: number;
  plannedStopHours: number;
  repairHours: number;
  plannedMaintenanceHours: number;
  mtbf: number | null;
  mttr: number | null;
  mtta: number | null;
};

// Importado só DEPOIS do shim: o módulo chama cache() ao ser carregado.
const service = require("../src/services/pc-factory.service") as {
  getPcFactoryAvailabilityByMachine: (params: PcFactoryQueryParams) => Promise<LinhaPortal[]>;
  getPcFactoryReliabilityByMachine: (params: PcFactoryQueryParams) => Promise<PcFactoryReliabilityRow[]>;
  getPcFactoryResourceDetails: (
    machine: string,
    params: PcFactoryQueryParams
  ) => Promise<{
    availabilityPercent: number | null;
    maintenanceHours: number;
    availabilityAudit: { loadTimeHours: number };
  } | null>;
};

/** Tolerância de aceite da disponibilidade, em pontos percentuais. */
const TOL_PP = 0.05;
/** Abaixo disto, os insumos das duas extrações são considerados iguais (em horas). */
const TOL_HORAS = 0.5;

const MES_POR_ROTULO: Record<string, number> = {
  JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6,
  JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12
};

type LinhaOficial = {
  codigo: string;
  recurso: string;
  loadTimeHours: number;
  maintenanceHours: number;
  waitingMaintenanceHours: number;
  /** Recalculada da fórmula — é esta que entra na comparação com o portal. */
  availabilityPercent: number | null;
  /** Coluna `Disponibilidade` da planilha, para conferir a fórmula na etapa 1. */
  availabilityPlanilha: number | null;
};

/* -------------------------------------------------------------------------- */
/*  Leitura da planilha oficial                                               */
/* -------------------------------------------------------------------------- */

function lerPlanilhaOficial(arquivo: string, mes: string): LinhaOficial[] {
  const workbook = XLSX.readFile(arquivo);
  const aba = workbook.SheetNames.includes("ag-grid") ? "ag-grid" : workbook.SheetNames[0];
  const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[aba], { defval: null });

  const [ano, mesNumero] = mes.split("-").map(Number);
  if (!Number.isFinite(ano) || !Number.isFinite(mesNumero)) throw new Error(`Mês inválido: ${mes} (use aaaa-mm).`);
  const rotulo = Object.entries(MES_POR_ROTULO).find(([, numero]) => numero === mesNumero)?.[0];
  if (!rotulo) throw new Error(`Mês inválido: ${mes} (use aaaa-mm).`);

  const numero = (valor: unknown) => {
    const n = Number(valor);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  return linhas
    .filter((linha) => String(linha["MÊS"] ?? "").trim().toUpperCase() === rotulo)
    .map((linha) => {
      // Dias → horas: a planilha guarda tempo como fração de dia (serial do Excel).
      const loadTimeHours = numero(linha["G0134.LOADTIME"]) * 24;
      const maintenanceHours = numero(linha["Tempo de Manutenção"]) * 24;
      const waitingMaintenanceHours = numero(linha["Tempo Ag. Manutenção"]) * 24;
      const disponibilidadePlanilha = Number(linha["Disponibilidade"]);

      return {
        codigo: String(linha["Cód. Nível Selecionado"] ?? "").trim(),
        recurso: String(linha["Nome Recurso"] ?? "").trim(),
        loadTimeHours,
        maintenanceHours,
        waitingMaintenanceHours,
        availabilityPercent: calculateMachineG0134Availability({
          loadTimeHours,
          maintenanceHours,
          waitingMaintenanceHours
        }).availabilityPercent,
        availabilityPlanilha: Number.isFinite(disponibilidadePlanilha) ? disponibilidadePlanilha : null
      };
    })
    .filter((linha) => linha.recurso.length > 0);
}

/* -------------------------------------------------------------------------- */
/*  Casamento de nomes                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Chave de comparação de nomes: sem acento, sem pontuação, minúscula, e com o typo
 * "Multfio" (que existe na base) normalizado para "multifio".
 */
function chaveDeNome(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/multi?fio/g, "multifio")
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Acha a máquina do portal correspondente à linha oficial. Nesta ordem:
 *   1. código oficial == machineCode do portal;
 *   2. código oficial == machineName (alguns recursos são cadastrados pelo código);
 *   3. nome normalizado idêntico;
 *   4. nome normalizado até o primeiro " - " (a planilha sufixa o grupo:
 *      "Levigadora 18 - Simec - G03" contra "Levigadora 18 Simec" no portal),
 *      aceito só quando houver UM único candidato.
 */
function casarMaquina(oficial: LinhaOficial, portal: LinhaPortal[]): LinhaPortal | null {
  if (oficial.codigo) {
    const porCodigo = portal.find((linha) => linha.machineCode?.trim() === oficial.codigo);
    if (porCodigo) return porCodigo;

    const codigoComoNome = chaveDeNome(oficial.codigo);
    const porNomeCodigo = portal.find((linha) => chaveDeNome(linha.machineName) === codigoComoNome);
    if (porNomeCodigo) return porNomeCodigo;
  }

  const alvo = chaveDeNome(oficial.recurso);
  const porNome = portal.find((linha) => chaveDeNome(linha.machineName) === alvo);
  if (porNome) return porNome;

  const raiz = chaveDeNome(oficial.recurso.split(" - ")[0]);
  if (raiz.length < 6) return null;
  const candidatos = portal.filter((linha) => chaveDeNome(linha.machineName).startsWith(raiz));
  return candidatos.length === 1 ? candidatos[0] : null;
}

/* -------------------------------------------------------------------------- */
/*  Comparação                                                                */
/* -------------------------------------------------------------------------- */

type Causa = "FORMULA" | "INSUMO" | "RELATORIO" | "NOMES_AGRUPADOS";

type Comparacao = {
  rotulo: string;
  /** Insumos oficiais somados (várias linhas oficiais podem cair na mesma máquina). */
  oficial: {
    loadTimeHours: number;
    maintenanceHours: number;
    waitingMaintenanceHours: number;
    availabilityPercent: number | null;
  };
  portal: LinhaPortal;
  linhasOficiais: number;
  diferenca: number;
  causa: Causa | null;
};

function diasNoMes(mes: string): number {
  const [ano, mesNumero] = mes.split("-").map(Number);
  return new Date(Date.UTC(ano, mesNumero, 0)).getUTCDate();
}

const h = (valor: number) => valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pp = (valor: number | null) =>
  valor === null ? "—" : valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
  const args = process.argv.slice(2);
  const arquivo = args.find((arg) => !arg.startsWith("--"));
  const indiceMes = args.indexOf("--month");
  const mes = indiceMes >= 0 ? args[indiceMes + 1] : undefined;

  if (!arquivo || !mes) {
    console.error('Uso: npm run validate:pc-factory-machines -- "<planilha.xlsx>" --month aaaa-mm');
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(arquivo)) {
    console.error(`Arquivo não encontrado: ${arquivo}`);
    process.exitCode = 1;
    return;
  }

  const oficiais = lerPlanilhaOficial(arquivo, mes);
  if (oficiais.length === 0) {
    console.error(`A planilha não tem linhas do mês ${mes}.`);
    process.exitCode = 1;
    return;
  }

  const ultimoDia = diasNoMes(mes);
  const horasDoMes = ultimoDia * 24;
  const filtros: PcFactoryQueryParams = {
    startDate: `${mes}-01`,
    endDate: `${mes}-${String(ultimoDia).padStart(2, "0")}`,
    mode: "G0134_OFICIAL"
  };

  console.log(`=== DISPONIBILIDADE POR MÁQUINA — ${path.basename(arquivo)} — ${mes} ===`);
  console.log("Fórmula: (LOADTIME − (Manutenção + Ag. Manutenção)) / LOADTIME × 100");
  console.log(`Tolerância: ${TOL_PP.toFixed(2)} p.p.`);

  /* --- 1. A fórmula central reproduz a coluna Disponibilidade da planilha? --- */
  console.log("\n--- 1. FÓRMULA CENTRAL x COLUNA DISPONIBILIDADE DA PLANILHA ---");
  const comColuna = oficiais.filter((linha) => linha.availabilityPlanilha !== null && linha.availabilityPercent !== null);
  const errosDeFormula = comColuna.filter(
    (linha) => Math.abs((linha.availabilityPercent as number) - (linha.availabilityPlanilha as number)) > TOL_PP
  );
  for (const linha of errosDeFormula) {
    console.log(
      `  ✗ ${linha.recurso.padEnd(30)} planilha ${pp(linha.availabilityPlanilha)}%  função ${pp(linha.availabilityPercent)}%`
    );
  }
  console.log(
    `  ${errosDeFormula.length === 0 ? "✓" : "✗"} ${comColuna.length - errosDeFormula.length}/${comColuna.length} ` +
      "linhas reproduzidas por calculateMachineG0134Availability()"
  );

  /* --- 2. Portal x oficial, máquina a máquina --- */
  const portal = await service.getPcFactoryAvailabilityByMachine(filtros);

  const porMaquina = new Map<LinhaPortal, LinhaOficial[]>();
  const semCorrespondencia: LinhaOficial[] = [];
  for (const oficial of oficiais) {
    const linha = casarMaquina(oficial, portal);
    if (!linha) {
      semCorrespondencia.push(oficial);
      continue;
    }
    const lista = porMaquina.get(linha);
    if (lista) lista.push(oficial);
    else porMaquina.set(linha, [oficial]);
  }

  const comparacoes: Comparacao[] = [];
  for (const [linhaPortal, linhasOficiais] of Array.from(porMaquina.entries())) {
    // Duas linhas da planilha na mesma máquina do portal (mesmo nome de recurso com
    // códigos diferentes): comparar a SOMA, que é o que o portal enxerga.
    const somado = calculateFleetG0134Availability(linhasOficiais);
    if (somado.availabilityPercent === null || linhaPortal.availabilityPercent === null) {
      semCorrespondencia.push(...linhasOficiais);
      continue;
    }

    const diferenca = linhaPortal.availabilityPercent - somado.availabilityPercent;
    const insumosIguais =
      Math.abs(somado.loadTimeHours - linhaPortal.loadTimeHours) <= TOL_HORAS &&
      Math.abs(somado.totalMaintenanceForAvailability - linhaPortal.totalMaintenanceForAvailability) <= TOL_HORAS;

    comparacoes.push({
      rotulo: linhasOficiais.map((linha) => linha.recurso).join(" + "),
      oficial: {
        loadTimeHours: somado.loadTimeHours,
        maintenanceHours: somado.maintenanceHours,
        waitingMaintenanceHours: somado.waitingMaintenanceHours,
        availabilityPercent: somado.availabilityPercent
      },
      portal: linhaPortal,
      linhasOficiais: linhasOficiais.length,
      diferenca,
      causa:
        Math.abs(diferenca) <= TOL_PP
          ? null
          : Math.abs(somado.loadTimeHours - horasDoMes) < TOL_HORAS
            ? "RELATORIO"
            : linhasOficiais.length > 1
              ? "NOMES_AGRUPADOS"
              : insumosIguais
                ? "FORMULA"
                : "INSUMO"
    });
  }

  const bateram = comparacoes.filter((item) => item.causa === null);
  const divergiram = comparacoes.filter((item) => item.causa !== null);
  const maiorDiferenca = comparacoes.reduce((maior, item) => Math.max(maior, Math.abs(item.diferenca)), 0);

  console.log("\n--- 2. PORTAL x OFICIAL ---");
  console.log(`Máquinas comparadas: ${comparacoes.length}`);
  console.log(`Bateram: ${bateram.length}`);
  console.log(`Divergiram: ${divergiram.length}`);
  console.log(`Maior diferença: ${maiorDiferenca.toFixed(2)} p.p.`);
  if (semCorrespondencia.length) {
    console.log(
      `Sem correspondência no portal: ${semCorrespondencia.length} — ${semCorrespondencia.map((l) => l.recurso).join(", ")}`
    );
  }

  if (divergiram.length) {
    console.log("");
    console.log(
      [
        "Máquina".padEnd(30),
        "Oficial".padStart(8),
        "Portal".padStart(8),
        "Dif".padStart(7),
        "LT ofic".padStart(9),
        "LT port".padStart(9),
        "Man ofic".padStart(9),
        "Man port".padStart(9),
        "Causa".padStart(16)
      ].join(" ")
    );
    for (const item of divergiram.sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca))) {
      console.log(
        [
          item.rotulo.slice(0, 29).padEnd(30),
          pp(item.oficial.availabilityPercent).padStart(8),
          pp(item.portal.availabilityPercent).padStart(8),
          ((item.diferenca >= 0 ? "+" : "") + item.diferenca.toFixed(2)).padStart(7),
          h(item.oficial.loadTimeHours).padStart(9),
          h(item.portal.loadTimeHours).padStart(9),
          h(item.oficial.maintenanceHours + item.oficial.waitingMaintenanceHours).padStart(9),
          h(item.portal.totalMaintenanceForAvailability).padStart(9),
          String(item.causa).padStart(16)
        ].join(" ")
      );
    }

    const porCausa = (causa: Causa) => divergiram.filter((item) => item.causa === causa).length;
    console.log("");
    if (porCausa("RELATORIO")) {
      console.log(
        `  RELATORIO (${porCausa("RELATORIO")}): LOADTIME oficial = período cheio (${horasDoMes} h). O relatório não\n` +
          "    descontou Fora de Turno / Recurso Não Programado / Setup, ainda que o próprio export traga\n" +
          "    essas horas na máquina. É o calendário do recurso na origem, não o cálculo do portal."
      );
    }
    if (porCausa("NOMES_AGRUPADOS")) {
      console.log(
        `  NOMES_AGRUPADOS (${porCausa("NOMES_AGRUPADOS")}): mais de um código oficial compartilha o MESMO nome de\n` +
          "    recurso na base importada, então o portal soma as máquinas numa linha só. Corrigir é dar\n" +
          "    nomes distintos aos recursos no PC-Factory."
      );
    }
    if (porCausa("INSUMO")) {
      console.log(
        `  INSUMO (${porCausa("INSUMO")}): a conta está certa dos dois lados, mas LOADTIME e/ou manutenção diferem\n` +
          "    entre as duas extrações (relatório e export do histórico não saíram no mesmo instante)."
      );
    }
    if (porCausa("FORMULA")) {
      console.log(`  FORMULA (${porCausa("FORMULA")}): mesmos insumos, resultado diferente. Isto é bug de cálculo.`);
    }
  }

  /* --- 3. Tabela x painel de detalhe: os dois têm de dar o mesmo número --- */
  console.log("\n--- 3. TABELA x PAINEL DE DETALHE (mesmo filtro) ---");
  const tabela = await service.getPcFactoryReliabilityByMachine(filtros);
  let detalheOk = true;
  for (const linha of tabela.slice(0, 6)) {
    const detalhe = await service.getPcFactoryResourceDetails(linha.machineName, filtros);
    const ok =
      detalhe !== null &&
      detalhe.availabilityPercent !== null &&
      linha.availability !== null &&
      Math.abs(detalhe.availabilityPercent - linha.availability) <= 0.01 &&
      Math.abs(detalhe.maintenanceHours - linha.maintenanceDowntimeHours) <= 0.05 &&
      Math.abs(detalhe.availabilityAudit.loadTimeHours - linha.loadTimeHours) <= 0.05;
    if (!ok) detalheOk = false;
    console.log(
      `  ${ok ? "✓" : "✗"} ${linha.machineName.slice(0, 26).padEnd(27)} ` +
        `tabela ${pp(linha.availability)}% / ${h(linha.maintenanceDowntimeHours)} h  ·  ` +
        `detalhe ${pp(detalhe?.availabilityPercent ?? null)}% / ${h(detalhe?.maintenanceHours ?? 0)} h`
    );
  }

  /* --- 4. Agregado: ponderado pela carga, NUNCA média simples --- */
  const agregadoOficial = calculateFleetG0134Availability(comparacoes.map((item) => item.oficial));
  const agregadoPortal = calculateFleetG0134Availability(comparacoes.map((item) => item.portal));
  const validas = comparacoes
    .map((item) => item.portal.availabilityPercent)
    .filter((valor): valor is number => valor !== null);
  const mediaSimples = validas.length ? validas.reduce((soma, valor) => soma + valor, 0) / validas.length : null;

  console.log("\n--- 4. AGREGADO DO RECORTE (ponderado pela carga) ---");
  console.log(
    `  oficial: ${pp(agregadoOficial.availabilityPercent)}%  ` +
      `(LOADTIME ${h(agregadoOficial.loadTimeHours)} h, manutenção ${h(agregadoOficial.totalMaintenanceForAvailability)} h)`
  );
  console.log(
    `  portal:  ${pp(agregadoPortal.availabilityPercent)}%  ` +
      `(LOADTIME ${h(agregadoPortal.loadTimeHours)} h, manutenção ${h(agregadoPortal.totalMaintenanceForAvailability)} h)`
  );
  console.log(`  (a média SIMPLES das máquinas daria ${pp(mediaSimples)}% — não é assim que o indicador é publicado)`);

  /* --- 5. Invariantes que valem em qualquer recorte --- */
  console.log("\n--- 5. INVARIANTES ---");
  const semNaN = portal.every((linha) =>
    [linha.availabilityPercent, linha.mtbf, linha.mttr, linha.mtta].every(
      (valor) => valor === null || Number.isFinite(valor)
    )
  );
  const dentroDoIntervalo = portal.every(
    (linha) => linha.availabilityPercent === null || (linha.availabilityPercent >= 0 && linha.availabilityPercent <= 100)
  );
  const formulaDireta = portal.every((linha) => {
    const esperado = calculateMachineG0134Availability(linha).availabilityPercent;
    if (esperado === null || linha.availabilityPercent === null) return esperado === linha.availabilityPercent;
    return Math.abs(esperado - linha.availabilityPercent) <= 0.001;
  });
  const manutencaoComposta = portal.every(
    (linha) =>
      Math.abs(linha.maintenanceHours + linha.waitingMaintenanceHours - linha.totalMaintenanceForAvailability) <= 0.05 &&
      Math.abs(linha.repairHours + linha.plannedMaintenanceHours - linha.maintenanceHours) <= 0.05
  );
  const loadTimeCoerente = portal.every(
    (linha) => Math.abs(linha.loadTimeHours - (linha.loadHours - linha.plannedStopHours)) <= 0.05
  );

  const invariantes: Array<[string, boolean]> = [
    ["sem NaN/Infinity em disponibilidade, MTBF, MTTR e MTTA", semNaN],
    ["disponibilidade entre 0 e 100", dentroDoIntervalo],
    ["disponibilidade = (LOADTIME − manutenção total) ÷ LOADTIME", formulaDireta],
    ["manutenção total = manutenção + aguardando; manutenção = corretiva + planejada", manutencaoComposta],
    ["LOADTIME = tempo de carga − setup", loadTimeCoerente],
    ["tabela e painel de detalhe mostram os mesmos números", detalheOk],
    ["fórmula reproduz a coluna Disponibilidade da planilha", errosDeFormula.length === 0]
  ];
  for (const [nome, ok] of invariantes) console.log(`  ${ok ? "✓" : "✗"} ${nome}`);

  /* --- Veredito --- */
  const invariantesOk = invariantes.every(([, ok]) => ok);
  const bugsDeCalculo = divergiram.filter((item) => item.causa === "FORMULA");

  console.log("");
  if (!invariantesOk || bugsDeCalculo.length > 0) {
    console.log(
      `✗ ${bugsDeCalculo.length} divergência(s) de CÁLCULO` + (invariantesOk ? "." : " + invariante(s) quebrada(s).")
    );
    process.exitCode = 1;
    return;
  }
  console.log("✓ Disponibilidade por máquina consistente com a regra do G0134.");
  if (divergiram.length) {
    console.log(
      `  ${divergiram.length} máquina(s) ainda diferem do relatório por dado de ORIGEM (ver as causas acima), ` +
        "não pelo cálculo."
    );
  }
}

main().catch((error) => {
  console.error("Falha ao validar:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
