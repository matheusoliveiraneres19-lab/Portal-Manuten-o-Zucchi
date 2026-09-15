"use client";

import { useMemo, useState } from "react";
import { BarChart3, ClipboardList, Clock, Gauge, Trophy, UserCheck, Users, Wrench, X } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { KpiGrid, type KpiCardData } from "@/components/ui/KpiGrid";
import { DataQualityPanel } from "@/components/ui/DataQualityPanel";
import { WorkforceMemberDrawer } from "@/components/team/WorkforceMemberDrawer";
import type { WorkforcePageData } from "@/types/workforce";

const TOP_INICIAL = 10;

/**
 * EQUIPE DE MANUTENÇÃO — seção de carga de trabalho.
 *
 * Fica ABAIXO do cadastro: o cadastro continua sendo o que era, e esta seção responde
 * a pergunta gerencial que faltava — quanto cada um trabalhou, em quantas ordens e em
 * que equipamentos. Todas as horas vêm de `ServiceOrder.workedHours` agregado no
 * service; nada é apontado aqui e nenhum número é recalculado no componente.
 */
export function WorkforceAnalysis({ data, periodLabel }: { data: WorkforcePageData; periodLabel: string }) {
  const [verTodos, setVerTodos] = useState(false);
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const int = (value: number) => value.toLocaleString("pt-BR");
  const horas = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;

  const cards: KpiCardData[] = [
    {
      title: "Colaboradores ativos",
      value: int(data.kpis.activeCollaborators),
      description: "No cadastro da equipe",
      icon: Users,
      tone: "blue"
    },
    {
      title: "Horas apontadas",
      value: horas(data.kpis.workedHours),
      valueTitle: `${data.kpis.workedHours.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} h — soma de trabalho real das ordens do período`,
      description: "Soma de trabalho real das OS",
      icon: Clock,
      tone: "gold"
    },
    {
      title: "OS com apontamento",
      value: int(data.kpis.ordersWithHours),
      description: "Ordens com trabalho real > 0",
      icon: ClipboardList,
      tone: "blue"
    },
    {
      title: "Média por colaborador",
      value: data.kpis.averageHoursPerCollaborator === null ? "—" : horas(data.kpis.averageHoursPerCollaborator),
      description:
        data.kpis.averageHoursPerCollaborator === null
          ? "Sem horas apontadas no período"
          : "Entre quem apontou horas",
      icon: Gauge,
      tone: "green"
    },
    {
      title: "Mais horas",
      value: data.kpis.topByHours?.name ?? "—",
      valueTitle: data.kpis.topByHours ? `${data.kpis.topByHours.name} — ${horas(data.kpis.topByHours.value)}` : undefined,
      description: data.kpis.topByHours ? horas(data.kpis.topByHours.value) : "Sem apontamento no período",
      icon: Trophy,
      tone: "gold"
    },
    {
      title: "Mais ordens",
      value: data.kpis.topByOrders?.name ?? "—",
      valueTitle: data.kpis.topByOrders ? `${data.kpis.topByOrders.name} — ${int(data.kpis.topByOrders.value)} OS` : undefined,
      description: data.kpis.topByOrders ? `${int(data.kpis.topByOrders.value)} ordens` : "Sem ordens no período",
      icon: UserCheck,
      tone: "blue"
    }
  ];

  const ranking = useMemo(
    () => (verTodos ? data.members : data.members.slice(0, TOP_INICIAL)),
    [data.members, verTodos]
  );
  const maxHoras = useMemo(() => Math.max(...data.members.map((m) => m.workedHours), 0) || 1, [data.members]);
  const maxOrdens = useMemo(() => Math.max(...data.members.map((m) => m.totalOrders), 0) || 1, [data.members]);

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-gold">Carga de trabalho da equipe</h2>
          <p className="mt-0.5 text-[11px] text-zinc-400">
            Horas e ordens por responsável, direto das Ordens de Manutenção — período: {periodLabel}.
          </p>
        </div>
      </header>

      {data.members.length === 0 ? (
        <article className="panel rounded-lg p-4">
          <EmptyState
            icon={Users}
            title="Sem ordens no período selecionado"
            description="Ajuste o filtro de período no topo do portal ou importe Ordens de Manutenção para ver a carga da equipe."
          />
        </article>
      ) : (
        <>
          <KpiGrid cards={cards} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" />

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
            {/* Horas por colaborador — barras horizontais, maior → menor. */}
            <article className="panel flex flex-col rounded-lg p-4 xl:col-span-7">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">
                  Horas apontadas por colaborador
                </h3>
                {data.members.length > TOP_INICIAL ? (
                  <button
                    type="button"
                    onClick={() => setVerTodos((value) => !value)}
                    className="inline-flex h-7 items-center gap-1.5 rounded-md border border-gold/40 px-2.5 text-[11px] font-semibold text-gold-deep transition hover:border-gold hover:bg-gold/10"
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                    {verTodos ? `Top ${TOP_INICIAL}` : `Ver todos (${data.members.length})`}
                  </button>
                ) : null}
              </div>

              <div className="space-y-1.5">
                {ranking.map((member) => (
                  <button
                    key={member.key}
                    type="button"
                    onClick={() => setSelecionado(member.key)}
                    title={[
                      member.name,
                      `Horas apontadas: ${horas(member.workedHours)}`,
                      `Quantidade de OS: ${int(member.totalOrders)}`,
                      `Média h/OS: ${member.averageHoursPerOrder === null ? "—" : horas(member.averageHoursPerOrder)}`
                    ].join("\n")}
                    className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-[11px] transition duration-200 ease-premium hover:bg-gold/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold"
                  >
                    <span className="w-44 shrink-0 truncate text-zinc-700">
                      {member.name}
                      {member.unregistered ? <span className="ml-1 text-[9px] text-amber-600">fora do cadastro</span> : null}
                    </span>
                    <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-black/[0.06]">
                      <span
                        className="block h-full rounded-full bg-gold transition-[width] duration-500 ease-premium"
                        style={{ width: `${(member.workedHours / maxHoras) * 100}%` }}
                      />
                    </span>
                    <span className="w-20 shrink-0 text-right tabular-nums font-semibold text-ink">
                      {horas(member.workedHours)}
                    </span>
                  </button>
                ))}
              </div>
            </article>

            {/* Ordens por colaborador — abertas x fechadas empilhadas. */}
            <article className="panel flex flex-col rounded-lg p-4 xl:col-span-5">
              <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">Ordens por colaborador</h3>
              <p className="mb-3 text-[11px] text-zinc-500">Abertas e fechadas no período.</p>

              <div className="space-y-1.5">
                {ranking.map((member) => (
                  <div key={member.key} className="flex items-center gap-2 text-[11px]">
                    <span className="w-32 shrink-0 truncate text-zinc-700" title={member.name}>
                      {member.name}
                    </span>
                    <span
                      className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-black/[0.06]"
                      title={`${int(member.openOrders)} abertas · ${int(member.closedOrders)} fechadas · ${int(member.totalOrders)} no total`}
                    >
                      <span
                        className="h-full bg-danger transition-[width] duration-500 ease-premium"
                        style={{ width: `${(member.openOrders / maxOrdens) * 100}%` }}
                      />
                      <span
                        className="h-full bg-success transition-[width] duration-500 ease-premium"
                        style={{ width: `${(member.closedOrders / maxOrdens) * 100}%` }}
                      />
                    </span>
                    <span className="w-14 shrink-0 text-right tabular-nums text-zinc-700">{int(member.totalOrders)}</span>
                  </div>
                ))}
              </div>

              <p className="mt-3 flex items-center gap-3 text-[10px] text-zinc-500">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-danger" /> Abertas
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-success" /> Fechadas
                </span>
              </p>
            </article>

            {/* Esforço por equipamento — onde a equipe gastou tempo. */}
            <article className="panel flex flex-col rounded-lg p-4 xl:col-span-12">
              <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">
                Esforço da equipe por equipamento
              </h3>
              <p className="mb-3 text-[11px] text-zinc-500">
                Onde a equipe gastou mais tempo no período. <strong className="text-zinc-700">Não é criticidade</strong> —
                um equipamento pode concentrar horas por uma única intervenção longa.
              </p>

              {data.equipmentEffort.length === 0 ? (
                <EmptyState
                  icon={Wrench}
                  title="Sem horas por equipamento no período"
                  description="As ordens do período não têm equipamento informado ou não têm trabalho real apontado."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-zinc-200 text-[10px] uppercase tracking-wide text-zinc-500">
                        <th className="px-2 py-2 font-bold">Equipamento</th>
                        <th className="px-2 py-2 text-right font-bold">Horas</th>
                        <th className="px-2 py-2 text-right font-bold">OS</th>
                        <th className="px-2 py-2 font-bold">Principais responsáveis</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.equipmentEffort.map((row) => (
                        <tr key={row.equipment} className="border-b border-zinc-100 transition hover:bg-gold/5 last:border-0">
                          <td className="max-w-[320px] truncate px-2 py-2 font-medium text-zinc-800" title={row.equipment}>
                            {row.equipment}
                          </td>
                          <td className="px-2 py-2 text-right font-semibold tabular-nums text-ink">{horas(row.workedHours)}</td>
                          <td className="px-2 py-2 text-right tabular-nums text-zinc-700">{int(row.totalOrders)}</td>
                          <td className="max-w-[320px] truncate px-2 py-2 text-zinc-600" title={row.topResponsibles.join(", ")}>
                            {row.topResponsibles.join(", ") || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </div>
        </>
      )}

      <DataQualityPanel quality={data.dataQuality} />

      <WorkforceMemberDrawer
        memberKey={selecionado}
        startDate={data.period.startDate}
        endDate={data.period.endDate}
        onClose={() => setSelecionado(null)}
      />
    </section>
  );
}
