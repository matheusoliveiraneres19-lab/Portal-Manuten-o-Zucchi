"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArrowLeft, Pencil, Printer } from "lucide-react";
import { ProcedureForm } from "@/components/procedures/ProcedureForm";
import type { ProcedureDetail } from "@/types/procedures";

type ProcedureDetailActionsProps = {
  detail: ProcedureDetail;
  canManage: boolean;
};

export function ProcedureDetailActions({ detail, canManage }: ProcedureDetailActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

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
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href="/dashboard/procedimentos"
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-gold/20 px-3 text-[13px] font-semibold text-zinc-300 transition hover:border-gold/40 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-gold/20 px-3 text-[13px] font-semibold text-zinc-300 transition hover:border-gold/40 hover:text-white"
      >
        <Printer className="h-4 w-4" /> Imprimir
      </button>
      {canManage ? (
        <>
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-gold/45 bg-gold/15 px-3 text-[13px] font-bold text-gold transition hover:bg-gold/25"
          >
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
