import { Inbox } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  className?: string;
};

/**
 * Estado vazio dos cards claros do portal. Ícone em medalhão discreto + título
 * curto + descrição que diz o QUE FAZER (importar, ajustar filtro) — um vazio que
 * só informa "sem dados" deixa o usuário sem próximo passo.
 */
export function EmptyState({ title, description, icon: Icon = Inbox, className = "" }: EmptyStateProps) {
  return (
    <div
      className={`flex h-full min-h-[140px] flex-col items-center justify-center gap-2.5 px-4 py-6 text-center ${className}`}
    >
      <span className="grid h-12 w-12 place-items-center rounded-full border border-gold/25 bg-gradient-to-br from-white to-surface text-gold-deep shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </span>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description ? (
        <p className="max-w-xs text-xs leading-relaxed text-neutralized-strong">{description}</p>
      ) : null}
    </div>
  );
}
