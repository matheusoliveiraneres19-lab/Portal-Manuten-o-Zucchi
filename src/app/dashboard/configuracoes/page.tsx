import { ConfiguracoesPage } from "@/components/configuracoes/ConfiguracoesPage";
import { getSession } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/services/settings.service";
import type { PortalSettingDTO } from "@/types/settings";

export const dynamic = "force-dynamic";

const EDIT_ROLES = ["ADMIN", "GESTOR"];

export default async function ConfiguracoesRoute() {
  const session = await getSession();
  const canEdit = Boolean(session && EDIT_ROLES.includes(session.role));

  const [settings, usersCount] = await Promise.all([safeSettings(), safeUsersCount()]);

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
      usersCount={usersCount}
      activeAlerts={activeAlerts}
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
