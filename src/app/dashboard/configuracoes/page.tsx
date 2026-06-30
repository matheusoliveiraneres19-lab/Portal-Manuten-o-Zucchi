import { ConfiguracoesPage } from "@/components/configuracoes/ConfiguracoesPage";
import { getSession } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/services/settings.service";
import { getAuditLogs, getImportHistory, getSystemTechnicalStatus } from "@/services/audit.service";
import type { PortalSettingDTO } from "@/types/settings";
import type { AuditLogDTO, ImportHistoryDTO, SystemTechnicalStatus } from "@/types/audit";

export const dynamic = "force-dynamic";

const EDIT_ROLES = ["ADMIN", "GESTOR"];
// Histórico/auditoria detalhados só para administradores e gestores.
const ADMIN_ROLES = ["ADMIN", "GESTOR"];

export default async function ConfiguracoesRoute() {
  const session = await getSession();
  const canEdit = Boolean(session && EDIT_ROLES.includes(session.role));
  const canAudit = Boolean(session && ADMIN_ROLES.includes(session.role));

  const [settings, usersCount, importHistory, auditLogs, systemStatus] = await Promise.all([
    safeSettings(),
    safeUsersCount(),
    canAudit ? safeImportHistory() : Promise.resolve([]),
    canAudit ? safeAuditLogs() : Promise.resolve([]),
    safeSystemStatus()
  ]);

  const settingsByCategory: Record<string, PortalSettingDTO[]> = {};
  for (const setting of settings) {
    (settingsByCategory[setting.category] ??= []).push(setting);
  }

  // Alertas ativos = configurações da categoria "alertas" habilitadas (boolean true).
  const activeAlerts = settings.length
    ? settings.filter((s) => s.category === "alertas" && s.value === true).length
    : null;

  return (
    <ConfiguracoesPage
      settingsByCategory={settingsByCategory}
      canEdit={canEdit}
      canAudit={canAudit}
      usersCount={usersCount}
      activeAlerts={activeAlerts}
      importHistory={importHistory}
      auditLogs={auditLogs}
      systemStatus={systemStatus}
    />
  );
}

async function safeSettings(): Promise<PortalSettingDTO[]> {
  try {
    return await getSettings();
  } catch (error) {
    console.error("Falha ao carregar configurações.", error);
    return [];
  }
}

async function safeUsersCount(): Promise<number | null> {
  try {
    return await prisma.user.count();
  } catch (error) {
    console.error("Falha ao contar usuários.", error);
    return null;
  }
}

async function safeImportHistory(): Promise<ImportHistoryDTO[]> {
  try {
    return await getImportHistory({ limit: 200 });
  } catch (error) {
    console.error("Falha ao carregar histórico de importações.", error);
    return [];
  }
}

async function safeAuditLogs(): Promise<AuditLogDTO[]> {
  try {
    return await getAuditLogs({ limit: 200 });
  } catch (error) {
    console.error("Falha ao carregar auditoria.", error);
    return [];
  }
}

async function safeSystemStatus(): Promise<SystemTechnicalStatus | null> {
  try {
    return await getSystemTechnicalStatus();
  } catch (error) {
    console.error("Falha ao carregar status técnico.", error);
    return null;
  }
}
