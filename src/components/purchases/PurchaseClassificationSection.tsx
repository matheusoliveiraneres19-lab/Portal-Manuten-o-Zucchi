"use client";

import dynamic from "next/dynamic";
import { ChartSkeleton } from "@/components/ChartSkeleton";
import { PurchaseClassificationNotice } from "@/components/purchases/PurchaseClassificationNotice";
import { PurchaseClassificationTree } from "@/components/purchases/PurchaseClassificationTree";
import { classificationToRank } from "@/components/purchases/PurchaseInsightCharts";
import type { PurchaseClassificationInsights } from "@/types/purchases";
import { CHART_SERIES } from "@/constants/theme";

const PurchaseRankBarChart = dynamic(
  () => import("@/components/purchases/PurchaseInsightCharts").then((m) => m.PurchaseRankBarChart),
  { ssr: false, loading: () => <ChartSkeleton className="xl:col-span-6" /> }
);

/**
 * Textos que mudam de aba para aba. São frases COMPLETAS, e não pedaços
 * montados em runtime, porque o gênero e o plural em pt-BR mudam com o
 * substantivo do recorte ("nenhuma requisição pendente" × "nenhum item
 * realizado") — templates produziriam concordância errada.
 */
export type PurchaseClassificationCopy = {
  /** Prefixo dos títulos dos gráficos: "<prefixo> por N1" / "por N2". */
  chartTitlePrefix: string;
  /** Subtítulo do gráfico de N1 — explica qual conjunto está sendo agrupado. */
  n1Subtitle: string;
  /** Prefixo do vazio dos gráficos: "<prefixo> com N1 preenchido.". */
  chartEmptyPrefix: string;
  treeTitle: string;
  treeDescription: string;
  treeEmptyDescription: string;
  /** Substantivo contado do recorte ("N <noun>") — rodapé da árvore e resumo. */
  itemNoun: string;
  /** Legenda do card "Sem classificação" no resumo. */
  summaryUnclassifiedHint: string;
  /** Primeira frase do aviso de base sem N1..N4. */
  noticeDetail: string;
};

/** Aba Compras Pendentes: o recorte são as requisições sem pedido de compra. */
export const PENDING_CLASSIFICATION_COPY: PurchaseClassificationCopy = {
  chartTitlePrefix: "Compras pendentes",
  n1Subtitle: "Requisições sem pedido, agrupadas pelo 1º nível de classificação.",
  chartEmptyPrefix: "Nenhuma requisição pendente",
  treeTitle: "Classificação das Pendências",
  treeDescription:
    "Hierarquia N1 › N2 › N3 › N4 com a quantidade de requisições pendentes em cada nível.",
  treeEmptyDescription: "Nenhuma requisição pendente filtrada possui N1 preenchido.",
  itemNoun: "requisição(ões) pendente(s)",
  summaryUnclassifiedHint: "Pendências sem nenhum nível N1..N4",
  noticeDetail:
    "A aba continua listando normalmente as requisições sem pedido de compra — apenas os gráficos e filtros por classificação ficam indisponíveis."
};

/** Aba Compras Realizadas: o recorte são os itens comprados e entregues. */
export const COMPLETED_CLASSIFICATION_COPY: PurchaseClassificationCopy = {
  chartTitlePrefix: "Compras realizadas",
  n1Subtitle: "Itens comprados e entregues, agrupados pelo 1º nível de classificação.",
  chartEmptyPrefix: "Nenhum item realizado",
  treeTitle: "Classificação das Realizadas",
  treeDescription:
    "Hierarquia N1 › N2 › N3 › N4 com a quantidade de itens comprados e entregues em cada nível.",
  treeEmptyDescription: "Nenhum item realizado filtrado possui N1 preenchido.",
  itemNoun: "item(ns) realizado(s)",
  summaryUnclassifiedHint: "Itens realizados sem nenhum nível N1..N4",
  noticeDetail:
    "A aba continua listando normalmente as compras realizadas — apenas os gráficos e filtros por classificação ficam indisponíveis."
};

type PurchaseClassificationSectionProps = {
  classification: PurchaseClassificationInsights;
  /** Total do recorte da aba (o mesmo da tabela) — base da cobertura e das barras. */
  total: number;
  /** N1 selecionados nos filtros — explica o recorte do gráfico de N2. */
  selectedN1: string[];
  copy: PurchaseClassificationCopy;
};

/**
 * Bloco de análise por classificação N1 > N2 > N3 > N4 (TAREFAS 5, 6, 7, 9 e 10):
 * resumo + gráficos de N1/N2 + árvore hierárquica.
 *
 * Vive fora das páginas porque Compras Pendentes e Compras Realizadas mostram o
 * MESMO bloco sobre recortes diferentes — só os textos mudam (ver `copy`).
 */
export function PurchaseClassificationSection({
  classification,
  total,
  selectedN1,
  copy
}: PurchaseClassificationSectionProps) {
  if (!classification.available) {
    return <PurchaseClassificationNotice detail={copy.noticeDetail} />;
  }

  return (
    <>
      <ClassificationSummary classification={classification} total={total} copy={copy} />

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <PurchaseRankBarChart
          className="xl:col-span-6"
          title={`${copy.chartTitlePrefix} por N1`}
          subtitle={copy.n1Subtitle}
          color={CHART_SERIES.compras}
          items={classificationToRank(classification.byN1)}
          emptyDescription={`${copy.chartEmptyPrefix} com N1 preenchido.`}
        />
        <PurchaseRankBarChart
          className="xl:col-span-6"
          title={`${copy.chartTitlePrefix} por N2`}
          subtitle={
            selectedN1.length
              ? `Restrito a N1: ${selectedN1.join(", ")}.`
              : "Selecione um N1 nos filtros para ver apenas os N2 daquele grupo."
          }
          color={CHART_SERIES.ordens}
          items={classificationToRank(classification.byN2)}
          emptyDescription={`${copy.chartEmptyPrefix} com N2 preenchido.`}
        />
      </section>

      <PurchaseClassificationTree
        nodes={classification.tree}
        total={total}
        unclassified={classification.unclassified}
        title={copy.treeTitle}
        description={copy.treeDescription}
        emptyDescription={copy.treeEmptyDescription}
        unclassifiedNoun={copy.itemNoun}
      />
    </>
  );
}

/**
 * Faixa de apoio da classificação (TAREFA 5). Os "mais recorrentes" ficam AQUI,
 * e não nos cards principais, para a tela não ficar carregada — os cards do topo
 * seguem sendo os KPIs próprios de cada aba.
 */
function ClassificationSummary({
  classification,
  total,
  copy
}: {
  classification: PurchaseClassificationInsights;
  total: number;
  copy: PurchaseClassificationCopy;
}) {
  const items = [
    {
      label: "N1 mais recorrente",
      value: classification.topN1?.label ?? "—",
      hint: classification.topN1 ? `${int(classification.topN1.count)} ${copy.itemNoun}` : "Sem N1 no recorte"
    },
    {
      label: "N2 mais recorrente",
      value: classification.topN2?.label ?? "—",
      hint: classification.topN2 ? `${int(classification.topN2.count)} ${copy.itemNoun}` : "Sem N2 no recorte"
    },
    {
      label: "Cobertura da classificação",
      value: percent(classification.coverage.n1, total),
      hint: `${int(classification.coverage.n1)} de ${int(total)} com N1 preenchido`
    },
    {
      label: "Sem classificação",
      value: int(classification.unclassified),
      hint: copy.summaryUnclassifiedHint
    }
  ];

  return (
    <section className="panel rounded-lg p-4">
      <h3 className="mb-3 text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">
        Resumo da classificação
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="rounded-lg border border-zinc-200 bg-white/60 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{item.label}</p>
            <p className="mt-0.5 truncate text-lg font-light text-zinc-950" title={item.value}>
              {item.value}
            </p>
            <p className="text-[10px] text-zinc-500">{item.hint}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function int(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString("pt-BR") : "0";
}

/** Percentual de uma parte sobre o total — nunca exibe NaN/Infinity. */
function percent(part: number, total: number): string {
  const value = total > 0 ? (part / total) * 100 : 0;
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
