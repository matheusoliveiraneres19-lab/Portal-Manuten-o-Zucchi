"use client";

import { useEffect, useState } from "react";
import { m } from "framer-motion";
import {
  Bell,
  BellRing,
  ChevronRight,
  ClipboardList,
  Cloud,
  Database,
  FileText,
  FileUp,
  Factory,
  Gem,
  History,
  Lock,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Tag,
  Target,
  Upload,
  UsersRound,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type StatusTone = "green" | "gold" | "blue" | "champagne";

const statusTone: Record<StatusTone, string> = {
  green: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  gold: "border-gold/40 bg-gold/15 text-gold",
  blue: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  champagne: "border-champagne/30 bg-champagne/10 text-champagne"
};

type StatusCard = {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
  tone: StatusTone;
  live?: boolean;
};

const STATUS_CARDS: StatusCard[] = [
  { title: "Banco de Dados", value: "Conectado", description: "Status da conexão principal do portal.", icon: Database, tone: "green", live: true },
  { title: "Versão do Portal", value: "V.01", description: "Versão atual do sistema.", icon: Tag, tone: "gold" },
  { title: "Ambiente", value: "Produção", description: "Deploy ativo na Vercel.", icon: Cloud, tone: "blue" },
  { title: "Última Importação", value: "—", description: "Último arquivo processado pelo portal.", icon: FileUp, tone: "champagne" },
  { title: "Usuários Ativos", value: "—", description: "Total de usuários cadastrados.", icon: UsersRound, tone: "champagne" },
  { title: "Alertas Ativos", value: "—", description: "Regras de alertas habilitadas.", icon: BellRing, tone: "champagne" }
];

type SettingsSection = {
  key: string;
  title: string;
  description: string;
  icon: LucideIcon;
  planned: string[];
};

const SECTIONS: SettingsSection[] = [
  {
    key: "geral",
    title: "Geral",
    description: "Nome do portal, versão, logo, empresa e preferências gerais.",
    icon: SlidersHorizontal,
    planned: ["Nome e identidade do portal", "Logo e marca da empresa", "Dados da empresa (CNPJ, unidade)", "Fuso horário e formato de data", "Preferências de exibição"]
  },
  {
    key: "metas",
    title: "Metas dos Indicadores",
    description: "Configure metas de aderência, disponibilidade, atrasos e horas.",
    icon: Target,
    planned: ["Meta de aderência preventiva", "Meta de disponibilidade", "Limite de atraso de OS", "Meta de horas apontadas", "Limite de backlog preventivo"]
  },
  {
    key: "os",
    title: "Regras de Ordens de Serviço",
    description: "Configure regras de OS realizadas, prefixos PL/PV e horas mínimas.",
    icon: ClipboardList,
    planned: ["Prefixos PL e PV", "Horas mínimas para “realizada” (0,1 h)", "Mapeamento de status do SAP", "Classificação gerencial das OS"]
  },
  {
    key: "pc-factory",
    title: "Regras PC-Factory",
    description: "Configure status, tempo oficial, cores e classificações do Management View.",
    icon: Factory,
    planned: ["Status que contam como manutenção", "Base oficial de tempo (Tempo Decorrido)", "Cores por status", "Classificações do Management View"]
  },
  {
    key: "compras",
    title: "Regras de Compras",
    description: "Configure Y01, Y04, serviços, bloqueados, atrasos e recebimentos.",
    icon: ShoppingCart,
    planned: ["Y01 (compra normal)", "Y04 (regularização)", "Serviços", "Itens bloqueados", "Regras de atraso e recebimento"]
  },
  {
    key: "importacoes",
    title: "Importações",
    description: "Acompanhe histórico e parâmetros das importações de planilhas.",
    icon: Upload,
    planned: ["Histórico de importações", "Layouts de planilha aceitos", "Validações de importação", "Reprocessamento de arquivos"]
  },
  {
    key: "permissoes",
    title: "Usuários e Permissões",
    description: "Controle permissões por perfil e acesso aos módulos.",
    icon: ShieldCheck,
    planned: ["Perfis (Admin, Gestor, Operador)", "Acesso por módulo", "Gestão de usuários", "Política de senha"]
  },
  {
    key: "procedimentos",
    title: "Central de Procedimentos",
    description: "Configure categorias, leitura, exclusão e trilha de funcionário novo.",
    icon: FileText,
    planned: ["Categorias de procedimentos", "Controle de leitura", "Edição e exclusão", "Trilha de funcionário novo"]
  },
  {
    key: "alertas",
    title: "Alertas",
    description: "Configure alertas de OS atrasada, compra vencida, PC-Factory e preventivas.",
    icon: Bell,
    planned: ["OS atrasada", "Compra vencida", "Parada no PC-Factory", "Preventiva não executada", "Canais de notificação"]
  },
  {
    key: "auditoria",
    title: "Auditoria",
    description: "Consulte ações sensíveis realizadas dentro do portal.",
    icon: History,
    planned: ["Ações sensíveis", "Login e logout", "Alterações de regras", "Exportações de dados"]
  }
];

const CRITICAL_RULES: Array<{ label: string; value: string }> = [
  { label: "OS realizada", value: "Trabalho real > 0,1 h" },
  { label: "OS não realizada", value: "Trabalho real ≤ 0,1 h" },
  { label: "Prefixo Lubrificação", value: "PL -" },
  { label: "Prefixo Preventiva Elétrica", value: "PV -" },
  { label: "PC-Factory", value: "Base oficial Tempo Decorrido / durationHours" },
  { label: "Compras Y04", value: "Regularização" },
  { label: "Compras Y01", value: "Compra normal" },
  { label: "Bloqueados", value: "Fora dos KPIs principais" }
];

export function ConfiguracoesPage() {
  const [activeSection, setActiveSection] = useState<SettingsSection | null>(null);

  return (
    <section className="relative overflow-hidden rounded-lg border border-gold/20 bg-[#060707] shadow-premium">
      <div className="login-marble-bg absolute inset-0 opacity-90" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.72),rgba(0,0,0,0.42)),radial-gradient(circle_at_84%_12%,rgba(196,154,69,0.16),transparent_24rem)]" />

      <div className="relative z-10 px-4 py-7 sm:px-6 lg:px-8">
        {/* Cabeçalho */}
        <header className="max-w-4xl">
          <div className="mb-4 flex items-center gap-3 text-gold">
            <Gem className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-[0.28em] text-champagne/80">
              Portal de Gestão da Manutenção
            </span>
          </div>
          <h1 className="font-serif text-4xl leading-tight text-white sm:text-5xl">Configurações</h1>
          <p className="mt-4 text-base leading-relaxed text-zinc-200">
            Gerencie parâmetros, metas, regras, importações, permissões e alertas do Portal de Gestão da Manutenção
            Zucchi.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Use esta área para ajustar as regras que alimentam os dashboards e controlar parâmetros administrativos do
            portal.
          </p>
        </header>

        {/* Cards de status */}
        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STATUS_CARDS.map((card, index) => {
            const Icon = card.icon;
            return (
              <m.article
                key={card.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.04, ease: "easeOut" }}
                className="flex items-center gap-4 rounded-lg border border-gold/25 bg-black/45 p-4 shadow-[0_14px_36px_rgba(0,0,0,0.34)] backdrop-blur"
              >
                <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border ${statusTone[card.tone]}`}>
                  <Icon className="h-6 w-6" strokeWidth={1.8} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-champagne/80">{card.title}</h3>
                  <div className="mt-0.5 flex items-center gap-2">
                    {card.live ? <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> : null}
                    <span className="truncate text-xl font-light text-white" title={card.value}>{card.value}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-zinc-400">{card.description}</p>
                </div>
              </m.article>
            );
          })}
        </div>

        {/* Seções administrativas */}
        <div className="mt-8 flex items-center gap-2 text-champagne">
          <Settings className="h-4 w-4 text-gold" />
          <h2 className="text-sm font-bold uppercase tracking-[0.2em]">Seções de Configuração</h2>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {SECTIONS.map((section, index) => {
            const Icon = section.icon;
            return (
              <m.button
                key={section.key}
                type="button"
                onClick={() => setActiveSection(section)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.03, ease: "easeOut" }}
                className="group flex items-start gap-4 rounded-lg border border-gold/25 bg-black/45 p-5 text-left shadow-[0_14px_36px_rgba(0,0,0,0.3)] backdrop-blur transition hover:-translate-y-0.5 hover:border-gold/50 hover:shadow-premium"
              >
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-gold/35 bg-gold/10 text-gold transition group-hover:bg-gold/20">
                  <Icon className="h-6 w-6" strokeWidth={1.7} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-white">{section.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-400">{section.description}</p>
                </div>
                <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-zinc-500 transition group-hover:translate-x-0.5 group-hover:text-gold" />
              </m.button>
            );
          })}
        </div>

        {/* Regras críticas do portal */}
        <div className="mt-8 rounded-lg border border-gold/25 bg-black/45 p-5 shadow-[0_14px_36px_rgba(0,0,0,0.3)] backdrop-blur">
          <div className="flex items-center gap-2 text-champagne">
            <Lock className="h-4 w-4 text-gold" />
            <h2 className="text-sm font-bold uppercase tracking-[0.2em]">Regras Críticas do Portal</h2>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Regras vigentes que alimentam os dashboards. Nesta fase são apenas exibidas — a edição entra nas próximas
            etapas.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {CRITICAL_RULES.map((rule) => (
              <div
                key={rule.label}
                className="flex items-center justify-between gap-3 rounded-lg border border-gold/15 bg-black/30 px-4 py-3"
              >
                <span className="text-sm text-zinc-300">{rule.label}</span>
                <span className="rounded-md border border-gold/25 bg-gold/5 px-2.5 py-1 text-right text-xs font-semibold text-champagne">
                  {rule.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <SectionPanel section={activeSection} onClose={() => setActiveSection(null)} />
    </section>
  );
}

function SectionPanel({ section, onClose }: { section: SettingsSection | null; onClose: () => void }) {
  useEffect(() => {
    if (!section) return;
    const handler = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [section, onClose]);

  if (!section) return null;
  const Icon = section.icon;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={section.title}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-gold/30 bg-[#0a0b0b] shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gold/20 p-5">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-gold/35 bg-gold/10 text-gold">
              <Icon className="h-6 w-6" strokeWidth={1.7} />
            </div>
            <div>
              <h2 className="font-serif text-xl text-white">{section.title}</h2>
              <p className="mt-1 text-sm text-zinc-400">{section.description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-gold/25 text-zinc-300 transition hover:border-gold/50 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-champagne/70">Configurações previstas</p>
          <ul className="mt-3 space-y-2">
            {section.planned.map((item) => (
              <li key={item} className="flex items-start gap-3 rounded-lg border border-gold/15 bg-black/30 px-4 py-3 text-sm text-zinc-200">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex items-start gap-3 rounded-lg border border-gold/30 bg-gold/10 p-4">
            <ScrollText className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
            <p className="text-sm leading-relaxed text-champagne">Configuração será ativada na próxima fase.</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
