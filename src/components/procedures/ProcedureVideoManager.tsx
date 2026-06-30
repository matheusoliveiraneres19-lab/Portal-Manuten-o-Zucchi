"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw, Trash2, Video, X } from "lucide-react";
import { getVideoProvider, videoProviderLabel } from "@/utils/video-embed";

type ProcedureVideoManagerProps = {
  slug: string;
  /** Vídeo principal atual (anexo de vídeo), se já cadastrado. */
  current: { id: string; title: string; url: string; description: string | null } | null;
};

/**
 * Gestão da videoaula (ADMIN/Gestão). Reaproveita a API de anexos:
 * o vídeo é salvo como anexo do tipo "link" e o service o classifica como vídeo.
 * Substituir = adiciona o novo e remove o anterior (sem perder o vídeo em caso de erro).
 */
export function ProcedureVideoManager({ slug, current }: ProcedureVideoManagerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(current?.url ?? "");
  const [title, setTitle] = useState(current?.title ?? "");
  const [description, setDescription] = useState(current?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const provider = url.trim() ? getVideoProvider(url) : "unknown";
  const isKnown = provider !== "unknown";

  function resetForm() {
    setUrl(current?.url ?? "");
    setTitle(current?.title ?? "");
    setDescription(current?.description ?? "");
  }

  async function handleSave() {
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      toast.error("Informe uma URL válida (http/https).");
      return;
    }
    if (!isKnown) {
      toast.error("Link de vídeo não reconhecido. Use YouTube, Google Drive, Vimeo ou um arquivo .mp4.");
      return;
    }
    setSaving(true);
    try {
      // 1) cria o novo vídeo
      const response = await fetch(`/api/procedures/${encodeURIComponent(slug)}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed, fileName: title.trim() || undefined, description: description.trim() || undefined })
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !data?.ok) {
        toast.error(data?.message ?? "Não foi possível salvar a videoaula.");
        return;
      }
      // 2) ao substituir, remove o vídeo anterior (só depois do novo entrar)
      if (current) {
        await fetch(`/api/procedures/${encodeURIComponent(slug)}/attachments/${current.id}`, { method: "DELETE" }).catch(() => {});
      }
      toast.success(current ? "Videoaula atualizada." : "Videoaula adicionada.");
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Falha de conexão ao salvar a videoaula.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!current) return;
    if (!window.confirm("Remover a videoaula deste procedimento?")) return;
    setRemoving(true);
    try {
      const response = await fetch(`/api/procedures/${encodeURIComponent(slug)}/attachments/${current.id}`, { method: "DELETE" });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !data?.ok) {
        toast.error(data?.message ?? "Não foi possível remover a videoaula.");
        return;
      }
      toast.success("Videoaula removida.");
      router.refresh();
    } catch {
      toast.error("Falha de conexão.");
    } finally {
      setRemoving(false);
    }
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-[#D6AA3A]">Gestão da videoaula (ADMIN/Gestão)</span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              resetForm();
              setOpen(true);
            }}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#D6AA3A]/55 bg-[#D6AA3A]/15 px-3 text-[12px] font-bold text-[#F6D98B] transition hover:bg-[#D6AA3A]/25"
          >
            {current ? <RefreshCw className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {current ? "Substituir videoaula" : "Adicionar videoaula"}
          </button>
          {current ? (
            <button
              type="button"
              onClick={handleRemove}
              disabled={removing}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-danger/40 px-3 text-[12px] font-bold text-danger transition hover:bg-danger/10 disabled:opacity-60"
            >
              {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Remover
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wide text-[#D6AA3A]">Videoaula do procedimento</span>
        <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="text-[#B8AD9A] transition hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Cole o link do YouTube, Google Drive ou vídeo interno..."
          className={inputClass}
        />
        {url.trim() ? (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
              isKnown ? "border-[#D6AA3A]/30 bg-[#D6AA3A]/10 text-[#F6D98B]" : "border-danger/40 bg-danger/10 text-danger"
            }`}
          >
            <Video className="h-3.5 w-3.5" /> Tipo detectado: {videoProviderLabel(provider)}
          </span>
        ) : null}
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título da videoaula (opcional)" className={inputClass} />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descrição curta (opcional)"
          className={inputClass}
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-9 rounded-lg border border-[#C6A24A]/30 px-3 text-[12px] font-semibold text-[#D7CDBA] transition hover:border-[#D6AA3A]/55 hover:text-white"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#D6AA3A]/60 bg-[#D6AA3A]/15 px-3 text-[12px] font-bold text-[#F6D98B] transition hover:bg-[#D6AA3A]/25 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {current ? "Salvar videoaula" : "Adicionar videoaula"}
        </button>
      </div>
    </div>
  );
}

const inputClass =
  "h-9 w-full rounded-lg border border-[#C6A24A]/30 bg-[#11100C] px-3 text-sm text-[#F8F3E7] outline-none transition placeholder:text-[#8F846F] focus:border-[#D6AA3A] focus:ring-2 focus:ring-[#D6AA3A]/20";
