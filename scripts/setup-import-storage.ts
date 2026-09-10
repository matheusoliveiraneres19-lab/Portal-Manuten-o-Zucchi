/**
 * Cria (ou confirma) o bucket PRIVADO das planilhas de importação.
 *
 *   npm run storage:setup-imports
 *
 * Idempotente: se o bucket já existir, apenas relata a configuração atual.
 * Roda uma vez por projeto Supabase (dev e produção têm buckets separados).
 *
 * Precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env. O script NÃO
 * imprime nenhuma das duas — só se estão presentes.
 */
import { getSupabaseAdminClient, supabaseServerConfigured } from "../src/lib/supabase-server";
import { ensureImportsBucket } from "../src/services/import-storage.service";
import { getImportsBucket, getMaxImportBytes, IMPORT_MODULE_SLUGS } from "../src/types/imports";

async function main() {
  if (!supabaseServerConfigured()) {
    console.error(
      "✗ Supabase não configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env antes de rodar."
    );
    process.exitCode = 1;
    return;
  }

  const bucket = getImportsBucket();
  console.log(`Bucket de importações: ${bucket}`);

  const { created } = await ensureImportsBucket(bucket);
  console.log(created ? "✓ Bucket criado (privado)." : "• Bucket já existia — nada a fazer.");

  // Confirma que o bucket está mesmo PRIVADO. Um bucket público exporia todas as
  // planilhas operacionais do portal a qualquer um com a URL — vale gritar.
  const { data: info, error } = await getSupabaseAdminClient().storage.getBucket(bucket);
  if (error) {
    console.error("✗ Não foi possível ler a configuração do bucket:", error.message);
    process.exitCode = 1;
    return;
  }

  if (info?.public) {
    console.error(
      `✗ ATENÇÃO: o bucket "${bucket}" está PÚBLICO. Torne-o privado em ` +
        "Supabase > Storage > Configuration antes de importar qualquer planilha."
    );
    process.exitCode = 1;
    return;
  }

  console.log("✓ Bucket privado.");
  console.log(`  Limite por arquivo: ${(getMaxImportBytes() / (1024 * 1024)).toFixed(0)} MB`);
  console.log("  Pastas usadas (criadas sob demanda, no primeiro upload de cada módulo):");
  for (const slug of Object.values(IMPORT_MODULE_SLUGS)) {
    console.log(`    imports/${slug}/<ano>/<mes>/`);
  }
}

main().catch((error) => {
  console.error("Falha ao preparar o bucket de importações:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
