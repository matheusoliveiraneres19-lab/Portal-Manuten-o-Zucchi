/**
 * Segmentação temporal dos registros do PC-Factory.
 *
 * PROBLEMA
 * --------
 * Um registro do PC-Factory é um INTERVALO (início → término), não um ponto no
 * tempo. Uma parada que começa em 31/08 e termina em 02/09 pertence aos dois
 * meses. Antes desta função o portal atribuía o intervalo inteiro ao mês de
 * INÍCIO, então:
 *
 *  - a evolução mensal jogava as 40 h daquela parada inteiras em agosto;
 *  - um filtro de setembro não via o registro (o filtro compara `startDateTime`,
 *    que está em agosto), perdendo horas reais do período.
 *
 * Medido na base em 2026-09-10: 41 registros (0,38%) atravessam mais de um mês,
 * carregando 352,67 h de 30.504,40 h — 1,16% das horas totais.
 *
 * REGRA DE RATEIO
 * ---------------
 * O tempo é distribuído **proporcionalmente ao relógio** em cada mês, mas o que
 * se distribui é `durationHours`, NÃO o delta (fim − início).
 *
 * Isso importa: `durationHours` é a base oficial de tempo do PC-Factory e pode
 * divergir do delta das datas (a planilha traz a própria medição, e o portal a
 * respeita — ver `metricHours()` em pc-factory.service.ts). Ratear o delta
 * introduziria um segundo número oficial. Rateando `durationHours` pela fração
 * do relógio, a soma dos segmentos reproduz `durationHours` exatamente.
 *
 * `realDurationHours` NÃO participa: é auditoria, nunca base de cálculo.
 */

/** Registro mínimo que a segmentação precisa enxergar. */
export type SegmentableRecord = {
  startDateTime: Date | null;
  endDateTime: Date | null;
  durationHours: number;
};

export type PcFactoryTimeSegment = {
  /** Mês do segmento no formato "YYYY-MM" (UTC), igual à chave usada na tendência. */
  monthKey: string;
  /** Recorte do intervalo dentro daquele mês. */
  start: Date;
  end: Date;
  /** Fatia de `durationHours` atribuída a este mês. */
  hours: number;
};

/**
 * Teto de segmentos por registro. Uma data corrompida (ano 2999) geraria
 * milhares de meses vazios e travaria a agregação; acima do teto o registro
 * cai no comportamento antigo (tudo no mês de início), que é conservador.
 */
const MAX_SEGMENTS = 240; // 20 anos

/** Horas consideradas iguais. Abaixo disso é ruído de ponto flutuante. */
export const SEGMENT_TOLERANCE_HOURS = 0.01;

function monthKeyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Primeiro instante do mês seguinte ao da data (UTC). */
function startOfNextMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isValidDate(value: Date | null | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * Divide o registro em um segmento por mês civil (UTC) atravessado.
 *
 * Devolve `[]` quando não há como situar o registro no tempo (sem início
 * válido) — o chamador decide se ignora ou trata à parte.
 *
 * Casos que caem em UM único segmento (o mês de início):
 *  - sem término válido;
 *  - término anterior ou igual ao início (dado inconsistente);
 *  - início e término no mesmo mês;
 *  - intervalo absurdamente longo (acima de MAX_SEGMENTS meses).
 */
export function splitPcFactoryRecordByMonth(record: SegmentableRecord): PcFactoryTimeSegment[] {
  const start = record.startDateTime;
  if (!isValidDate(start)) return [];

  const hours = Number.isFinite(record.durationHours) && record.durationHours > 0 ? record.durationHours : 0;
  const end = record.endDateTime;

  // Sem término utilizável: o registro inteiro pertence ao mês de início.
  if (!isValidDate(end) || end.getTime() <= start.getTime()) {
    return [{ monthKey: monthKeyOf(start), start, end: isValidDate(end) ? end : start, hours: round2(hours) }];
  }

  // Recorta o intervalo nas fronteiras de mês.
  const slices: Array<{ start: Date; end: Date }> = [];
  let cursor = start;
  while (cursor.getTime() < end.getTime()) {
    if (slices.length >= MAX_SEGMENTS) {
      // Intervalo implausível (data corrompida): volta ao comportamento antigo.
      return [{ monthKey: monthKeyOf(start), start, end, hours: round2(hours) }];
    }
    const boundary = startOfNextMonth(cursor);
    const sliceEnd = boundary.getTime() < end.getTime() ? boundary : end;
    slices.push({ start: cursor, end: sliceEnd });
    cursor = sliceEnd;
  }

  if (slices.length <= 1) {
    return [{ monthKey: monthKeyOf(start), start, end, hours: round2(hours) }];
  }

  // Rateia `durationHours` pela fração do relógio de cada fatia.
  const totalMs = end.getTime() - start.getTime();
  const segments: PcFactoryTimeSegment[] = [];
  let distributed = 0;

  for (let i = 0; i < slices.length; i += 1) {
    const slice = slices[i];
    const isLast = i === slices.length - 1;
    // A última fatia recebe o RESTO em vez da sua própria fração: garante que a
    // soma feche exatamente com durationHours, sem acumular erro de arredondamento.
    const sliceHours = isLast
      ? hours - distributed
      : round2((hours * (slice.end.getTime() - slice.start.getTime())) / totalMs);
    distributed = round2(distributed + sliceHours);
    segments.push({
      monthKey: monthKeyOf(slice.start),
      start: slice.start,
      end: slice.end,
      hours: round2(Math.max(0, sliceHours))
    });
  }

  return segments;
}

/** true quando o registro atravessa mais de um mês civil (UTC). */
export function isMultiMonthRecord(record: SegmentableRecord): boolean {
  const { startDateTime: start, endDateTime: end } = record;
  if (!isValidDate(start) || !isValidDate(end) || end.getTime() <= start.getTime()) return false;
  return monthKeyOf(start) !== monthKeyOf(end);
}

/**
 * Horas do registro que caem DENTRO da janela [filterStart, filterEnd].
 *
 * Sobreposição, não contenção: um registro que começou antes da janela e
 * terminou dentro dela contribui com a parte sobreposta. Devolve 0 quando não
 * há interseção.
 *
 * Como em `splitPcFactoryRecordByMonth`, o que se rateia é `durationHours`.
 */
export function overlapHours(record: SegmentableRecord, filterStart: Date | null, filterEnd: Date | null): number {
  const start = record.startDateTime;
  if (!isValidDate(start)) return 0;

  const hours = Number.isFinite(record.durationHours) && record.durationHours > 0 ? record.durationHours : 0;
  if (hours === 0) return 0;

  const end = isValidDate(record.endDateTime) && record.endDateTime.getTime() > start.getTime() ? record.endDateTime : null;

  // Sem término: o registro é tratado como pontual no início — dentro ou fora.
  if (!end) {
    const afterStart = !filterStart || start.getTime() >= filterStart.getTime();
    const beforeEnd = !filterEnd || start.getTime() <= filterEnd.getTime();
    return afterStart && beforeEnd ? round2(hours) : 0;
  }

  const windowStart = filterStart ? Math.max(start.getTime(), filterStart.getTime()) : start.getTime();
  const windowEnd = filterEnd ? Math.min(end.getTime(), filterEnd.getTime()) : end.getTime();
  if (windowEnd <= windowStart) return 0;

  const totalMs = end.getTime() - start.getTime();
  return round2((hours * (windowEnd - windowStart)) / totalMs);
}

/* -------------------------------------------------------------------------- */
/*  Auditoria da segmentação                                                   */
/* -------------------------------------------------------------------------- */

export type SegmentationAudit = {
  /** Registros que atravessam mais de um mês. */
  multiMonthIntervals: number;
  /** Soma de durationHours de todos os registros, sem segmentar. */
  totalOriginalDurationHours: number;
  /** Soma das horas de todos os segmentos gerados. */
  totalSegmentedDurationHours: number;
  /** |original − segmentado|. Precisa ficar em SEGMENT_TOLERANCE_HOURS. */
  difference: number;
  /** true quando a diferença está dentro da tolerância. */
  withinTolerance: boolean;
};

/**
 * Confere que a segmentação não criou nem perdeu tempo.
 *
 * É a trava da TAREFA 9: se a soma dos segmentos divergir do total original em
 * mais de 0,01 h, algum rateio está errado e a importação precisa avisar em vez
 * de publicar números silenciosamente tortos.
 */
export function auditSegmentation(records: readonly SegmentableRecord[]): SegmentationAudit {
  let multiMonthIntervals = 0;
  let original = 0;
  let segmented = 0;

  for (const record of records) {
    const hours = Number.isFinite(record.durationHours) && record.durationHours > 0 ? record.durationHours : 0;
    original += hours;
    if (isMultiMonthRecord(record)) multiMonthIntervals += 1;
    for (const segment of splitPcFactoryRecordByMonth(record)) segmented += segment.hours;
  }

  const totalOriginalDurationHours = round2(original);
  const totalSegmentedDurationHours = round2(segmented);
  const difference = round2(Math.abs(totalOriginalDurationHours - totalSegmentedDurationHours));

  return {
    multiMonthIntervals,
    totalOriginalDurationHours,
    totalSegmentedDurationHours,
    difference,
    withinTolerance: difference <= SEGMENT_TOLERANCE_HOURS
  };
}
