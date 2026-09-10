-- Infraestrutura de importação sobre Supabase Pro: rastreio do arquivo no
-- Storage + área de staging genérica.
--
-- 100% ADITIVA. Nenhuma coluna é removida ou renomeada, nenhum dado é apagado e
-- nenhum tipo existente muda. As importações já gravadas continuam válidas: as
-- colunas novas ficam NULL (ou 0) e a UI trata isso como "importação anterior à
-- infra de Storage".
--
-- Todas as instruções são idempotentes (IF NOT EXISTS), então reaplicar o
-- arquivo à mão — ou aplicá-lo sobre um banco onde parte já existe — é seguro.

-- 1) ImportHistory: rastreio do arquivo original e ciclo de vida da importação.
--
--    `status` (enum ImportStatus) NÃO muda: continua sendo o resultado final que
--    os cinco importadores atuais gravam e que a aba Configurações lê.
--    `stage` é o ciclo de vida novo (UPLOADED/VALIDATING/PROCESSING/COMPLETED/
--    FAILED/CANCELLED), gravado só pelo import-orchestrator. É TEXT, não enum,
--    para não exigir CREATE TYPE nem migration a cada estado novo — mesma
--    decisão já tomada em AuditLog.action/module.
ALTER TABLE "ImportHistory" ADD COLUMN IF NOT EXISTS "stage"       TEXT;
ALTER TABLE "ImportHistory" ADD COLUMN IF NOT EXISTS "bucket"      TEXT;
ALTER TABLE "ImportHistory" ADD COLUMN IF NOT EXISTS "filePath"    TEXT;
ALTER TABLE "ImportHistory" ADD COLUMN IF NOT EXISTS "fileSize"    INTEGER;
ALTER TABLE "ImportHistory" ADD COLUMN IF NOT EXISTS "mimeType"    TEXT;
ALTER TABLE "ImportHistory" ADD COLUMN IF NOT EXISTS "validRows"   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportHistory" ADD COLUMN IF NOT EXISTS "ignoredRows" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportHistory" ADD COLUMN IF NOT EXISTS "startedAt"   TIMESTAMP(3);
ALTER TABLE "ImportHistory" ADD COLUMN IF NOT EXISTS "finishedAt"  TIMESTAMP(3);
ALTER TABLE "ImportHistory" ADD COLUMN IF NOT EXISTS "metadata"    JSONB;
-- Nullable de propósito: com `@updatedAt` NOT NULL o Prisma exigiria backfill
-- das linhas antigas, e "atualizado em" de uma importação que nunca foi
-- atualizada é NULL mesmo, não a data da migration.
ALTER TABLE "ImportHistory" ADD COLUMN IF NOT EXISTS "updatedAt"   TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "ImportHistory_stage_idx"           ON "ImportHistory"("stage");
CREATE INDEX IF NOT EXISTS "ImportHistory_type_createdAt_idx"  ON "ImportHistory"("type", "createdAt");

-- 2) ImportStagingRow: toda linha de uma importação grande passa por aqui ANTES
--    de tocar a base oficial. É o que protege PC-Factory, Compras, OS e
--    Lubrificantes de ficarem com a base vazia quando a planilha falha no meio.
CREATE TABLE IF NOT EXISTS "ImportStagingRow" (
    "id"              TEXT NOT NULL,
    "importHistoryId" TEXT NOT NULL,
    "module"          TEXT NOT NULL,
    "rowNumber"       INTEGER NOT NULL,
    "raw"             JSONB NOT NULL,
    "normalized"      JSONB,
    "status"          TEXT NOT NULL,
    "errorMessage"    TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportStagingRow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ImportStagingRow_importHistoryId_idx"        ON "ImportStagingRow"("importHistoryId");
CREATE INDEX IF NOT EXISTS "ImportStagingRow_module_idx"                 ON "ImportStagingRow"("module");
CREATE INDEX IF NOT EXISTS "ImportStagingRow_status_idx"                 ON "ImportStagingRow"("status");
CREATE INDEX IF NOT EXISTS "ImportStagingRow_importHistoryId_status_idx" ON "ImportStagingRow"("importHistoryId", "status");

-- ON DELETE CASCADE: descartar um histórico descarta o staging junto — o staging
-- é lixo de processo, não base oficial. Envolvido em DO $$ porque o Postgres não
-- aceita "ADD CONSTRAINT IF NOT EXISTS".
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ImportStagingRow_importHistoryId_fkey'
  ) THEN
    ALTER TABLE "ImportStagingRow"
      ADD CONSTRAINT "ImportStagingRow_importHistoryId_fkey"
      FOREIGN KEY ("importHistoryId") REFERENCES "ImportHistory"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- RLS habilitado sem policies, como nas demais tabelas do portal: o Prisma se
-- conecta com role de serviço (ignora RLS) e nenhum cliente anônimo enxerga a
-- tabela — o staging carrega a planilha crua e não pode vazar pela API pública.
ALTER TABLE "ImportStagingRow" ENABLE ROW LEVEL SECURITY;
