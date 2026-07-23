import Link from "next/link";
import { ArrowRight } from "lucide-react";

type SeeAllLinkProps = {
  /** Rota da aba oficial (idealmente já com ?startDate&endDate do período atual). */
  href: string;
  label?: string;
};

/**
 * Link "Ver todas" padrão dos cards da aba Início. Navega para a aba oficial do
 * módulo (next/link), preservando o visual premium do portal. Substitui os antigos
 * <button> sem ação que não navegavam.
 */
export function SeeAllLink({ href, label = "Ver todas" }: SeeAllLinkProps) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-xs font-semibold text-petroleum transition hover:gap-1.5 hover:text-gold"
    >
      {label}
      <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}
