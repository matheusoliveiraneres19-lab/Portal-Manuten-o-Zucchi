import { CriticalityScoreBadge } from "@/components/critical-equipments/CriticalityScoreBadge";
import type { CriticalEquipmentItem } from "@/types/critical-equipments";

type CriticalEquipmentTableProps = {
  items: CriticalEquipmentItem[];
};

export function CriticalEquipmentTable({ items }: CriticalEquipmentTableProps) {
  return (
    <article className="panel overflow-hidden rounded-lg">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Análise detalhada por equipamento</h3>
          <p className="mt-0.5 text-xs text-zinc-500">Ordenado por volume de ordens e esforço de manutenção.</p>
        </div>
        <span className="rounded-md border border-gold/40 bg-gold/15 px-2.5 py-1 text-[11px] font-bold text-[#7a5a16]">
          {items.length} equipamento(s)
        </span>
      </div>

      <div className="max-h-[60vh] overflow-auto">
        <table className="w-full min-w-[1180px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-[#efe7d8] text-[10px] uppercase tracking-wide text-[#5a3d12]">
            <tr className="border-b border-zinc-300">
              <th className="px-3 py-2.5 font-bold">#</th>
              <th className="px-3 py-2.5 font-bold">Equipamento</th>
              <th className="px-3 py-2.5 font-bold">Código técnico</th>
              <th className="px-3 py-2.5 text-right font-bold">Total OS</th>
              <th className="px-3 py-2.5 text-right font-bold">Abertas</th>
              <th className="px-3 py-2.5 text-right font-bold">Liberadas</th>
              <th className="px-3 py-2.5 text-right font-bold">Em and.</th>
              <th className="px-3 py-2.5 text-right font-bold">Fechadas</th>
              <th className="px-3 py-2.5 text-right font-bold">Horas</th>
              <th className="px-3 py-2.5 font-bold">Última OS</th>
              <th className="px-3 py-2.5 font-bold">Grupo principal</th>
              <th className="px-3 py-2.5 font-bold">Responsável principal</th>
              <th className="px-3 py-2.5 font-bold">Score crítico</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={`${item.equipmentCode}-${item.position}`} className="border-b border-zinc-100 transition hover:bg-gold/[0.06]">
                <td className="px-3 py-2.5 font-bold text-zinc-500">{String(item.position).padStart(2, "0")}</td>
                <td className="max-w-[240px] px-3 py-2.5">
                  <p className="truncate font-semibold text-zinc-900" title={item.equipmentName}>
                    {item.equipmentName}
                  </p>
                </td>
                <td className="px-3 py-2.5 text-zinc-600">{display(item.equipmentCode)}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-zinc-900">{int(item.totalOrders)}</td>
                <td className="px-3 py-2.5 text-right text-zinc-700">{int(item.openOrders)}</td>
                <td className="px-3 py-2.5 text-right text-zinc-700">{int(item.releasedOrders)}</td>
                <td className="px-3 py-2.5 text-right text-zinc-700">{int(item.inProgressOrders)}</td>
                <td className="px-3 py-2.5 text-right text-zinc-700">{int(item.closedOrders)}</td>
                <td className="px-3 py-2.5 text-right font-medium text-zinc-900">{hours(item.totalWorkedHours)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-zinc-700">{date(item.lastOrderDate)}</td>
                <td className="max-w-[180px] px-3 py-2.5">
                  <span className="block truncate text-zinc-700" title={item.mainPlanningGroup}>
                    {item.mainPlanningGroup}
                  </span>
                </td>
                <td className="max-w-[200px] px-3 py-2.5">
                  <span className="block truncate text-zinc-700" title={item.mainResponsible}>
                    {item.mainResponsible}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <CriticalityScoreBadge score={item.criticalityScore} label={item.criticalityLabel} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function int(value: number): string {
  return value.toLocaleString("pt-BR");
}

function hours(value: number): string {
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} H`;
}

function date(value: string | null): string {
  if (!value) {
    return "Não informado";
  }
  return new Date(value).toLocaleDateString("pt-BR");
}

function display(value: string): string {
  return value && value !== "SEM CÓDIGO" ? value : "Não informado";
}
