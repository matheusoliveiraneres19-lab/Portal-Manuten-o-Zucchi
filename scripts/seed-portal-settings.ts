/**
 * Semeia as configurações padrão do portal (PortalSetting) no banco configurado
 * em DATABASE_URL. Idempotente — não sobrescreve valores já existentes.
 *
 * Replica seedDefaultSettings() sem importar o service (que usa react.cache,
 * indisponível fora do runtime do React).
 *
 *   npx tsx scripts/seed-portal-settings.ts
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SETTINGS } from "@/constants/portal-settings-defaults";

async function main() {
  const existing = await prisma.portalSetting.findMany({ select: { category: true, key: true } });
  const existingKeys = new Set(existing.map((row) => `${row.category}:${row.key}`));
  const missing = DEFAULT_SETTINGS.filter((s) => !existingKeys.has(`${s.category}:${s.key}`));

  if (missing.length) {
    await prisma.portalSetting.createMany({
      data: missing.map((s) => ({
        category: s.category,
        key: s.key,
        label: s.label,
        description: s.description ?? null,
        value: s.value as Prisma.InputJsonValue,
        valueType: s.valueType,
        isEditable: s.isEditable ?? true
      })),
      skipDuplicates: true
    });
  }

  const total = await prisma.portalSetting.count();
  console.log(`Configurações: ${missing.length} criadas de ${DEFAULT_SETTINGS.length} padrões. Total no banco: ${total}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
