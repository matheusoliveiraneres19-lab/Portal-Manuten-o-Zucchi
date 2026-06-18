"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus, RotateCcw, Trash2, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import { AttachmentManager } from "@/components/team/AttachmentManager";
import type { AttachmentRow, ToolItemRow } from "@/types/collaborators";

const inputClass =
  "h-9 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-gold";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function statusBadge(status: ToolItemRow["status"]) {
  return status === "DEVOLVIDA"
    ? { label: "Devolvida", cls: "bg-zinc-200/70 text-zinc-600 border border-zinc-300" }
    : { label: "Em uso", cls: "bg-petroleum/15 text-petroleum border border-petroleum/30" };
}

type FormState = { name: string; status: ToolItemRow["status"]; assignedAt: string; returnedAt: string; notes: string };
const EMPTY: FormState = { name: "", status: "EM_USO", assignedAt: "", returnedAt: "", notes: "" };

export function ToolsSection({
  collaboratorId,
  tools: initialTools,
  attachments,
  canManage
}: {
  collaboratorId: string;
  tools: ToolItemRow[];
  attachments: AttachmentRow[];
  canManage: boolean;
}) {
  const [tools, setTools] = useState<ToolItemRow[]>(initialTools);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY);
    setFormOpen(true);
  }
  function openEdit(tool: ToolItemRow) {
    setEditingId(tool.id);
    setForm({
      name: tool.name,
      status: tool.status,
      assignedAt: tool.assignedAt?.slice(0, 10) ?? "",
      returnedAt: tool.returnedAt?.slice(0, 10) ?? "",
      notes: tool.notes ?? ""
    });
    setFormOpen(true);
  }

  async function patch(id: string, body: Record<string, unknown>, successMsg: string) {
    const response = await fetch(`/api/collaborators/${collaboratorId}/tools/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const json = (await response.json().catch(() => null)) as { ok?: boolean; message?: string; tool?: ToolItemRow } | null;
    if (!response.ok || !json?.ok || !json.tool) throw new Error(json?.message ?? "Falha ao salvar.");
    const saved = json.tool;
    setTools((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
    toast.success(successMsg);
  }

  async function submit() {
    if (saving) return;
    if (!form.name.trim()) {
      toast.error("Nome da ferramenta é obrigatório.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        status: form.status,
        assignedAt: form.assignedAt || null,
        returnedAt: form.returnedAt || null,
        notes: form.notes.trim() || null
      };
      if (editingId) {
        await patch(editingId, payload, "Ferramenta atualizada.");
      } else {
        const response = await fetch(`/api/collaborators/${collaboratorId}/tools`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const json = (await response.json().catch(() => null)) as { ok?: boolean; message?: string; tool?: ToolItemRow } | null;
        if (!response.ok || !json?.ok || !json.tool) throw new Error(json?.message ?? "Falha ao salvar.");
        setTools((prev) => [...prev, json.tool as ToolItemRow]);
        toast.success("Ferramenta cadastrada.");
      }
      setFormOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(tool: ToolItemRow) {
    try {
      const next = tool.status === "EM_USO" ? "DEVOLVIDA" : "EM_USO";
      const body =
        next === "DEVOLVIDA"
          ? { status: next, returnedAt: new Date().toISOString().slice(0, 10) }
          : { status: next, returnedAt: null };
      await patch(tool.id, body, next === "DEVOLVIDA" ? "Marcada como devolvida." : "Marcada como em uso.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar status.");
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Remover esta ferramenta?")) return;
    try {
      const response = await fetch(`/api/collaborators/${collaboratorId}/tools/${id}`, { method: "DELETE" });
      const json = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !json?.ok) throw new Error(json?.message ?? "Falha ao remover.");
      setTools((prev) => prev.filter((t) => t.id !== id));
      toast.success("Ferramenta removida.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao remover.");
    }
  }

  return (
    <article className="panel rounded-lg p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-[#5a3d12]" />
          <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">Ferramentas sob responsabilidade</h3>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gold/55 bg-gold/15 px-3 text-[11px] font-bold text-gold transition hover:bg-gold/25"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar ferramenta
          </button>
        ) : null}
      </div>

      {tools.length === 0 ? (
        <p className="text-[12px] text-zinc-500">Nenhuma ferramenta cadastrada.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-zinc-500">
                <th className="pb-1.5 pr-3 font-bold">Ferramenta</th>
                <th className="pb-1.5 pr-3 font-bold">Status</th>
                <th className="pb-1.5 pr-3 font-bold">Designada</th>
                <th className="pb-1.5 pr-3 font-bold">Devolvida</th>
                {canManage ? <th className="pb-1.5 font-bold">Ações</th> : null}
              </tr>
            </thead>
            <tbody className="text-zinc-800">
              {tools.map((tool) => {
                const badge = statusBadge(tool.status);
                return (
                  <tr key={tool.id} className="border-t border-zinc-200/60">
                    <td className="py-1.5 pr-3 font-medium">{tool.name}</td>
                    <td className="py-1.5 pr-3">
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}>{badge.label}</span>
                    </td>
                    <td className="py-1.5 pr-3">{fmtDate(tool.assignedAt)}</td>
                    <td className="py-1.5 pr-3">{fmtDate(tool.returnedAt)}</td>
                    {canManage ? (
                      <td className="py-1.5">
                        <span className="flex items-center gap-1">
                          <button type="button" onClick={() => void toggleStatus(tool)} title={tool.status === "EM_USO" ? "Marcar devolvida" : "Marcar em uso"} className="grid h-7 w-7 place-items-center rounded-md text-[#2f6e51] transition hover:bg-[#3f8f6b]/10">
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => openEdit(tool)} title="Editar" className="grid h-7 w-7 place-items-center rounded-md text-petroleum transition hover:bg-petroleum/10">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => void remove(tool.id)} title="Remover" className="grid h-7 w-7 place-items-center rounded-md text-danger transition hover:bg-danger/10">
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
              <Wrench className="h-3.5 w-3.5" /> {editingId ? "Editar ferramenta" : "Nova ferramenta"}
            </span>
            <button type="button" onClick={() => setFormOpen(false)} className="grid h-7 w-7 place-items-center rounded-md text-zinc-500 hover:bg-zinc-200/60">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Ferramenta</span>
              <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Status</span>
              <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ToolItemRow["status"] })}>
                <option value="EM_USO">Em uso</option>
                <option value="DEVOLVIDA">Devolvida</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Designada em</span>
              <input type="date" className={inputClass} value={form.assignedAt} onChange={(e) => setForm({ ...form, assignedAt: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Devolvida em</span>
              <input type="date" className={inputClass} value={form.returnedAt} onChange={(e) => setForm({ ...form, returnedAt: e.target.value })} />
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
        <AttachmentManager collaboratorId={collaboratorId} kind="TERMO_FERRAMENTA" title="Termo de responsabilidade (PDF)" initial={attachments} />
      ) : null}
    </article>
  );
}
