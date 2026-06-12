"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Table2 } from "lucide-react";
import type { PcFactoryRecordsResult, PcFactoryStatusCategory } from "@/types/pc-factory";

export type RecordsTableFilters = {
  startDate: string;
  endDate: string;
  resources: string[];
  productionLines: string[];
  groupPortals: string[];
  sectors: string[];
  shifts: string[];
  statusNames: string[];
  categories: string[];
  onlyMaintenance: boolean;
  onlyMechanical: boolean;
  onlyElectrical: boolean;
  onlyAutomation: boolean;
  onlyWaiting: boolean;
  excludeOutOfPlanned: boolean;
  search: string;
};

const MAINTENANCE_TYPE_LABELS: Record<string, string> = {
  MECANICA: "Mecânica",
  ELETRICA: "Elétrica",
  AUTOMACAO: "Automação",
  AGUARDANDO: "Aguardando"
};

type PcFactoryRecordsTableProps = {
  initial: PcFactoryRecordsResult;
  filters: RecordsTableFilters;
  onSelectResource: (resourceName: string) => void;
};

const PAGE_SIZES = [25, 50, 100];

const categoryBadge: Record<PcFactoryStatusCategory, string> = {
  MANUTENCAO: "bg-amber-100 text-amber-800",
  PRODUCAO: "bg-emerald-100 text-emerald-700",
  SETUP: "bg-sky-100 text-sky-700",
  PARADA_PERDA: "bg-rose-100 text-rose-700",
  OPERACIONAL: "bg-zinc-200 text-zinc-700",
  EXCLUIR_TEMPO_PLANEJADO: "bg-zinc-200 text-zinc-600",
  OUTROS: "bg-zinc-100 text-zinc-600"
};

export function PcFactoryRecordsTable({ initial, filters, onSelectResource }: PcFactoryRecordsTableProps) {
  const [result, setResult] = useState(initial);
  const [pageSize, setPageSize] = useState(initial.pageSize);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);
  const filtersSig = JSON.stringify(filters);

  useEffect(() => {
    setResult(initial);
    setPageSize(initial.pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersSig]);

  function load(nextPage: number, nextSize: number) {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);

    const params = new URLSearchParams();
    if (filters.startDate) params.set("startDate", filters.startDate);
    if (filters.endDate) params.set("endDate", filters.endDate);
    filters.resources.forEach((v) => params.append("resource", v));
    filters.productionLines.forEach((v) => params.append("line", v));
    filters.groupPortals.forEach((v) => params.append("group", v));
    filters.sectors.forEach((v) => params.append("sector", v));
    filters.shifts.forEach((v) => params.append("shift", v));
    filters.statusNames.forEach((v) => params.append("statusName", v));
    filters.categories.forEach((v) => params.append("category", v));
    if (filters.onlyMaintenance) params.set("onlyMaintenance", "1");
    if (filters.onlyMechanical) params.set("onlyMechanical", "1");
    if (filters.onlyElectrical) params.set("onlyElectrical", "1");
    if (filters.onlyAutomation) params.set("onlyAutomation", "1");
    if (filters.onlyWaiting) params.set("onlyWaiting", "1");
    if (filters.excludeOutOfPlanned) params.set("excludeOutOfPlanned", "1");
    if (filters.search) params.set("search", filters.search);
    params.set("page", String(nextPage));
    params.set("pageSize", String(nextSize));

    fetch(`/api/pc-factory/records?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("request failed");
        return (await response.json()) as PcFactoryRecordsResult;
      })
      .then((payload) => {
        if (requestRef.current === requestId) setResult(payload);
      })
      .catch(() => {})
      .finally(() => {
        if (requestRef.current === requestId) setLoading(false);
      });
  }

  function changePage(next: number) {
    if (next < 1 || next > result.totalPages || loading) return;
    load(next, pageSize);
  }

  function changeSize(size: number) {
    setPageSize(size);
    load(1, size);
  }

  return (
    <article className="panel rounded-lg p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Table2 className="h-4 w-4 text-gold" />
          <h3 className="text-sm font-bold text-zinc-800">Registros PC-Factory</h3>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600">
            {result.total.toLocaleString("pt-BR")} registros
          </span>
        </div>
        <label className="flex items-center gap-2 text-[11px] text-zinc-500">
          Por página
          <select
            value={pageSize}
            onChange={(event) => changeSize(Number(event.target.value))}
            className="h-8 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-700 outline-none focus:border-gold"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="relative overflow-x-auto rounded-lg border border-zinc-200">
        {loading ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
            <Loader2 className="h-5 w-5 animate-spin text-gold" />
          </div>
        ) : null}
        <table className="w-full min-w-[1320px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-[10px] uppercase tracking-wide text-zinc-500">
              <Th>Data início</Th>
              <Th>Data fim</Th>
              <Th>Grupo Portal</Th>
              <Th>Linha / Área</Th>
              <Th>Máquina / Recurso</Th>
              <Th>Nome Status Recurso</Th>
              <Th>Classificação Portal</Th>
              <Th>Tipo manutenção</Th>
              <Th className="text-right">Duração</Th>
              <Th className="text-center">Entra KPI Manutenção?</Th>
              <Th className="text-center">Entra Tempo Planejado?</Th>
              <Th>Observação</Th>
            </tr>
          </thead>
          <tbody>
            {result.data.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-3 py-8 text-center text-zinc-500">
                  Nenhum registro para os filtros atuais.
                </td>
              </tr>
            ) : (
              result.data.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => onSelectResource(row.resourceName)}
                  className="cursor-pointer border-b border-zinc-100 transition hover:bg-gold/5"
                >
                  <Td>{formatDateTime(row.startDateTime)}</Td>
                  <Td>{formatDateTime(row.endDateTime)}</Td>
                  <Td>{orDash(row.groupPortal)}</Td>
                  <Td>{orDash(row.productionLine ?? row.sector)}</Td>
                  <Td className="font-semibold text-zinc-800">
                    {row.resourceName}
                    {row.resourceCode ? <span className="ml-1 font-mono text-[10px] text-zinc-400">{row.resourceCode}</span> : null}
                  </Td>
                  <Td className="text-zinc-700">{orDash(row.statusRaw)}</Td>
                  <Td>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${categoryBadge[row.statusCategory]}`}>
                      {row.classificationLabel}
                    </span>
                  </Td>
                  <Td>{row.maintenanceType ? MAINTENANCE_TYPE_LABELS[row.maintenanceType] ?? row.maintenanceType : "—"}</Td>
                  <Td className="text-right font-semibold text-zinc-700">
                    {row.durationHours.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} h
                  </Td>
                  <Td className="text-center">{row.isMaintenanceKpi ? <Yes /> : <No />}</Td>
                  <Td className="text-center">{row.isInPlannedTime ? <Yes /> : <No />}</Td>
                  <Td className="max-w-[200px] truncate" title={row.observation ?? ""}>
                    {orDash(row.observation)}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
        <span>
          Página {result.page} de {result.totalPages}
        </span>
        <div className="flex items-center gap-1">
          <PageButton onClick={() => changePage(result.page - 1)} disabled={result.page <= 1 || loading}>
            <ChevronLeft className="h-4 w-4" />
          </PageButton>
          <PageButton onClick={() => changePage(result.page + 1)} disabled={result.page >= result.totalPages || loading}>
            <ChevronRight className="h-4 w-4" />
          </PageButton>
        </div>
      </div>
    </article>
  );
}

function Yes() {
  return <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Sim</span>;
}

function No() {
  return <span className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-500">Não</span>;
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 font-semibold ${className}`}>{children}</th>;
}

function Td({ children, className = "", title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <td className={`px-3 py-2 text-zinc-600 ${className}`} title={title}>
      {children}
    </td>
  );
}

function PageButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="grid h-8 w-8 place-items-center rounded-md border border-zinc-300 text-zinc-600 transition hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function orDash(value: string | null): string {
  return value && value.trim() ? value : "Não informado";
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "Não informado";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
