-- Tabela Gerencial (Management View) do PC-Factory: captura o código do status
-- (RCODSTATUS) e o grupo gerencial derivado dele. Colunas nullable (sem default,
-- sem CREATE TYPE) — seguro para aplicar no Supabase via apply_migration.
-- Após aplicar, reimportar os registros para popular as duas colunas.
ALTER TABLE "PcFactoryRecord" ADD COLUMN     "managementGroup" TEXT,
ADD COLUMN     "statusCode" TEXT;
