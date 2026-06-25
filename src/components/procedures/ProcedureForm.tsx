"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import {
  PROCEDURE_CATEGORY_NAMES,
  PROCEDURE_LEVELS,
  PROCEDURE_STATUSES
} from "@/constants/procedure-categories";
import type { ProcedureDetail } from "@/types/procedures";

type ProcedureFormProps = {
  open: boolean;
  onClose: () => void;
  /** Quando presente, o formulário edita; caso contrário, cria. */
  initial?: ProcedureDetail | null;
  /** Chamado após salvar com sucesso (ex.: redirecionar para o novo slug). */
  onSaved?: (slug: string) => void;
};

type FormState = {
  title: string;
  categoryName: string;
  summary: string;
  objective: string;
  whenToUse: string;
  content: string;
  commonMistakes: string;
  level: string;
  estimatedMinutes: string;
  targetAudience: string;
  responsible: string;
  tags: string;
  status: string;
  isFeatured: boolean;
  isOnboarding: boolean;
};

function emptyState(): FormState {
  return {
    title: "",
    categoryName: PROCEDURE_CATEGORY_NAMES[0],
    summary: "",
    objective: "",
    whenToUse: "",
    content: "",
    commonMistakes: "",
    level: PROCEDURE_LEVELS[0],
    estimatedMinutes: "",
    targetAudience: "",
    responsible: "",
    tags: "",
    status: PROCEDURE_STATUSES[0],
    isFeatured: false,
    isOnboarding: false
  };
}

function fromDetail(detail: ProcedureDetail): FormState {
  return {
    title: detail.title,
    categoryName: detail.categoryName,
    summary: detail.summary ?? "",
    objective: detail.objective ?? "",
    whenToUse: detail.whenToUse ?? "",
    content: detail.content ?? "",
    commonMistakes: detail.commonMistakes ?? "",
    level: detail.level,
    estimatedMinutes: detail.estimatedMinutes != null ? String(detail.estimatedMinutes) : "",
    targetAudience: detail.targetAudience ?? "",
    responsible: detail.responsible ?? "",
    tags: detail.tags.join(", "),
    status: detail.status,
    isFeatured: detail.isFeatured,
    isOnboarding: detail.isOnboarding
  };
}

export function ProcedureForm({ open, onClose, initial, onSaved }: ProcedureFormProps) {
  const router = useRouter();
  const isEditing = Boolean(initial);
  const [form, setForm] = useState<FormState>(emptyState);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(initial ? fromDetail(initial) : emptyState());
  }, [open, initial]);

  if (!open) return null;

  function update<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.title.trim() || !form.summary.trim() || !form.content.trim()) {
      toast.error("Preencha título, resumo e conteúdo / passo a passo.");
      return;
    }
    setSaving(true);

    const payload = {
      title: form.title,
      categoryName: form.categoryName,
      summary: form.summary,
      objective: form.objective,
      whenToUse: form.whenToUse,
      content: form.content,
      commonMistakes: form.commonMistakes,
      level: form.level,
      estimatedMinutes: form.estimatedMinutes ? Number(form.estimatedMinutes) : null,
      targetAudience: form.targetAudience,
      responsible: form.responsible,
      tags: form.tags,
      status: form.status,
      isFeatured: form.isFeatured,
      isOnboarding: form.isOnboarding
    };

    try {
      const url = isEditing ? `/api/procedures/${initial!.id}` : "/api/procedures";
      const response = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; message?: string; procedure?: { slug: string } } | null;

      if (!response.ok || !data?.ok) {
        toast.error(data?.message ?? "Não foi possível salvar o procedimento.");
        return;
      }

      toast.success(isEditing ? "Procedimento atualizado com sucesso." : "Procedimento criado com sucesso.");
      onClose();
      router.refresh();
      if (data.procedure?.slug) onSaved?.(data.procedure.slug);
    } catch {
      toast.error("Falha de conexão ao salvar o procedimento.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-2xl rounded-2xl border border-[#C6A24A]/30 bg-gradient-to-br from-[#15130E] to-[#0E0D0A] shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between border-b border-[#C6A24A]/25 px-5 py-4">
          <h2 className="font-serif text-xl font-semibold text-[#F8F3E7]">{isEditing ? "Editar procedimento" : "Novo procedimento"}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-[#B8AD9A] transition hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          <Field label="Título *">
            <input className={inputClass} value={form.title} onChange={(e) => update("title", e.target.value)} required />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Categoria *">
              <select className={inputClass} value={form.categoryName} onChange={(e) => update("categoryName", e.target.value)}>
                {PROCEDURE_CATEGORY_NAMES.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </Field>
            <Field label="Nível">
              <select className={inputClass} value={form.level} onChange={(e) => update("level", e.target.value)}>
                {PROCEDURE_LEVELS.map((level) => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Resumo *">
            <textarea className={textareaClass} rows={2} value={form.summary} onChange={(e) => update("summary", e.target.value)} required />
          </Field>

          <Field label="Objetivo">
            <textarea className={textareaClass} rows={2} value={form.objective} onChange={(e) => update("objective", e.target.value)} />
          </Field>

          <Field label="Quando usar">
            <textarea className={textareaClass} rows={2} value={form.whenToUse} onChange={(e) => update("whenToUse", e.target.value)} />
          </Field>

          <Field label="Conteúdo / passo a passo *">
            <textarea className={textareaClass} rows={6} value={form.content} onChange={(e) => update("content", e.target.value)} required />
          </Field>

          <Field label="Erros comuns">
            <textarea className={textareaClass} rows={2} value={form.commonMistakes} onChange={(e) => update("commonMistakes", e.target.value)} />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Tempo estimado (min)">
              <input type="number" min={0} className={inputClass} value={form.estimatedMinutes} onChange={(e) => update("estimatedMinutes", e.target.value)} />
            </Field>
            <Field label="Status">
              <select className={inputClass} value={form.status} onChange={(e) => update("status", e.target.value)}>
                {PROCEDURE_STATUSES.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </Field>
            <Field label="Público indicado">
              <input className={inputClass} value={form.targetAudience} onChange={(e) => update("targetAudience", e.target.value)} placeholder="Ex.: Mecânicos e Eletricistas" />
            </Field>
            <Field label="Responsável">
              <input className={inputClass} value={form.responsible} onChange={(e) => update("responsible", e.target.value)} placeholder="Ex.: PCM" />
            </Field>
          </div>

          <Field label="Tags (separadas por vírgula)">
            <input className={inputClass} value={form.tags} onChange={(e) => update("tags", e.target.value)} placeholder="apontamento, sap, horas" />
          </Field>

          <div className="flex flex-wrap gap-5">
            <label className="flex items-center gap-2 text-sm text-[#D7CDBA]">
              <input type="checkbox" checked={form.isFeatured} onChange={(e) => update("isFeatured", e.target.checked)} className="h-4 w-4 accent-[#D6AA3A]" />
              Marcar como “Mais acessado / Destaque”
            </label>
            <label className="flex items-center gap-2 text-sm text-[#D7CDBA]">
              <input type="checkbox" checked={form.isOnboarding} onChange={(e) => update("isOnboarding", e.target.checked)} className="h-4 w-4 accent-[#D6AA3A]" />
              Marcar como “Funcionário Novo”
            </label>
          </div>

          <div className="flex justify-end gap-2 border-t border-[#C6A24A]/25 pt-4">
            <button type="button" onClick={onClose} className="h-10 rounded-lg border border-[#C6A24A]/30 px-4 text-sm font-semibold text-[#D7CDBA] transition hover:border-[#D6AA3A]/55 hover:text-white">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#D6AA3A]/60 bg-[#D6AA3A]/15 px-4 text-sm font-bold text-[#F6D98B] transition hover:bg-[#D6AA3A]/25 disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isEditing ? "Salvar alterações" : "Criar procedimento"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputClass =
  "h-10 w-full rounded-lg border border-[#C6A24A]/30 bg-[#11100C] px-3 text-sm text-[#F8F3E7] outline-none transition placeholder:text-[#8F846F] focus:border-[#D6AA3A] focus:ring-2 focus:ring-[#D6AA3A]/20";
const textareaClass =
  "w-full rounded-lg border border-[#C6A24A]/30 bg-[#11100C] px-3 py-2 text-sm leading-relaxed text-[#F8F3E7] outline-none transition placeholder:text-[#8F846F] focus:border-[#D6AA3A] focus:ring-2 focus:ring-[#D6AA3A]/20";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#D6AA3A]">{label}</span>
      {children}
    </label>
  );
}
