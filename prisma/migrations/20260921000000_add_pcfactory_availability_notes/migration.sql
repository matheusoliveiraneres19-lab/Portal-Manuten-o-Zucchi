-- JUSTIFICATIVA GERENCIAL DE BAIXA DISPONIBILIDADE (PC-Factory).
--
-- ADITIVA: cria uma tabela nova e não toca em nenhuma existente. Nenhum dado do
-- PC-Factory (PcFactoryRecord), de Ordens de Serviço, Compras, Preventivas ou
-- Lubrificantes é lido, alterado ou apagado por esta migration.
--
-- O conteúdo desta tabela é gerencial e NÃO participa de nenhum cálculo:
-- Disponibilidade Física, Horas de Parada, Tempo Total, MTBF, MTTR e MTTA
-- continuam saindo exclusivamente de PcFactoryRecord.
--
-- Idempotente (IF NOT EXISTS) para poder ser aplicada com
-- `npx prisma db execute` no Supabase sem risco de erro em reexecução.

-- CreateTable
CREATE TABLE IF NOT EXISTS "PcFactoryAvailabilityNote" (
    "id" TEXT NOT NULL,
    "resourceName" TEXT NOT NULL,
    "resourceCode" TEXT,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "actionPlan" TEXT,
    "responsible" TEXT,
    "availabilitySnapshot" DOUBLE PRECISION,
    "downtimeHoursSnapshot" DOUBLE PRECISION,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" TEXT,
    "updatedByName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PcFactoryAvailabilityNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: a chave de negócio é (máquina + período), não a máquina sozinha.
CREATE UNIQUE INDEX IF NOT EXISTS "PcFactoryAvailabilityNote_resource_period_key"
    ON "PcFactoryAvailabilityNote"("resourceName", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PcFactoryAvailabilityNote_resourceName_idx"
    ON "PcFactoryAvailabilityNote"("resourceName");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PcFactoryAvailabilityNote_periodStart_periodEnd_idx"
    ON "PcFactoryAvailabilityNote"("periodStart", "periodEnd");

-- RLS habilitado sem policies (consistente com o restante do banco; o Prisma usa
-- a role de serviço e ignora RLS).
ALTER TABLE "PcFactoryAvailabilityNote" ENABLE ROW LEVEL SECURITY;
