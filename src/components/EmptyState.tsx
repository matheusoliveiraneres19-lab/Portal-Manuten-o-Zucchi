import { Inbox } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  className?: string;
};

/**
 * Estado vazio elegante para os cards claros do dashboard.
 * Ícone discreto + título curto + descrição clara.
 */
export function EmptyState({ title, description, icon: Icon = Inbox, className = "" }: EmptyStateProps) {
  return (
    <div
      className={`flex h-full min-h-[140px] flex-col items-center justify-center gap-2 px-4 py-6 text-center ${className}`}
    >
      <span className="grid h-10 w-10 place-items-center rounded-full border border-zinc-200 bg-zinc-50 text-zinc-400">
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </span>
      <p className="text-sm font-semibold text-zinc-700">{title}</p>
      {description ? <p className="max-w-xs text-xs leading-relaxed text-zinc-500">{description}</p> : null}
    </div>
  );
}
