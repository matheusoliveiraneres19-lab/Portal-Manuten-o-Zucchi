"use client";

import { RefreshCw, ServerCrash, Upload } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type ModuleAction = {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
};

type ModuleEmptyStateProps = {
  /** Ícone do estado "sem dados". No estado indisponível é sempre ServerCrash. */
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  /** Ação principal do estado "sem dados" (normalmente importar planilha). */
  action?: ModuleAction;
  /**
   * true quando a consulta ao banco FALHOU (PageDataSource "unavailable"), e não
   * quando simplesmente não há registros. Troca ícone, texto e ação: pedir
   * "importe a planilha" numa queda de banco manda o usuário reimportar dados que
   * já estão no servidor.
   */
  unavailable?: boolean;
  /** Título do estado indisponível (ex.: "Dados de compras indisponíveis"). */
  unavailableTitle?: string;
  /**
   * "dark"  — hero escuro com veio de mármore (PC-Factory, Lubrificantes, Eq. Críticos);
   * "panel" — card claro `.panel` (Compras).
   * Mantém a superfície que cada módulo já usava.
   */
  surface?: "dark" | "panel";
};

const UNAVAILABLE_DESCRIPTION =
  "Não foi possível consultar o banco de dados agora. Os dados importados não foram perdidos — atualize a página em alguns instantes.";

/**
 * Estado vazio de PÁGINA de módulo — ocupa a área de conteúdo quando não há nada
 * a exibir. Unifica os quatro componentes que existiam por módulo (Compras,
 * PC-Factory, Lubrificantes e Equipamentos Críticos), cujo trecho de "dados
 * indisponíveis" era idêntico nos três que o tinham.
 *
 * Para o estado vazio DENTRO de um card (gráfico, tabela), use `EmptyState`.
 */
export function ModuleEmptyState({
  icon: Icon,
  title,
  description,
  action,
  unavailable = false,
  unavailableTitle = "Dados indisponíveis",
  surface = "dark"
}: ModuleEmptyStateProps) {
  const dark = surface === "dark";
  const ActionIcon = action?.icon ?? Upload;

  const shell = dark
    ? "relative overflow-hidden rounded-card border border-gold/20 bg-ink p-10 text-center shadow-premium"
    : "panel flex flex-col items-center justify-center gap-4 p-10 text-center";

  const medallion = unavailable
    ? dark
      ? "border-danger/45 bg-danger/15 text-danger-soft"
      : "border-transparent bg-danger text-white"
    : dark
      ? "border-gold/35 bg-gold/10 text-gold"
      : "border-transparent bg-petroleum text-white";

  const heading = dark ? "font-serif text-2xl text-white" : "font-serif text-xl text-ink";
  const body = dark
    ? "max-w-md text-sm leading-relaxed text-parchment"
    : "mx-auto max-w-md text-sm text-neutralized-strong";

  return (
    <div className={shell}>
      {dark ? <div className="login-marble-bg absolute inset-0 opacity-80" /> : null}

      <div className={dark ? "relative z-10 mx-auto flex max-w-xl flex-col items-center gap-4" : "contents"}>
        <span
          className={`grid h-16 w-16 place-items-center rounded-full border shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] ${medallion}`}
        >
          {unavailable ? (
            <ServerCrash className="h-8 w-8" strokeWidth={1.6} />
          ) : (
            <Icon className="h-8 w-8" strokeWidth={1.6} />
          )}
        </span>

        <div>
          <h2 className={heading}>{unavailable ? unavailableTitle : title}</h2>
          <p className={`mt-1 ${body}`}>{unavailable ? UNAVAILABLE_DESCRIPTION : description}</p>
        </div>

        {unavailable ? (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className={`mt-1 inline-flex h-11 items-center gap-2 rounded-lg border px-5 text-sm font-bold transition ${
              dark
                ? "border-danger/55 bg-danger/15 text-danger-soft hover:bg-danger/25"
                : "border-danger/45 bg-danger/10 text-danger-strong hover:bg-danger/20"
            }`}
          >
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </button>
        ) : action ? (
          <button
            type="button"
            onClick={action.onClick}
            className={`mt-1 inline-flex h-11 items-center gap-2 rounded-lg border border-gold/55 bg-gold/15 px-5 text-sm font-bold transition hover:bg-gold/25 ${
              dark ? "text-gold" : "text-gold-deep"
            }`}
          >
            <ActionIcon className="h-4 w-4" />
            {action.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}
