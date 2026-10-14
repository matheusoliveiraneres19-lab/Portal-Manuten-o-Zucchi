-- ANÁLISE MRP — compras lidas do Portal (sem planilha de compras no MRP).
--
-- MrpPurchaseImport passa a registrar a ORIGEM do snapshot de compras:
--   FILE_UPLOAD — planilha enviada ao MRP (todos os registros já existentes);
--   PORTAL_DB   — snapshot de PurchaseRecord gerado na execução da análise.
-- `metadata` guarda o lote de compras lido e as contagens do snapshot.
--
-- ADITIVA e idempotente: só a tabela MRP "MrpPurchaseImport". As linhas
-- existentes recebem 'FILE_UPLOAD' (o que de fato são) e metadata NULL.
ALTER TABLE "MrpPurchaseImport" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'FILE_UPLOAD';
ALTER TABLE "MrpPurchaseImport" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
