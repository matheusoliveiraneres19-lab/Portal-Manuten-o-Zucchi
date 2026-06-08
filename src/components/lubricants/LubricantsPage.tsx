"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarRange, Download, Droplets, RefreshCw, Upload } from "lucide-react";
import { ChartSkeleton } from "@/components/ChartSkeleton";
import { LubricantKpiCards } from "@/components/lubricants/LubricantKpiCards";
import { LubricantReplenishmentBanner } from "@/components/lubricants/LubricantReplenishmentBanner";
import { LubricantFilters } from "@/components/lubricants/LubricantFilters";
import { LubricantEmptyState } from "@/components/lubricants/LubricantEmptyState";
import { LubricantCodesTable } from "@/components/lubricants/LubricantCodesTable";
import { LubricantMovementsHistory } from "@/components/lubricants/LubricantMovementsHistory";
import { LubricantDetailsDrawer } from "@/components/lubricants/LubricantDetailsDrawer";
import { LubricantMachineApplicationModal } from "@/components/lubricants/LubricantMachineApplicationModal";
import { LubricantTechnicalSheetModal } from "@/components/lubricants/LubricantTechnicalSheetModal";
import { LubricantImportModal } from "@/components/lubricants/LubricantImportModal";
import type { LubricantDetails, LubricantsPageData } from "@/types/lubricants";

const LubricantOutputChart = dynamic(
  () => import("@/components/lubricants/LubricantOutputChart").then((m) => m.LubricantOutputChart),
  { ssr: false, loading: () => <ChartSkeleton className="xl:col-span-6" /> }
);
const LubricantFlowChart = dynamic(
  () => import("@/components/lubricants/LubricantFlowChart").then((m) => m.LubricantFlowChart),
  { ssr: false, loading: () => <ChartSkeleton className="xl:col-span-7" /> }
);
const LubricantCategoryChart = dynamic(
  () => import("@/components/lubricants/LubricantCategoryChart").then((m) => m.LubricantCategoryChart),
  { ssr: false, loading: () => <ChartSkeleton className="xl:col-span-5" /> }
);
const LubricantBalanceChart = dynamic(
  () => import("@/components/lubricants/LubricantBalanceChart").then((m) => m.LubricantBalanceChart),
  { ssr: false, loading: () => <ChartSkeleton className="xl:col-span-6" /> }
);

export type AppliedLubricantFilters = {
  startDate: string;
  endDate: string;
  year: number;
  month: number;
  code: string;
  category: string;
  unit: string;
  search: string;
};

type LubricantsPageProps = {
  data: LubricantsPageData;
  appliedFilters: AppliedLubricantFilters;
};

export function LubricantsPage({ data, appliedFilters }: LubricantsPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<AppliedLubricantFilters>(appliedFilters);

  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [details, setDetails] = useState<LubricantDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const [appModalCode, setAppModalCode] = useState<string | null>(null);
  const [sheetModalCode, setSheetModalCode] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const appliedSignature = JSON.stringify(appliedFilters);
  useEffect(() => {
    setDraft(appliedFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedSignature]);

  function navigate(filters: AppliedLubricantFilters) {
    const params = filtersToParams(filters);
    const query = params.toString();
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname));
  }

  function updateDraft<Key extends keyof AppliedLubricantFilters>(key: Key, value: AppliedLubricantFilters[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function applyFilters() {
    navigate(draft);
    toast.success("Filtros aplicados");
  }

  function clearFilters() {
    startTransition(() => router.push(pathname));
    toast("Filtros limpos");
  }

  function refreshData() {
    startTransition(() => router.refresh());
    toast("Dados atualizados");
  }

  function fetchDetails(code: string) {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setDetailsLoading(true);
    setDetailsError(null);

    fetch(`/api/lubricants/details?code=${encodeURIComponent(code)}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("request failed");
        }
        return (await response.json()) as LubricantDetails;
      })
      .then((payload) => {
        if (requestRef.current === requestId) {
          setDetails(payload);
        }
      })
      .catch(() => {
        if (requestRef.current === requestId) {
          setDetailsError("Não foi possível carregar os detalhes deste lubrificante.");
          toast.error("Não foi possível carregar os detalhes deste lubrificante.");
        }
      })
      .finally(() => {
        if (requestRef.current === requestId) {
          setDetailsLoading(false);
        }
      });
  }

  function openDetails(code: string) {
    setSelectedCode(code);
    setDetails(null);
    fetchDetails(code);
  }

  function closeDetails() {
    requestRef.current += 1;
    setSelectedCode(null);
  }

  function handleSaved() {
    startTransition(() => router.refresh());
    if (selectedCode) {
      fetchDetails(selectedCode);
    }
  }

  function exportCsv() {
    if (data.codes.length === 0) {
      toast.error("Nada para exportar.");
      return;
    }
    const header = [
      "Codigo",
      "Descricao",
      "Unidade",
      "EntradasMes",
      "SaidasMes",
      "EntradasAno",
      "SaidasAno",
      "Saldo",
      "Maquinas",
      "FichaTecnica"
    ];
    const lines = data.codes.map((row) =>
      [
        row.code,
        csvCell(row.description),
        row.unit,
        row.monthlyInputs,
        row.monthlyOutputs,
        row.annualInputs,
        row.annualOutputs,
        row.balance,
        csvCell(row.machinesUsed.join("; ")),
        row.hasTechnicalSheet ? "Anexada" : "Pendente"
      ].join(";")
    );
    const csv = [header.join(";"), ...lines].join("\r\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `lubrificantes-${data.reference.year}-${String(data.reference.month).padStart(2, "0")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado");
  }

  const isEmpty = data.source === "empty";
  const sheetCode = sheetModalCode ? data.codes.find((row) => row.code === sheetModalCode) : null;
  const appCode = appModalCode ? data.codes.find((row) => row.code === appModalCode) : null;

  return (
    <section className={`space-y-4 text-champagne transition ${isPending ? "opacity-70" : ""}`}>
      {/* Hero */}
      <header className="relative overflow-hidden rounded-lg border border-gold/20 bg-[#070808] p-5 shadow-premium sm:p-6">
        <div className="login-marble-bg absolute inset-0 opacity-80" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.78),rgba(0,0,0,0.44)),radial-gradient(circle_at_88%_8%,rgba(196,154,69,0.15),transparent_22rem)]" />
        <div className="relative z-10">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-gold">
            <Droplets className="h-5 w-5" />
            <span className="rounded-md border border-gold/40 bg-gold/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-champagne/80">
              Dados importados de planilha SAP/Fiori
            </span>
          </div>
          <h1 className="font-serif text-3xl leading-tight text-white sm:text-4xl">Lubrificantes</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-300 sm:text-base">
            Controle entradas, saídas, consumo e aplicação dos lubrificantes utilizados na manutenção.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-400">
            <span>Saídas são identificadas por quantidades negativas e entradas por quantidades positivas.</span>
            <span className="flex items-center gap-1.5">
              <CalendarRange className="h-3.5 w-3.5 text-gold" />
              Referência: <strong className="font-semibold text-champagne">{data.reference.monthLabel}</strong>
            </span>
          </div>
        </div>
      </header>

      {/* Barra de ações */}
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton onClick={() => setImportOpen(true)} primary>
          <Upload className="h-4 w-4" /> Importar Excel
        </ActionButton>
        <ActionButton onClick={refreshData}>
          <RefreshCw className="h-4 w-4" /> Atualizar dados
        </ActionButton>
        <ActionButton onClick={exportCsv}>
          <Download className="h-4 w-4" /> Exportar
        </ActionButton>
        <ActionButton onClick={clearFilters}>Limpar filtros</ActionButton>
      </div>

      {/* Filtros */}
      <LubricantFilters
        draft={draft}
        options={data.filterOptions}
        isPending={isPending}
        onChange={updateDraft}
        onApply={applyFilters}
        onClear={clearFilters}
      />

      {isEmpty ? (
        <LubricantEmptyState onImport={() => setImportOpen(true)} />
      ) : (
        <>
          <LubricantKpiCards kpis={data.kpis} reference={data.reference} />

          <LubricantReplenishmentBanner items={data.replenishment} onSelect={openDetails} onSynced={handleSaved} />

          <p className="text-[11px] text-zinc-500">
            <span className="font-semibold text-gold">Dica:</span> clique em um material nos gráficos ou na tabela para
            ver entradas, saídas, saldo e máquinas de aplicação.
          </p>

          <section className="grid grid-cols-1 gap-3 xl:grid-cols-12">
            <LubricantOutputChart
              className="xl:col-span-6"
              title="Saídas por material no mês"
              subtitle={`Top 10 materiais com maior saída em ${data.reference.monthLabel}.`}
              items={data.monthlyOutputs}
              color="#a6192e"
              emptyDescription="Sem saídas no mês de referência."
              onSelect={openDetails}
            />
            <LubricantOutputChart
              className="xl:col-span-6"
              title="Saídas por material no ano"
              subtitle={`Top 10 materiais com maior saída em ${data.reference.year}.`}
              items={data.annualOutputs}
              color="#7b2d3a"
              emptyDescription="Sem saídas no ano de referência."
              onSelect={openDetails}
            />
            <LubricantFlowChart className="xl:col-span-7" points={data.monthlyFlow} />
            <LubricantCategoryChart className="xl:col-span-5" slices={data.movementTypeDistribution} />
            <LubricantBalanceChart className="xl:col-span-6" rows={data.balanceByCode} onSelect={openDetails} />
          </section>

          <LubricantCodesTable
            rows={data.codes}
            reference={data.reference}
            onSelect={openDetails}
            onEditApplications={(code) => setAppModalCode(code)}
            onEditSheet={(code) => setSheetModalCode(code)}
          />

          <LubricantMovementsHistory
            initial={data.movements}
            filters={{
              startDate: appliedFilters.startDate,
              endDate: appliedFilters.endDate,
              code: appliedFilters.code,
              category: appliedFilters.category,
              unit: appliedFilters.unit,
              search: appliedFilters.search
            }}
          />
        </>
      )}

      <LubricantDetailsDrawer
        open={selectedCode !== null}
        loading={detailsLoading}
        error={detailsError}
        details={details}
        onClose={closeDetails}
        onEditApplications={(code) => setAppModalCode(code)}
        onEditSheet={(code) => setSheetModalCode(code)}
        onSaved={handleSaved}
      />

      <LubricantMachineApplicationModal
        open={appModalCode !== null}
        code={appModalCode}
        description={appCode?.description ?? details?.description ?? null}
        onClose={() => setAppModalCode(null)}
        onSaved={handleSaved}
      />

      <LubricantTechnicalSheetModal
        open={sheetModalCode !== null}
        code={sheetModalCode}
        description={sheetCode?.description ?? details?.description ?? null}
        currentUrl={sheetCode?.technicalSheetUrl ?? details?.technicalSheetUrl ?? null}
        onClose={() => setSheetModalCode(null)}
        onSaved={handleSaved}
      />

      <LubricantImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={handleSaved} />
    </section>
  );
}

function ActionButton({
  children,
  onClick,
  primary = false
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        primary
          ? "inline-flex h-10 items-center gap-2 rounded-lg border border-gold/55 bg-gold/15 px-4 text-sm font-bold text-gold transition hover:bg-gold/25"
          : "inline-flex h-10 items-center gap-2 rounded-lg border border-gold/20 px-4 text-sm font-semibold text-zinc-300 transition hover:border-gold/40 hover:text-white"
      }
    >
      {children}
    </button>
  );
}

function filtersToParams(filters: AppliedLubricantFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  if (filters.year) params.set("ano", String(filters.year));
  if (filters.month) params.set("mes", String(filters.month));
  if (filters.code) params.set("code", filters.code);
  if (filters.category) params.set("tipo", filters.category);
  if (filters.unit) params.set("unidade", filters.unit);
  if (filters.search) params.set("q", filters.search);
  return params;
}

function csvCell(value: string): string {
  return /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
