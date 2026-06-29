-- CreateTable
CREATE TABLE "PortalSetting" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "value" JSONB NOT NULL,
    "valueType" TEXT NOT NULL,
    "isEditable" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PortalSetting_category_idx" ON "PortalSetting"("category");

-- CreateIndex
CREATE UNIQUE INDEX "PortalSetting_category_key_key" ON "PortalSetting"("category", "key");

-- RLS habilitado sem policies (consistente com o banco; Prisma usa role service e ignora RLS).
ALTER TABLE "PortalSetting" ENABLE ROW LEVEL SECURITY;
