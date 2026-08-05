"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { PcFactoryModalShell, ghostButtonClass, primaryButtonClass } from "@/components/pc-factory/PcFactoryModalShell";
import type { PcFactoryImportResult, PcFactoryLayoutType } from "@/types/pc-factory";

/** Rótulos amigáveis do layout detectado na importação (TAREFA 7/8). */
const LAYOUT_LABELS: Record<PcFactoryLayoutType, string> = {
  PC_FACTORY_STATUS_HISTORY_CSV: "CSV histórico de status (normalizado)",
  PC_FACTORY_IMPORT: "Import_PC_FACTORY (ajustada)",
  PC_FACTORY_AG_GRID: "ag-grid (transacional)",
  PC_FACTORY_AG_GRID_DAILY_SUMMARY: "ag-grid diário (resumo)",
  UNKNOWN: "não reconhecido"
};

/** Extensões aceitas pelo importador (TAREFA 1). */
const ACCEPTED_EXTENSIONS = /\.(csv|xlsx|xls)$/i;

type PcFactoryImportModalProps = {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
};

export function PcFactoryImportModal({ open, onClose, onImported }: PcFactoryImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<PcFactoryImportResult | null>(null);
  // Diagnóstico multi-linha devolvido pela rota quando o layout não é reconhecido
  // (TAREFA 14) — mostrado no corpo do modal, não só num toast de uma linha.
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setFile(null);
      setResult(null);
      setErrorDetail(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [open]);

  async function handleUpload() {
    if (!file) {
      toast.error("Selecione um arquivo .csv, .xlsx ou .xls.");
      return;
    }
    if (!ACCEPTED_EXTENSIONS.test(file.name)) {
      toast.error("Formato não suportado. Envie um arquivo .csv, .xlsx ou .xls.");
      return;
    }
    setUploading(true);
    setErrorDetail(null);
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
      const message = error instanceof Error ? error.message : "Falha ao importar o arquivo.";
      setErrorDetail(message);
      // O toast mostra só a 1ª linha; o diagnóstico completo fica no corpo do modal.
      toast.error(message.split("\n")[0]);
    } finally {
      setUploading(false);
    }
  }

  return (
    <PcFactoryModalShell
      open={open}
      title="Importar relatório do PC-Factory"
      subtitle="CSV histórico de status (.csv) ou planilha do PC-Factory (.xlsx)"
      onClose={onClose}
    >
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gold/35 bg-black/25 px-4 py-8 text-center transition hover:border-gold/55">
        <FileSpreadsheet className="h-8 w-8 text-gold" />
        <span className="text-sm font-semibold text-champagne">
          {file ? file.name : "Clique para selecionar o arquivo (.csv, .xlsx)"}
        </span>
        <span className="text-[11px] text-zinc-500">
          <strong className="text-zinc-300">.csv</strong>: histórico de status normalizado (separador &quot;;&quot;, UTF-8,
          colunas resourceName, statusCode, startDateTime, durationHours...).{" "}
          <strong className="text-zinc-300">.xlsx</strong>: aba <strong className="text-zinc-300">Import_PC_FACTORY</strong> ou
          a aba bruta <strong className="text-zinc-300">ag-grid</strong>.
        </span>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </label>

      {errorDetail ? (
        <div className="mt-3 rounded-lg border border-danger/40 bg-danger/10 p-3">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-rose-300">Diagnóstico da falha</p>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-rose-200">
            {errorDetail}
          </pre>
        </div>
      ) : null}

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

          <div className="rounded-lg border border-gold/15 bg-black/25 p-3 text-xs">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-gold">Qualidade do arquivo lido</p>
            <dl className="grid grid-cols-2 gap-2">
              <Summary label="Máquinas detectadas" value={result.resourcesDetected} tone="gold" />
              <Summary label="Status distintos" value={result.statusDetected.length} tone="gold" />
              <Summary
                label="Datas de fim inválidas"
                value={result.invalidEndDatesCount}
                tone={result.invalidEndDatesCount > 0 ? "danger" : "default"}
              />
              <Summary
                label="Durações inválidas (=0)"
                value={result.invalidDurationCount}
                tone={result.invalidDurationCount > 0 ? "danger" : "default"}
              />
              <Summary
                label="Horas não apontadas"
                value={result.notReportedHours}
                suffix=" h"
                tone={result.notReportedHours > 0 ? "danger" : "default"}
              />
              <Summary label="Duplicadas ignoradas" value={result.ignoredReasons.duplicate} />
            </dl>
            {result.notReportedHours > 0 ? (
              <p className="mt-2 text-[11px] leading-snug text-amber-200/90">
                <strong className="font-semibold">Atenção:</strong>{" "}
                {result.notReportedHours.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} h em
                &quot;Aguardando lançamento&quot; — apontamentos abertos. Ficam FORA do Tempo de Carga e não contam como parada.
              </p>
            ) : null}
          </div>

          <p className="text-[11px] text-zinc-500">
            <span className="font-semibold text-gold">Layout:</span> {LAYOUT_LABELS[result.layoutType] ?? result.layoutType}
            {result.readAs === "csv" ? (
              <>
                <span className="ml-2 font-semibold text-gold">Separador:</span>{" "}
                <code className="text-zinc-300">{result.delimiterUsed}</code>
                {result.bomRemoved ? <span className="ml-2 text-zinc-400">· UTF-8 BOM removido</span> : null}
              </>
            ) : result.sheetUsed ? (
              <>
                <span className="ml-2 font-semibold text-gold">Aba lida:</span> {result.sheetUsed}
              </>
            ) : null}
            {result.periodDetected.start && result.periodDetected.end ? (
              <>
                <span className="ml-2 font-semibold text-gold">Período:</span>{" "}
                {formatPeriod(result.periodDetected.start)} a {formatPeriod(result.periodDetected.end)}
              </>
            ) : null}
          </p>
          {result.missingRecommendedColumns.length ? (
            <p className="text-[11px] text-amber-200/80">
              <span className="font-semibold">Colunas recomendadas ausentes:</span>{" "}
              {result.missingRecommendedColumns.join(", ")}
            </p>
          ) : null}
          {result.classificationRefsDetected.length ? (
            <p className="text-[11px] text-zinc-500">
              <span className="font-semibold text-gold">Classificações do PC-Factory:</span>{" "}
              {result.classificationRefsDetected.join(" · ")}
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

/** ISO → dd/mm/aaaa para o resumo de período detectado. */
function formatPeriod(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
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
