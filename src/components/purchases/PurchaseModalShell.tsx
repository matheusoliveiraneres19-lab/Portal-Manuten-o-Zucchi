"use client";

import { useEffect } from "react";
import { AnimatePresence, m } from "framer-motion";
import { X } from "lucide-react";

type PurchaseModalShellProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
};

/** Modal premium centralizado do módulo de Compras. */
export function PurchaseModalShell({ open, title, subtitle, onClose, children }: PurchaseModalShellProps) {
  useEffect(() => {
    if (!open) {
      return;
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <m.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-black/65 backdrop-blur-sm" />

          <m.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-xl border border-gold/25 bg-[#0a0b0b] text-champagne shadow-[0_24px_70px_rgba(0,0,0,0.6)]"
          >
            <div className="flex items-start justify-between gap-3 border-b border-gold/20 bg-[#070808] px-5 py-4">
              <div className="min-w-0">
                <h2 className="font-serif text-lg text-white">{title}</h2>
                {subtitle ? <p className="mt-0.5 text-xs text-zinc-400">{subtitle}</p> : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-gold/20 text-zinc-300 transition hover:border-gold/40 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4">{children}</div>
          </m.div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}

export const purchasePrimaryButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gold/55 bg-gold/15 px-5 text-sm font-bold text-gold transition hover:bg-gold/25 disabled:cursor-not-allowed disabled:opacity-60";
export const purchaseGhostButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gold/20 px-4 text-sm font-semibold text-zinc-300 transition hover:border-gold/40 hover:text-white";
