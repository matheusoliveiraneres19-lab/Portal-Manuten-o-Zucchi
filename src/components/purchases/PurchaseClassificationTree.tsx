"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Layers } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import type { PurchaseClassificationNode } from "@/types/purchases";

type PurchaseClassificationTreeProps = {
  nodes: PurchaseClassificationNode[];
  /** Total de pendências no recorte — base das barras de proporção. */
  total: number;
  /** Pendências sem nenhum nível preenchido (rodapé informativo). */
  unclassified: number;
};

/** Cor por profundidade (N1 → N4), mantendo a paleta premium Zucchi. */
const DEPTH_COLORS = ["#c49a45", "#0f4d68", "#7b551f", "#5a7d8c"];

/**
 * Visão hierárquica "Classificação das Pendências" (TAREFA 9):
 * N1 > N2 > N3 > N4 com a quantidade de requisições em cada nível.
 * Os N1 já vêm abertos; os níveis mais profundos abrem sob demanda.
 */
export function PurchaseClassificationTree({ nodes, total, unclassified }: PurchaseClassificationTreeProps) {
  return (
    <article className="panel rounded-lg p-4">
      <div className="mb-1 flex items-center gap-2">
        <Layers className="h-4 w-4 text-[#5a3d12]" />
        <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-[#5a3d12]">
          Classificação das Pendências
        </h3>
      </div>
      <p className="mb-3 text-[11px] text-zinc-500">
        Hierarquia N1 &rsaquo; N2 &rsaquo; N3 &rsaquo; N4 com a quantidade de requisições pendentes em cada nível.
      </p>

      {nodes.length === 0 ? (
        <EmptyState
          title="Sem classificação no recorte"
          description="Nenhuma requisição pendente filtrada possui N1 preenchido."
        />
      ) : (
        <>
          <div className="space-y-1">
            {nodes.map((node) => (
              <TreeNode key={node.key} node={node} total={total} depth={0} defaultOpen />
            ))}
          </div>
          {unclassified > 0 ? (
            <p className="mt-3 border-t border-zinc-200 pt-2 text-[11px] text-zinc-500">
              <strong className="font-semibold text-zinc-700">{int(unclassified)}</strong> requisição(ões) pendente(s)
              sem nenhum nível de classificação preenchido.
            </p>
          ) : null}
        </>
      )}
    </article>
  );
}

function TreeNode({
  node,
  total,
  depth,
  defaultOpen = false
}: {
  node: PurchaseClassificationNode;
  total: number;
  depth: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasChildren = node.children.length > 0;
  const color = DEPTH_COLORS[Math.min(depth, DEPTH_COLORS.length - 1)];
  // Blindado contra divisão por zero — nunca gera NaN/Infinity na largura da barra.
  const ratio = total > 0 ? Math.min(100, Math.max(0, (node.count / total) * 100)) : 0;
  const width = Number.isFinite(ratio) ? ratio : 0;

  return (
    <div style={{ marginLeft: depth * 16 }}>
      <div
        className={`flex items-center gap-2 rounded-md px-2 py-1.5 transition ${hasChildren ? "cursor-pointer hover:bg-gold/[0.06]" : ""}`}
        onClick={hasChildren ? () => setOpen((current) => !current) : undefined}
        role={hasChildren ? "button" : undefined}
        tabIndex={hasChildren ? 0 : undefined}
        onKeyDown={
          hasChildren
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setOpen((current) => !current);
                }
              }
            : undefined
        }
      >
        <span className="w-4 shrink-0 text-zinc-400">
          {hasChildren ? (
            open ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )
          ) : null}
        </span>
        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
        <span className="min-w-0 flex-1 truncate text-xs text-zinc-800" title={node.label}>
          {node.label}
        </span>
        <span className="shrink-0 text-xs font-bold tabular-nums text-zinc-900">{int(node.count)}</span>
      </div>

      <div className="ml-6 mr-2 h-1 overflow-hidden rounded-full bg-zinc-100">
        <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>

      {hasChildren && open ? (
        <div className="mt-1 space-y-1">
          {node.children.map((child) => (
            <TreeNode key={child.key} node={child} total={total} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function int(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString("pt-BR") : "0";
}
