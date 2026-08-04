"use client";

import { ChevronDown, Info } from "lucide-react";
import type { PcFactoryKpis } from "@/types/pc-factory";

type PcFactoryAvailabilityExplainerProps = {
  kpis: PcFactoryKpis;
};

/**
 * Seção discreta e expansível que documenta, na própria tela, como a Disponibilidade é
 * calculada — e mostra os números do recorte atual em cada etapa da fórmula oficial do
 * PC-Factory Management View. Serve para o gestor conferir passo a passo contra o
 * PC-Factory sem precisar abrir o código.
 *
 * Usa <details>/<summary> nativo: sem estado, sem JS, funciona com teclado e leitor de tela.
 */
export function PcFactoryAvailabilityExplainer({ kpis }: PcFactoryAvailabilityExplainerProps) {
  const steps = [
    {
      label: "Tempo de Carga",
      formula: "Total − Fora de Turno − Recurso Não Programado",
      value: hours(kpis.loadHours),
      detail: `${hours(kpis.totalHours)} − ${hours(kpis.outOfShiftHours)} − ${hours(kpis.unscheduledResourceHours)}`
    },
    {
      label: "Tempo Operacional",
      formula: "Tempo de Carga − Paradas Planejadas",
      value: hours(kpis.operationalHours),
      detail: `${hours(kpis.loadHours)} − ${hours(kpis.plannedStopHours)}`
    },
    {
      label: "Tempo Trabalhado",
      formula: "Tempo Operacional − Paradas Não Planejadas",
      value: hours(kpis.workedHours),
      detail: `${hours(kpis.operationalHours)} − ${hours(kpis.stoppedHours)}`
    },
    {
      label: "Disponibilidade",
      formula: "Tempo Trabalhado ÷ Tempo Operacional",
      value: percent(kpis.availabilityPercent),
      detail: `${hours(kpis.workedHours)} ÷ ${hours(kpis.operationalHours)}`
    }
  ];

  return (
    <details className="panel group rounded-lg px-4 py-3 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[12px] font-semibold text-zinc-700 transition hover:text-zinc-950">
        <Info className="h-4 w-4 shrink-0 text-petroleum" strokeWidth={1.8} />
        Como a disponibilidade é calculada?
        <ChevronDown className="ml-auto h-4 w-4 shrink-0 transition group-open:rotate-180" strokeWidth={1.8} />
      </summary>

      <div className="mt-3 space-y-3 border-t border-zinc-200 pt-3">
        <p className="text-[11px] leading-relaxed text-zinc-500">
          Regra oficial do PC-Factory Management View. Os valores abaixo são do período e dos filtros
          selecionados agora — devem bater com o Management View para o mesmo recorte.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[11px]">
            <thead>
              <tr className="text-zinc-500">
                <th className="pb-1 font-semibold">Etapa</th>
                <th className="pb-1 font-semibold">Fórmula</th>
                <th className="pb-1 font-semibold">Cálculo</th>
                <th className="pb-1 text-right font-semibold">Valor</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((step) => (
                <tr key={step.label} className="border-t border-zinc-100">
                  <td className="py-1.5 font-semibold text-zinc-800">{step.label}</td>
                  <td className="py-1.5 text-zinc-500">{step.formula}</td>
                  <td className="py-1.5 font-mono text-[10px] text-zinc-500">{step.detail}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums text-zinc-950">{step.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[10px] leading-relaxed text-zinc-400">
          Fora de Turno e Recurso Não Programado ficam fora do Tempo de Carga. Setup, Refeição e Limpeza
          de Setor contam como Parada Planejada. Manutenção (Mecânica, Elétrica, Automação e Aguardando),
          falta de material e ausência de operador contam como Parada Não Planejada.
        </p>
      </div>
    </details>
  );
}

function hours(value: number): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
}

function percent(value: number | null): string {
  return value === null ? "Dados insuficientes" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}
