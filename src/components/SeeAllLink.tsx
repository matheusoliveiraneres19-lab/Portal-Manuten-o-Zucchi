import Link from "next/link";
import { ArrowRight } from "lucide-react";

type SeeAllLinkProps = {
  /** Rota da aba oficial (idealmente já com ?startDate&endDate do período atual). */
  href: string;
  label?: string;
};

/**
 * Link "Ver todas" dos cards da aba Início. Navega para a aba oficial do módulo
 * preservando o período. Agora com forma de botão-pílula: como texto puro ele se
 * perdia no cabeçalho do card e não parecia clicável.
 *
 * `group` + `translate-x` na seta dão o microfeedback de direção no hover, sem
 * alterar a largura do botão (o antigo `hover:gap` deslocava o layout).
 */
export function SeeAllLink({ href, label = "Ver todas" }: SeeAllLinkProps) {
  return (
    <Link
      href={href}
      className="group inline-flex shrink-0 items-center gap-1.5 rounded-full border border-petroleum/20 bg-petroleum/[0.06] px-2.5 py-1 text-[11px] font-semibold text-petroleum-strong transition-colors duration-200 ease-premium hover:border-gold/45 hover:bg-gold/[0.12] hover:text-gold-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold/70"
    >
      {label}
      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 ease-premium group-hover:translate-x-0.5" />
    </Link>
  );
}
