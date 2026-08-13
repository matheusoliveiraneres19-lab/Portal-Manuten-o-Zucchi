"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, m } from "framer-motion";
import { X } from "lucide-react";

type ModalShellProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
};

/**
 * Modal premium do portal (preto/grafite/dourado), centralizado.
 *
 * Unifica os três shells que existiam por módulo — Compras, PC-Factory e
 * Lubrificantes — cujos corpos eram byte a byte idênticos; só divergiam o
 * comentário e o nome das constantes de classe exportadas.
 *
 * Além do que os três já faziam (fechar no Escape, no backdrop e no X), aqui:
 *  - o scroll do documento é travado enquanto o modal está aberto, senão a página
 *    de trás rola junto com a roda do mouse;
 *  - o foco vai para o modal ao abrir e volta para o elemento que o disparou ao
 *    fechar, e `role="dialog"`/`aria-modal` são declarados;
 *  - o conteúdo rola dentro do modal (`max-h`), evitando que um formulário longo
 *    estoure a altura da janela.
 */
export function ModalShell({ open, title, subtitle, onClose, children }: ModalShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    // Guarda quem abriu o modal para devolver o foco ao fechar.
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
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
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
          />

          <m.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
            className="relative z-10 flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-gold/25 bg-ink text-champagne shadow-[0_24px_70px_rgba(0,0,0,0.6)] outline-none"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gold/20 bg-ink px-5 py-4">
              <div className="min-w-0">
                <h2 className="font-serif text-lg text-white">{title}</h2>
                {subtitle ? <p className="mt-0.5 text-xs text-parchment-dim">{subtitle}</p> : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-gold/20 text-parchment transition hover:border-gold/40 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold/70"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4">{children}</div>
          </m.div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/* Classes de campo e botão usadas dentro dos modais                  */
/* ------------------------------------------------------------------ */

export const modalFieldLabelClass =
  "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-parchment-dim";

export const modalFieldInputClass =
  "h-10 w-full rounded-lg border border-gold/15 bg-black/35 px-3 text-sm text-parchment outline-none transition focus:border-gold/55 focus:bg-black/50";

export const modalPrimaryButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gold/55 bg-gold/15 px-5 text-sm font-bold text-gold transition hover:bg-gold/25 disabled:cursor-not-allowed disabled:opacity-60";

export const modalGhostButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gold/20 px-4 text-sm font-semibold text-parchment transition hover:border-gold/40 hover:text-white";
