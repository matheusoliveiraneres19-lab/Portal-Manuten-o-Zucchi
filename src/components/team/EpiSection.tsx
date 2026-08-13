"use client";

import { useState } from "react";
import { HardHat, Loader2, Pencil, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { AttachmentManager } from "@/components/team/AttachmentManager";
import type { AttachmentRow, EpiDerivedStatus, EpiItemRow } from "@/types/collaborators";

const inputClass =
  "h-9 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-gold";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function statusBadge(status: EpiDerivedStatus, days: number) {
  if (status === "VENCIDO") {
    return { label: `Vencido há ${Math.abs(days)} d`, cls: "bg-danger/15 text-danger border border-danger/30" };
  }
  if (status === "A_VENCER") {
    return { label: days === 0 ? "Vence hoje" : `Vence em ${days} d`, cls: "bg-gold/20 text-warning-strong border border-gold/40" };
  }
  return { label: "Válido", cls: "bg-success/15 text-success-strong border border-success/30" };
}

type FormState = { name: string; caNumber: string; caValidUntil: string; deliveredAt: string; notes: string };
const EMPTY: FormState = { name: "", caNumber: "", caValidUntil: "", deliveredAt: "", notes: "" };

export function EpiSection({
  collaboratorId,
  epis: initialEpis,
  attachments,
  canManage
}: {
  collaboratorId: string;
  epis: EpiItemRow[];
  attachments: AttachmentRow[];
  canManage: boolean;
}) {
  const [epis, setEpis] = useState<EpiItemRow[]>(initialEpis);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY);
    setFormOpen(true);
  }
  function openEdit(epi: EpiItemRow) {
    setEditingId(epi.id);
    setForm({
      name: epi.name,
      caNumber: epi.caNumber,
      caValidUntil: epi.caValidUntil.slice(0, 10),
      deliveredAt: epi.deliveredAt?.slice(0, 10) ?? "",
      notes: epi.notes ?? ""
    });
    setFormOpen(true);
  }

  async function submit() {
    if (saving) return;
    if (!form.name.trim() || !form.caNumber.trim() || !form.caValidUntil) {
      toast.error("Nome, CA e validade são obrigatórios.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        caNumber: form.caNumber.trim(),
        caValidUntil: form.caValidUntil,
        deliveredAt: form.deliveredAt || null,
        notes: form.notes.trim() || null
      };
      const url = editingId
        ? `/api/collaborators/${collaboratorId}/epis/${editingId}`
        : `/api/collaborators/${collaboratorId}/epis`;
      const response = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = (await response.json().catch(() => null)) as { ok?: boolean; message?: string; epi?: EpiItemRow } | null;
      if (!response.ok || !json?.ok || !json.epi) throw new Error(json?.message ?? "Falha ao salvar o EPI.");
      const saved = json.epi;
      setEpis((prev) => (editingId ? prev.map((e) => (e.id === saved.id ? saved : e)) : [...prev, saved]));
      toast.success(editingId ? "EPI atualizado." : "EPI cadastrado.");
      setFormOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Remover este EPI?")) return;
    try {
      const response = await fetch(`/api/collaborators/${collaboratorId}/epis/${id}`, { method: "DELETE" });
      const json = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !json?.ok) throw new Error(json?.message ?? "Falha ao remover.");
      setEpis((prev) => prev.filter((e) => e.id !== id));
      toast.success("EPI removido.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao remover.");
    }
  }

  return (
    <article className="panel rounded-lg p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <HardHat className="h-4 w-4 text-gold-deep" />
          <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">EPIs</h3>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gold/55 bg-gold/15 px-3 text-[11px] font-bold text-gold transition hover:bg-gold/25"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar EPI
          </button>
        ) : null}
      </div>

      {epis.length === 0 ? (
        <p className="text-[12px] text-zinc-500">Nenhum EPI cadastrado.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-zinc-500">
                <th className="pb-1.5 pr-3 font-bold">EPI</th>
                <th className="pb-1.5 pr-3 font-bold">CA</th>
                <th className="pb-1.5 pr-3 font-bold">Validade</th>
                <th className="pb-1.5 pr-3 font-bold">Entregue</th>
                <th className="pb-1.5 pr-3 font-bold">Status</th>
                {canManage ? <th className="pb-1.5 font-bold">Ações</th> : null}
              </tr>
            </thead>
            <tbody className="text-zinc-800">
              {epis.map((epi) => {
                const badge = statusBadge(epi.status, epi.daysToExpire);
                return (
                  <tr key={epi.id} className="border-t border-zinc-200/60">
                    <td className="py-1.5 pr-3 font-medium">{epi.name}</td>
                    <td className="py-1.5 pr-3">{epi.caNumber}</td>
                    <td className="py-1.5 pr-3">{fmtDate(epi.caValidUntil)}</td>
                    <td className="py-1.5 pr-3">{fmtDate(epi.deliveredAt)}</td>
                    <td className="py-1.5 pr-3">
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}>{badge.label}</span>
                    </td>
                    {canManage ? (
                      <td className="py-1.5">
                        <span className="flex items-center gap-1">
                          <button type="button" onClick={() => openEdit(epi)} title="Editar" className="grid h-7 w-7 place-items-center rounded-md text-petroleum transition hover:bg-petroleum/10">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => void remove(epi.id)} title="Remover" className="grid h-7 w-7 place-items-center rounded-md text-danger transition hover:bg-danger/10">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canManage && formOpen ? (
        <div className="mt-3 rounded-lg border border-zinc-200/70 bg-white/70 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-zinc-600">
              <ShieldCheck className="h-3.5 w-3.5" /> {editingId ? "Editar EPI" : "Novo EPI"}
            </span>
            <button type="button" onClick={() => setFormOpen(false)} className="grid h-7 w-7 place-items-center rounded-md text-zinc-500 hover:bg-zinc-200/60">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Nome do EPI</span>
              <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Número do CA</span>
              <input className={inputClass} value={form.caNumber} onChange={(e) => setForm({ ...form, caNumber: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Validade do CA</span>
              <input type="date" className={inputClass} value={form.caValidUntil} onChange={(e) => setForm({ ...form, caValidUntil: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Entregue em</span>
              <input type="date" className={inputClass} value={form.deliveredAt} onChange={(e) => setForm({ ...form, deliveredAt: e.target.value })} />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Observações</span>
              <input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
          </div>
          <div className="mt-2.5 flex justify-end">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-gold/55 bg-gold/15 px-4 text-sm font-bold text-gold transition hover:bg-gold/25 disabled:opacity-70"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editingId ? "Salvar" : "Cadastrar"}
            </button>
          </div>
        </div>
      ) : null}

      {canManage ? (
        <AttachmentManager collaboratorId={collaboratorId} kind="EPI_FICHA" title="Ficha de EPI (PDF)" initial={attachments} />
      ) : null}
    </article>
  );
}
