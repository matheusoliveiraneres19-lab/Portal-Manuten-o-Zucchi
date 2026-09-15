"use client";

import { AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { normalizeMachineName } from "@/utils/technical-object-normalizer";
import type { PcFactoryReliabilityRow } from "@/types/pc-factory";

type PcFactoryReliabilityTableProps = {
  rows: PcFactoryReliabilityRow[];
  className?: string;
  onSelect?: (resourceName: string) => void;
};

/** Quantas máquinas listar (mais críticas primeiro, por horas de parada de manutenção). */
const MAX_ROWS = 12;

/** Fórmulas oficiais (tooltip do cabeçalho — base: Tempo Decorrido / durationHours). */
const HEADER_HINTS = {
  failures: "Quebras = eventos de manutenção (Mecânica + Elétrica + Automação + Terceiros + Aguardando).",
  mtbf: "MTBF = Tempo Operacional / Quebras  (Tempo Operacional = Tempo de Carga − Setup).",
  mttr:
    "MTTR = Tempo de reparo corretivo / Quebras  (reparo = Mecânica + Elétrica + Automação + Terceiros). " +
    "Não inclui Aguardando Manutenção (é o MTTA) nem Manutenção Planejada (não é falha).",
  mtta: "MTTA = Tempo aguardando manutenção / Quebras.",
  downtime:
    "Paradas = Manutenção total = Mecânica + Elétrica + Automação + Planejada + Terceiros + Aguardando. " +
    "É o mesmo número do card Horas de Manutenção e do que a Disponibilidade subtrai — maior que o " +
    "numerador do MTTR, que é só o reparo corretivo. Passe o mouse na célula para ver a composição.",
  availability:
    "Disponibilidade = (LOADTIME − (Manutenção + Aguardando Manutenção)) / LOADTIME × 100, " +
    "com LOADTIME = Tempo de Carga − Setup (= G0134.LOADTIME). Soma direta de horas: não usa " +
    "MTTR, MTBF, MTTA nem quebras. Passe o mouse na célula para ver a conta da máquina."
} as const;

/**
 * Tabela de confiabilidade por máquina: nº de quebras, MTBF, MTTR, MTTA, paradas e
 * disponibilidade. Os valores vêm prontos do service central (regras oficiais do
 * PC-Factory, base Tempo Decorrido); indicadores não aplicáveis chegam como null e
 * são exibidos como "—" (nunca 0 h / 0% indevido). Clique numa linha para detalhar.
 */
export function PcFactoryReliabilityTable({ rows, className = "", onSelect }: PcFactoryReliabilityTableProps) {
  const data = rows.slice(0, MAX_ROWS);

  return (
    <article className={`panel rounded-lg p-4 ${className}`}>
      <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">Confiabilidade por máquina</h3>
      <p className="mb-3 text-[11px] text-zinc-500">
        Quebras, MTBF (tempo médio entre falhas), MTTR (reparo), MTTA (aguardando) e disponibilidade. Base: Tempo
        Decorrido. Passe o mouse nos títulos para ver as fórmulas. Clique para detalhar.
      </p>

      {data.length === 0 ? (
        <EmptyState title="Sem manutenção no período" description="Nenhuma máquina registrou eventos de manutenção." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-[11px] font-extrabold uppercase tracking-wide text-zinc-500">
                <th className="py-2 pr-3">Máquina</th>
                <th className="px-3 py-2 text-right" title={HEADER_HINTS.failures}>Quebras</th>
                <th className="px-3 py-2 text-right" title={HEADER_HINTS.mtbf}>MTBF</th>
                <th className="px-3 py-2 text-right" title={HEADER_HINTS.mttr}>MTTR</th>
                <th className="px-3 py-2 text-right" title={HEADER_HINTS.mtta}>MTTA</th>
                <th className="px-3 py-2 text-right" title={HEADER_HINTS.downtime}>Paradas</th>
                <th className="py-2 pl-3 text-right" title={HEADER_HINTS.availability}>Disponib.</th>
              </tr>
            </thead>
            {/* Linha clicável precisa ser alcançável pelo teclado: era só um onClick
                em <tr>, então quem navega por Tab nunca chegava ao detalhe da
                máquina. Enter e Espaço abrem, e o foco fica visível. */}
            <tbody>
              {data.map((row) => (
                <tr
                  key={row.machineName}
                  onClick={() => onSelect?.(row.machineName)}
                  onKeyDown={(event) => {
                    if (!onSelect) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(row.machineName);
                    }
                  }}
                  tabIndex={onSelect ? 0 : undefined}
                  role={onSelect ? "button" : undefined}
                  aria-label={onSelect ? `Ver detalhes de ${row.machineName}` : undefined}
                  className={`border-b border-zinc-100 text-zinc-800 transition duration-200 ease-premium last:border-0 ${
                    onSelect
                      ? "cursor-pointer hover:bg-gold/10 focus-visible:bg-gold/10 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold"
                      : ""
                  }`}
                >
                  {/* Nome normalizado só para LEITURA (FASE 3). O agrupamento e o
                      clique continuam usando `row.machineName` cru — a normalização
                      arruma grafia, não identidade de ativo. */}
                  <td className="max-w-[220px] truncate py-2 pr-3 font-semibold" title={row.dataQualityIssue ?? row.machineName}>
                    <span className="inline-flex items-center gap-1.5">
                      {row.dataQualityIssue ? (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-gold" aria-label={row.dataQualityIssue} />
                      ) : null}
                      <span className="truncate">{normalizeMachineName(row.machineName) || row.machineName}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.failureEvents.toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatHours(row.mtbf)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatHours(row.mttr)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatHours(row.mtta)}</td>
                  <td className="px-3 py-2 text-right tabular-nums" title={downtimeBreakdown(row)}>
                    {formatHours(row.downtimeHours)}
                  </td>
                  <td className="py-2 pl-3 text-right" title={availabilityBreakdown(row)}>
                    <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${availabilityClass(row.availability)}`}>
                      {formatPercent(row.availability)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

/** Horas em pt-BR (1 casa). null/NaN/Infinity → "—" (nunca exibe 0 h indevido). */
function formatHours(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
}

/** Percentual em pt-BR (1 casa). null/NaN/Infinity → "—" (nunca exibe 0% indevido). */
function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/**
 * Verde ≥ 90%, âmbar 70-90%, vermelho < 70% (metas usuais de disponibilidade).
 *
 * O vermelho e o âmbar ganharam borda e peso: num fundo claro, só o preenchimento a
 * 15% deixava a faixa crítica com contraste parecido com o da faixa boa — que é
 * justamente o oposto do que a tabela precisa comunicar de relance.
 */
/**
 * Composição das Paradas da máquina, para a célula não ser um número sem origem.
 * Corretiva e Planejada aparecem separadas justamente porque só a corretiva entra
 * no MTTR — as duas somam nas Paradas e na Disponibilidade.
 */
function downtimeBreakdown(row: PcFactoryReliabilityRow): string {
  const h = (value: number) => `${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`;
  return [
    `Composição das Paradas — ${normalizeMachineName(row.machineName) || row.machineName}`,
    `Reparo corretivo (Mec. + Elét. + Autom. + Terceiros): ${h(row.repairHours)}`,
    `Manutenção Planejada: ${h(row.plannedMaintenanceHours)}`,
    `Aguardando Manutenção: ${h(row.waitingMaintenanceHours)}`,
    `Total: ${h(row.maintenanceDowntimeHours)}`,
    "Só o reparo corretivo entra no MTTR; Aguardando entra no MTTA."
  ].join("\n");
}

/**
 * A conta da Disponibilidade da máquina aberta na célula — os mesmos termos das colunas
 * do relatório oficial G0134, para conferir sem sair da tela.
 */
function availabilityBreakdown(row: PcFactoryReliabilityRow): string {
  const h = (value: number) => `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`;
  return [
    `Disponibilidade — ${normalizeMachineName(row.machineName) || row.machineName}`,
    `LOADTIME: ${h(row.loadTimeHours)}  (carga ${h(row.plannedHours)} − setup ${h(row.plannedStopHours)})`,
    `Manutenção: ${h(row.maintenanceHours)}`,
    `Aguardando: ${h(row.waitingMaintenanceHours)}`,
    `Manutenção total usada: ${h(row.maintenanceDowntimeHours)}`,
    `Disponibilidade: ${formatPercent(row.availability)}`,
    "(LOADTIME − manutenção total) ÷ LOADTIME × 100 — sem MTTR/MTBF/MTTA/quebras."
  ].join("\n");
}

function availabilityClass(value: number | null): string {
  if (value === null) return "border border-zinc-300 bg-zinc-100 text-zinc-600";
  if (value >= 90) return "border border-success/30 bg-success/15 text-success-strong";
  if (value >= 70) return "border border-gold/45 bg-gold/25 text-gold-deep";
  return "border border-danger/50 bg-danger/20 font-extrabold text-danger";
}
