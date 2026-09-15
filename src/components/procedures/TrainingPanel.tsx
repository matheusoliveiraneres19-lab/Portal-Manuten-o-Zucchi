"use client";

import { AlertTriangle, BookOpenCheck, GraduationCap, Route, UserCheck, Users } from "lucide-react";
import { FieldNotice } from "@/components/ui/FieldNotice";
import type { TrainingOverview } from "@/services/training.service";

/**
 * TREINAMENTO — leitura dos procedimentos obrigatórios.
 *
 * Substitui o card "Progresso funcionário novo", que mostrava `0%` sem dizer de quê.
 * A auditoria encontrou dois estados diferentes escondidos nesse zero, e eles pedem
 * mensagens opostas:
 *
 *  - SEM TRILHA DEFINIDA — nenhum procedimento marcado como obrigatório. Não há o que
 *    cobrar de ninguém; o que falta é configuração, e mostrar "0% de conclusão" aqui
 *    acusaria a equipe de algo que ela não tem como fazer.
 *  - TRILHA DEFINIDA E NINGUÉM LEU — aí sim 0% é real e vira alerta de treinamento
 *    pendente, com quem está devendo.
 */
export function TrainingPanel({ overview }: { overview: TrainingOverview }) {
  const int = (value: number) => value.toLocaleString("pt-BR");
  const semTrilha = !overview.hasMandatoryTrail;
  const ninguemLeu = overview.hasMandatoryTrail && overview.totalConfirmations === 0;

  return (
    <section className="space-y-3">
      <header>
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-gold">
          <GraduationCap className="h-4 w-4" />
          Treinamento da equipe
        </h2>
        <p className="mt-0.5 text-[11px] text-zinc-400">
          Conclusão dos procedimentos obrigatórios, a partir das confirmações de leitura registradas no portal.
        </p>
      </header>

      {semTrilha ? (
        <FieldNotice
          notices={[
            {
              id: "sem-trilha",
              message: "Nenhum procedimento está marcado como obrigatório, então não há taxa de conclusão a calcular.",
              detail: `O portal tem ${int(overview.publishedProcedures)} procedimentos publicados, mas nenhum deles faz parte da trilha de leitura obrigatória. Defina a ordem de onboarding nos procedimentos que todo colaborador precisa ler — só a partir daí a cobrança de treinamento passa a fazer sentido. Antes disso, "0% de conclusão" mediria a configuração, não a equipe.`,
              tone: "warning"
            }
          ]}
        />
      ) : null}

      {ninguemLeu ? (
        <div className="flex items-start gap-3 rounded-lg border border-danger/45 bg-danger/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-rose-100">Treinamento pendente — 0% de conclusão</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-rose-200/90">
              Existem {int(overview.mandatoryProcedures)} procedimentos obrigatórios e{" "}
              <strong className="font-semibold">nenhuma confirmação de leitura</strong> registrada entre os{" "}
              {int(overview.eligibleUsers)} usuários do portal. O número é real, não é falha de cálculo.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card icon={Route} label="Procedimentos obrigatórios" value={int(overview.mandatoryProcedures)} />
        <Card
          icon={UserCheck}
          label="Colaboradores com leitura concluída"
          value={overview.hasMandatoryTrail ? int(overview.usersCompleted) : "—"}
        />
        <Card
          icon={Users}
          label="Colaboradores pendentes"
          value={overview.hasMandatoryTrail ? int(overview.usersPending) : "—"}
          tone={overview.usersPending > 0 ? "danger" : undefined}
        />
        <Card
          icon={BookOpenCheck}
          label="Taxa de conclusão"
          value={overview.completionRate === null ? "Sem base" : `${overview.completionRate}%`}
          hint={overview.completionRate === null ? "sem trilha definida" : undefined}
          tone={overview.completionRate !== null && overview.completionRate < 50 ? "danger" : undefined}
        />
      </div>

      {overview.hasMandatoryTrail ? (
        <>
          <article className="rounded-2xl border border-gold/20 bg-black/30 p-4">
            <h3 className="mb-3 text-[11px] font-extrabold uppercase tracking-wide text-gold">Conclusão por procedimento</h3>
            <div className="space-y-2">
              {overview.byProcedure.map((procedure) => (
                <div key={procedure.id} className="flex items-center gap-3 text-[11px]">
                  <span className="w-56 shrink-0 truncate text-zinc-300" title={procedure.title}>
                    {procedure.title}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-black/50">
                    <span
                      className="block h-full rounded-full bg-gold transition-[width] duration-500 ease-premium"
                      style={{ width: `${procedure.completionPercent ?? 0}%` }}
                    />
                  </span>
                  <span className="w-20 shrink-0 text-right tabular-nums text-zinc-300">
                    {procedure.completionPercent === null ? "—" : `${procedure.completionPercent}%`}
                  </span>
                  <span className="w-24 shrink-0 text-right text-[10px] text-zinc-500">
                    {int(procedure.confirmations)} de {int(overview.eligibleUsers)}
                  </span>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-gold/20 bg-black/30 p-4">
            <h3 className="mb-3 text-[11px] font-extrabold uppercase tracking-wide text-gold">
              Acompanhamento por colaborador
            </h3>
            <div className="max-h-[320px] overflow-auto">
              <table className="w-full min-w-[620px] border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-ink text-[10px] uppercase tracking-wide text-gold-deep">
                  <tr className="border-b border-gold/20">
                    <th className="px-2 py-2 font-bold">Colaborador</th>
                    <th className="px-2 py-2 text-right font-bold">Obrigatórios</th>
                    <th className="px-2 py-2 text-right font-bold">Concluídos</th>
                    <th className="px-2 py-2 text-right font-bold">Pendentes</th>
                    <th className="px-2 py-2 text-right font-bold">Progresso</th>
                    <th className="px-2 py-2 font-bold">Última leitura</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.byUser.map((row) => (
                    <tr key={row.userId} className="border-b border-gold/10 text-zinc-300 last:border-0">
                      <td className="max-w-[220px] truncate px-2 py-2" title={row.email ?? row.name}>
                        {row.name}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{int(row.mandatory)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-emerald-400">{int(row.completed)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-rose-300">{int(row.pending)}</td>
                      <td className="px-2 py-2 text-right font-semibold tabular-nums">
                        {row.progressPercent === null ? "—" : `${row.progressPercent}%`}
                      </td>
                      <td className="px-2 py-2 text-zinc-500">{formatDate(row.lastReadAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </>
      ) : null}
    </section>
  );
}

function Card({
  icon: Icon,
  label,
  value,
  hint,
  tone
}: {
  icon: typeof Route;
  label: string;
  value: string;
  hint?: string;
  tone?: "danger";
}) {
  return (
    <div className="rounded-2xl border border-gold/25 bg-gradient-to-br from-[#18150F] to-[#0D0C09] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">
        <Icon className="h-4 w-4" />
        <span className="truncate" title={label}>
          {label}
        </span>
      </div>
      <p className={`truncate text-2xl font-light ${tone === "danger" ? "text-rose-300" : "text-white"}`} title={value}>
        {value}
      </p>
      {hint ? <p className="truncate text-[10px] text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "Nunca";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
