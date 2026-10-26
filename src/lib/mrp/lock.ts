/**
 * ANÁLISE MRP — trava do "Atualizar tudo" (`atualizarSlots()` do HTML), sem
 * dependência da SheetJS: usável no navegador. Recebe só "colunas obrigatórias
 * ok?" de cada slot (calculado no servidor).
 *
 * Regra: estoque E compras presentes e válidos, e a planilha do MRP válida se
 * anexada. Regra do Portal: sem Base MRP vigente, a planilha do MRP é exigida
 * (no HTML sempre havia a base embutida).
 */
import type { MrpFileKind } from "./types";

export type MrpLockState = { ready: boolean; message: string; filled: number };

export function evaluateMrpLockFlags(
  slots: Record<MrpFileKind, { requiredColumnsOk: boolean } | null>,
  hasActiveBase: boolean
): MrpLockState {
  const ok = (kind: MrpFileKind) => !slots[kind] || slots[kind]!.requiredColumnsOk;
  const okB = ok("base"),
    okE = ok("est"),
    okC = ok("cmp");
  const temB = !!slots.base,
    temE = !!slots.est,
    temC = !!slots.cmp;
  const filled = (temB ? 1 : 0) + (temE ? 1 : 0) + (temC ? 1 : 0);
  const needsBase = !temB && !hasActiveBase;
  const ready = temE && temC && okE && okC && okB && !needsBase;

  let message: string;
  if (ready) {
    message = `${filled} planilha(s) prontas${temB ? " (com base do MRP nova)" : " (base do MRP vigente)"} — clique em Atualizar tudo`;
  } else if (!okE || !okC || !okB) {
    message = "Alguma planilha está sem as colunas obrigatórias — troque a aba ou o tipo no cartão";
  } else if (temE && temC && needsBase) {
    message = "Não há Base MRP vigente — anexe também a planilha do MRP";
  } else if (temE || temC || temB) {
    message = "Falta a planilha de " + (!temE ? "estoque" : "compras realizadas");
  } else {
    message = "Trava ativa — anexe as planilhas de estoque e compras para liberar a atualização";
  }
  return { ready, message, filled };
}
