"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Database,
  Factory,
  FileSpreadsheet,
  History,
  ScrollText,
  ShieldCheck,
  ShoppingCart,
  XCircle
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  AUDIT_ACTION_LABELS,
  AUDIT_MODULE_LABELS,
  IMPORT_STATUS_LABELS,
  IMPORT_TYPE_LABELS,
  type AuditLogDTO,
  type ImportHistoryDTO,
  type SystemTechnicalStatus
} from "@/types/audit";

type AdminPanelsProps = {
  importHistory: ImportHistoryDTO[];
  auditLogs: AuditLogDTO[];
  systemStatus: SystemTechnicalStatus | null;
};

const inputClass =
  "rounded-lg border border-gold/25 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-gold/60";
const labelClass = "text-[11px] font-semibold uppercase tracking-wide text-champagne/70";

function formatDateTime(iso: string): string {
  // Renderiza no client; mantém consistência com o restante do portal (pt-BR).
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Converte um input date (yyyy-mm-dd) para limites do dia, ou null. */
function dayBounds(value: string, edge: "start" | "end"): number | null {
  if (!value) return null;
  const ms = new Date(`${value}T${edge === "start" ? "00:00:00" : "23:59:59.999"}`).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "SUCESSO"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
      : status === "PARCIAL"
        ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
        : status === "ERRO"
          ? "border-red-400/30 bg-red-400/10 text-red-300"
          : "border-zinc-400/30 bg-zinc-400/10 text-zinc-300";
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      {IMPORT_STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function AdminPanels({ importHistory, auditLogs, systemStatus }: AdminPanelsProps) {
  return (
    <div className="mt-8 space-y-8">
      <ImportHistoryPanel rows={importHistory} />
      <AuditLogPanel rows={auditLogs} />
      <SystemStatusPanel status={systemStatus} />
    </div>
  );
}

/* ----------------------------- 1) Importações ----------------------------- */

function ImportHistoryPanel({ rows }: { rows: ImportHistoryDTO[] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");

  const types = useMemo(() => Array.from(new Set(rows.map((r) => r.type))), [rows]);
  const statuses = useMemo(() => Array.from(new Set(rows.map((r) => r.status))), [rows]);

  const filtered = useMemo(() => {
    const fromMs = dayBounds(from, "start");
    const toMs = dayBounds(to, "end");
    return rows.filter((r) => {
      const t = new Date(r.createdAt).getTime();
      if (fromMs !== null && t < fromMs) return false;
      if (toMs !== null && t > toMs) return false;
      if (type && r.type !== type) return false;
      if (status && r.status !== status) return false;
      return true;
    });
  }, [rows, from, to, type, status]);

  return (
    <section className="rounded-lg border border-gold/25 bg-black/45 p-5 shadow-[0_14px_36px_rgba(0,0,0,0.3)] backdrop-blur">
      <PanelHeader icon={History} title="Histórico de Importações" subtitle={`${filtered.length} de ${rows.length} registro(s)`} />

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="De">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Até">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Módulo">
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
            <option value="">Todos</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {IMPORT_TYPE_LABELS[t] ?? t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
            <option value="">Todos</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {IMPORT_STATUS_LABELS[s] ?? s}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gold/20 text-[11px] uppercase tracking-wide text-champagne/70">
              <th className="px-3 py-2 font-semibold">Data</th>
              <th className="px-3 py-2 font-semibold">Módulo</th>
              <th className="px-3 py-2 font-semibold">Arquivo</th>
              <th className="px-3 py-2 text-right font-semibold">Linhas</th>
              <th className="px-3 py-2 text-right font-semibold">Criadas</th>
              <th className="px-3 py-2 text-right font-semibold">Atualizadas</th>
              <th className="px-3 py-2 text-right font-semibold">Erros</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Usuário</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <EmptyRow colSpan={9} message="Nenhuma importação no período/filtros selecionados." />
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-b border-white/5 text-zinc-200 hover:bg-white/[0.03]">
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-400">{formatDateTime(r.createdAt)}</td>
                  <td className="px-3 py-2">{r.moduleLabel}</td>
                  <td className="max-w-[220px] truncate px-3 py-2" title={r.fileName}>
                    {r.fileName}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.totalRows}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-300">{r.createdRows}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-sky-300">{r.updatedRows}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-300">{r.errorRows}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="max-w-[160px] truncate px-3 py-2 text-zinc-400" title={r.importedBy ?? "—"}>
                    {r.importedBy ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ----------------------------- 2) Auditoria ------------------------------- */

function AuditLogPanel({ rows }: { rows: AuditLogDTO[] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [module, setModule] = useState("");
  const [action, setAction] = useState("");
  const [user, setUser] = useState("");

  const modules = useMemo(() => Array.from(new Set(rows.map((r) => r.module))), [rows]);
  const actions = useMemo(() => Array.from(new Set(rows.map((r) => r.action))), [rows]);

  const filtered = useMemo(() => {
    const fromMs = dayBounds(from, "start");
    const toMs = dayBounds(to, "end");
    const u = user.trim().toLowerCase();
    return rows.filter((r) => {
      const t = new Date(r.createdAt).getTime();
      if (fromMs !== null && t < fromMs) return false;
      if (toMs !== null && t > toMs) return false;
      if (module && r.module !== module) return false;
      if (action && r.action !== action) return false;
      if (u && !(r.userName ?? "").toLowerCase().includes(u) && !(r.userId ?? "").toLowerCase().includes(u)) return false;
      return true;
    });
  }, [rows, from, to, module, action, user]);

  return (
    <section className="rounded-lg border border-gold/25 bg-black/45 p-5 shadow-[0_14px_36px_rgba(0,0,0,0.3)] backdrop-blur">
      <PanelHeader icon={ShieldCheck} title="Auditoria do Sistema" subtitle={`${filtered.length} de ${rows.length} ação(ões)`} />

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Field label="De">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Até">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Módulo">
          <select value={module} onChange={(e) => setModule(e.target.value)} className={inputClass}>
            <option value="">Todos</option>
            {modules.map((m) => (
              <option key={m} value={m}>
                {AUDIT_MODULE_LABELS[m] ?? m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tipo de ação">
          <select value={action} onChange={(e) => setAction(e.target.value)} className={inputClass}>
            <option value="">Todas</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {AUDIT_ACTION_LABELS[a] ?? a}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Usuário">
          <input
            type="text"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="nome ou login"
            className={inputClass}
          />
        </Field>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gold/20 text-[11px] uppercase tracking-wide text-champagne/70">
              <th className="px-3 py-2 font-semibold">Data/Hora</th>
              <th className="px-3 py-2 font-semibold">Usuário</th>
              <th className="px-3 py-2 font-semibold">Ação</th>
              <th className="px-3 py-2 font-semibold">Módulo</th>
              <th className="px-3 py-2 font-semibold">Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <EmptyRow colSpan={5} message="Nenhuma ação auditada no período/filtros selecionados." />
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-b border-white/5 text-zinc-200 hover:bg-white/[0.03]">
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-400">{formatDateTime(r.createdAt)}</td>
                  <td className="px-3 py-2">{r.userName ?? r.userId ?? "—"}</td>
                  <td className="px-3 py-2">{r.actionLabel}</td>
                  <td className="px-3 py-2 text-zinc-400">{r.moduleLabel}</td>
                  <td className="max-w-[280px] px-3 py-2 text-zinc-400">
                    <DetailCell entityName={r.entityName} details={r.details} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DetailCell({ entityName, details }: { entityName: string | null; details: Record<string, unknown> | null }) {
  const extra =
    details && Object.keys(details).length > 0
      ? Object.entries(details)
          .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
          .join(" · ")
      : "";
  return (
    <div className="min-w-0">
      {entityName ? <span className="text-zinc-200">{entityName}</span> : null}
      {extra ? <span className="block truncate text-[11px] text-zinc-500" title={extra}>{extra}</span> : null}
      {!entityName && !extra ? "—" : null}
    </div>
  );
}

/* --------------------------- 3) Status técnico ---------------------------- */

function SystemStatusPanel({ status }: { status: SystemTechnicalStatus | null }) {
  const dbOk = status?.database === "conectado";
  const authOk = status?.auth === "ativa";

  const lastBy = (type: string) => status?.lastImports.find((i) => i.type === type) ?? null;
  const pcf = lastBy("PC_FACTORY");
  const os = lastBy("ORDENS_SERVICO");
  const compras = lastBy("COMPRAS");

  const fmt = (at: string | null) => (at ? formatDateTime(at) : "—");

  const cards: Array<{ icon: LucideIcon; title: string; value: string; sub?: string; ok?: boolean | null }> = [
    { icon: Database, title: "Banco de Dados", value: dbOk ? "Conectado" : "Desconectado", ok: dbOk },
    { icon: ShieldCheck, title: "Autenticação", value: authOk ? "Ativa" : "Inativa", ok: authOk },
    { icon: Cloud, title: "Deploy", value: status?.deploy ?? "—", ok: null },
    { icon: Factory, title: "Última Imp. PC-Factory", value: fmt(pcf?.at ?? null), sub: pcf?.fileName ?? undefined, ok: null },
    { icon: FileSpreadsheet, title: "Última Imp. Ordens", value: fmt(os?.at ?? null), sub: os?.fileName ?? undefined, ok: null },
    { icon: ShoppingCart, title: "Última Imp. Compras", value: fmt(compras?.at ?? null), sub: compras?.fileName ?? undefined, ok: null }
  ];

  return (
    <section className="rounded-lg border border-gold/25 bg-black/45 p-5 shadow-[0_14px_36px_rgba(0,0,0,0.3)] backdrop-blur">
      <PanelHeader icon={ScrollText} title="Status Técnico" subtitle="Indicadores seguros do ambiente (sem dados sensíveis)" />

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          const tone =
            c.ok === true
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
              : c.ok === false
                ? "border-red-400/30 bg-red-400/10 text-red-300"
                : "border-gold/30 bg-gold/10 text-gold";
          return (
            <div key={c.title} className="flex items-center gap-3 rounded-lg border border-gold/15 bg-black/30 p-4">
              <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border ${tone}`}>
                {c.ok === true ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : c.ok === false ? (
                  <XCircle className="h-5 w-5" />
                ) : (
                  <Icon className="h-5 w-5" strokeWidth={1.8} />
                )}
              </div>
              <div className="min-w-0">
                <h4 className="text-[11px] font-extrabold uppercase tracking-wide text-champagne/80">{c.title}</h4>
                <p className="truncate text-base font-light text-white" title={c.value}>
                  {c.value}
                </p>
                {c.sub ? (
                  <p className="truncate text-[11px] text-zinc-500" title={c.sub}>
                    {c.sub}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Último erro registrado */}
      <div className="mt-4 flex items-start gap-3 rounded-lg border border-red-400/20 bg-red-500/5 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
        <div className="min-w-0">
          <h4 className="text-[11px] font-extrabold uppercase tracking-wide text-red-300/80">Último Erro Registrado</h4>
          {status?.lastError ? (
            <>
              <p className="text-sm text-zinc-200">
                {status.lastError.moduleLabel} — <span className="text-zinc-400">{formatDateTime(status.lastError.at)}</span>
              </p>
              <p className="mt-0.5 break-words text-[12px] text-zinc-400">{status.lastError.message}</p>
            </>
          ) : (
            <p className="text-sm text-zinc-400">Nenhum erro de importação registrado.</p>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------- Helpers UI ------------------------------- */

function PanelHeader({ icon: Icon, title, subtitle }: { icon: LucideIcon; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2 text-champagne">
      <Icon className="h-4 w-4 text-gold" />
      <h2 className="text-sm font-bold uppercase tracking-[0.2em]">{title}</h2>
      {subtitle ? <span className="ml-2 text-[11px] font-normal normal-case tracking-normal text-zinc-500">{subtitle}</span> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-8 text-center text-sm text-zinc-500">
        {message}
      </td>
    </tr>
  );
}
