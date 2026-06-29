"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, Lock } from "lucide-react";
import type { PortalSettingDTO, SettingValue } from "@/types/settings";

type DraftValue = string | boolean;

function initialDraft(setting: PortalSettingDTO): DraftValue {
  if (setting.valueType === "boolean") return Boolean(setting.value);
  if (setting.valueType === "wordlist") return (setting.value as string[]).join(", ");
  return String(setting.value);
}

export function SettingsForm({
  category,
  settings,
  canEdit
}: {
  category: string;
  settings: PortalSettingDTO[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const initial = useMemo(() => {
    const map: Record<string, DraftValue> = {};
    for (const setting of settings) map[setting.key] = initialDraft(setting);
    return map;
  }, [settings]);

  const [draft, setDraft] = useState<Record<string, DraftValue>>(initial);
  const [saving, setSaving] = useState(false);

  const dirtyKeys = settings
    .filter((s) => s.isEditable && draft[s.key] !== initial[s.key])
    .map((s) => s.key);

  function setValue(key: string, value: DraftValue) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function handleSave() {
    if (!dirtyKeys.length) return;
    setSaving(true);
    let okCount = 0;
    let failMessage = "";

    for (const key of dirtyKeys) {
      try {
        const response = await fetch(`/api/settings/${encodeURIComponent(category)}/${encodeURIComponent(key)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: draft[key] as SettingValue })
        });
        const body = await response.json().catch(() => null);
        if (response.ok && body?.ok) {
          okCount += 1;
        } else {
          failMessage = body?.message ?? "Não foi possível salvar a configuração.";
        }
      } catch {
        failMessage = "Não foi possível salvar a configuração.";
      }
    }

    setSaving(false);

    if (okCount > 0 && !failMessage) {
      toast.success("Configuração salva com sucesso.");
      router.refresh();
    } else if (okCount > 0) {
      toast.warning(`Algumas configurações falharam. ${failMessage}`);
      router.refresh();
    } else {
      toast.error(failMessage || "Não foi possível salvar a configuração.");
    }
  }

  return (
    <div className="space-y-4">
      {settings.map((setting) => (
        <SettingField
          key={setting.key}
          setting={setting}
          value={draft[setting.key]}
          canEdit={canEdit}
          onChange={(value) => setValue(setting.key, value)}
        />
      ))}

      {canEdit ? (
        <SettingsSaveButton saving={saving} disabled={!dirtyKeys.length} onClick={handleSave} count={dirtyKeys.length} />
      ) : (
        <p className="rounded-lg border border-gold/15 bg-black/30 p-3 text-xs text-zinc-400">
          Somente administradores e gestores podem editar configurações.
        </p>
      )}
    </div>
  );
}

function SettingField({
  setting,
  value,
  canEdit,
  onChange
}: {
  setting: PortalSettingDTO;
  value: DraftValue;
  canEdit: boolean;
  onChange: (value: DraftValue) => void;
}) {
  const locked = !setting.isEditable || !canEdit;

  return (
    <label className="block rounded-lg border border-gold/15 bg-black/30 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-champagne">{setting.label}</span>
        {!setting.isEditable ? (
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-zinc-500">
            <Lock className="h-3 w-3" /> Somente leitura
          </span>
        ) : null}
      </div>
      {setting.description ? <p className="mt-0.5 text-xs text-zinc-400">{setting.description}</p> : null}

      <div className="mt-3">
        {setting.valueType === "boolean" ? (
          <Switch checked={Boolean(value)} disabled={locked} onChange={(checked) => onChange(checked)} />
        ) : setting.valueType === "wordlist" ? (
          <input
            type="text"
            disabled={locked}
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Separe por vírgula"
            className={inputClass}
          />
        ) : (
          <input
            type={setting.valueType === "number" || setting.valueType === "percent" ? "number" : "text"}
            step={setting.valueType === "number" || setting.valueType === "percent" ? "any" : undefined}
            min={setting.valueType === "percent" ? 0 : setting.valueType === "number" ? 0 : undefined}
            max={setting.valueType === "percent" ? 100 : undefined}
            disabled={locked}
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
          />
        )}
      </div>

      {setting.valueType === "percent" ? <span className="mt-1 block text-[11px] text-zinc-500">Valor em % (0–100)</span> : null}
    </label>
  );
}

function Switch({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full border transition disabled:opacity-50 ${
        checked ? "border-emerald-400/50 bg-emerald-400/30" : "border-gold/25 bg-black/40"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${checked ? "translate-x-6" : "translate-x-1"}`}
      />
    </button>
  );
}

export function SettingsSaveButton({
  saving,
  disabled,
  onClick,
  count
}: {
  saving: boolean;
  disabled: boolean;
  onClick: () => void;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || saving}
      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-gold/55 bg-gold/15 px-4 text-sm font-bold text-gold transition hover:bg-gold/25 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      {saving ? "Salvando..." : count > 0 ? `Salvar ${count} alteração(ões)` : "Salvar"}
    </button>
  );
}

const inputClass =
  "h-10 w-full rounded-lg border border-gold/25 bg-black/40 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition focus:border-gold/60 focus:ring-1 focus:ring-gold/40 disabled:opacity-60 [color-scheme:dark]";
