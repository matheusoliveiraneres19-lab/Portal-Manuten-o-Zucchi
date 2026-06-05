import { ShoppingCart } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import type { PendingPurchase } from "@/types/dashboard";

type TableCardProps = {
  title: string;
  purchases: PendingPurchase[];
  className?: string;
  emptyTitle?: string;
  emptyDescription?: string;
};

export function TableCard({
  title,
  purchases,
  className = "",
  emptyTitle = "Sem compras pendentes no período",
  emptyDescription = "Aguardando importação de compras para exibir este indicador."
}: TableCardProps) {
  return (
    <article className={`panel rounded-lg p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">{title}</h3>
        {purchases.length ? <button className="text-xs font-semibold text-petroleum">Ver todas</button> : null}
      </div>
      {purchases.length === 0 ? (
        <EmptyState icon={ShoppingCart} title={emptyTitle} description={emptyDescription} />
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-xs">
          <thead>
            <tr className="border-b border-zinc-200 text-xs text-zinc-500">
              <th className="pb-2 font-semibold">Item</th>
              <th className="pb-2 font-semibold">Fornecedor</th>
              <th className="pb-2 font-semibold">Previsão</th>
              <th className="pb-2 text-right font-semibold">Valor</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((purchase) => (
              <tr key={purchase.item} className="border-b border-zinc-100 last:border-0">
                <td className="py-2.5 text-zinc-900">{purchase.item}</td>
                <td className="py-2.5 text-zinc-700">{purchase.supplier}</td>
                <td className="py-2.5 text-zinc-700">{purchase.date}</td>
                <td className="py-2.5 text-right font-medium text-zinc-900">{purchase.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </article>
  );
}

