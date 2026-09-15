import Link from "next/link";
import { AlertOctagon, ArrowRight } from "lucide-react";
import type { AlertItem } from "@/types/dashboard";

/**
 * Faixa de alertas CRÍTICOS no topo da home.
 *
 * Os alertas existiam, mas viviam num card no rodapé da tela, com o mesmo peso visual
 * de um ranking — a gestão passava por eles sem ver. Aqui eles ganham a primeira
 * dobra, e só quando há gravidade CRÍTICO: uma faixa vermelha permanente vira ruído e
 * deixa de ser lida em duas semanas.
 *
 * Sem animação: é um aviso, não um alarme piscando. O bloco inteiro leva ao primeiro
 * alerta, e cada linha leva à aba que a originou.
 */
export function CriticalAlertsBanner({ alerts }: { alerts: AlertItem[] }) {
  const criticos = alerts.filter((alert) => alert.severity === "CRITICO");
  if (criticos.length === 0) return null;

  return (
    <section className="mt-4 overflow-hidden rounded-lg border border-danger/50 bg-[linear-gradient(120deg,rgba(120,20,25,0.16),rgba(120,20,25,0.06))] shadow-[0_10px_30px_rgba(120,20,25,0.12)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-danger/25 px-4 py-2.5">
        <AlertOctagon className="h-5 w-5 shrink-0 text-danger" />
        <p className="flex-1 text-sm font-bold text-danger">
          {criticos.length === 1
            ? "Existe 1 alerta crítico que precisa de atenção"
            : `Existem ${criticos.length.toLocaleString("pt-BR")} alertas críticos que precisam de atenção`}
        </p>
      </div>

      <ul className="divide-y divide-danger/15">
        {criticos.slice(0, 4).map((alert, index) => (
          <li key={`${alert.time}-${index}`}>
            <Link
              href={alert.href}
              className="flex items-start gap-3 px-4 py-2.5 transition duration-200 ease-premium hover:bg-danger/10 focus-visible:bg-danger/10 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-danger"
            >
              <span className="mt-0.5 shrink-0 rounded border border-danger/40 bg-danger/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-danger">
                {alert.time}
              </span>
              <span className="min-w-0 flex-1 text-[12px] leading-relaxed text-neutralized-strong">{alert.text}</span>
              <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger/70" />
            </Link>
          </li>
        ))}
      </ul>

      {criticos.length > 4 ? (
        <p className="border-t border-danger/15 px-4 py-2 text-[11px] text-neutralized-strong">
          e mais {criticos.length - 4} alerta(s) crítico(s) na lista abaixo.
        </p>
      ) : null}
    </section>
  );
}
