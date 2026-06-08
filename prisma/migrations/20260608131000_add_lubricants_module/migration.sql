/*
  Warnings:

  - You are about to drop the column `equipmentId` on the `LubricantMovement` table. All the data in the column will be lost.
  - You are about to drop the column `observation` on the `LubricantMovement` table. All the data in the column will be lost.
  - You are about to drop the column `responsible` on the `LubricantMovement` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `LubricantMovement` table. All the data in the column will be lost.
  - Added the required column `absoluteQuantity` to the `LubricantMovement` table without a default value. This is not possible if the table is not empty.
  - Added the required column `materialCode` to the `LubricantMovement` table without a default value. This is not possible if the table is not empty.
  - Added the required column `materialDescription` to the `LubricantMovement` table without a default value. This is not possible if the table is not empty.
  - Added the required column `movementCategory` to the `LubricantMovement` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unit` to the `LubricantMovement` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "LubricantMachineApplication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lubricantId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "equipmentCode" TEXT,
    "equipmentName" TEXT NOT NULL,
    "applicationPoint" TEXT,
    "recommendation" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LubricantMachineApplication_lubricantId_fkey" FOREIGN KEY ("lubricantId") REFERENCES "Lubricant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Lubricant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "type" TEXT,
    "unit" TEXT NOT NULL,
    "currentStock" REAL NOT NULL DEFAULT 0,
    "minimumStock" REAL NOT NULL DEFAULT 0,
    "technicalSheetUrl" TEXT,
    "applicationNotes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Lubricant" ("code", "createdAt", "currentStock", "id", "minimumStock", "name", "type", "unit", "updatedAt") SELECT "code", "createdAt", "currentStock", "id", "minimumStock", "name", "type", "unit", "updatedAt" FROM "Lubricant";
DROP TABLE "Lubricant";
ALTER TABLE "new_Lubricant" RENAME TO "Lubricant";
CREATE UNIQUE INDEX "Lubricant_code_key" ON "Lubricant"("code");
CREATE INDEX "Lubricant_code_idx" ON "Lubricant"("code");
CREATE INDEX "Lubricant_name_idx" ON "Lubricant"("name");
CREATE INDEX "Lubricant_active_idx" ON "Lubricant"("active");
CREATE TABLE "new_LubricantMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lubricantId" TEXT NOT NULL,
    "materialCode" TEXT NOT NULL,
    "materialDescription" TEXT NOT NULL,
    "center" TEXT,
    "companyName" TEXT,
    "storageLocation" TEXT,
    "movementTypeCode" TEXT,
    "movementTypeText" TEXT,
    "movementCategory" TEXT NOT NULL,
    "movementDate" DATETIME NOT NULL,
    "movementTime" TEXT,
    "quantity" REAL NOT NULL,
    "absoluteQuantity" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'EXCEL',
    "importBatch" TEXT,
    "technicalKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LubricantMovement_lubricantId_fkey" FOREIGN KEY ("lubricantId") REFERENCES "Lubricant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_LubricantMovement" ("createdAt", "id", "lubricantId", "movementDate", "quantity") SELECT "createdAt", "id", "lubricantId", "movementDate", "quantity" FROM "LubricantMovement";
DROP TABLE "LubricantMovement";
ALTER TABLE "new_LubricantMovement" RENAME TO "LubricantMovement";
CREATE UNIQUE INDEX "LubricantMovement_technicalKey_key" ON "LubricantMovement"("technicalKey");
CREATE INDEX "LubricantMovement_lubricantId_idx" ON "LubricantMovement"("lubricantId");
CREATE INDEX "LubricantMovement_materialCode_idx" ON "LubricantMovement"("materialCode");
CREATE INDEX "LubricantMovement_movementDate_idx" ON "LubricantMovement"("movementDate");
CREATE INDEX "LubricantMovement_movementCategory_idx" ON "LubricantMovement"("movementCategory");
CREATE INDEX "LubricantMovement_technicalKey_idx" ON "LubricantMovement"("technicalKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "LubricantMachineApplication_lubricantId_idx" ON "LubricantMachineApplication"("lubricantId");

-- CreateIndex
CREATE INDEX "LubricantMachineApplication_equipmentId_idx" ON "LubricantMachineApplication"("equipmentId");

-- CreateIndex
CREATE INDEX "LubricantMachineApplication_equipmentCode_idx" ON "LubricantMachineApplication"("equipmentCode");
