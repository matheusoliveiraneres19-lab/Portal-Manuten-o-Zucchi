"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarRange, Download, Loader2, Search, SlidersHorizontal, Target } from "lucide-react";
import { toast } from "sonner";
import { AREA_LABELS, STATUS_LABELS } from "@/components/team/CollaboratorFormModal";
import { AreaGoalsModal } from "@/components/team/AreaGoalsModal";
import { TeamHoursDrilldownModal } from "@/components/team/TeamHoursDrilldownModal";
import { normalizeNameKey } from "@/lib/name-normalizer";
import type { CollaboratorArea, CollaboratorStatus, TeamHoursOsType, TeamHoursResult, TeamHoursRow } from "@/types/collaborators";

type TeamHoursPanelProps = {
  initial: TeamHoursResult;
  onGoalsChanged?: () => void;
};

const inputClass =
  "h-10 rounded-lg border border-white/14 bg-black/40 px-3 text-sm text-white outline-none transition focus:border-gold/70";

export function TeamHoursPanel({ initial, onGoalsChanged }: TeamHoursPanelProps) {
  const [data, setData] = useState<TeamHoursResult>(initial);
  const [startDate, setStartDate] = useState(initial.startDate.slice(0, 10));
  const [endDate, setEndDate] = useState(initial.endDate.slice(0, 10));
  const [osType, setOsType] = useState<TeamHoursOsType>(initial.osType ?? "all");
  const [loading, setLoading] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [drilldown, setDrilldown] = useState<{ id: string; name: string } | null>(null);

  const [areaFilter, setAreaFilter] = useState<CollaboratorArea | "">("");
  const [statusFilter, setStatusFilter] = useState<CollaboratorStatus | "">("");
  const [nameFilter, setNameFilter] = useState("");

  async function fetchHours(start: string, end: string, type: TeamHoursOsType = osType) {
    if (start && end && start > end) {
      toast.error("A data inicial não pode ser maior que a final.");
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ startDate: start, endDate: end, osType: type });
      const response = await fetch(`/api/collaborators/hours?${params.toString()}`);
      if (!response.ok) throw new Error("request failed");
      const result = (await response.json()) as TeamHoursResult;
      setData(result);
      setStartDate(result.startDate.slice(0, 10));
      setEndDate(result.endDate.slice(0, 10));
      setOsType(result.osType ?? type);
    } catch {
      toast.error("Não foi possível carregar as horas do período.");
    } finally {
      setLoading(false);
    }
  }

  function applyPreset(preset: "atual" | "passado" | "tri" | "ano") {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    let start: Date;
    let end: Date;
    if (preset === "atual") {
      start = new Date(Date.UTC(y, m, 1));
      end = new Date(Date.UTC(y, m + 1, 0));
    } else if (preset === "passado") {
      start = new Date(Date.UTC(y, m - 1, 1));
      end = new Date(Date.UTC(y, m, 0));
    } else if (preset === "tri") {
      start = new Date(Date.UTC(y, m - 2, 1));
      end = new Date(Date.UTC(y, m + 1, 0));
    } else {
      start = new Date(Date.UTC(y, 0, 1));
      end = new Date(Date.UTC(y, 11, 31));
    }
    void fetchHours(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
  }

  // Filtragem client-side (a carga já traz todos os colaboradores).
  const nameKey = normalizeNameKey(nameFilter);
  const filteredRows = useMemo(
    () =>
      data.rows.filter((row) => {
        if (areaFilter && row.area !== areaFilter) return false;
        if (statusFilter && row.status !== statusFilter) return false;
        if (nameKey && !normalizeNameKey(`${row.name} ${row.matricula} ${row.role ?? ""}`).includes(nameKey)) return false;
        return true;
      }),
    [data.rows, areaFilter, statusFilter, nameKey]
  );

  // Totais recalculados sobre o filtro atual.
  const totalHours = round(filteredRows.reduce((sum, row) => sum + row.hours, 0));
  const totalGoal = round(filteredRows.reduce((sum, row) => sum + row.monthlyGoal, 0));
  const overallPercent = totalGoal > 0 ? (totalHours / totalGoal) * 100 : null;
  const belowGoal = filteredRows.filter((row) => row.goalPercent !== null && row.goalPercent < 100).length;

  function exportCsv() {
    if (filteredRows.length === 0) {
      toast.error("Nada para exportar no filtro atual.");
      return;
    }
    const headers = ["Matrícula", "Nome", "Função", "Área", "Status", "Horas", "Nº OS", "Meta (h)", "% da meta"];
    const lines = [
      headers.map(csvCell).join(";"),
      ...filteredRows.map((row) =>
        [
          csvCell(row.matricula),
          csvCell(row.name),
          csvCell(row.role ?? ""),
          csvCell(AREA_LABELS[row.area]),
          csvCell(STATUS_LABELS[row.status]),
          csvNumber(row.hours),
          String(row.orderCount),
          csvNumber(row.monthlyGoal),
          row.goalPercent === null ? "" : csvNumber(row.goalPercent)
        ].join(";")
      )
    ];
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `horas-equipe_${startDate}_a_${endDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado.");
  }

  return (
    <div className={`space-y-4 transition ${loading ? "opacity-70" : ""}`}>
      {/* Período + presets */}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">De</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Até</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
        </div>
        <button
          type="button"
          onClick={() => fetchHours(startDate, endDate)}
          disabled={loading}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-gold/55 bg-gold/15 px-4 text-sm font-bold text-gold transition hover:bg-gold/25 disabled:opacity-70"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarRange className="h-4 w-4" />}
          Aplicar
        </button>
        <div className="flex flex-wrap items-center gap-1.5">
          <PresetButton onClick={() => applyPreset("atual")}>Mês atual</PresetButton>
          <PresetButton onClick={() => applyPreset("passado")}>Mês passado</PresetButton>
          <PresetButton onClick={() => applyPreset("tri")}>Últimos 3 meses</PresetButton>
          <PresetButton onClick={() => applyPreset("ano")}>Ano</PresetButton>
        </div>
        <button
          type="button"
          onClick={() => setGoalsOpen(true)}
          className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg border border-gold/20 px-4 text-sm font-semibold text-zinc-300 transition hover:border-gold/40 hover:text-white"
        >
          <SlidersHorizontal className="h-4 w-4" /> Metas por área
        </button>
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-gold/20 px-4 text-sm font-semibold text-zinc-300 transition hover:border-gold/40 hover:text-white"
        >
          <Download className="h-4 w-4" /> Exportar CSV
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            placeholder="Filtrar por nome, matrícula ou função"
            className="h-10 w-72 rounded-lg border border-white/14 bg-black/40 pl-9 pr-3 text-sm text-white outline-none transition focus:border-gold/70"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as CollaboratorStatus | "")} className={inputClass}>
          <option value="" className="bg-[#0a0b0b]">Todos os status</option>
          {(Object.keys(STATUS_LABELS) as CollaboratorStatus[]).map((s) => (
            <option key={s} value={s} className="bg-[#0a0b0b]">{STATUS_LABELS[s]}</option>
          ))}
        </select>
        <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value as CollaboratorArea | "")} className={inputClass}>
          <option value="" className="bg-[#0a0b0b]">Todas as áreas</option>
          {(Object.keys(AREA_LABELS) as CollaboratorArea[]).map((a) => (
            <option key={a} value={a} className="bg-[#0a0b0b]">{AREA_LABELS[a]}</option>
          ))}
        </select>
        {/* Tipo de OS afeta a SOMA das horas → refaz a busca no servidor. */}
        <select
          value={osType}
          onChange={(e) => {
            const value = e.target.value as TeamHoursOsType;
            setOsType(value);
            void fetchHours(startDate, endDate, value);
          }}
          className={inputClass}
          title="Tipo de Ordem de Manutenção considerado nas horas"
        >
          <option value="all" className="bg-[#0a0b0b]">Todas as OS</option>
          <option value="corrective" className="bg-[#0a0b0b]">Corretivas</option>
          <option value="preventive" className="bg-[#0a0b0b]">Preventivas (PL/PV)</option>
        </select>
        <span className="ml-auto text-[11px] text-zinc-500">{filteredRows.length} de {data.rows.length} colaborador(es)</span>
      </div>

      {/* Resumo */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Horas apontadas" value={`${fmt(totalHours)} h`} icon={Target} />
        <SummaryCard label="Meta (filtro)" value={`${fmt(totalGoal)} h`} icon={Target} />
        <SummaryCard label="% da meta" value={overallPercent === null ? "—" : `${fmt(overallPercent)}%`} icon={Target} />
        <SummaryCard label="Abaixo da meta" value={`${belowGoal}`} icon={AlertTriangle} tone="danger" />
      </section>

      {/* Tabela horas x colaborador */}
      <article className="panel overflow-hidden rounded-lg">
        {filteredRows.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-zinc-500">Nenhum colaborador no filtro atual.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-white/[0.02] text-left text-[11px] font-extrabold uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-2.5">Colaborador</th>
                  <th className="px-4 py-2.5">Área</th>
                  <th className="px-4 py-2.5 text-right">Horas</th>
                  <th className="px-4 py-2.5 text-right">Nº OS</th>
                  <th className="px-4 py-2.5 text-right">Meta</th>
                  <th className="px-4 py-2.5">% da meta</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setDrilldown({ id: row.id, name: row.name })}
                    className="cursor-pointer border-b border-zinc-100 text-zinc-800 transition last:border-0 hover:bg-gold/10"
                    title="Ver as Ordens de Manutenção que compõem estas horas"
                  >
                    <td className="px-4 py-2.5">
                      <div className="font-semibold">{row.name}</div>
                      <div className="text-[11px] text-zinc-500">
                        {row.matricula}
                        {row.role ? ` · ${row.role}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">{AREA_LABELS[row.area]}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{fmt(row.hours)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600">{row.orderCount}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600">{fmt(row.monthlyGoal)}</td>
                    <td className="px-4 py-2.5">
                      <GoalBar percent={row.goalPercent} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-zinc-600">{STATUS_LABELS[row.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <p className="text-[11px] text-zinc-500">
        <span className="font-semibold text-gold">Fonte:</span> Ordens de Manutenção (ServiceOrder · soma de{" "}
        <code className="text-zinc-400">workedHours</code>). Clique em um colaborador para ver as OS que compõem as horas.
      </p>

      {/* Apontamentos sem cadastro */}
      {data.unmatched.length > 0 ? (
        <article className="rounded-lg border border-gold/25 bg-gold/[0.06] p-4">
          <div className="mb-2 flex items-center gap-2 text-gold">
            <AlertTriangle className="h-4 w-4" />
            <h3 className="text-[11px] font-extrabold uppercase tracking-wide">Apontamentos sem colaborador cadastrado</h3>
          </div>
          <p className="mb-3 text-[11px] text-zinc-400">
            Estes nomes têm horas no período mas não casaram com nenhum cadastro. Cadastre-os para que as horas apareçam acima.
          </p>
          <div className="flex flex-wrap gap-2">
            {data.unmatched.map((row) => (
              <span key={row.userName} className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-black/30 px-3 py-1 text-xs text-champagne">
                {row.userName}
                <strong className="text-gold">{fmt(row.hours)} h</strong>
              </span>
            ))}
          </div>
        </article>
      ) : null}

      <AreaGoalsModal
        open={goalsOpen}
        onClose={() => setGoalsOpen(false)}
        onSaved={() => {
          void fetchHours(startDate, endDate);
          onGoalsChanged?.();
        }}
      />

      <TeamHoursDrilldownModal
        target={drilldown}
        startDate={startDate}
        endDate={endDate}
        osType={osType}
        onClose={() => setDrilldown(null)}
      />
    </div>
  );
}

function GoalBar({ percent }: { percent: number | null }) {
  if (percent === null) return <span className="text-xs text-zinc-400">—</span>;
  const width = Math.min(100, Math.max(0, percent));
  const tone = percent >= 100 ? "bg-[#3f8f6b]" : percent >= 60 ? "bg-gold" : "bg-danger/70";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-200">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${width}%` }} />
      </div>
      <span className="tabular-nums text-xs text-zinc-600">{fmt(percent)}%</span>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, tone = "gold" }: { label: string; value: string; icon: typeof Target; tone?: "gold" | "danger" }) {
  return (
    <div className="panel flex items-center gap-3 rounded-lg p-4">
      <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] ${tone === "danger" ? "bg-danger" : "bg-gold"}`}>
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </div>
      <div>
        <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-zinc-800">{label}</h3>
        <div className="text-2xl font-light text-zinc-950">{value}</div>
      </div>
    </div>
  );
}

function PresetButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center rounded-md border border-white/12 px-2.5 text-[11px] font-semibold text-zinc-300 transition hover:border-gold/40 hover:text-gold"
    >
      {children}
    </button>
  );
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function fmt(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function csvNumber(value: number): string {
  return String(value).replace(".", ",");
}
