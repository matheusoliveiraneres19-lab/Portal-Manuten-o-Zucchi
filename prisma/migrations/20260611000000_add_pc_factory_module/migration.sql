-- CreateEnum
CREATE TYPE "PcFactoryStatus" AS ENUM ('PRODUCAO', 'PARADA', 'MANUTENCAO', 'SETUP', 'AGUARDANDO', 'SEM_OPERADOR', 'FALTA_MATERIAL', 'LIMPEZA', 'QUALIDADE', 'INATIVO', 'OUTROS');

-- CreateEnum
CREATE TYPE "PcFactorySource" AS ENUM ('EXCEL', 'PC_FACTORY', 'MANUAL');

-- AlterEnum
ALTER TYPE "ImportType" ADD VALUE 'PC_FACTORY';

-- CreateTable
CREATE TABLE "PcFactoryRecord" (
    "id" TEXT NOT NULL,
    "resourceCode" TEXT,
    "resourceName" TEXT NOT NULL,
    "productionLine" TEXT,
    "sector" TEXT,
    "statusRaw" TEXT,
    "statusNormalized" "PcFactoryStatus" NOT NULL,
    "startDateTime" TIMESTAMP(3),
    "endDateTime" TIMESTAMP(3),
    "durationMinutes" DOUBLE PRECISION NOT NULL,
    "durationHours" DOUBLE PRECISION NOT NULL,
    "orderNumber" TEXT,
    "productCode" TEXT,
    "productDescription" TEXT,
    "operatorName" TEXT,
    "shift" TEXT,
    "observation" TEXT,
    "source" "PcFactorySource" NOT NULL DEFAULT 'EXCEL',
    "importBatch" TEXT,
    "technicalKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PcFactoryRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PcFactoryRecord_technicalKey_key" ON "PcFactoryRecord"("technicalKey");

-- CreateIndex
CREATE INDEX "PcFactoryRecord_resourceName_idx" ON "PcFactoryRecord"("resourceName");

-- CreateIndex
CREATE INDEX "PcFactoryRecord_resourceCode_idx" ON "PcFactoryRecord"("resourceCode");

-- CreateIndex
CREATE INDEX "PcFactoryRecord_productionLine_idx" ON "PcFactoryRecord"("productionLine");

-- CreateIndex
CREATE INDEX "PcFactoryRecord_sector_idx" ON "PcFactoryRecord"("sector");

-- CreateIndex
CREATE INDEX "PcFactoryRecord_statusNormalized_idx" ON "PcFactoryRecord"("statusNormalized");

-- CreateIndex
CREATE INDEX "PcFactoryRecord_startDateTime_idx" ON "PcFactoryRecord"("startDateTime");

-- CreateIndex
CREATE INDEX "PcFactoryRecord_endDateTime_idx" ON "PcFactoryRecord"("endDateTime");

-- CreateIndex
CREATE INDEX "PcFactoryRecord_importBatch_idx" ON "PcFactoryRecord"("importBatch");

