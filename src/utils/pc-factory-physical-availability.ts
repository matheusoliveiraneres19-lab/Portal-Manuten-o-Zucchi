/**
 * DISPONIBILIDADE FÍSICA — fórmula oficial do portal (decisão da manutenção, 2026-09).
 *
 *     Disponibilidade Física (%) =
 *       (Tempo Total do Período − Horas de Parada) ÷ Tempo Total do Período × 100
 *
 * O denominador passou a ser o TEMPO-CALENDÁRIO do recorte (dias × 24 h), não mais o
 * `G0134.LOADTIME`. Conferência manual que motivou a mudança:
 *
 *     744 h (agosto) − 128 h de parada = 616 h disponíveis → 616/744 = 82,8 %
 *
 * O que esta fórmula NÃO usa, por decisão explícita: LOADTIME, Tempo Operacional,
 * Fora de Turno, Recurso Não Programado, Setup, MTBF, MTTR, MTTA, quantidade de
 * quebras/eventos e média de disponibilidades. Depende de DOIS números e só deles:
 * tempo-calendário do período e horas de parada.
 *
 * A fórmula G0134 continua existindo, isolada em
 * `calculateMachineG0134Availability` (pc-factory-normalizer), para auditoria e
 * comparação histórica — ver `scripts/compare-pcfactory-availability-methods.ts`.
 * MTBF, MTTR e MTTA seguem sendo indicadores separados e não entram aqui.
 *
 * Puro: sem Prisma, sem React, sem acesso a banco. Só aritmética.
 */

/** Rótulo do indicador em toda a interface. Não usar "Disponibilidade G0134". */
export const PHYSICAL_AVAILABILITY_LABEL = "Disponibilidade Física";

/** Fórmula por extenso, para tooltips e painéis de auditoria. */
export const PHYSICAL_AVAILABILITY_FORMULA =
  "Disponibilidade Física = (Tempo Total − Horas de Parada) / Tempo Total × 100";

/**
 * Os SEIS tipos de parada que somam as "Horas de Parada".
 *
 * É exatamente a mesma composição que a coluna "Paradas" da tabela Confiabilidade
 * por Máquina já exibia (`totalMaintenanceForAvailability`), então o número da tela
 * e o número da fórmula são o mesmo — requisito de conferência manual.
 *
 * Esta tarefa NÃO mexe na classificação dos eventos: muda o denominador e a fórmula.
 */
export const PHYSICAL_DOWNTIME_TYPES = [
  "Manutenção Mecânica",
  "Manutenção Elétrica",
  "Manutenção Automação",
  "Manutenção Planejada",
  "Manutenção Terceiros",
  "Aguardando Manutenção"
] as const;

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/** Aceita "2026-08-01" (dia inteiro) ou um Date com hora real. */
export type PeriodBound = string | Date;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function isDateOnly(value: PeriodBound): value is string {
  return typeof value === "string" && DATE_ONLY.test(value);
}

function toDate(value: PeriodBound): Date | null {
  const date = typeof value === "string" ? new Date(isDateOnly(value) ? `${value}T00:00:00.000Z` : value) : value;
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
}

/** Meia-noite UTC do dia da data — base da contagem de dias-calendário. */
function startOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * TEMPO TOTAL DO PERÍODO (horas-calendário) — função central, sem mês fixo em código.
 *
 * Duas leituras, conforme o que o chamador informa:
 *
 *  - **Datas sem hora** ("2026-08-01" → "2026-08-31"): conta DIAS CIVIS INCLUSIVOS
 *    × 24 h. É o caso do filtro da tela, que seleciona dias inteiros.
 *      01/08 → 31/08 = 31 dias = 744 h
 *      01/08 → 10/08 = 10 dias = 240 h
 *      01/02 → 28/02 = 28 dias = 672 h
 *  - **Timestamps reais**: diferença exata entre os dois instantes. Nunca assume
 *    mês inteiro.
 *
 * Período invertido ou inválido devolve 0 — e `calculatePhysicalAvailability`
 * transforma 0 em `availabilityPercent: null`, nunca em 0 % nem NaN.
 */
export function calculatePeriodHours(dateFrom: PeriodBound, dateTo: PeriodBound): number {
  const from = toDate(dateFrom);
  const to = toDate(dateTo);
  if (!from || !to) return 0;

  // Dia inteiro dos dois lados: contagem de dias civis, exata por construção — não
  // depende de arredondar 23:59:59.999 para fechar as 24 h.
  if (isDateOnly(dateFrom) && isDateOnly(dateTo)) {
    const days = (startOfUtcDay(to) - startOfUtcDay(from)) / MS_PER_DAY + 1;
    return days > 0 ? days * 24 : 0;
  }

  const hours = (to.getTime() - from.getTime()) / MS_PER_HOUR;
  return hours > 0 ? round2(hours) : 0;
}

/** Entrada da Disponibilidade Física. Horas já somadas — esta função não sabe de banco. */
export type PhysicalAvailabilityInput = {
  /** Tempo-calendário do recorte (ver `calculatePeriodHours`). */
  totalPeriodHours: number;
  /** Soma direta de `durationHours` dos seis tipos de parada. */
  downtimeHours: number;
};

export type PhysicalAvailabilityResult = {
  totalPeriodHours: number;
  downtimeHours: number;
  /** Tempo Total − Paradas, nunca negativo. */
  availableHours: number;
  /** 0..100, ou null quando não há período (nunca NaN, nunca Infinity). */
  availabilityPercent: number | null;
  /**
   * Paradas MAIORES que o tempo-calendário — impossível fisicamente, sinal de
   * sobreposição ou duplicidade de registros. A UI pode exibir 0 %, mas o problema
   * NÃO é mascarado: viaja no dataset para virar aviso de qualidade.
   */
  downtimeExceedsPeriod: boolean;
  /** Quanto as paradas passaram do período (0 quando consistente). */
  excessDowntimeHours: number;
};

/** Texto único do aviso de inconsistência — usado por painel, tooltip e scripts. */
export const DOWNTIME_EXCEEDS_PERIOD_WARNING =
  "Horas de parada superiores às horas-calendário do período. " +
  "Verifique sobreposição ou duplicidade dos registros.";

/**
 * DISPONIBILIDADE FÍSICA — função central, pura e única. Todo percentual de
 * disponibilidade do portal sai daqui; não há segunda implementação.
 *
 * Invariantes garantidas (cobertas por `scripts/test-physical-availability.ts`):
 *   Paradas = 0            → 100 %
 *   Paradas = Tempo Total  → 0 %
 *   Tempo Total ≤ 0        → null
 *   nunca NaN, nunca Infinity, nunca acima de 100 %, nunca abaixo de 0 %
 */
export function calculatePhysicalAvailability(params: PhysicalAvailabilityInput): PhysicalAvailabilityResult {
  const safe = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);
  const totalPeriodHours = safe(params.totalPeriodHours);
  const downtimeHours = safe(params.downtimeHours);

  const availableHours = Math.max(totalPeriodHours - downtimeHours, 0);
  const availabilityPercent = totalPeriodHours > 0 ? (availableHours / totalPeriodHours) * 100 : null;

  return {
    totalPeriodHours: round2(totalPeriodHours),
    downtimeHours: round2(downtimeHours),
    availableHours: round2(availableHours),
    // Precisão interna alta: quem exibe é que arredonda (ver formatPercent).
    availabilityPercent,
    downtimeExceedsPeriod: totalPeriodHours > 0 && downtimeHours > totalPeriodHours,
    excessDowntimeHours: round2(Math.max(0, downtimeHours - totalPeriodHours))
  };
}

export type FleetPhysicalAvailabilityInput = {
  /** Horas-calendário do período, POR MÁQUINA. */
  periodHoursPerMachine: number;
  /** Quantidade de máquinas válidas no recorte. */
  machineCount: number;
  /** Soma das paradas de TODAS as máquinas do conjunto. */
  downtimeHours: number;
};

export type FleetPhysicalAvailabilityResult = PhysicalAvailabilityResult & {
  machineCount: number;
  periodHoursPerMachine: number;
};

/**
 * DISPONIBILIDADE FÍSICA DE UM CONJUNTO (grupo de área, linha, frota inteira).
 *
 *     Tempo Total do grupo = horas do período × nº de máquinas válidas
 *     Disponibilidade      = (Tempo Total − Σ paradas) ÷ Tempo Total × 100
 *
 * É uma média PONDERADA pelo tempo, não a média simples dos percentuais
 * individuais: com 10 máquinas em agosto o denominador é 744 × 10 = 7.440 h. Média
 * simples daria outro número e faria uma máquina com pouquíssimo tempo pesar igual
 * a uma da linha principal.
 *
 * "Máquinas válidas" = recursos distintos presentes no recorte. A base do
 * PC-Factory não tem cadastro de vigência (entrada em operação / desativação), então
 * a regra gerencial documentada é: cada máquina válida conta como disponível 24 h/dia
 * durante todo o período selecionado. Data de entrada NÃO é inferida do primeiro
 * registro — seria inferência insegura.
 */
export function calculateFleetPhysicalAvailability(
  params: FleetPhysicalAvailabilityInput
): FleetPhysicalAvailabilityResult {
  const periodHoursPerMachine = Number.isFinite(params.periodHoursPerMachine) && params.periodHoursPerMachine > 0
    ? params.periodHoursPerMachine
    : 0;
  const machineCount = Number.isFinite(params.machineCount) && params.machineCount > 0
    ? Math.floor(params.machineCount)
    : 0;

  const result = calculatePhysicalAvailability({
    totalPeriodHours: periodHoursPerMachine * machineCount,
    downtimeHours: params.downtimeHours
  });

  return { ...result, machineCount, periodHoursPerMachine: round2(periodHoursPerMachine) };
}

/**
 * Horas-calendário de um mês civil ("2026-08" → 744). Usado pela evolução mensal,
 * onde cada mês tem o SEU total — nunca o total de um mês aplicado a outro.
 */
export function calculateMonthHours(monthKey: string): number {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) return 0;
  // Dia 0 do mês seguinte = último dia deste mês.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return daysInMonth * 24;
}

/**
 * Horas-calendário de um mês LIMITADAS à janela do recorte.
 *
 * Um filtro de 10/08 a 20/09 não tem agosto inteiro nem setembro inteiro: agosto
 * entra com 22 dias e setembro com 20. Sem isto, a evolução mensal dividiria as
 * paradas de um pedaço de mês pelo mês cheio e mostraria disponibilidade alta demais
 * nas pontas do período.
 */
export function calculateMonthHoursWithinWindow(monthKey: string, windowFrom: Date, windowTo: Date): number {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) return 0;

  const monthStart = Date.UTC(year, month - 1, 1);
  // Primeiro instante do mês seguinte: fim exclusivo, evita erro de 1 ms.
  const monthEnd = Date.UTC(year, month, 1);

  const from = Math.max(monthStart, windowFrom.getTime());
  const to = Math.min(monthEnd, windowTo.getTime());
  if (to <= from) return 0;

  return round2((to - from) / MS_PER_HOUR);
}
