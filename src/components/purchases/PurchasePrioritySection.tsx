"use client";

import dynamic from "next/dynamic";
import { AlertTriangle } from "lucide-react";
import { ChartSkeleton } from "@/components/ChartSkeleton";
import { PurchaseCriticalTable } from "@/components/purchases/PurchaseCriticalTable";
import { PurchasePriorityCards } from "@/components/purchases/PurchasePriorityCards";
import type { PendingPriorityAnalysis } from "@/types/purchases";

const PurchasePriorityChart = dynamic(
  () => import("@/components/purchases/PurchasePriorityCharts").then((m) => m.PurchasePriorityChart),
  { ssr: false, loading: () => <ChartSkeleton className="xl:col-span-5" /> }
);
const PurchasePriorityStackChart = dynamic(
  () => import("@/components/purchases/PurchasePriorityCharts").then((m) => m.PurchasePriorityStackChart),
  { ssr: false, loading: () => <ChartSkeleton className="xl:col-span-7" /> }
);

/**
 * Bloco de PRIORIDADE da aba Compras Pendentes — linhas 1 a 4 do layout da
 * TAREFA 14:
 *
 *   1. cards: Requisições Pendentes | N1 | N2 | N3 | N4 | Sem Prioridade
 *   2. "Compras Pendentes por Prioridade" | "Prioridades por Requisitante"
 *   3. "Prioridades por Grupo de Mercadoria"
 *   4. "Top Compras Pendentes Críticas"
 *
 * Está partido em DOIS componentes (`...CardsRow` e `...Dashboards`) porque a
 * aba encaixa os cards de apoio (materiais, requisitantes, mais antiga) entre a
 * linha 1 e a linha 2 — os dois blocos de cards juntos formam o cabeçalho de
 * indicadores da tela, e os gráficos vêm depois.
 *
 * Os dois dependem da MESMA condição (`priority.available`): sem a coluna
 * "Nº acompanhamento" o bloco inteiro dá lugar ao aviso — cinco cards zerados se
 * leriam como "não há pendências".
 */

type PriorityBlockProps = {
  priority: PendingPriorityAnalysis;
  /** Total pendente do recorte — o mesmo número da tabela. */
  totalPending: number;
  /** Prioridades no filtro ativo (destaque nos cards e no gráfico). */
  selected: string[];
  /** Liga/desliga uma prioridade no filtro — cards e gráfico compartilham. */
  onTogglePriority: (priority: string) => void;
};

/**
 * Linha 1: "Requisições Pendentes" + um card por prioridade.
 *
 * Sem a coluna "Nº acompanhamento" na base, os CINCO cards de prioridade somem e
 * entra o aviso — mas "Requisições Pendentes" fica: é o KPI principal da aba e
 * existia antes desta feature. Escondê-lo junto com o resto transformaria a
 * ausência da coluna numa PERDA de informação, não só na falta de um recurso.
 */
export function PurchasePriorityCardsRow({
  priority,
  totalPending,
  selected,
  onTogglePriority
}: PriorityBlockProps) {
  return (
    <>
      <PurchasePriorityCards
        totalPending={totalPending}
        slices={priority.available ? priority.byPriority : []}
        selected={selected}
        onSelect={onTogglePriority}
      />
      {priority.available ? null : <PurchasePriorityNotice />}
    </>
  );
}

/** Linhas 2 a 4: gráficos por prioridade + ranking de pendências críticas. */
export function PurchasePriorityDashboards({
  priority,
  selected,
  onTogglePriority
}: Omit<PriorityBlockProps, "totalPending">) {
  if (!priority.available) {
    return null;
  }

  return (
    <>
      <section className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <PurchasePriorityChart
          className="xl:col-span-5"
          title="Compras Pendentes por Prioridade"
          subtitle="Quantas requisições pendentes existem em cada prioridade do Nº acompanhamento."
          slices={priority.byPriority}
          selected={selected}
          onSelect={onTogglePriority}
        />
        <PurchasePriorityStackChart
          className="xl:col-span-7"
          title="Prioridades por Requisitante"
          subtitle="Quem concentra as pendências críticas — ordenado por N1, depois N2."
          rows={priority.byRequester}
          emptyDescription="Nenhuma requisição pendente com requisitante preenchido."
        />
        <PurchasePriorityStackChart
          className="xl:col-span-12"
          title="Prioridades por Grupo de Mercadoria"
          subtitle="Grupos de mercadoria (Descr grupo Merc) com mais itens pendentes por prioridade."
          rows={priority.byMerchandiseGroup}
          emptyDescription="Nenhuma requisição pendente com grupo de mercadoria preenchido."
        />
      </section>

      <PurchaseCriticalTable items={priority.criticalItems} />
    </>
  );
}

/**
 * Aviso quando a base importada não tem a coluna "Nº acompanhamento" — mesmo
 * padrão do aviso de classificação N1..N4, e igualmente acionável (diz quais
 * cabeçalhos o importador reconhece).
 */
function PurchasePriorityNotice() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-gold/30 bg-gold/5 px-3 py-2.5 text-[12px] text-champagne">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
      <span>
        <strong className="font-semibold text-white">
          A coluna “Nº acompanhamento” não foi encontrada na base importada. Reimporte a planilha de compras com essa
          coluna para habilitar os dashboards por prioridade N1/N2/N3/N4.
        </strong>
        <span className="mt-0.5 block text-[11px] text-zinc-400">
          A aba continua listando normalmente as requisições sem pedido de compra — apenas os cards, gráficos, o ranking
          crítico e o filtro por prioridade ficam indisponíveis. O importador reconhece{" "}
          <code>Nº acompanhamento</code>, <code>N acompanhamento</code>, <code>No acompanhamento</code>,{" "}
          <code>Número acompanhamento</code>, <code>Nr acompanhamento</code>, <code>Acompanhamento</code> e{" "}
          <code>Prioridade</code>, e aceita os valores <code>N1</code>…<code>N4</code> ou <code>N01</code>…
          <code>N04</code>.
        </span>
      </span>
    </div>
  );
}
