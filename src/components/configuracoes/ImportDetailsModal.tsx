"use client";

/**
 * Modal "Detalhes da Importação" (Configurações → Histórico de Importações).
 *
 * Busca os detalhes sob demanda em /api/imports/[id] — a listagem já carrega
 * 200 registros e embutir metadata e erros de todos eles no HTML da página
 * seria pagar o custo de uma coisa que o usuário abre uma por vez.
 *
 * Importa rótulos de @/types/audit (texto puro). NÃO importar @/types/imports
 * aqui: aquele módulo carrega os enums do @prisma/client em runtime.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { ModalShell, modalGhostButtonClass } from "@/components/ui/ModalShell";
import { formatDateTimePtBr } from "@/utils/date";
import {
  IMPORT_ROW_STATUS_LABELS,
  IMPORT_STATUS_LABELS,
  type ImportHistoryDTO
} from "@/types/audit";

type StagingError = {
  id: string;
  rowNumber: number;
  status: string;
  errorMessage: string | null;
};

type ImportDetails = {
  import: ImportHistoryDTO;
  stagingSummary: Record<string, number>;
  stagingErrors: StagingError[];
  canDownload: boolean;
};

type ImportDetailsModalProps = {
  /** Linha clicada na tabela. `null` fecha o modal. */
  row: ImportHistoryDTO | null;
  onClose: () => void;
};

export function ImportDetailsModal({ row, onClose }: ImportDetailsModalProps) {
  const [details, setDetails] = useState<ImportDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const importId = row?.id ?? null;

  useEffect(() => {
    if (!importId) {
      setDetails(null);
      setError(null);
      return;
    }

    // Requisição obsoleta não pode sobrescrever a atual: o usuário fecha um
    // modal e abre outro mais rápido do que a rede responde.
    let active = true;
    const controller = new AbortController();

    setLoading(true);
    setError(null);

    fetch(`/api/imports/${importId}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await readJson(res);
        if (!active) return;
        if (!res.ok || !body?.success) {
          setError(body?.error ?? "Não foi possível carregar os detalhes desta importação.");
          setDetails(null);
          return;
        }
        setDetails(body.data as ImportDetails);
      })
      .catch((err: unknown) => {
        if (!active || (err instanceof Error && err.name === "AbortError")) return;
        setError("Falha de rede ao carregar os detalhes da importação.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [importId]);

  const handleDownload = useCallback(async () => {
    if (!importId) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/imports/${importId}/file`);
      const body = await readJson(res);
      if (!res.ok || !body?.success) {
        setError(body?.error ?? "Não foi possível gerar o link do arquivo.");
        return;
      }
      // A URL assinada expira em minutos — abrir em aba nova evita perder o
      // estado do modal se o download demorar.
      const { url } = body.data as { url: string };
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setError("Falha de rede ao gerar o link do arquivo.");
    } finally {
      setDownloading(false);
    }
  }, [importId]);

  if (!row) return null;

  const current = details?.import ?? row;

  return (
    <ModalShell
      open
      title="Detalhes da Importação"
      subtitle={`${current.moduleLabel} — ${formatDateTimePtBr(current.createdAt)}`}
      onClose={onClose}
    >
      <div className="space-y-5 text-sm">
        {/* ---------------------------- Resumo ---------------------------- */}
        <section>
          <SectionTitle>Resumo</SectionTitle>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
            <Row label="Arquivo" value={current.fileName} title={current.fileName} />
            <Row label="Usuário" value={current.importedBy ?? "—"} />
            <Row label="Status" value={IMPORT_STATUS_LABELS[current.status] ?? current.status} />
            <Row label="Estágio" value={current.stageLabel ?? "—"} />
            <Row label="Início" value={current.startedAt ? formatDateTimePtBr(current.startedAt) : "—"} />
            <Row label="Fim" value={current.finishedAt ? formatDateTimePtBr(current.finishedAt) : "—"} />
            <Row label="Duração" value={formatDuration(current.durationMs)} />
            <Row label="Tamanho" value={formatBytes(current.fileSize)} />
          </dl>
        </section>

        {/* --------------------------- Contadores -------------------------- */}
        <section>
          <SectionTitle>Linhas</SectionTitle>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
            <Counter label="Lidas" value={current.totalRows} />
            <Counter label="Válidas" value={current.validRows} tone="emerald" />
            <Counter label="Criadas" value={current.createdRows} tone="emerald" />
            <Counter label="Atualizadas" value={current.updatedRows} tone="sky" />
            <Counter label="Ignoradas" value={current.ignoredRows} tone="zinc" />
            <Counter label="Com erro" value={current.errorRows} tone="red" />
          </div>
        </section>

        {/* ----------------------------- Erro ------------------------------ */}
        {current.errorMessage ? (
          <section className="flex items-start gap-2 rounded-lg border border-red-400/25 bg-red-500/5 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <div className="min-w-0">
              <h4 className="text-[11px] font-bold uppercase tracking-wide text-red-300/80">Erro registrado</h4>
              <p className="mt-1 whitespace-pre-wrap break-words text-[12px] text-zinc-300">
                {current.errorMessage}
              </p>
            </div>
          </section>
        ) : null}

        {loading ? (
          <p className="flex items-center gap-2 text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando detalhes…
          </p>
        ) : null}

        {error ? <p className="text-[12px] text-red-300">{error}</p> : null}

        {/* ---------------------------- Staging ---------------------------- */}
        {details && Object.keys(details.stagingSummary).length > 0 ? (
          <section>
            <SectionTitle>Staging</SectionTitle>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(details.stagingSummary).map(([status, count]) => (
                <span
                  key={status}
                  className="rounded-full border border-gold/20 bg-black/40 px-2.5 py-1 text-[11px] text-zinc-300"
                >
                  {IMPORT_ROW_STATUS_LABELS[status] ?? status}: <b className="tabular-nums">{count}</b>
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {details && details.stagingErrors.length > 0 ? (
          <section>
            <SectionTitle>Linhas com problema (primeiras {details.stagingErrors.length})</SectionTitle>
            <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-gold/15">
              <table className="w-full border-collapse text-left text-[12px]">
                <tbody>
                  {details.stagingErrors.map((e) => (
                    <tr key={e.id} className="border-b border-white/5 last:border-0">
                      <td className="whitespace-nowrap px-2 py-1.5 text-zinc-500">Linha {e.rowNumber}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-zinc-400">
                        {IMPORT_ROW_STATUS_LABELS[e.status] ?? e.status}
                      </td>
                      <td className="px-2 py-1.5 text-zinc-300">{e.errorMessage ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {/* ---------------------------- Metadata --------------------------- */}
        {current.metadata && Object.keys(current.metadata).length > 0 ? (
          <section>
            <SectionTitle>Metadata</SectionTitle>
            <pre className="mt-2 max-h-52 overflow-auto rounded-lg border border-gold/15 bg-black/40 p-3 text-[11px] leading-relaxed text-zinc-300">
              {JSON.stringify(current.metadata, null, 2)}
            </pre>
          </section>
        ) : null}

        {/* ---------------------------- Arquivo ---------------------------- */}
        <section>
          <SectionTitle>Arquivo original</SectionTitle>
          {current.hasFile ? (
            <>
              <p className="mt-2 flex items-start gap-2 break-all text-[11px] text-zinc-500">
                <FileSpreadsheet className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold/70" />
                {current.filePath}
              </p>
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading || !details?.canDownload}
                className={`${modalGhostButtonClass} mt-2 disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Baixar planilha original
              </button>
              <p className="mt-1 text-[11px] text-zinc-600">O link é assinado e expira em 5 minutos.</p>
            </>
          ) : (
            <p className="mt-2 text-[12px] text-zinc-500">
              Esta importação não guardou o arquivo no Storage — ela é anterior à infraestrutura de
              armazenamento, ou o Supabase Storage não estava configurado no momento do envio.
            </p>
          )}
        </section>
      </div>
    </ModalShell>
  );
}

/* ------------------------------- Helpers UI ------------------------------- */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[11px] font-bold uppercase tracking-wide text-champagne/70">{children}</h3>;
}

function Row({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="truncate text-[13px] text-zinc-200" title={title ?? value}>
        {value}
      </dd>
    </div>
  );
}

const COUNTER_TONES: Record<string, string> = {
  zinc: "text-zinc-300",
  emerald: "text-emerald-300",
  sky: "text-sky-300",
  red: "text-red-300"
};

function Counter({ label, value, tone = "zinc" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-gold/15 bg-black/30 px-2 py-1.5 text-center">
      <p className={`text-base font-bold tabular-nums ${COUNTER_TONES[tone] ?? COUNTER_TONES.zinc}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
    </div>
  );
}

/**
 * Lê o corpo como JSON tolerando resposta não-JSON.
 *
 * Quando a função serverless estoura tempo/memória, a Vercel devolve uma página
 * HTML — sem isto, o `res.json()` quebraria com "Unexpected token '<'" e o
 * usuário veria um erro que não diz nada.
 */
type ApiEnvelope = { success?: boolean; error?: string; data?: unknown };

async function readJson(res: Response): Promise<ApiEnvelope> {
  try {
    return await res.json();
  } catch {
    return { success: false, error: `Resposta inesperada do servidor (HTTP ${res.status}).` };
  }
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms < 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${Math.round(seconds % 60)} s`;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
