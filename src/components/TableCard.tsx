import { ShoppingCart } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { SeeAllLink } from "@/components/SeeAllLink";
import type { PendingPurchase } from "@/types/dashboard";

type TableCardProps = {
  title: string;
  purchases: PendingPurchase[];
  className?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Rota da aba oficial para o botão "Ver todas" (com query params de período). */
  href?: string;
};

/**
 * Tabela de compras pendentes na home.
 *
 * As colunas mudaram (FASE 5): antes eram Item / Fornecedor / Previsão / Valor, e as
 * três últimas vinham vazias em TODAS as linhas — uma requisição pendente de compra
 * ainda não virou pedido, então não tem fornecedor negociado, prazo nem preço. Três
 * colunas de "—" numa tabela da home é o tipo de coisa que faz a gestão desconfiar do
 * portal inteiro. As colunas de agora existem desde a abertura da requisição e
 * respondem o que se pergunta olhando essa fila: prioridade, o quê, quem pediu e há
 * quanto tempo está parado.
 *
 * Padrão de tabela do portal aplicado aqui: cabeçalho grudado no topo ao rolar,
 * linhas zebradas discretas, hover na linha inteira, valores com `tabular-nums`
 * (dígitos de largura fixa — sem isso a coluna "dança" entre linhas) e alinhamento à
 * direita para números.
 */
export function TableCard({
  title,
  purchases,
  className = "",
  emptyTitle = "Sem compras pendentes no período",
  emptyDescription = "Aguardando importação de compras para exibir este indicador.",
  href
}: TableCardProps) {
  return (
    /* Sem `h-full` de propósito: este card fica ao lado da lista de alertas, que é
       bem mais alta. Esticado, sobrava ~40% de área vazia embaixo da tabela. */
    <article className={`panel panel-accent flex flex-col p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">{title}</h3>
        {href ? <SeeAllLink href={href} /> : null}
      </div>

      {purchases.length === 0 ? (
        <EmptyState icon={ShoppingCart} title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="-mx-1 max-h-[320px] overflow-auto rounded-lg">
          <table className="w-full min-w-[560px] border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-surface/95 backdrop-blur">
              <tr className="border-b border-gold/25 text-[10px] uppercase tracking-wider text-gold-deep">
                <th scope="col" className="px-2 py-2 font-bold">
                  Prior.
                </th>
                <th scope="col" className="px-2 py-2 font-bold">
                  Material
                </th>
                <th scope="col" className="px-2 py-2 font-bold">
                  Requisitante
                </th>
                <th scope="col" className="px-2 py-2 font-bold">
                  Solicitado
                </th>
                <th scope="col" className="px-2 py-2 text-right font-bold">
                  Dias
                </th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((purchase) => (
                <tr
                  key={`${purchase.requisition}-${purchase.item}`}
                  className="border-b border-black/[0.05] transition-colors duration-200 ease-premium last:border-0 odd:bg-black/[0.015] hover:bg-gold/[0.08]"
                >
                  <td className="whitespace-nowrap px-2 py-2.5">
                    <PriorityBadge priority={purchase.priority} />
                  </td>
                  <td
                    className="max-w-[260px] truncate px-2 py-2.5 font-medium text-ink"
                    title={`${purchase.item} — requisição ${purchase.requisition}`}
                  >
                    {purchase.item}
                  </td>
                  <td className="max-w-[140px] truncate px-2 py-2.5 text-neutralized-strong" title={purchase.requester}>
                    {purchase.requester}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 tabular-nums text-neutralized-strong">
                    {purchase.requestedAt}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-right font-semibold tabular-nums text-ink">
                    {purchase.daysOpen === null ? "—" : purchase.daysOpen.toLocaleString("pt-BR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

/**
 * N1 é a prioridade mais alta do acompanhamento de compras, N4 a mais baixa. A cor
 * evita que a coluna vire só mais um texto: a fila é lida pela urgência, não pela ordem.
 */
function PriorityBadge({ priority }: { priority: string }) {
  const style =
    priority === "N1"
      ? "border-danger/60 bg-danger/20 font-extrabold text-danger"
      : priority === "N2"
        ? "border-gold/50 bg-gold/25 text-gold-deep"
        : priority === "N3" || priority === "N4"
          ? "border-black/10 bg-black/[0.04] text-neutralized-strong"
          : "border-transparent bg-transparent text-neutralized";

  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${style}`}>
      {priority}
    </span>
  );
}
