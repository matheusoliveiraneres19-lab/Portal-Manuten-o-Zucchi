-- Adiciona os tipos de importação da Análise MRP ao enum ImportType.
--
-- ISOLADA DE PROPÓSITO (mesmo motivo de 20260910000000_add_import_type_local_instalacao):
-- o PostgreSQL proíbe USAR um valor de enum na mesma transação em que ele foi
-- criado. Nenhuma outra instrução fica nesta migration.
--
-- Aditiva: ADD VALUE não recria o enum nem altera linha nenhuma de ImportHistory.
ALTER TYPE "ImportType" ADD VALUE IF NOT EXISTS 'MRP_BASE';
ALTER TYPE "ImportType" ADD VALUE IF NOT EXISTS 'MRP_STOCK';
ALTER TYPE "ImportType" ADD VALUE IF NOT EXISTS 'MRP_PURCHASES';
