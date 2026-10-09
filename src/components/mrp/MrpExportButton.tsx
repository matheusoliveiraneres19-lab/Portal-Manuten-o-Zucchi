"use client";

/**
 * Botão de exportação Excel da Análise MRP (FASE J). O .xlsx é gerado no
 * servidor (GET /api/mrp/export); aqui só se envia o tipo + os filtros atuais
 * e se baixa o arquivo com o nome do Content-Disposition.
 */
import { useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { MrpExportType } from "@/lib/mrp/export";

type Props = {
  type: MrpExportType;
  label: string;
  /** Filtros atuais da aba (vazios são omitidos). */
  params?: Record<string, string | boolean | undefined>;
  testId?: string;
};

function fileNameFrom(disposition: string | null): string | null {
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition ?? "");
  return m ? decodeURIComponent(m[1]) : null;
}

export function MrpExportButton({ type, label, params, testId }: Props) {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  async function run() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      const qs = new URLSearchParams({ type });
      for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== "" && v !== false) qs.set(k, String(v));
      const res = await fetch(`/api/mrp/export?${qs}`, { cache: "no-store" });
      const name = fileNameFrom(res.headers.get("content-disposition"));
      if (!res.ok || !name) {
        const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
        toast.error(body?.message || body?.error || `Erro ${res.status} ao gerar o Excel.`);
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success("Arquivo gerado");
    } catch {
      toast.error("Falha de rede ao gerar o Excel.");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      aria-busy={busy}
      data-testid={testId}
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-gold/30 px-3 text-xs font-semibold text-gold transition hover:bg-gold/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold/70 disabled:cursor-wait disabled:opacity-60"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} {label}
    </button>
  );
}
