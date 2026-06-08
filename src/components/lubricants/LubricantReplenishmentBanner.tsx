"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, BellRing, Loader2 } from "lucide-react";
import type { LubricantReplenishmentItem } from "@/types/lubricants";

type LubricantReplenishmentBannerProps = {
  items: LubricantReplenishmentItem[];
  onSelect: (code: string) => void;
  onSynced: () => void;
};

export function LubricantReplenishmentBanner({ items, onSelect, onSynced }: LubricantReplenishmentBannerProps) {
  const [syncing, setSyncing] = useState(false);

  if (items.length === 0) {
    return null;
  }

  async function syncAlerts() {
    setSyncing(true);
    try {
      const response = await fetch("/api/lubricants/sync-alerts", { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? "request failed");
      }
      toast.success(`Alertas sincronizados: ${data.created} criados, ${data.resolved} resolvidos`);
      onSynced();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao gerar alertas.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border border-danger/40 bg-[#1a0c0e] shadow-premium">
      <div className="flex flex-col gap-3 border-b border-danger/25 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5 text-rose-200">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-danger/25 text-danger">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-white">
              {items.length} {items.length === 1 ? "item abaixo" : "itens abaixo"} do estoque mínimo
            </h3>
            <p className="text-[11px] text-rose-200/70">
              Saldo estimado menor que o mínimo cadastrado. Gere alertas para acompanhar a reposição.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={syncAlerts}
          disabled={syncing}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-danger/55 bg-danger/15 px-4 text-sm font-bold text-rose-100 transition hover:bg-danger/25 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
          Gerar alertas de reposição
        </button>
      </div>

      <ul className="divide-y divide-danger/15">
        {items.slice(0, 6).map((item) => (
          <li key={item.code}>
            <button
              type="button"
              onClick={() => onSelect(item.code)}
              className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-xs transition hover:bg-danger/10"
            >
              <span className="min-w-0">
                <span className="font-mono text-[11px] text-rose-300">{item.code}</span>
                <span className="ml-2 truncate text-zinc-200">{item.description}</span>
              </span>
              <span className="shrink-0 text-rose-200">
                Saldo <strong>{num(item.balance)}</strong> / mín. {num(item.minimumStock)} {item.unit}
                <span className="ml-2 rounded bg-danger/25 px-1.5 py-0.5 font-semibold text-rose-100">
                  −{num(item.deficit)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {items.length > 6 ? (
        <p className="border-t border-danger/15 px-4 py-1.5 text-[11px] text-rose-200/70">
          +{items.length - 6} outros itens abaixo do mínimo (veja a tabela de códigos).
        </p>
      ) : null}
    </section>
  );
}

function num(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}
