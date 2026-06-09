"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type RefreshOptions = {
  /** Mensagem do toast de confirmação. Passe `null` para não exibir toast
   *  (ex.: quando o modal de importação já mostrou seu próprio aviso). */
  toastMessage?: string | null;
};

/**
 * Atualização global dos dados do portal após importação ou edição.
 *
 * Todas as páginas do portal são renderizadas com `dynamic = "force-dynamic"`,
 * então um `router.refresh()` re-executa o server component, que reconsulta os
 * services centralizados (portal-analytics e afins). Resultado: o dashboard e a
 * página atual refletem os novos dados automaticamente, sem reload completo e
 * sem precisar atualizar página por página (TAREFAS 8 e 9).
 *
 * Uso típico (após importar planilha de Ordens, Lubrificantes, Compras, etc.):
 *   const { refresh, isRefreshing } = usePortalDataRefresh();
 *   ...
 *   onImported={() => refresh({ toastMessage: null })}
 */
export function usePortalDataRefresh() {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();

  const refresh = useCallback(
    (options: RefreshOptions = {}) => {
      startTransition(() => router.refresh());

      if (options.toastMessage !== null) {
        toast.success(options.toastMessage ?? "Dados do portal atualizados");
      }
    },
    [router]
  );

  return { refresh, isRefreshing };
}
