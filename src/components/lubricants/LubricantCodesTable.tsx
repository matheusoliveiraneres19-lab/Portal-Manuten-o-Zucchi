"use client";

import { useMemo, useState } from "react";
import { Eye, FileCheck2, FileWarning, Search, Wrench } from "lucide-react";
import type { LubricantCodeRow } from "@/types/lubricants";
import type { LubricantReferencePeriod } from "@/types/lubricants";

type LubricantCodesTableProps = {
  rows: LubricantCodeRow[];
  reference: LubricantReferencePeriod;
  onSelect: (code: string) => void;
  onEditApplications: (code: string) => void;
  onEditSheet: (code: string) => void;
};

export function LubricantCodesTable({
  rows,
  reference,
  onSelect,
  onEditApplications,
  onEditSheet
}: LubricantCodesTableProps) {
  const [term, setTerm] = useState("");

  const filtered = useMemo(() => {
    const search = term.trim().toLowerCase();
    if (!search) {
      return rows;
    }
    return rows.filter((row) => `${row.code} ${row.description}`.toLowerCase().includes(search));
  }, [rows, term]);

  return (
    <article className="panel overflow-hidden rounded-lg">
      <div className="flex flex-col gap-3 border-b border-[#3e311d1f] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-gold-deep">
            Códigos de lubrificantes e aplicações
          </h3>
          <p className="text-[11px] text-zinc-500">
            Mês/ano de referência: {reference.monthLabel}. Clique no código para ver detalhes.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Filtrar por código ou descrição..."
            className="h-9 w-full rounded-md border border-zinc-300 bg-white pl-8 pr-2 text-xs text-zinc-800 outline-none focus:border-gold"
          />
        </div>
      </div>

      <div className="max-h-[560px] overflow-auto">
        <table className="w-full min-w-[960px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-surface text-[10px] uppercase tracking-wide text-gold-deep">
            <tr>
              <Th>Código</Th>
              <Th>Descrição</Th>
              <Th className="text-center">Un.</Th>
              <Th className="text-right">Ent. mês</Th>
              <Th className="text-right">Saí. mês</Th>
              <Th className="text-right">Ent. ano</Th>
              <Th className="text-right">Saí. ano</Th>
              <Th className="text-right">Saldo</Th>
              <Th className="text-right">Mín.</Th>
              <Th>Máquinas</Th>
              <Th className="text-center">Ficha</Th>
              <Th className="text-center">Ações</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200/70">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-10 text-center text-zinc-500">
                  Nenhum código encontrado.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr
                  key={row.id}
                  className={`transition hover:bg-gold/[0.06] ${row.belowMinimum ? "bg-rose-100/60" : "bg-white/40"}`}
                >
                  <td className="px-3 py-2 font-mono text-[11px] font-semibold text-petroleum">
                    <button type="button" onClick={() => onSelect(row.code)} className="hover:underline">
                      {row.code}
                    </button>
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-zinc-800" title={row.description}>
                    {row.description}
                  </td>
                  <td className="px-3 py-2 text-center text-zinc-500">{row.unit}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-700">{num(row.monthlyInputs)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-danger">{num(row.monthlyOutputs)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-700">{num(row.annualInputs)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-danger">{num(row.annualOutputs)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-zinc-900">
                    <span className="inline-flex items-center gap-1">
                      {row.belowMinimum ? (
                        <span className="rounded bg-danger px-1 py-0.5 text-[9px] font-bold uppercase text-white">Repor</span>
                      ) : null}
                      {num(row.balance)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-500">
                    {row.minimumStock > 0 ? num(row.minimumStock) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {row.hasMachineApplication ? (
                      <span className="truncate text-zinc-700" title={row.machinesUsed.join(", ")}>
                        {row.machinesUsed.slice(0, 2).join(", ")}
                        {row.machinesUsed.length > 2 ? ` +${row.machinesUsed.length - 2}` : ""}
                      </span>
                    ) : (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                        Pendente
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {row.hasTechnicalSheet ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                        <FileCheck2 className="h-3.5 w-3.5" /> Anexada
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700">
                        <FileWarning className="h-3.5 w-3.5" /> Pendente
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1">
                      <IconButton title="Ver detalhes" onClick={() => onSelect(row.code)}>
                        <Eye className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton title="Editar aplicações" onClick={() => onEditApplications(row.code)}>
                        <Wrench className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton title="Informar ficha técnica" onClick={() => onEditSheet(row.code)}>
                        <FileCheck2 className="h-3.5 w-3.5" />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`whitespace-nowrap px-3 py-2 font-bold ${className}`}>{children}</th>;
}

function IconButton({
  children,
  title,
  onClick
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-md border border-zinc-300 text-zinc-600 transition hover:border-gold hover:bg-gold/10 hover:text-gold-deep"
    >
      {children}
    </button>
  );
}

function num(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}
