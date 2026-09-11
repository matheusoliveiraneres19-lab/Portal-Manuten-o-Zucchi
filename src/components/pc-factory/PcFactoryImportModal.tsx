"use client";

/**
 * Modal de importação do PC-Factory.
 *
 * CAMINHO PRINCIPAL (arquivos de qualquer tamanho):
 *   1. pede uma URL assinada    → POST /api/pc-factory/import/upload-url
 *   2. envia o arquivo DIRETO ao bucket privado (PUT no Supabase)
 *   3. abre a sessão            → POST /api/pc-factory/import/start
 *   4. processa em fatias       → POST /api/pc-factory/import/process (em laço)
 *   5. aplica na base oficial   → POST /api/pc-factory/import/finish
 *
 * O arquivo NUNCA entra no corpo de uma requisição para a Vercel. Era isso que
 * produzia o erro "Unexpected token 'R'": acima de ~4,5 MB a plataforma
 * respondia `Request Entity Too Large` em TEXTO PURO, e o `response.json()`
 * daqui engasgava no "R" de "Request".
 *
 * CAMINHO DE RESERVA: se o Storage não estiver configurado (503), cai no POST
 * direto para /api/pc-factory/import, que aceita até 4 MB.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { ModalShell, modalGhostButtonClass, modalPrimaryButtonClass } from "@/components/ui/ModalShell";
import type { PcFactoryLayoutType } from "@/types/pc-factory";

/** Rótulos amigáveis do layout detectado na importação. */
const LAYOUT_LABELS: Record<string, string> = {
  PC_FACTORY_STATUS_HISTORY_CSV: "CSV histórico de status (normalizado)",
  PC_FACTORY_IMPORT: "Import_PC_FACTORY (ajustada)",
  PC_FACTORY_AG_GRID: "ag-grid (transacional)",
  PC_FACTORY_AG_GRID_DAILY_SUMMARY: "ag-grid diário (resumo)",
  UNKNOWN: "não reconhecido"
};

const ACCEPTED_EXTENSIONS = /\.(csv|xlsx|xlsm|xls)$/i;

/** Teto do POST direto (caminho de reserva). Abaixo do corte da Vercel (~4,5 MB). */
const DIRECT_UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024;

/** Etapas exibidas no modal, na ordem em que acontecem. */
const STEPS = [
  { key: "upload", label: "Enviando arquivo ao Supabase Storage" },
  { key: "start", label: "Criando sessão de importação" },
  { key: "read", label: "Lendo arquivo" },
  { key: "validate", label: "Validando colunas" },
  { key: "process", label: "Processando linhas" },
  { key: "staging", label: "Gravando staging" },
  { key: "apply", label: "Aplicando base oficial" },
  { key: "finish", label: "Finalizando importação" },
  { key: "done", label: "Importação concluída" }
] as const;

type StepKey = (typeof STEPS)[number]["key"];

/** Auditoria devolvida pelo fluxo de staging (TAREFA 14). */
type PcFactoryAudit = {
  layoutType: string;
  sheetUsed: string | null;
  readAs: "xlsx" | "csv";
  delimiterUsed: string | null;
  bomRemoved: boolean;
  totalRows: number;
  validRows: number;
  ignoredRows: number;
  machines: number;
  statuses: number;
  dateMin: string | null;
  dateMax: string | null;
  totalDurationHours: number;
  maintenanceHours: number;
  invalidEndDates: number;
  derivedEndDates: number;
  multiMonthIntervals: number;
  originalVsSegmentedDifference: number;
  missingRecommendedColumns: string[];
  groupsDetected: string[];
  statusDetected: string[];
  /** Abas do arquivo e reparo do XLSX — preenchidos só no fluxo de staging. */
  sheetNames?: string[];
  repairedCells?: number;
  statusColorsSkipped?: boolean;
};

type ImportSummary = {
  audit: PcFactoryAudit | null;
  appliedRows: number;
  replacedRows: number;
  fileSizeBytes: number;
  viaStorage: boolean;
};

type PcFactoryImportModalProps = {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
};

export function PcFactoryImportModal({ open, onClose, onImported }: PcFactoryImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState<StepKey | null>(null);
  const [failedStep, setFailedStep] = useState<StepKey | null>(null);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setFile(null);
      setSummary(null);
      setErrorDetail(null);
      setCurrentStep(null);
      setFailedStep(null);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [open]);

  const handleUpload = useCallback(async () => {
    if (!file) {
      toast.error("Selecione um arquivo .csv, .xlsx, .xlsm ou .xls.");
      return;
    }
    if (!ACCEPTED_EXTENSIONS.test(file.name)) {
      toast.error("Formato não suportado. Envie um arquivo .csv, .xlsx, .xlsm ou .xls.");
      return;
    }

    setRunning(true);
    setErrorDetail(null);
    setFailedStep(null);
    setSummary(null);
    setProgress(null);

    let step: StepKey = "upload";
    const at = (next: StepKey) => {
      step = next;
      setCurrentStep(next);
    };

    try {
      at("upload");

      // ---- 1) URL assinada ------------------------------------------------
      const signed = await callApi("/api/pc-factory/import/upload-url", { fileName: file.name });

      // Storage indisponível: cai no POST direto, que só aceita arquivo pequeno.
      if (signed.status === 503) {
        if (file.size > DIRECT_UPLOAD_LIMIT_BYTES) {
          throw new ImportFailure(
            "Arquivo muito grande para envio direto e o Supabase Storage não está configurado. " +
              "Peça ao administrador para configurar o armazenamento de importações.",
            signed.details
          );
        }
        const legacy = await importDirect(file);
        setSummary(legacy);
        at("done");
        toast.success(`Importação concluída: ${legacy.appliedRows} registros.`);
        onImported();
        return;
      }
      if (!signed.ok) throw new ImportFailure(signed.error, signed.details);

      const { uploadUrl, path, bucket, contentType, apiKey } = signed.data as {
        uploadUrl: string;
        path: string;
        bucket: string;
        contentType: string;
        apiKey: string;
      };

      // ---- 2) PUT direto no bucket ---------------------------------------
      // Aqui o arquivo sai do navegador para o Supabase sem tocar a Vercel.
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "content-type": contentType, apikey: apiKey, "x-upsert": "false" },
        body: file
      });
      if (!put.ok) {
        throw new ImportFailure(
          "Falha ao enviar o arquivo para o armazenamento.",
          `HTTP ${put.status} — ${(await put.text().catch(() => "")).slice(0, 400)}`
        );
      }

      // ---- 3) Abre a sessão ----------------------------------------------
      at("start");
      const started = await callApi("/api/pc-factory/import/start", {
        fileName: file.name,
        filePath: path,
        bucket,
        fileSize: file.size,
        mimeType: contentType
      });
      if (!started.ok) throw new ImportFailure(started.error, started.details);
      const { importId } = started.data as { importId: string };

      // ---- 4) Processa em fatias -----------------------------------------
      at("read");
      let offset = 0;
      let audit: PcFactoryAudit | null = null;
      let guard = 0;

      for (;;) {
        // Trava contra laço infinito se o servidor parar de avançar o offset.
        if (guard++ > 2000) {
          throw new ImportFailure(
            "O processamento não avançou. Tente novamente ou reduza o arquivo.",
            `laço interrompido em offset=${offset}`
          );
        }

        const processed = await callApi("/api/pc-factory/import/process", { importId, offset });
        if (!processed.ok) throw new ImportFailure(processed.error, processed.details);

        const data = processed.data as {
          done: boolean;
          nextOffset: number;
          totalRows: number;
          processedRows: number;
          audit: PcFactoryAudit | null;
        };

        // A primeira resposta já prova que o arquivo foi lido e o layout validado.
        if (offset === 0) at("validate");
        at(data.done ? "staging" : "process");
        setProgress({ processed: data.processedRows, total: data.totalRows });

        if (data.nextOffset <= offset && !data.done) {
          throw new ImportFailure(
            "O processamento parou sem concluir o arquivo.",
            `offset travado em ${offset}`
          );
        }
        offset = data.nextOffset;
        audit = data.audit ?? audit;
        if (data.done) break;
      }

      // ---- 5) Aplica na base oficial (transação) -------------------------
      at("apply");
      const finished = await callApi("/api/pc-factory/import/finish", { importId });
      if (!finished.ok) throw new ImportFailure(finished.error, finished.details);

      at("finish");
      const applied = finished.data as { appliedRows: number; replacedRows: number; audit: PcFactoryAudit | null };

      setSummary({
        audit: applied.audit ?? audit,
        appliedRows: applied.appliedRows,
        replacedRows: applied.replacedRows,
        fileSizeBytes: file.size,
        viaStorage: true
      });
      at("done");
      toast.success(
        applied.replacedRows > 0
          ? `Base substituída: ${applied.appliedRows} registros (${applied.replacedRows} anteriores).`
          : `Importação concluída: ${applied.appliedRows} registros.`
      );
      onImported();
    } catch (error) {
      setFailedStep(step);
      const message = error instanceof ImportFailure ? error.message : friendlyMessage(error);
      const details = error instanceof ImportFailure ? error.details : null;
      setErrorDetail(details ? `${message}\n\n${details}` : message);
      toast.error(message.split("\n")[0]);
    } finally {
      setRunning(false);
    }
  }, [file, onImported]);

  const audit = summary?.audit ?? null;

  return (
    <ModalShell
      open={open}
      title="Importar relatório do PC-Factory"
      subtitle="CSV histórico de status (.csv) ou planilha do PC-Factory (.xlsx / .xlsm)"
      onClose={onClose}
    >
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gold/35 bg-black/25 px-4 py-8 text-center transition hover:border-gold/55">
        <FileSpreadsheet className="h-8 w-8 text-gold" />
        <span className="text-sm font-semibold text-champagne">
          {file ? `${file.name} · ${formatBytes(file.size)}` : "Clique para selecionar o arquivo"}
        </span>
        <span className="text-[11px] text-zinc-500">
          <strong className="text-zinc-300">.csv</strong>: histórico de status normalizado (separador
          &quot;;&quot;, UTF-8, colunas resourceName, statusCode, startDateTime, durationHours…).{" "}
          <strong className="text-zinc-300">.xlsx</strong>: aba{" "}
          <strong className="text-zinc-300">Import_PC_FACTORY</strong> ou a aba bruta{" "}
          <strong className="text-zinc-300">ag-grid</strong>.
        </span>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xlsm,.xls"
          className="hidden"
          disabled={running}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </label>

      {/* --------------------------- Progresso --------------------------- */}
      {currentStep ? (
        <ol className="mt-4 space-y-1.5 rounded-lg border border-gold/15 bg-black/25 p-3">
          {STEPS.map((s) => {
            const state = stepState(s.key, currentStep, failedStep);
            if (state === "future" && !running && !summary) return null;
            return (
              <li key={s.key} className="flex items-center gap-2 text-[12px]">
                <StepIcon state={state} />
                <span
                  className={
                    state === "error"
                      ? "text-rose-300"
                      : state === "current"
                        ? "font-semibold text-champagne"
                        : state === "done"
                          ? "text-zinc-400"
                          : "text-zinc-600"
                  }
                >
                  {s.label}
                  {s.key === "process" && state === "current" && progress
                    ? ` — ${progress.processed.toLocaleString("pt-BR")} de ${progress.total.toLocaleString("pt-BR")} linhas`
                    : ""}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}

      {errorDetail ? (
        <div className="mt-3 rounded-lg border border-danger/40 bg-danger/10 p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-rose-300">
            <AlertTriangle className="h-3.5 w-3.5" /> Diagnóstico da falha
          </p>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-rose-200">
            {errorDetail}
          </pre>
          <p className="mt-2 text-[11px] text-rose-200/80">
            A base atual do PC-Factory <strong>não foi alterada</strong>.
          </p>
        </div>
      ) : null}

      {!summary && !running ? (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] leading-snug text-amber-200/90">
          <strong className="font-semibold">Atenção:</strong> a importação é <strong>validada antes</strong> de
          substituir a base oficial do PC-Factory. Se houver falha, os dados atuais são preservados.
        </div>
      ) : null}

      {/* ---------------------------- Resumo ----------------------------- */}
      {summary ? (
        <div className="mt-4 space-y-3">
          <dl className="grid grid-cols-2 gap-2 rounded-lg border border-gold/15 bg-black/25 p-3 text-xs">
            <Summary label="Registros aplicados" value={summary.appliedRows} tone="gold" />
            <Summary
              label="Substituídos (anteriores)"
              value={summary.replacedRows}
              tone={summary.replacedRows > 0 ? "danger" : "default"}
            />
            <Summary label="Linhas lidas" value={audit?.totalRows ?? summary.appliedRows} />
            <Summary label="Linhas válidas" value={audit?.validRows ?? summary.appliedRows} />
            <Summary label="Linhas ignoradas" value={audit?.ignoredRows ?? 0} tone={(audit?.ignoredRows ?? 0) > 0 ? "danger" : "default"} />
            <Summary label="Máquinas" value={audit?.machines ?? 0} />
            <Summary label="Status distintos" value={audit?.statuses ?? 0} />
            <Summary label="Duração total" value={audit?.totalDurationHours ?? 0} suffix=" h" tone="gold" />
          </dl>

          {audit ? (
            <div className="rounded-lg border border-gold/15 bg-black/25 p-3 text-xs">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-gold">
                Qualidade e segmentação (auditoria)
              </p>
              <dl className="grid grid-cols-2 gap-2">
                <Summary label="Horas de manutenção" value={audit.maintenanceHours} suffix=" h" />
                <Summary
                  label="Fim inválido (01/01/0001)"
                  value={audit.invalidEndDates}
                  tone={audit.invalidEndDates > 0 ? "danger" : "default"}
                />
                <Summary label="Fim recalculado" value={audit.derivedEndDates} tone={audit.derivedEndDates > 0 ? "gold" : "default"} />
                <Summary label="Registros multi-mês" value={audit.multiMonthIntervals} />
                {audit.repairedCells ? (
                  <Summary label="Células de data vazias reparadas" value={audit.repairedCells} tone="gold" />
                ) : null}
                <Summary
                  label="Diferença original × segmentado"
                  value={audit.originalVsSegmentedDifference}
                  suffix=" h"
                  tone={audit.originalVsSegmentedDifference > 0.01 ? "danger" : "default"}
                />
              </dl>
              {audit.statusColorsSkipped ? (
                <p className="mt-2 text-[11px] leading-snug text-amber-200/90">
                  Planilha grande: as cores de status não foram lidas do arquivo e o gráfico usa a
                  paleta padrão do portal. Os números da importação não mudam.
                </p>
              ) : null}
              {audit.originalVsSegmentedDifference > 0.01 ? (
                <p className="mt-2 text-[11px] leading-snug text-rose-200">
                  <strong className="font-semibold">Atenção:</strong> a soma dos segmentos mensais divergiu do total
                  original em mais de 0,01 h. Reporte ao time técnico.
                </p>
              ) : null}
            </div>
          ) : null}

          {audit ? (
            <p className="text-[11px] text-zinc-500">
              <span className="font-semibold text-gold">Layout:</span>{" "}
              {LAYOUT_LABELS[audit.layoutType] ?? audit.layoutType}
              {audit.readAs === "csv" ? (
                <>
                  <span className="ml-2 font-semibold text-gold">Separador:</span>{" "}
                  <code className="text-zinc-300">{audit.delimiterUsed}</code>
                  {audit.bomRemoved ? <span className="ml-2 text-zinc-400">· UTF-8 BOM removido</span> : null}
                </>
              ) : audit.sheetUsed ? (
                <>
                  <span className="ml-2 font-semibold text-gold">Aba lida:</span> {audit.sheetUsed}
                </>
              ) : null}
              {audit.dateMin && audit.dateMax ? (
                <>
                  <span className="ml-2 font-semibold text-gold">Período:</span> {formatPeriod(audit.dateMin)} a{" "}
                  {formatPeriod(audit.dateMax)}
                </>
              ) : null}
              <span className="ml-2 font-semibold text-gold">Arquivo:</span> {formatBytes(summary.fileSizeBytes)}
              {summary.viaStorage ? (
                <span className="ml-2 text-zinc-400">· via Supabase Storage</span>
              ) : (
                <span className="ml-2 text-zinc-400">· envio direto</span>
              )}
            </p>
          ) : null}

          {audit?.missingRecommendedColumns.length ? (
            <p className="text-[11px] text-amber-200/80">
              <span className="font-semibold">Colunas recomendadas ausentes:</span>{" "}
              {audit.missingRecommendedColumns.join(", ")}
            </p>
          ) : null}
          {audit?.groupsDetected.length ? (
            <p className="text-[11px] text-zinc-500">
              <span className="font-semibold text-gold">Grupos detectados:</span> {audit.groupsDetected.join(" · ")}
            </p>
          ) : null}
          {audit?.statusDetected.length ? (
            <p className="text-[11px] text-zinc-500">
              <span className="font-semibold text-gold">Status detectados:</span> {audit.statusDetected.join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={running} className={modalGhostButtonClass}>
          {summary ? "Fechar" : "Cancelar"}
        </button>
        <button type="button" onClick={handleUpload} disabled={running || !file} className={modalPrimaryButtonClass}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Importar
        </button>
      </div>
    </ModalShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  Comunicação com a API                                                      */
/* -------------------------------------------------------------------------- */

class ImportFailure extends Error {
  readonly details: string | null;
  constructor(message: string, details?: string | null) {
    super(message);
    this.name = "ImportFailure";
    this.details = details ?? null;
  }
}

type ApiCall = {
  ok: boolean;
  status: number;
  data: unknown;
  error: string;
  details: string | null;
};

/**
 * Lê a resposta SEM assumir que ela é JSON.
 *
 * Este é o ponto exato onde o erro "Unexpected token 'R'" nascia: um
 * `response.json()` direto sobre o texto `Request Entity Too Large` devolvido
 * pela Vercel. Aqui o content-type decide, e qualquer corpo não-JSON vira uma
 * mensagem em português — o usuário nunca vê o erro do parser.
 */
async function readResponse(response: Response): Promise<ApiCall> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const body = (await response.json()) as { success?: boolean; data?: unknown; error?: string; details?: string; message?: string };
      return {
        ok: response.ok && body?.success !== false,
        status: response.status,
        data: body?.data ?? body,
        error: body?.error ?? body?.message ?? `Falha na importação. Status HTTP: ${response.status}`,
        details: body?.details ?? null
      };
    } catch {
      return {
        ok: false,
        status: response.status,
        data: null,
        error: `Resposta inválida do servidor (HTTP ${response.status}).`,
        details: "corpo anunciado como JSON, mas ilegível"
      };
    }
  }

  const rawText = (await response.text().catch(() => "")).trim();
  return {
    ok: false,
    status: response.status,
    data: null,
    error: translateRawBody(rawText, response.status),
    details: rawText ? rawText.slice(0, 600) : null
  };
}

/**
 * Traduz um corpo em texto puro para uma mensagem acionável.
 *
 * `Request Entity Too Large` é o caso concreto: vem da Vercel, em texto, antes
 * de a rota rodar. Dizer "arquivo muito grande" — e o que fazer — é o mínimo.
 */
function translateRawBody(rawText: string, status: number): string {
  if (status === 413 || /request entity too large/i.test(rawText)) {
    return "Arquivo muito grande para envio direto. A importação será feita via Supabase Storage.";
  }
  if (status === 504 || /timeout|gateway/i.test(rawText)) {
    return "O servidor demorou demais para responder. Tente novamente — o arquivo já enviado é reaproveitado.";
  }
  if (status === 401 || status === 403) {
    return "Sessão expirada ou sem permissão para importar. Faça login novamente.";
  }
  if (rawText.startsWith("<")) {
    return `O servidor devolveu uma página de erro em vez de dados (HTTP ${status}).`;
  }
  return rawText || `Falha na importação. Status HTTP: ${status}`;
}

async function callApi(url: string, body: unknown): Promise<ApiCall> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    return await readResponse(response);
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: "Falha de rede ao falar com o portal. Verifique a conexão e tente novamente.",
      details: error instanceof Error ? error.message : null
    };
  }
}

/** Caminho de reserva: POST direto, só para arquivo pequeno e sem Storage. */
async function importDirect(file: File): Promise<ImportSummary> {
  const formData = new FormData();
  formData.append("file", file);

  let response: Response;
  try {
    response = await fetch("/api/pc-factory/import", { method: "POST", body: formData });
  } catch (error) {
    throw new ImportFailure(
      "Falha de rede ao enviar o arquivo.",
      error instanceof Error ? error.message : null
    );
  }

  const call = await readResponse(response);
  if (!call.ok) throw new ImportFailure(call.error, call.details);

  const legacy = call.data as {
    importedRows?: number;
    replacedRows?: number;
    totalRows?: number;
    ignoredRows?: number;
    resourcesDetected?: number;
    statusDetected?: string[];
    totalHours?: number;
    maintenanceHours?: number;
    invalidEndDatesCount?: number;
    derivedEndDatesCount?: number;
    multiMonthIntervals?: number;
    originalVsSegmentedDifference?: number;
    layoutType?: PcFactoryLayoutType;
    sheetUsed?: string | null;
    readAs?: "xlsx" | "csv";
    delimiterUsed?: string | null;
    bomRemoved?: boolean;
    periodDetected?: { start: string | null; end: string | null };
    missingRecommendedColumns?: string[];
    groupsDetected?: string[];
  };

  return {
    appliedRows: legacy.importedRows ?? 0,
    replacedRows: legacy.replacedRows ?? 0,
    fileSizeBytes: file.size,
    viaStorage: false,
    audit: {
      layoutType: legacy.layoutType ?? "UNKNOWN",
      sheetUsed: legacy.sheetUsed ?? null,
      readAs: legacy.readAs ?? "xlsx",
      delimiterUsed: legacy.delimiterUsed ?? null,
      bomRemoved: legacy.bomRemoved ?? false,
      totalRows: legacy.totalRows ?? 0,
      validRows: legacy.importedRows ?? 0,
      ignoredRows: legacy.ignoredRows ?? 0,
      machines: legacy.resourcesDetected ?? 0,
      statuses: legacy.statusDetected?.length ?? 0,
      dateMin: legacy.periodDetected?.start ?? null,
      dateMax: legacy.periodDetected?.end ?? null,
      totalDurationHours: legacy.totalHours ?? 0,
      maintenanceHours: legacy.maintenanceHours ?? 0,
      invalidEndDates: legacy.invalidEndDatesCount ?? 0,
      derivedEndDates: legacy.derivedEndDatesCount ?? 0,
      multiMonthIntervals: legacy.multiMonthIntervals ?? 0,
      originalVsSegmentedDifference: legacy.originalVsSegmentedDifference ?? 0,
      missingRecommendedColumns: legacy.missingRecommendedColumns ?? [],
      groupsDetected: legacy.groupsDetected ?? [],
      statusDetected: legacy.statusDetected ?? []
    }
  };
}

function friendlyMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Falha inesperada ao importar o arquivo.";
}

/* -------------------------------------------------------------------------- */
/*  Helpers de UI                                                              */
/* -------------------------------------------------------------------------- */

type StepState = "done" | "current" | "future" | "error";

function stepState(key: StepKey, current: StepKey | null, failed: StepKey | null): StepState {
  const order = STEPS.findIndex((s) => s.key === key);
  const currentOrder = current ? STEPS.findIndex((s) => s.key === current) : -1;
  if (failed && key === failed) return "error";
  if (currentOrder < 0) return "future";
  if (order < currentOrder) return "done";
  if (order === currentOrder) return current === "done" ? "done" : "current";
  return "future";
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "error") return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-400" />;
  if (state === "done") return <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />;
  if (state === "current") return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-gold" />;
  return <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-zinc-700" />;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
        {value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
        {suffix}
      </dd>
    </div>
  );
}
