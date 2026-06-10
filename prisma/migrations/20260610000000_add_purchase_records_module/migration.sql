-- CreateEnum
CREATE TYPE "PurchaseType" AS ENUM ('NORMAL', 'REGULARIZACAO', 'OUTROS');

-- CreateEnum
CREATE TYPE "ItemNature" AS ENUM ('MATERIAL', 'SERVICO');

-- CreateEnum
CREATE TYPE "PurchaseRecordSource" AS ENUM ('EXCEL', 'SAP', 'MANUAL');

-- CreateTable
CREATE TABLE "PurchaseRecord" (
    "id" TEXT NOT NULL,
    "purchaseOrderNumber" TEXT,
    "requisitionNumber" TEXT,
    "requisitionLevel" TEXT,
    "supplierCode" TEXT,
    "supplierName" TEXT,
    "materialCode" TEXT,
    "itemDescription" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "requisitionDate" TIMESTAMP(3),
    "purchaseOrderDate" TIMESTAMP(3),
    "expectedDeliveryDate" TIMESTAMP(3),
    "receiptDate" TIMESTAMP(3),
    "migoDate" TIMESTAMP(3),
    "miroDate" TIMESTAMP(3),
    "receiptNumber" TEXT,
    "migoNumber" TEXT,
    "miroNumber" TEXT,
    "grossPrice" DOUBLE PRECISION,
    "netPrice" DOUBLE PRECISION,
    "grossTotal" DOUBLE PRECISION,
    "netTotal" DOUBLE PRECISION,
    "goodsGroupCode" TEXT,
    "goodsGroupDescription" TEXT,
    "requester" TEXT,
    "purchasingGroup" TEXT,
    "deletionCode" TEXT,
    "purchaseType" "PurchaseType" NOT NULL DEFAULT 'OUTROS',
    "itemNature" "ItemNature" NOT NULL DEFAULT 'MATERIAL',
    "hasPurchaseOrder" BOOLEAN NOT NULL DEFAULT false,
    "hasMigo" BOOLEAN NOT NULL DEFAULT false,
    "hasMiro" BOOLEAN NOT NULL DEFAULT false,
    "isReceiptCompleted" BOOLEAN NOT NULL DEFAULT false,
    "isLateOpen" BOOLEAN NOT NULL DEFAULT false,
    "isLateReceived" BOOLEAN NOT NULL DEFAULT false,
    "delayDays" INTEGER,
    "requisitionToOrderDays" INTEGER,
    "orderToReceiptDays" INTEGER,
    "migoToMiroDays" INTEGER,
    "totalProcessDays" INTEGER,
    "ignored" BOOLEAN NOT NULL DEFAULT false,
    "ignoredReason" TEXT,
    "source" "PurchaseRecordSource" NOT NULL DEFAULT 'EXCEL',
    "importBatch" TEXT,
    "technicalKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRecord_technicalKey_key" ON "PurchaseRecord"("technicalKey");

-- CreateIndex
CREATE INDEX "PurchaseRecord_purchaseOrderNumber_idx" ON "PurchaseRecord"("purchaseOrderNumber");

-- CreateIndex
CREATE INDEX "PurchaseRecord_requisitionNumber_idx" ON "PurchaseRecord"("requisitionNumber");

-- CreateIndex
CREATE INDEX "PurchaseRecord_supplierName_idx" ON "PurchaseRecord"("supplierName");

-- CreateIndex
CREATE INDEX "PurchaseRecord_materialCode_idx" ON "PurchaseRecord"("materialCode");

-- CreateIndex
CREATE INDEX "PurchaseRecord_goodsGroupCode_idx" ON "PurchaseRecord"("goodsGroupCode");

-- CreateIndex
CREATE INDEX "PurchaseRecord_purchaseType_idx" ON "PurchaseRecord"("purchaseType");

-- CreateIndex
CREATE INDEX "PurchaseRecord_itemNature_idx" ON "PurchaseRecord"("itemNature");

-- CreateIndex
CREATE INDEX "PurchaseRecord_purchaseOrderDate_idx" ON "PurchaseRecord"("purchaseOrderDate");

-- CreateIndex
CREATE INDEX "PurchaseRecord_requisitionDate_idx" ON "PurchaseRecord"("requisitionDate");

-- CreateIndex
CREATE INDEX "PurchaseRecord_expectedDeliveryDate_idx" ON "PurchaseRecord"("expectedDeliveryDate");

-- CreateIndex
CREATE INDEX "PurchaseRecord_hasPurchaseOrder_idx" ON "PurchaseRecord"("hasPurchaseOrder");

-- CreateIndex
CREATE INDEX "PurchaseRecord_isReceiptCompleted_idx" ON "PurchaseRecord"("isReceiptCompleted");

-- CreateIndex
CREATE INDEX "PurchaseRecord_isLateOpen_idx" ON "PurchaseRecord"("isLateOpen");

-- CreateIndex
CREATE INDEX "PurchaseRecord_ignored_idx" ON "PurchaseRecord"("ignored");

-- Habilita RLS para manter o mesmo padrao de seguranca das demais tabelas.
-- O app acessa via Prisma com a connection string (role postgres/service), que ignora RLS.
ALTER TABLE "PurchaseRecord" ENABLE ROW LEVEL SECURITY;
