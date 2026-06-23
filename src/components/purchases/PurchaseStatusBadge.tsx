import {
  PURCHASE_OPERATIONAL_STATUS_COLORS,
  PURCHASE_OPERATIONAL_STATUS_LABELS
} from "@/utils/purchase-classification";
import type { PurchaseOperationalStatus } from "@/types/purchases";

type PurchaseStatusBadgeProps = {
  status: PurchaseOperationalStatus;
  label?: string;
  className?: string;
};

/**
 * Badge de status operacional (REGRA 13) — cores centralizadas em
 * PURCHASE_OPERATIONAL_STATUS_COLORS. Funciona em tema claro e escuro.
 */
export function PurchaseStatusBadge({ status, label, className = "" }: PurchaseStatusBadgeProps) {
  const color = PURCHASE_OPERATIONAL_STATUS_COLORS[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${className}`}
      style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}55` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label ?? PURCHASE_OPERATIONAL_STATUS_LABELS[status]}
    </span>
  );
}
