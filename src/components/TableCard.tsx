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
 * Padrão de tabela do portal aplicado aqui: cabeçalho grudado no topo ao rolar,
 * linhas zebradas discretas, hover na linha inteira, valores com `tabular-nums`
 * (dígitos de largura fixa — sem isso a coluna de valor "dança" entre linhas) e
 * alinhamento à direita para números.
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
                  Item
                </th>
                <th scope="col" className="px-2 py-2 font-bold">
                  Fornecedor
                </th>
                <th scope="col" className="px-2 py-2 font-bold">
                  Previsão
                </th>
                <th scope="col" className="px-2 py-2 text-right font-bold">
                  Valor
                </th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((purchase) => (
                <tr
                  key={purchase.item}
                  className="border-b border-black/[0.05] transition-colors duration-200 ease-premium last:border-0 odd:bg-black/[0.015] hover:bg-gold/[0.08]"
                >
                  <td className="max-w-[240px] truncate px-2 py-2.5 font-medium text-ink" title={purchase.item}>
                    {purchase.item}
                  </td>
                  <td className="max-w-[180px] truncate px-2 py-2.5 text-neutralized-strong" title={purchase.supplier}>
                    {purchase.supplier}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 tabular-nums text-neutralized-strong">
                    {purchase.date}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-right font-semibold tabular-nums text-ink">
                    {purchase.value}
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
