/**
 * Manutenção em FIM DE SEMANA (sábado 00:00 → segunda 00:00) — funções puras.
 *
 * REGRA
 * -----
 * Um registro é um INTERVALO. Não se classifica a duração inteira pela data de
 * início: o intervalo é fatiado nas meias-noites locais e só as fatias que caem em
 * sábado ou domingo somam. Sexta 22:00 → sábado 04:00 tem 6 h, das quais 4 h são FDS.
 * Cada instante pertence a exatamente um dia local — não há dupla contagem.
 *
 * TIMEZONE
 * --------
 * O calendário é o de America/Sao_Paulo, resolvido via Intl (não depende do TZ do
 * servidor da Vercel, que é UTC).
 *
 * ATENÇÃO às datas gravadas do PC-Factory: o importador monta `startDateTime` /
 * `endDateTime` com `Date.UTC(...)` a partir do relógio da planilha, ou seja, os
 * campos UTC da data JÁ SÃO o horário de parede de São Paulo (a tabela exibe com
 * `timeZone: "UTC"` pelo mesmo motivo). `pcFactoryWallClockToInstant` converte esse
 * horário de parede no instante real antes do cálculo — sem isso um registro de
 * sábado 00:00–03:00 seria lido como sexta 21:00–24:00.
 */
import { isMaintenanceKpi } from "@/utils/pc-factory-normalizer";

export const PC_FACTORY_TIMEZONE = "America/Sao_Paulo";

const MS_PER_HOUR = 3_600_000;

/**
 * Teto de dias percorridos por intervalo. Uma data corrompida (ano 2999) faria o
 * laço andar centenas de milhares de dias; acima do teto o intervalo não é
 * considerado FDS (conservador — mesmo espírito do MAX_SEGMENTS da segmentação).
 */
const MAX_DAYS = 7400; // ~20 anos

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    formatters.set(timezone, formatter);
  }
  return formatter;
}

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function localParts(instantMs: number, timezone: string): LocalParts {
  const parts: Record<string, number> = {};
  for (const part of formatterFor(timezone).formatToParts(new Date(instantMs))) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === 24 ? 0 : parts.hour,
    minute: parts.minute,
    second: parts.second
  };
}

/** Deslocamento (ms) do fuso em relação ao UTC naquele instante. São Paulo hoje = −3 h. */
function offsetMs(instantMs: number, timezone: string): number {
  const p = localParts(instantMs, timezone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instantMs / 1000) * 1000;
}

/** Instante real de um horário de parede (ano, mês 1-12, dia, h, min, s) no fuso. */
function wallTimeToInstantMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  timezone: string
): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  // Segunda passada corrige o caso em que o palpite caiu do outro lado de uma troca de horário de verão.
  const firstPass = guess - offsetMs(guess, timezone);
  return guess - offsetMs(firstPass, timezone);
}

/**
 * Converte uma data GRAVADA do PC-Factory (horário de parede codificado nos campos
 * UTC) no instante real em `timezone`.
 */
export function pcFactoryWallClockToInstant(wallClock: Date, timezone: string = PC_FACTORY_TIMEZONE): Date {
  return new Date(
    wallTimeToInstantMs(
      wallClock.getUTCFullYear(),
      wallClock.getUTCMonth() + 1,
      wallClock.getUTCDate(),
      wallClock.getUTCHours(),
      wallClock.getUTCMinutes(),
      wallClock.getUTCSeconds(),
      wallClock.getUTCMilliseconds(),
      timezone
    )
  );
}

function isValidDate(value: Date | null | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * Horas EXATAS do intervalo [start, end) que caem em sábado ou domingo no calendário
 * local de `timezone`. Intervalo vazio, invertido ou inválido → 0.
 */
export function calculateWeekendMaintenanceHours({
  start,
  end,
  timezone = PC_FACTORY_TIMEZONE
}: {
  start: Date;
  end: Date;
  timezone?: string;
}): number {
  if (!isValidDate(start) || !isValidDate(end)) return 0;
  const startMs = start.getTime();
  const endMs = end.getTime();
  if (endMs <= startMs) return 0;

  const first = localParts(startMs, timezone);
  // Dia local corrente como data UTC "pura" (só ano/mês/dia) — facilita avançar dia a dia.
  let day = new Date(Date.UTC(first.year, first.month - 1, first.day));
  let dayStartMs = wallTimeToInstantMs(first.year, first.month, first.day, 0, 0, 0, 0, timezone);

  let weekendMs = 0;
  for (let i = 0; dayStartMs < endMs; i += 1) {
    if (i >= MAX_DAYS) return 0;
    const next = new Date(day.getTime() + 86_400_000);
    const nextStartMs = wallTimeToInstantMs(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, 0, 0, timezone);
    const weekday = day.getUTCDay(); // 0 = domingo, 6 = sábado
    if (weekday === 0 || weekday === 6) {
      const overlap = Math.min(endMs, nextStartMs) - Math.max(startMs, dayStartMs);
      if (overlap > 0) weekendMs += overlap;
    }
    day = next;
    dayStartMs = nextStartMs;
  }

  return weekendMs / MS_PER_HOUR;
}

/** Registro mínimo para medir a manutenção em fim de semana. */
export type WeekendMeasurableRecord = {
  startDateTime: Date | null;
  endDateTime: Date | null;
  durationHours: number;
};

/**
 * Horas de FDS de um registro GRAVADO do PC-Factory, na base oficial `durationHours`.
 *
 * Como em `overlapHours` (pc-factory-segments), o que se rateia é `durationHours` pela
 * fração do relógio que cai no fim de semana. Quando a duração bate com o delta das
 * datas (o caso normal) o resultado é exatamente a sobreposição; quando diverge, a
 * fatia continua limitada à duração oficial — 0 ≤ FDS ≤ durationHours sempre.
 *
 * NÃO filtra por status: quem chama decide se o registro é manutenção
 * (ver `pcFactoryMaintenanceWeekendHours`).
 */
export function pcFactoryRecordWeekendHours(record: WeekendMeasurableRecord, timezone: string = PC_FACTORY_TIMEZONE): number {
  const hours = Number.isFinite(record.durationHours) && record.durationHours > 0 ? record.durationHours : 0;
  if (hours === 0) return 0;
  const { startDateTime, endDateTime } = record;
  if (!isValidDate(startDateTime) || !isValidDate(endDateTime)) return 0;
  const spanMs = endDateTime.getTime() - startDateTime.getTime();
  if (spanMs <= 0) return 0;

  const start = pcFactoryWallClockToInstant(startDateTime, timezone);
  const end = pcFactoryWallClockToInstant(endDateTime, timezone);
  const realSpanHours = (end.getTime() - start.getTime()) / MS_PER_HOUR;
  if (realSpanHours <= 0) return 0;

  const weekend = calculateWeekendMaintenanceHours({ start, end, timezone });
  return Math.min(hours, Math.max(0, (hours * weekend) / realSpanHours));
}

/**
 * Horas de FDS de um registro, contando SÓ o que é manutenção pela classificação
 * central (`isMaintenanceKpi` — a mesma do "ENTRA KPI MANUTENÇÃO?"). Produção, Setup
 * e qualquer outro status → 0, mesmo em sábado/domingo.
 */
export function pcFactoryMaintenanceWeekendHours(
  record: WeekendMeasurableRecord & { statusRaw: string | null },
  timezone: string = PC_FACTORY_TIMEZONE
): number {
  if (!isMaintenanceKpi(record.statusRaw)) return 0;
  return pcFactoryRecordWeekendHours(record, timezone);
}

/** % do tempo de manutenção que caiu no fim de semana. Denominador 0 → 0; sempre em [0, 100]. */
export function calculateWeekendPercentage(weekendMaintenanceHours: number, totalMaintenanceHours: number): number {
  if (!Number.isFinite(totalMaintenanceHours) || totalMaintenanceHours <= 0) return 0;
  if (!Number.isFinite(weekendMaintenanceHours) || weekendMaintenanceHours <= 0) return 0;
  return Math.min(100, (weekendMaintenanceHours / totalMaintenanceHours) * 100);
}
