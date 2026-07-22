"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { PcFactoryModalShell, ghostButtonClass, primaryButtonClass } from "@/components/pc-factory/PcFactoryModalShell";
import type { PcFactoryImportResult, PcFactoryLayoutType } from "@/types/pc-factory";

/** Rótulos amigáveis do layout detectado na importação (TAREFA 7/8). */
const LAYOUT_LABELS: Record<PcFactoryLayoutType, string> = {
  PC_FACTORY_IMPORT: "Import_PC_FACTORY (ajustada)",
  PC_FACTORY_AG_GRID: "ag-grid (transacional)",
  PC_FACTORY_AG_GRID_DAILY_SUMMARY: "ag-grid diário (resumo)",
  UNKNOWN: "não reconhecido"
};

type PcFactoryImportModalProps = {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
};

export function PcFactoryImportModal({ open, onClose, onImported }: PcFactoryImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<PcFactoryImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setFile(null);
      setResult(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [open]);

  async function handleUpload() {
    if (!file) {
      toast.error("Selecione um arquivo .xlsx.");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/pc-factory/import", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "request failed");
      const payload = data as PcFactoryImportResult;
      setResult(payload);
      toast.success(
        payload.replacedRows > 0
          ? `Base substituída: ${payload.importedRows} registros importados (${payload.replacedRows} anteriores apagados)`
          : `Importação concluída: ${payload.importedRows} registros importados`
      );
      onImported();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao importar a planilha.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <PcFactoryModalShell
      open={open}
      title="Importar relatório do PC-Factory"
      subtitle='Planilha ajustada (.xlsx) — aba "Import_PC_FACTORY" ou aba bruta "ag-grid"'
      onClose={onClose}
    >
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gold/35 bg-black/25 px-4 py-8 text-center transition hover:border-gold/55">
        <FileSpreadsheet className="h-8 w-8 text-gold" />
        <span className="text-sm font-semibold text-champagne">{file ? file.name : "Clique para selecionar o arquivo .xlsx"}</span>
        <span className="text-[11px] text-zinc-500">
          Lê preferencialmente a aba <strong className="text-zinc-300">Import_PC_FACTORY</strong> (colunas resourceName,
          statusRaw, groupPortal...). Se ausente, lê a aba bruta <strong className="text-zinc-300">ag-grid</strong>
          (Apelido Recurso, Nome Status Recurso, Tempo Decorrido [hr]...).
        </span>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      </label>

      <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] leading-snug text-amber-200/90">
        <strong className="font-semibold">Atenção:</strong> a importação <strong>substitui toda a base</strong> do PC-Factory — os
        dados atuais são apagados e trocados pela planilha enviada. (Se o arquivo não tiver linhas válidas, nada é apagado.)
      </div>

      {result ? (
        <div className="mt-4 space-y-3">
          <dl className="grid grid-cols-2 gap-2 rounded-lg border border-gold/15 bg-black/25 p-3 text-xs">
            <Summary label="Total de linhas" value={result.totalRows} />
            <Summary label="Importadas" value={result.importedRows} tone="gold" />
            <Summary label="Substituídos (apagados)" value={result.replacedRows} tone={result.replacedRows > 0 ? "danger" : "default"} />
            <Summary label="Criadas" value={result.createdRows} />
            <Summary label="Ignoradas" value={result.ignoredRows} tone={result.ignoredRows > 0 ? "danger" : "default"} />
            <Summary label="Com erro" value={result.errorRows} tone={result.errorRows > 0 ? "danger" : "default"} />
          </dl>

          {result.ignoredRows > 0 ? (
            <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-rose-300">Motivos das linhas ignoradas</p>
              <dl className="grid grid-cols-2 gap-2">
                <Summary label="Sem recurso" value={result.ignoredReasons.noResource} />
                <Summary label="Sem status" value={result.ignoredReasons.noStatus} />
                <Summary label="Sem duração/data" value={result.ignoredReasons.noDuration} />
                <Summary label="Linha vazia" value={result.ignoredReasons.emptyRow} />
                <Summary label="Duplicada" value={result.ignoredReasons.duplicate} />
                <Summary label="Outro" value={result.ignoredReasons.other} />
              </dl>
            </div>
          ) : null}

          <div className="rounded-lg border border-gold/15 bg-black/25 p-3 text-xs">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-gold">Classificação (auditoria da regra)</p>
            <dl className="grid grid-cols-2 gap-2">
              <Summary label="Manutenção (total)" value={result.maintenanceRows} tone="gold" />
              <Summary label="Manut. Mecânica" value={result.mechanicalMaintenanceRows} />
              <Summary label="Manut. Elétrica" value={result.electricalMaintenanceRows} />
              <Summary label="Manut. Automação" value={result.automationMaintenanceRows} />
              <Summary label="Aguardando manut." value={result.waitingMaintenanceRows} />
              <Summary label="Produção" value={result.productionRows} />
              <Summary label="Setup" value={result.setupRows} />
              <Summary label="Parada/perda" value={result.operationalLossRows} />
              <Summary label="Fora do planejado" value={result.excludedFromPlannedTimeRows} />
              <Summary label="Outros" value={result.otherRows} />
              <Summary label="Recursos detectados" value={result.resourcesDetected} />
              <Summary label="Grupos detectados" value={result.groupsDetected.length} />
              <Summary label="Com problema de dados" value={result.dataQualityRows} tone={result.dataQualityRows > 0 ? "danger" : "default"} />
              <Summary label="Horas totais" value={result.totalHours} suffix=" h" />
              <Summary label="Horas de manutenção" value={result.maintenanceHours} suffix=" h" tone="gold" />
              <Summary label="Ocorrências (eventos)" value={result.totalOccurrences} />
            </dl>
          </div>

          {result.sheetUsed ? (
            <p className="text-[11px] text-zinc-500">
              <span className="font-semibold text-gold">Aba lida:</span> {result.sheetUsed}
              <span className="ml-2 font-semibold text-gold">Layout:</span> {LAYOUT_LABELS[result.layoutType] ?? result.layoutType}
            </p>
          ) : null}
          {result.groupsDetected.length ? (
            <p className="text-[11px] text-zinc-500">
              <span className="font-semibold text-gold">Grupos detectados:</span> {result.groupsDetected.join(" · ")}
            </p>
          ) : null}
          {result.statusDetected.length ? (
            <p className="text-[11px] text-zinc-500">
              <span className="font-semibold text-gold">Status detectados:</span> {result.statusDetected.join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {result?.errors.length ? (
        <div className="mt-2 max-h-28 overflow-y-auto rounded-lg border border-danger/30 bg-danger/10 p-2 text-[11px] text-rose-200">
          {result.errors.slice(0, 8).map((error, index) => (
            <p key={index}>
              Linha {error.linha}: {error.mensagem}
            </p>
          ))}
        </div>
      ) : null}

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={ghostButtonClass}>
          {result ? "Fechar" : "Cancelar"}
        </button>
        <button type="button" onClick={handleUpload} disabled={uploading || !file} className={primaryButtonClass}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Importar
        </button>
      </div>
    </PcFactoryModalShell>
  );
}

function Summary({
  label,
  value,
  tone = "default",
  suffix = ""
}: {
  label: string;
  value: number;
  tone?: "default" | "danger" | "gold";
  suffix?: string;
}) {
  const valueClass = tone === "danger" ? "text-danger" : tone === "gold" ? "text-gold" : "text-champagne";
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-zinc-400">{label}</dt>
      <dd className={`font-semibold ${valueClass}`}>
        {value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
        {suffix}
      </dd>
    </div>
  );
}
