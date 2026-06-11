-- CreateEnum
CREATE TYPE "PcFactoryStatusCategory" AS ENUM ('MANUTENCAO', 'PRODUCAO', 'SETUP', 'PARADA_PERDA', 'OPERACIONAL', 'EXCLUIR_TEMPO_PLANEJADO', 'OUTROS');

-- DropIndex
DROP INDEX "PcFactoryRecord_statusNormalized_idx";

-- AlterTable
ALTER TABLE "PcFactoryRecord" DROP COLUMN "statusNormalized",
ADD COLUMN     "statusCategory" "PcFactoryStatusCategory" NOT NULL DEFAULT 'OUTROS';

-- DropEnum
DROP TYPE "PcFactoryStatus";

-- CreateIndex
CREATE INDEX "PcFactoryRecord_statusCategory_idx" ON "PcFactoryRecord"("statusCategory");

