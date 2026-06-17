"use client";

import { FormEvent, useEffect, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { Loader2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import type { CollaboratorArea, CollaboratorRow, CollaboratorStatus } from "@/types/collaborators";

export const AREA_LABELS: Record<CollaboratorArea, string> = {
  MECANICA: "Mecânica",
  ELETRICA: "Elétrica",
  AUTOMACAO: "Automação",
  OUTROS: "Outros"
};

export const STATUS_LABELS: Record<CollaboratorStatus, string> = {
  ATIVO: "Ativo",
  FERIAS: "Férias",
  AFASTADO: "Afastado",
  DESLIGADO: "Desligado"
};

type CollaboratorFormModalProps = {
  open: boolean;
  initial: CollaboratorRow | null;
  onClose: () => void;
  onSaved: () => void;
};

const inputClass =
  "h-11 w-full rounded-lg border border-white/14 bg-black/40 px-3 text-sm text-white outline-none transition focus:border-gold/70 focus:bg-black/55 disabled:opacity-60";
const labelClass = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400";

export function CollaboratorFormModal({ open, initial, onClose, onSaved }: CollaboratorFormModalProps) {
  const isEdit = Boolean(initial);
  const [saving, setSaving] = useState(false);

  // Reinicia o formulário sempre que abrir (com ou sem registro inicial).
  const [form, setForm] = useState(() => emptyForm());
  useEffect(() => {
    if (open) setForm(initial ? fromRow(initial) : emptyForm());
  }, [open, initial]);

  function update<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    if (!form.matricula.trim()) return toast.error("Informe a matrícula.");
    if (!form.name.trim()) return toast.error("Informe o nome.");

    setSaving(true);
    try {
      const payload = {
        matricula: form.matricula.trim(),
        name: form.name.trim(),
        role: form.role.trim() || null,
        area: form.area,
        shift: form.shift.trim() || null,
        monthlyGoal: Number(form.monthlyGoal) || 0,
        status: form.status,
        admissionDate: form.admissionDate || null
      };

      const response = await fetch(isEdit ? `/api/collaborators/${initial!.id}` : "/api/collaborators", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;

      if (!response.ok || !data?.ok) {
        throw new Error(data?.message ?? "Não foi possível salvar o colaborador.");
      }

      toast.success(isEdit ? "Colaborador atualizado." : "Colaborador cadastrado.");
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <m.div
          className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <m.div
            className="w-full max-w-lg overflow-hidden rounded-lg border border-gold/25 bg-[#0a0b0b] shadow-premium"
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-gold/15 px-5 py-4">
              <div className="flex items-center gap-2.5 text-gold">
                <UserPlus className="h-5 w-5" />
                <h2 className="font-serif text-lg text-white">
                  {isEdit ? "Editar colaborador" : "Registrar novo colaborador"}
                </h2>
              </div>
              <button type="button" onClick={onClose} aria-label="Fechar" className="text-zinc-400 transition hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </header>

            <form onSubmit={handleSubmit} className="space-y-3 px-5 py-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Matrícula *</label>
                  <input className={inputClass} value={form.matricula} disabled={saving} onChange={(e) => update("matricula", e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Nome *</label>
                  <input className={inputClass} value={form.name} disabled={saving} onChange={(e) => update("name", e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Função</label>
                  <input className={inputClass} value={form.role} disabled={saving} onChange={(e) => update("role", e.target.value)} placeholder="Ex.: Mecânico Industrial" />
                </div>
                <div>
                  <label className={labelClass}>Área</label>
                  <select className={inputClass} value={form.area} disabled={saving} onChange={(e) => update("area", e.target.value as CollaboratorArea)}>
                    {(Object.keys(AREA_LABELS) as CollaboratorArea[]).map((area) => (
                      <option key={area} value={area} className="bg-[#0a0b0b]">{AREA_LABELS[area]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Turno</label>
                  <input className={inputClass} value={form.shift} disabled={saving} onChange={(e) => update("shift", e.target.value)} placeholder="Ex.: 1º turno" />
                </div>
                <div>
                  <label className={labelClass}>Meta mensal (h)</label>
                  <input className={inputClass} type="number" min={0} step={1} value={form.monthlyGoal} disabled={saving} onChange={(e) => update("monthlyGoal", e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Data de admissão</label>
                  <input className={inputClass} type="date" value={form.admissionDate} disabled={saving} onChange={(e) => update("admissionDate", e.target.value)} />
                </div>
                {isEdit ? (
                  <div>
                    <label className={labelClass}>Status</label>
                    <select className={inputClass} value={form.status} disabled={saving} onChange={(e) => update("status", e.target.value as CollaboratorStatus)}>
                      {(Object.keys(STATUS_LABELS) as CollaboratorStatus[]).map((status) => (
                        <option key={status} value={status} className="bg-[#0a0b0b]">{STATUS_LABELS[status]}</option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className="inline-flex h-10 items-center rounded-lg border border-white/15 px-4 text-sm font-semibold text-zinc-300 transition hover:border-gold/40 hover:text-white disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-gold/55 bg-gold/15 px-4 text-sm font-bold text-gold transition hover:bg-gold/25 disabled:opacity-70"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  {isEdit ? "Salvar" : "Cadastrar"}
                </button>
              </div>
            </form>
          </m.div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}

type FormState = {
  matricula: string;
  name: string;
  role: string;
  area: CollaboratorArea;
  shift: string;
  monthlyGoal: string;
  status: CollaboratorStatus;
  admissionDate: string;
};

function emptyForm(): FormState {
  return { matricula: "", name: "", role: "", area: "OUTROS", shift: "", monthlyGoal: "220", status: "ATIVO", admissionDate: "" };
}

function fromRow(row: CollaboratorRow): FormState {
  return {
    matricula: row.matricula,
    name: row.name,
    role: row.role ?? "",
    area: row.area,
    shift: row.shift ?? "",
    monthlyGoal: String(row.monthlyGoal),
    status: row.status,
    admissionDate: row.admissionDate ? row.admissionDate.slice(0, 10) : ""
  };
}
