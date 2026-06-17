"use client";

import { FormEvent, useEffect, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { Loader2, Target, X } from "lucide-react";
import { toast } from "sonner";
import { AREA_LABELS } from "@/components/team/CollaboratorFormModal";
import type { AreaGoal, CollaboratorArea } from "@/types/collaborators";

type AreaGoalsModalProps = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

const inputClass =
  "h-10 w-28 rounded-lg border border-white/14 bg-black/40 px-3 text-sm text-white outline-none transition focus:border-gold/70 disabled:opacity-60";

export function AreaGoalsModal({ open, onClose, onSaved }: AreaGoalsModalProps) {
  const [goals, setGoals] = useState<AreaGoal[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/collaborators/goals")
      .then((response) => response.json())
      .then((data: { goals: AreaGoal[] }) => {
        setGoals(data.goals);
        setValues(Object.fromEntries(data.goals.map((g) => [g.area, String(g.goal)])));
      })
      .catch(() => toast.error("Não foi possível carregar as metas atuais."))
      .finally(() => setLoading(false));
  }, [open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const payload: Record<string, number> = {};
      for (const [area, value] of Object.entries(values)) {
        const n = Number(value);
        if (Number.isFinite(n) && n > 0) payload[area] = n;
      }
      const response = await fetch("/api/collaborators/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goals: payload })
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !data?.ok) throw new Error(data?.message ?? "Falha ao salvar metas.");
      toast.success("Metas por área atualizadas.");
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar metas.");
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
            className="w-full max-w-md overflow-hidden rounded-lg border border-gold/25 bg-[#0a0b0b] shadow-premium"
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-gold/15 px-5 py-4">
              <div className="flex items-center gap-2.5 text-gold">
                <Target className="h-5 w-5" />
                <h2 className="font-serif text-lg text-white">Metas por área</h2>
              </div>
              <button type="button" onClick={onClose} aria-label="Fechar" className="text-zinc-400 transition hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </header>

            <form onSubmit={handleSubmit} className="space-y-3 px-5 py-5">
              <p className="text-[11px] text-zinc-400">
                Define a meta mensal (horas) de cada área. Ao salvar, todos os colaboradores da área recebem o novo valor.
              </p>

              {loading ? (
                <div className="grid place-items-center py-8 text-zinc-500">
                  <Loader2 className="h-5 w-5 animate-spin text-gold" />
                </div>
              ) : (
                goals.map((g) => (
                  <div key={g.area} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                    <div>
                      <div className="text-sm font-semibold text-champagne">{AREA_LABELS[g.area as CollaboratorArea]}</div>
                      <div className="text-[11px] text-zinc-500">
                        {g.count} colaborador(es){g.uniform ? "" : " · metas divergentes"}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={1000}
                        step={1}
                        value={values[g.area] ?? ""}
                        disabled={saving}
                        onChange={(e) => setValues((current) => ({ ...current, [g.area]: e.target.value }))}
                        className={inputClass}
                      />
                      <span className="text-xs text-zinc-500">h</span>
                    </div>
                  </div>
                ))
              )}

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
                  disabled={saving || loading}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-gold/55 bg-gold/15 px-4 text-sm font-bold text-gold transition hover:bg-gold/25 disabled:opacity-70"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
                  Salvar metas
                </button>
              </div>
            </form>
          </m.div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
