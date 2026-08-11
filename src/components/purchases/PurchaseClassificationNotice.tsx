"use client";

import { AlertTriangle } from "lucide-react";

/**
 * Aviso da TAREFA 10: a base importada não trouxe N1/N2/N3/N4. Substitui os
 * gráficos por uma explicação acionável, em vez de mostrar barras zeradas.
 */
export function PurchaseClassificationNotice() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-gold/30 bg-gold/5 px-3 py-2.5 text-[12px] text-champagne">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
      <span>
        <strong className="font-semibold text-white">
          A classificação N1/N2/N3/N4 não foi encontrada na base importada. Reimporte a planilha de compras com essas
          colunas para habilitar essa análise.
        </strong>
        <span className="mt-0.5 block text-[11px] text-zinc-400">
          A aba continua listando normalmente as requisições sem pedido de compra — apenas os gráficos e filtros por
          classificação ficam indisponíveis. O importador reconhece os cabeçalhos <code>N1</code>…<code>N4</code>,{" "}
          <code>Nível 1</code>…<code>Nível 4</code>, <code>Classificação N1</code>… e <code>Categoria N1</code>…
        </span>
      </span>
    </div>
  );
}
