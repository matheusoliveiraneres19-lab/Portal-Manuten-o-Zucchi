"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type DashboardPeriodState = {
  /** Data inicial efetiva (yyyy-mm-dd): da URL, ou o padrão derivado dos dados. */
  startDate: string;
  /** Data final efetiva (yyyy-mm-dd). */
  endDate: string;
  /** true quando o usuário selecionou um período (presente na URL). */
  isCustom: boolean;
  /** Aplica um novo período preservando os demais search params. */
  setPeriod: (startDate: string, endDate: string) => void;
  /** Remove o período da URL, voltando ao padrão. */
  clearPeriod: () => void;
};

/**
 * Store global de período do portal, baseado em search params da URL.
 * Funciona como fonte única para dashboard, gráficos e Ordens de Serviço
 * (todos server components que leem startDate/endDate da URL).
 */
export function useDashboardPeriod(fallback: { startDate: string; endDate: string }): DashboardPeriodState {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlStart = searchParams.get("startDate") ?? undefined;
  const urlEnd = searchParams.get("endDate") ?? undefined;

  const setPeriod = useCallback(
    (startDate: string, endDate: string) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("startDate", startDate);
      next.set("endDate", endDate);
      router.push(`${pathname}?${next.toString()}`);
    },
    [pathname, router, searchParams]
  );

  const clearPeriod = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("startDate");
    next.delete("endDate");
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }, [pathname, router, searchParams]);

  return {
    startDate: urlStart ?? fallback.startDate,
    endDate: urlEnd ?? fallback.endDate,
    isCustom: Boolean(urlStart && urlEnd),
    setPeriod,
    clearPeriod
  };
}
