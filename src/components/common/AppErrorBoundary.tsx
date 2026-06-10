"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, LayoutDashboard } from "lucide-react";

type AppErrorBoundaryProps = {
  error: Error & { digest?: string };
  reset: () => void;
  /** Mensagem amigável principal. */
  title?: string;
  description?: string;
  /** Exibe o botão "Voltar ao dashboard" (oculto quando já se está no dashboard raiz). */
  showHome?: boolean;
};

const DEFAULT_DESCRIPTION =
  "Não foi possível carregar este módulo no momento. Tente atualizar a página ou revise os filtros aplicados.";

/**
 * Fallback de erro premium do portal. Usado pelos arquivos error.tsx do App Router.
 * NÃO esconde o problema: registra o erro no console apenas em desenvolvimento e
 * oferece recuperação ("Tentar novamente" re-renderiza o segmento via reset()).
 */
export function AppErrorBoundary({
  error,
  reset,
  title = "Algo saiu do esperado",
  description = DEFAULT_DESCRIPTION,
  showHome = true
}: AppErrorBoundaryProps) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      // Log seguro (sem dados sensíveis) apenas em dev.
      console.error("[AppErrorBoundary]", error);
    }
  }, [error]);

  return (
    <div className="grid min-h-[60vh] place-items-center p-6">
      <div className="marble-dark relative w-full max-w-md overflow-hidden rounded-xl border border-gold/25 bg-[#0a0b0b] p-8 text-center shadow-premium">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full border border-gold/40 bg-black/40 text-gold shadow-[0_0_30px_rgba(196,154,69,0.18)]">
          <AlertTriangle className="h-8 w-8" strokeWidth={1.6} />
        </div>
        <h1 className="font-serif text-2xl text-white">{title}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-zinc-400">{description}</p>

        {error?.digest ? (
          <p className="mt-3 text-[11px] text-zinc-600">Código de referência: {error.digest}</p>
        ) : null}

        <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-gold/55 bg-gold/15 px-5 text-sm font-bold text-gold transition hover:bg-gold/25 sm:w-auto"
          >
            <RefreshCw className="h-4 w-4" /> Tentar novamente
          </button>
          {showHome ? (
            <Link
              href="/"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-gold/20 px-5 text-sm font-semibold text-zinc-300 transition hover:border-gold/40 hover:text-white sm:w-auto"
            >
              <LayoutDashboard className="h-4 w-4" /> Voltar ao dashboard
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
