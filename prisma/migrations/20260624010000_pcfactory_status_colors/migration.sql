-- Distribuição de horas por status real do PC-Factory: captura a chave canônica do
-- status (statusKey) e a cor lida da planilha na importação (statusColorHex).
-- Colunas nullable (sem default, sem CREATE TYPE) — seguro para aplicar no Supabase
-- via apply_migration. Após aplicar, reimportar os registros para popular as colunas.
ALTER TABLE "PcFactoryRecord"
  ADD COLUMN IF NOT EXISTS "statusKey" TEXT,
  ADD COLUMN IF NOT EXISTS "statusColorHex" TEXT;

CREATE INDEX IF NOT EXISTS "PcFactoryRecord_statusKey_idx" ON "PcFactoryRecord"("statusKey");
