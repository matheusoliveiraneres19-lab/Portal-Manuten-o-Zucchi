import {
  ClipboardList,
  Droplet,
  Factory,
  FileText,
  GraduationCap,
  MonitorSmartphone,
  ShieldCheck,
  Wrench,
  Zap,
  type LucideIcon
} from "lucide-react";
import type { ProcedureLevel } from "@/constants/procedure-categories";

/** Ícone por nome de categoria da Central de Procedimentos. */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "Funcionário Novo": GraduationCap,
  "SAP/Fiori": MonitorSmartphone,
  "PC-Factory": Factory,
  "Ordem de Serviço": ClipboardList,
  Segurança: ShieldCheck,
  Mecânica: Wrench,
  Elétrica: Zap,
  Lubrificação: Droplet
};

export function categoryIcon(name: string): LucideIcon {
  return CATEGORY_ICONS[name] ?? FileText;
}

/** Cores do badge de nível (consistentes em cards, tabela e detalhe). */
export const LEVEL_STYLES: Record<ProcedureLevel, string> = {
  Básico: "border-[#3f8f6b]/40 bg-[#3f8f6b]/15 text-[#7fd0ab]",
  Intermediário: "border-gold/40 bg-gold/15 text-champagne",
  Avançado: "border-danger/40 bg-danger/15 text-danger"
};

export function levelStyle(level: string): string {
  return LEVEL_STYLES[level as ProcedureLevel] ?? LEVEL_STYLES.Básico;
}
