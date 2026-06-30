"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, Loader2, Plus, RefreshCw, Trash2, UploadCloud, Video, X } from "lucide-react";
import { getVideoProvider, videoProviderLabel } from "@/utils/video-embed";

type ProcedureVideoManagerProps = {
  slug: string;
  /** Vídeo principal atual, se já cadastrado. `isExternal` = veio de link (não de upload). */
  current: { id: string; title: string; url: string; description: string | null; isExternal: boolean } | null;
};

const MAX_VIDEO_MB = 100;
const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024;

/**
 * Gestão da videoaula (ADMIN/Gestão). Duas formas de cadastrar, ambas dentro do portal:
 *  - ENVIAR ARQUIVO (MP4): upload DIRETO ao Supabase Storage via URL assinada (contorna
 *    o limite de 4 MB da Vercel) e registra o anexo;
 *  - LINK externo (YouTube/Drive/Vimeo/.mp4): reaproveita a API de anexos.
 * Substituir = cria o novo e remove o anterior só depois (não perde o vídeo em caso de erro).
 */
export function ProcedureVideoManager({ slug, current }: ProcedureVideoManagerProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  // Pré-preenche o link apenas quando o vídeo atual é um link (uploads usam URL temporária).
  const [url, setUrl] = useState(current?.isExternal ? current.url : "");
  const [title, setTitle] = useState(current?.title ?? "");
  const [description, setDescription] = useState(current?.description ?? "");
  const [savingLink, setSavingLink] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const provider = url.trim() ? getVideoProvider(url) : "unknown";
  const isKnown = provider !== "unknown";
  const busy = savingLink || uploading || removing;

  function resetForm() {
    setUrl(current?.isExternal ? current.url : "");
    setTitle(current?.title ?? "");
    setDescription(current?.description ?? "");
  }

  /** Remove o vídeo anterior (best-effort) após o novo entrar — usado em substituição. */
  async function deleteCurrent() {
    if (!current) return;
    await fetch(`/api/procedures/${encodeURIComponent(slug)}/attachments/${current.id}`, { method: "DELETE" }).catch(() => {});
  }

  async function registerVideo(payload: Record<string, unknown>): Promise<boolean> {
    const response = await fetch(`/api/procedures/${encodeURIComponent(slug)}/attachments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
    if (!response.ok || !data?.ok) {
      toast.error(data?.message ?? "Não foi possível salvar a videoaula.");
      return false;
    }
    return true;
  }

  // ---- Upload direto de arquivo MP4 ----
  async function handleFile(file: File | undefined | null) {
    if (!file) return;
    if (file.type !== "video/mp4") {
      toast.error("Envie um vídeo no formato MP4 (ou cole um link do YouTube/Drive).");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      toast.error(`Vídeo excede ${MAX_VIDEO_MB} MB. Compacte o arquivo ou use um link.`);
      return;
    }
    setUploading(true);
    try {
      // 1) pede a URL assinada de upload
      const signRes = await fetch(`/api/procedures/${encodeURIComponent(slug)}/attachments/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, fileSize: file.size })
      });
      const signData = (await signRes.json().catch(() => null)) as
        | { ok?: boolean; uploadUrl?: string; storagePath?: string; message?: string }
        | null;
      if (!signRes.ok || !signData?.ok || !signData.uploadUrl || !signData.storagePath) {
        toast.error(signData?.message ?? "Não foi possível iniciar o upload.");
        return;
      }

      // 2) envia o arquivo DIRETO ao Storage (multipart, no formato do supabase-js)
      const form = new FormData();
      form.append("cacheControl", "3600");
      form.append("", file);
      const putRes = await fetch(signData.uploadUrl, { method: "PUT", headers: { "x-upsert": "false" }, body: form });
      if (!putRes.ok) {
        toast.error(`Falha no envio do vídeo ao servidor (HTTP ${putRes.status}).`);
        return;
      }

      // 3) registra o anexo
      const ok = await registerVideo({
        storagePath: signData.storagePath,
        fileName: title.trim() || file.name,
        description: description.trim() || undefined,
        fileSize: file.size
      });
      if (!ok) return;

      // 4) substituição: remove o vídeo anterior
      await deleteCurrent();
      toast.success(current ? "Videoaula atualizada." : "Videoaula adicionada.");
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Falha de conexão durante o upload do vídeo.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // ---- Link externo ----
  async function handleSaveLink() {
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      toast.error("Informe uma URL válida (http/https) ou envie um arquivo.");
      return;
    }
    if (!isKnown) {
      toast.error("Link de vídeo não reconhecido. Use YouTube, Google Drive, Vimeo ou .mp4.");
      return;
    }
    setSavingLink(true);
    try {
      const ok = await registerVideo({
        url: trimmed,
        fileName: title.trim() || undefined,
        description: description.trim() || undefined
      });
      if (!ok) return;
      await deleteCurrent();
      toast.success(current ? "Videoaula atualizada." : "Videoaula adicionada.");
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Falha de conexão ao salvar a videoaula.");
    } finally {
      setSavingLink(false);
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wide text-[#D6AA3A]">Videoaula do procedimento</span>
        <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="text-[#B8AD9A] transition hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Enviar arquivo (drag & drop) */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!busy) handleFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => !busy && fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Enviar arquivo de vídeo"
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
          dragOver ? "border-[#D6AA3A] bg-[#D6AA3A]/10" : "border-[#C6A24A]/30 bg-black/30 hover:border-[#D6AA3A]/55"
        } ${busy ? "pointer-events-none opacity-60" : ""}`}
      >
        {uploading ? (
          <>
            <Loader2 className="h-7 w-7 animate-spin text-[#D6AA3A]" />
            <p className="text-sm font-semibold text-[#F8F3E7]">Enviando vídeo…</p>
            <p className="text-[11px] text-[#8F846F]">Não feche esta janela até concluir.</p>
          </>
        ) : (
          <>
            <UploadCloud className="h-7 w-7 text-[#D6AA3A]" />
            <p className="text-sm font-semibold text-[#F8F3E7]">Arraste o vídeo aqui ou clique para enviar</p>
            <p className="text-[11px] text-[#8F846F]">Formato MP4, até {MAX_VIDEO_MB} MB. O vídeo fica hospedado no portal.</p>
          </>
        )}
        <input ref={fileInputRef} type="file" accept="video/mp4" onChange={(e) => handleFile(e.target.files?.[0])} className="hidden" />
      </div>

      {/* Separador */}
      <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-[#8F846F]">
        <span className="h-px flex-1 bg-[#C6A24A]/20" /> ou cole um link <span className="h-px flex-1 bg-[#C6A24A]/20" />
      </div>

      {/* Link externo */}
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
      </div>

      {/* Metadados (valem para arquivo e link) */}
      <div className="space-y-2">
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
          onClick={handleSaveLink}
          disabled={busy || !url.trim()}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#D6AA3A]/60 bg-[#D6AA3A]/15 px-3 text-[12px] font-bold text-[#F6D98B] transition hover:bg-[#D6AA3A]/25 disabled:opacity-50"
        >
          {savingLink ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          Salvar link
        </button>
      </div>
    </div>
  );
}

const inputClass =
  "h-9 w-full rounded-lg border border-[#C6A24A]/30 bg-[#11100C] px-3 text-sm text-[#F8F3E7] outline-none transition placeholder:text-[#8F846F] focus:border-[#D6AA3A] focus:ring-2 focus:ring-[#D6AA3A]/20";
