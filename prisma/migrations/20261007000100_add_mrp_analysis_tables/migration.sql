-- ANÁLISE MRP (FASE B) — tabelas de persistência da migração do
-- "Analise_MRP_Compacto (1).html" para o Portal.
--
-- ADITIVA: só CREATE TABLE / CREATE INDEX / ADD CONSTRAINT em tabelas NOVAS.
-- Nenhuma tabela existente é alterada (Purchase, PurchaseRecord, Material,
-- MaterialMovement, ServiceOrder, PcFactoryRecord… intactas). As únicas FKs para
-- tabela existente apontam para "ImportHistory" com ON DELETE SET NULL — apagar
-- um histórico nunca apaga dado do MRP, e o MRP nunca apaga histórico.
--
-- Quantidades em DECIMAL(65,30): ida e volta exata do Number do JS. O float8 NÃO
-- é exato neste banco (extra_float_digits = 0 corta em 15 dígitos) — ver
-- scripts/mrp/test-numeric-precision.ts e a migration 20261007000200.
-- Datas de compra em TEXT ISO, porque o cmpOrdem() do HTML compara a chave como string.
--
-- Idempotente (IF NOT EXISTS / checagem de constraint) para ser aplicada com
-- `npx prisma db execute` no Supabase, como as migrations anteriores.
-- Depende de 20261007000000_add_import_type_mrp (aplicar antes).

-- CreateTable
CREATE TABLE IF NOT EXISTS "MrpBaseVersion" (
    "id" TEXT NOT NULL,
    "importHistoryId" TEXT,
    "fileName" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sheets" JSONB NOT NULL,
    "ignoredSheets" JSONB NOT NULL,
    "defaultArea" TEXT NOT NULL,
    "materialCount" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),

    CONSTRAINT "MrpBaseVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MrpBaseMaterial" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "min" DECIMAL(65,30) NOT NULL,
    "max" DECIMAL(65,30) NOT NULL,
    "statusMrp" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "sourceSheet" TEXT,
    "sourceRow" INTEGER,

    CONSTRAINT "MrpBaseMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MrpStockImport" (
    "id" TEXT NOT NULL,
    "importHistoryId" TEXT,
    "fileName" TEXT NOT NULL,
    "sheet" TEXT NOT NULL,
    "depositFilter" TEXT NOT NULL,
    "depositInfo" TEXT NOT NULL,
    "depositColumnFound" BOOLEAN NOT NULL,
    "rowsRead" INTEGER NOT NULL,
    "rowsAccepted" INTEGER NOT NULL,
    "duplicateRows" INTEGER NOT NULL,
    "otherDepositRows" INTEGER NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MrpStockImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MrpStockItem" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "freeQty" DECIMAL(65,30) NOT NULL,
    "sourceRow" INTEGER NOT NULL,

    CONSTRAINT "MrpStockItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MrpPurchaseImport" (
    "id" TEXT NOT NULL,
    "importHistoryId" TEXT,
    "fileName" TEXT NOT NULL,
    "sheet" TEXT NOT NULL,
    "rowsRead" INTEGER NOT NULL,
    "rowsAccepted" INTEGER NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MrpPurchaseImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MrpPurchaseItem" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "requisitionDate" TEXT NOT NULL,
    "receiptDate" TEXT NOT NULL,
    "expectedDeliveryDate" TEXT NOT NULL,
    "requisitionNumber" TEXT NOT NULL,
    "purchaseOrderNumber" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "sourceRow" INTEGER,

    CONSTRAINT "MrpPurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MrpAnalysisRun" (
    "id" TEXT NOT NULL,
    "baseVersionId" TEXT NOT NULL,
    "stockImportId" TEXT NOT NULL,
    "purchaseImportId" TEXT NOT NULL,
    "depositFilter" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "kpis" JSONB NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MrpAnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MrpAnalysisItem" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "min" DECIMAL(65,30) NOT NULL,
    "max" DECIMAL(65,30) NOT NULL,
    "free" DECIMAL(65,30) NOT NULL,
    "notFound" BOOLEAN NOT NULL,
    "noParams" BOOLEAN NOT NULL,
    "noMovement" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL,
    "statusOriginal" TEXT NOT NULL,
    "suggested" DECIMAL(65,30) NOT NULL,
    "suggestedOriginal" DECIMAL(65,30) NOT NULL,
    "missing" DECIMAL(65,30) NOT NULL,
    "purchaseQty" DECIMAL(65,30),
    "purchaseOrder" TEXT,
    "purchaseRequisition" TEXT,
    "purchaseForecast" TEXT,
    "purchaseSupplier" TEXT,
    "purchaseDate" TEXT,

    CONSTRAINT "MrpAnalysisItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MrpBaseVersion_isActive_idx" ON "MrpBaseVersion"("isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MrpBaseVersion_createdAt_idx" ON "MrpBaseVersion"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MrpBaseMaterial_versionId_code_key" ON "MrpBaseMaterial"("versionId", "code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MrpStockImport_createdAt_idx" ON "MrpStockImport"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MrpStockItem_importId_code_key" ON "MrpStockItem"("importId", "code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MrpPurchaseImport_createdAt_idx" ON "MrpPurchaseImport"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MrpPurchaseItem_importId_code_idx" ON "MrpPurchaseItem"("importId", "code");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MrpPurchaseItem_importId_seq_key" ON "MrpPurchaseItem"("importId", "seq");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MrpAnalysisRun_isCurrent_idx" ON "MrpAnalysisRun"("isCurrent");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MrpAnalysisRun_createdAt_idx" ON "MrpAnalysisRun"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MrpAnalysisItem_runId_status_idx" ON "MrpAnalysisItem"("runId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MrpAnalysisItem_runId_area_idx" ON "MrpAnalysisItem"("runId", "area");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MrpAnalysisItem_runId_family_idx" ON "MrpAnalysisItem"("runId", "family");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MrpAnalysisItem_runId_noMovement_idx" ON "MrpAnalysisItem"("runId", "noMovement");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MrpAnalysisItem_runId_code_key" ON "MrpAnalysisItem"("runId", "code");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MrpBaseVersion_importHistoryId_fkey') THEN
    ALTER TABLE "MrpBaseVersion"
      ADD CONSTRAINT "MrpBaseVersion_importHistoryId_fkey"
      FOREIGN KEY ("importHistoryId") REFERENCES "ImportHistory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MrpBaseMaterial_versionId_fkey') THEN
    ALTER TABLE "MrpBaseMaterial"
      ADD CONSTRAINT "MrpBaseMaterial_versionId_fkey"
      FOREIGN KEY ("versionId") REFERENCES "MrpBaseVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MrpStockImport_importHistoryId_fkey') THEN
    ALTER TABLE "MrpStockImport"
      ADD CONSTRAINT "MrpStockImport_importHistoryId_fkey"
      FOREIGN KEY ("importHistoryId") REFERENCES "ImportHistory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MrpStockItem_importId_fkey') THEN
    ALTER TABLE "MrpStockItem"
      ADD CONSTRAINT "MrpStockItem_importId_fkey"
      FOREIGN KEY ("importId") REFERENCES "MrpStockImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MrpPurchaseImport_importHistoryId_fkey') THEN
    ALTER TABLE "MrpPurchaseImport"
      ADD CONSTRAINT "MrpPurchaseImport_importHistoryId_fkey"
      FOREIGN KEY ("importHistoryId") REFERENCES "ImportHistory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MrpPurchaseItem_importId_fkey') THEN
    ALTER TABLE "MrpPurchaseItem"
      ADD CONSTRAINT "MrpPurchaseItem_importId_fkey"
      FOREIGN KEY ("importId") REFERENCES "MrpPurchaseImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MrpAnalysisRun_baseVersionId_fkey') THEN
    ALTER TABLE "MrpAnalysisRun"
      ADD CONSTRAINT "MrpAnalysisRun_baseVersionId_fkey"
      FOREIGN KEY ("baseVersionId") REFERENCES "MrpBaseVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MrpAnalysisRun_stockImportId_fkey') THEN
    ALTER TABLE "MrpAnalysisRun"
      ADD CONSTRAINT "MrpAnalysisRun_stockImportId_fkey"
      FOREIGN KEY ("stockImportId") REFERENCES "MrpStockImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MrpAnalysisRun_purchaseImportId_fkey') THEN
    ALTER TABLE "MrpAnalysisRun"
      ADD CONSTRAINT "MrpAnalysisRun_purchaseImportId_fkey"
      FOREIGN KEY ("purchaseImportId") REFERENCES "MrpPurchaseImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MrpAnalysisItem_runId_fkey') THEN
    ALTER TABLE "MrpAnalysisItem"
      ADD CONSTRAINT "MrpAnalysisItem_runId_fkey"
      FOREIGN KEY ("runId") REFERENCES "MrpAnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;


-- INVARIANTES "no máximo UMA versão ativa" e "no máximo UMA análise current",
-- garantidas pelo banco (e não só pela interface). Índices únicos PARCIAIS: o
-- Prisma não os representa no schema, por isso ficam só aqui. A troca é feita
-- em transação por src/services/mrp-persistence.service.ts (desativa a anterior
-- e ativa a nova; qualquer falha = rollback e a anterior continua ativa).
CREATE UNIQUE INDEX IF NOT EXISTS "MrpBaseVersion_single_active_key"
  ON "MrpBaseVersion"("isActive") WHERE "isActive" = true;

CREATE UNIQUE INDEX IF NOT EXISTS "MrpAnalysisRun_single_current_key"
  ON "MrpAnalysisRun"("isCurrent") WHERE "isCurrent" = true;
