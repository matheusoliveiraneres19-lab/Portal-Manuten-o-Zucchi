-- ORDENS DE SERVIÇO NA JUSTIFICATIVA DE BAIXA DISPONIBILIDADE (PC-Factory).
--
-- ADITIVA: uma coluna opcional nova ("cause" = MOTIVO) e uma tabela nova de
-- vínculo justificativa ↔ OS. Nenhum dado existente é alterado ou apagado:
-- PcFactoryRecord, ServiceOrder e as justificativas já gravadas ficam intactos.
--
-- Informação GERENCIAL: o vínculo não participa de Disponibilidade Física, Horas
-- de Parada, Tempo Total, MTBF, MTTR nem MTTA.
--
-- Remover um vínculo apaga só a linha desta tabela — a FK para "ServiceOrder" é
-- ON DELETE SET NULL no sentido OS → vínculo, nunca o contrário.
--
-- Idempotente (IF NOT EXISTS / checagem de constraint) para ser aplicada com
-- `npx prisma db execute` no Supabase, como as migrations anteriores do módulo.

-- AlterTable
ALTER TABLE "PcFactoryAvailabilityNote" ADD COLUMN IF NOT EXISTS "cause" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PcFactoryAvailabilityNoteServiceOrder" (
    "id" TEXT NOT NULL,
    "availabilityNoteId" TEXT NOT NULL,
    "osNumber" TEXT NOT NULL,
    "serviceOrderId" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PcFactoryAvailabilityNoteServiceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PcFactoryAvailabilityNoteServiceOrder_osNumber_idx" ON "PcFactoryAvailabilityNoteServiceOrder"("osNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PcFactoryAvailabilityNoteServiceOrder_serviceOrderId_idx" ON "PcFactoryAvailabilityNoteServiceOrder"("serviceOrderId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PcFactoryAvailabilityNoteServiceOrder_availabilityNoteId_os_key" ON "PcFactoryAvailabilityNoteServiceOrder"("availabilityNoteId", "osNumber");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PcFactoryAvailabilityNoteServiceOrder_availabilityNoteId_fkey'
  ) THEN
    ALTER TABLE "PcFactoryAvailabilityNoteServiceOrder"
      ADD CONSTRAINT "PcFactoryAvailabilityNoteServiceOrder_availabilityNoteId_fkey"
      FOREIGN KEY ("availabilityNoteId") REFERENCES "PcFactoryAvailabilityNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PcFactoryAvailabilityNoteServiceOrder_serviceOrderId_fkey'
  ) THEN
    ALTER TABLE "PcFactoryAvailabilityNoteServiceOrder"
      ADD CONSTRAINT "PcFactoryAvailabilityNoteServiceOrder_serviceOrderId_fkey"
      FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
