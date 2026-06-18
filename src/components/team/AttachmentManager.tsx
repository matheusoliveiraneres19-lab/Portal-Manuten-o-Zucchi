"use client";

import { useRef, useState } from "react";
import { Download, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { AttachmentKindValue, AttachmentRow } from "@/types/collaborators";

const MAX_BYTES = 10 * 1024 * 1024;

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function fmtDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

/**
 * Lista/anexa/baixa/remove PDFs de um colaborador para um `kind` específico.
 * Só é renderizado quando a sessão é ADMIN/GESTOR (anexos = dados pessoais).
 */
export function AttachmentManager({
  collaboratorId,
  kind,
  title,
  initial
}: {
  collaboratorId: string;
  kind: AttachmentKindValue;
  title: string;
  initial: AttachmentRow[];
}) {
  const [items, setItems] = useState<AttachmentRow[]>(initial);
  const [busy, setBusy] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleUpload(file: File) {
    if (file.type !== "application/pdf" || !/\.pdf$/i.test(file.name)) {
      toast.error("Envie um arquivo PDF.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Arquivo excede o limite de 10 MB.");
      return;
    }
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kind", kind);
      const response = await fetch(`/api/collaborators/${collaboratorId}/attachments`, {
        method: "POST",
        body: formData
      });
      const json = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string; attachment?: AttachmentRow }
        | null;
      if (!response.ok || !json?.ok || !json.attachment) {
        throw new Error(json?.message ?? "Falha ao enviar o anexo.");
      }
      setItems((prev) => [json.attachment as AttachmentRow, ...prev]);
      toast.success("Anexo enviado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao enviar o anexo.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDownload(id: string) {
    setDownloadingId(id);
    try {
      const response = await fetch(`/api/collaborators/${collaboratorId}/attachments/${id}`);
      const json = (await response.json().catch(() => null)) as { ok?: boolean; url?: string; message?: string } | null;
      if (!response.ok || !json?.ok || !json.url) throw new Error(json?.message ?? "Falha ao abrir o anexo.");
      window.open(json.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao abrir o anexo.");
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Remover este anexo? A ação não pode ser desfeita.")) return;
    try {
      const response = await fetch(`/api/collaborators/${collaboratorId}/attachments/${id}`, { method: "DELETE" });
      const json = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !json?.ok) throw new Error(json?.message ?? "Falha ao remover.");
      setItems((prev) => prev.filter((item) => item.id !== id));
      toast.success("Anexo removido.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao remover.");
    }
  }

  return (
    <div className="mt-3 border-t border-zinc-200/60 pt-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{title}</span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gold/50 bg-gold/10 px-2.5 text-[11px] font-bold text-gold transition hover:bg-gold/20 disabled:opacity-70"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Anexar PDF
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUpload(file);
          }}
        />
      </div>

      {items.length === 0 ? (
        <p className="text-[11px] text-zinc-400">Nenhum anexo.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-2 rounded-md border border-zinc-200/70 bg-white/60 px-2.5 py-1.5"
            >
              <span className="flex min-w-0 items-center gap-2 text-[12px] text-zinc-800">
                <FileText className="h-3.5 w-3.5 shrink-0 text-danger" />
                <span className="truncate" title={item.fileName}>{item.fileName}</span>
                <span className="shrink-0 text-[10px] text-zinc-400">
                  {fmtSize(item.sizeBytes)} · {fmtDateTime(item.uploadedAt)}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => void handleDownload(item.id)}
                  disabled={downloadingId === item.id}
                  title="Baixar"
                  className="grid h-7 w-7 place-items-center rounded-md text-petroleum transition hover:bg-petroleum/10 disabled:opacity-60"
                >
                  {downloadingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(item.id)}
                  title="Remover"
                  className="grid h-7 w-7 place-items-center rounded-md text-danger transition hover:bg-danger/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
