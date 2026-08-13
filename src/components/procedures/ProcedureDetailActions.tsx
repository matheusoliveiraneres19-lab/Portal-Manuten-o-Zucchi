"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArrowLeft, Check, CheckCircle2, Loader2, Pencil, Printer, Star } from "lucide-react";
import { ProcedureForm } from "@/components/procedures/ProcedureForm";
import type { ProcedureDetail } from "@/types/procedures";

type ProcedureDetailActionsProps = {
  detail: ProcedureDetail;
  canManage: boolean;
  isFavorite: boolean;
  readConfirmedAt: string | null;
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("pt-BR");
}

/* Botões neutros (Voltar/Imprimir) e dourados (Editar) com alto contraste. */
const NEUTRAL_BTN =
  "inline-flex h-9 items-center gap-2 rounded-lg border border-gold/30 px-3 text-[13px] font-semibold text-parchment transition hover:border-gold/55 hover:text-white";
const GOLD_BTN =
  "inline-flex h-9 items-center gap-2 rounded-lg border border-gold/55 bg-gold/15 px-3 text-[13px] font-bold text-gold-soft transition hover:bg-gold/25";

export function ProcedureDetailActions({ detail, canManage, isFavorite, readConfirmedAt }: ProcedureDetailActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [favorite, setFavorite] = useState(isFavorite);
  const [favLoading, setFavLoading] = useState(false);
  const [readAt, setReadAt] = useState(readConfirmedAt);
  const [readLoading, setReadLoading] = useState(false);

  async function toggleFavorite() {
    setFavLoading(true);
    try {
      const response = await fetch(`/api/procedures/${encodeURIComponent(detail.slug)}/favorite`, { method: "POST" });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; favorited?: boolean; message?: string } | null;
      if (!response.ok || !data?.ok) {
        toast.error(data?.message ?? "Não foi possível favoritar.");
        return;
      }
      setFavorite(Boolean(data.favorited));
      toast.success(data.favorited ? "Adicionado aos favoritos." : "Removido dos favoritos.");
      router.refresh();
    } catch {
      toast.error("Falha de conexão.");
    } finally {
      setFavLoading(false);
    }
  }

  async function confirmRead() {
    setReadLoading(true);
    try {
      const response = await fetch(`/api/procedures/${encodeURIComponent(detail.slug)}/read`, { method: "POST" });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; confirmedAt?: string; message?: string } | null;
      if (!response.ok || !data?.ok) {
        toast.error(data?.message ?? "Não foi possível registrar a leitura.");
        return;
      }
      setReadAt(data.confirmedAt ?? new Date().toISOString());
      toast.success("Leitura confirmada. Obrigado!");
      router.refresh();
    } catch {
      toast.error("Falha de conexão.");
    } finally {
      setReadLoading(false);
    }
  }

  async function archive() {
    if (!window.confirm("Arquivar este procedimento? Ele deixará de aparecer na lista pública.")) return;
    setArchiving(true);
    try {
      const response = await fetch(`/api/procedures/${detail.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Arquivado" })
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !data?.ok) {
        toast.error(data?.message ?? "Não foi possível arquivar.");
        return;
      }
      toast.success("Procedimento arquivado.");
      router.push("/dashboard/procedimentos");
      router.refresh();
    } catch {
      toast.error("Falha de conexão ao arquivar.");
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <Link href="/dashboard/procedimentos" className={NEUTRAL_BTN}>
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      {/* Favorito — qualquer usuário */}
      <button
        type="button"
        onClick={toggleFavorite}
        disabled={favLoading}
        className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[13px] font-bold transition disabled:opacity-60 ${
          favorite
            ? "border-gold/60 bg-gold/15 text-gold-soft"
            : "border-gold/30 text-parchment hover:border-gold/55 hover:text-white"
        }`}
      >
        {favLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className={`h-4 w-4 ${favorite ? "fill-gold" : ""}`} />}
        {favorite ? "Favoritado" : "Favoritar"}
      </button>

      {/* Li e estou ciente — qualquer usuário */}
      {readAt ? (
        <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-success/50 bg-success/15 px-3 text-[13px] font-bold text-success-soft">
          <CheckCircle2 className="h-4 w-4" /> Lido em {formatDate(readAt)}
        </span>
      ) : (
        <button
          type="button"
          onClick={confirmRead}
          disabled={readLoading}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-success/50 bg-success/15 px-3 text-[13px] font-bold text-success-soft transition hover:bg-success/25 disabled:opacity-60"
        >
          {readLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Li e estou ciente
        </button>
      )}

      <button type="button" onClick={() => window.print()} className={NEUTRAL_BTN}>
        <Printer className="h-4 w-4" /> Imprimir
      </button>

      {canManage ? (
        <>
          <button type="button" onClick={() => setEditOpen(true)} className={GOLD_BTN}>
            <Pencil className="h-4 w-4" /> Editar
          </button>
          {detail.status !== "Arquivado" ? (
            <button
              type="button"
              onClick={archive}
              disabled={archiving}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-danger/40 px-3 text-[13px] font-bold text-danger transition hover:bg-danger/10 disabled:opacity-60"
            >
              <Archive className="h-4 w-4" /> Arquivar
            </button>
          ) : null}
          <ProcedureForm open={editOpen} onClose={() => setEditOpen(false)} initial={detail} onSaved={(slug) => router.push(`/dashboard/procedimentos/${slug}`)} />
        </>
      ) : null}
    </div>
  );
}
