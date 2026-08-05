-- Suporte ao CSV historico normalizado do PC-Factory (StatusHistorico).
--
-- Migration ADITIVA: apenas adiciona colunas nullable e um indice. Nao apaga,
-- nao renomeia e nao altera tipo de coluna existente, portanto e segura de rodar
-- com a tabela populada e nao requer migrate reset.
--
-- classificationRef  : valor cru de "classificationPcFactoryRef" do CSV (auditoria).
-- availabilityBucket : bucket oficial de disponibilidade derivado no import
--                      (PRODUCAO | PARADA_PLANEJADA | PARADA_NAO_PLANEJADA |
--                       FORA_DE_TURNO | RECURSO_NAO_PROGRAMADO | NAO_APONTADO).
--                      String em vez de enum para evitar CREATE TYPE no Supabase.

-- AlterTable
ALTER TABLE "PcFactoryRecord" ADD COLUMN     "classificationRef" TEXT,
ADD COLUMN     "availabilityBucket" TEXT;

-- CreateIndex
CREATE INDEX "PcFactoryRecord_availabilityBucket_idx" ON "PcFactoryRecord"("availabilityBucket");
