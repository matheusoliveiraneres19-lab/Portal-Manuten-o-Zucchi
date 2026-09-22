-- IMPORTAÇÃO INCREMENTAL DO PC-FACTORY.
--
-- ADITIVA: acrescenta uma coluna nullable e um índice. Nenhuma linha existente
-- é apagada ou alterada por esta migration — nem em PcFactoryRecord, nem em
-- qualquer outra tabela. Nada de TRUNCATE, nada de DELETE.
--
-- `fingerprint` é a identidade determinística do EVENTO (SHA-1 dos campos de
-- negócio). É sobre ela que a importação incremental faz
-- `createMany({ skipDuplicates: true })`: reimportar um mês já carregado passa a
-- não inserir nada em vez de duplicar horas.
--
-- Fica NULLABLE porque os 71 mil registros já gravados não a têm. O backfill
-- (`npm run backfill:pc-factory-fingerprint`) recalcula a chave a partir das
-- COLUNAS JÁ PERSISTIDAS e preenche todos. Enquanto houver NULL, o índice único
-- não reclama: no PostgreSQL um índice UNIQUE aceita vários NULLs.
--
-- Idempotente (IF NOT EXISTS) para poder rodar por `prisma db execute` no
-- Supabase sem risco em reexecução.

-- AlterTable
ALTER TABLE "PcFactoryRecord" ADD COLUMN IF NOT EXISTS "fingerprint" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PcFactoryRecord_fingerprint_key"
    ON "PcFactoryRecord"("fingerprint");
