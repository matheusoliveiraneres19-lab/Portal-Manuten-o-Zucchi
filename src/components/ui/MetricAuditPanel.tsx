"use client";

import { Calculator } from "lucide-react";

export type AuditLine = {
  label: string;
  value: string;
  /** Linha de resultado (negrito + separador acima). */
  strong?: boolean;
  /** Explicação em letra miúda, abaixo da linha. */
  hint?: string;
};

export type AuditFormula = {
  /** A fórmula em si, em texto (ex.: "realizadas ÷ base × 100"). */
  expression: string;
  /** Regras que definem os termos da fórmula. */
  rules?: string[];
  /** Meta/limite, quando existe. */
  target?: string;
};

type Props = {
  title: string;
  /** Uma frase sobre o que o painel explica. */
  description?: string;
  lines: AuditLine[];
  formula?: AuditFormula;
  /** Blocos extras: "como cada indicador é apurado". */
  definitions?: Array<{ term: string; detail: string }>;
  className?: string;
  /** Aberto por padrão? Só quando a transparência é o assunto principal da tela. */
  defaultOpen?: boolean;
};

/**
 * Painel de AUDITORIA DE MÉTRICA — "de onde vem esse número".
 *
 * Generaliza o que funcionou no PC-Factory: mostrar a cadeia de cálculo aberta, com a
 * fórmula escrita e as regras que definem cada termo. A gestão não desconfia de um
 * número errado, desconfia de um número sem origem — e a diferença entre os dois, na
 * tela, é este bloco.
 *
 * Fica em `<details>` e fechado por padrão: a resposta precisa estar a um clique, não
 * ocupando o espaço dos indicadores.
 */
export function MetricAuditPanel({
  title,
  description,
  lines,
  formula,
  definitions,
  className = "",
  defaultOpen = false
}: Props) {
  return (
    <details className={`group rounded-lg border border-gold/15 bg-ink/60 ${className}`} open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gold transition hover:bg-gold/5">
        <Calculator className="h-3.5 w-3.5" />
        <span className="flex-1">{title}</span>
        <span className="text-[10px] font-normal normal-case text-zinc-500 transition group-open:hidden">ver</span>
      </summary>

      <div className="space-y-3 border-t border-gold/10 px-3 py-3">
        {description ? <p className="text-[11px] leading-relaxed text-zinc-400">{description}</p> : null}

        {lines.length > 0 ? (
          <div className="space-y-1 font-mono text-[11px] text-zinc-300">
            {lines.map((line) => (
              <div
                key={line.label}
                className={`flex items-baseline justify-between gap-3 ${
                  line.strong ? "border-t border-gold/10 pt-1 text-champagne" : ""
                }`}
              >
                <span className={line.strong ? "font-semibold" : ""}>
                  {line.label}
                  {line.hint ? <span className="ml-1 font-sans text-[10px] text-zinc-500">({line.hint})</span> : null}
                </span>
                <span className={`tabular-nums ${line.strong ? "font-bold" : ""}`}>{line.value}</span>
              </div>
            ))}
          </div>
        ) : null}

        {formula ? (
          <div className="space-y-1 border-t border-gold/10 pt-2">
            <p className="font-mono text-[11px] text-gold">{formula.expression}</p>
            {formula.target ? <p className="font-mono text-[11px] text-champagne">{formula.target}</p> : null}
            {formula.rules?.length ? (
              <ul className="mt-1 space-y-0.5">
                {formula.rules.map((rule) => (
                  <li key={rule} className="text-[10px] leading-snug text-zinc-500">
                    • {rule}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {definitions?.length ? (
          <dl className="space-y-1.5 border-t border-gold/10 pt-2">
            {definitions.map((definition) => (
              <div key={definition.term}>
                <dt className="text-[11px] font-semibold text-champagne">{definition.term}</dt>
                <dd className="text-[10px] leading-snug text-zinc-500">{definition.detail}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </details>
  );
}
