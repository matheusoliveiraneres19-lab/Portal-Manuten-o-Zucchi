-- CreateTable
CREATE TABLE "FunctionalLocation" (
    "id" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "costCenter" TEXT,
    "costCenterDescription" TEXT,
    "parentTag" TEXT,
    "rootTag" TEXT,
    "rootDescription" TEXT,
    "area" TEXT,
    "equipmentFamily" TEXT,
    "isRootEquipment" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FunctionalLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FunctionalLocation_tag_key" ON "FunctionalLocation"("tag");

-- CreateIndex
CREATE INDEX "FunctionalLocation_rootTag_idx" ON "FunctionalLocation"("rootTag");

-- CreateIndex
CREATE INDEX "FunctionalLocation_parentTag_idx" ON "FunctionalLocation"("parentTag");

-- CreateIndex
CREATE INDEX "FunctionalLocation_equipmentFamily_idx" ON "FunctionalLocation"("equipmentFamily");

-- CreateIndex
CREATE INDEX "FunctionalLocation_isRootEquipment_idx" ON "FunctionalLocation"("isRootEquipment");

-- RLS habilitado sem policies (consistente com o banco; Prisma usa role service e ignora RLS).
ALTER TABLE "FunctionalLocation" ENABLE ROW LEVEL SECURITY;
