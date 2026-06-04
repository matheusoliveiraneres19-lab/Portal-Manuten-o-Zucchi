-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ServiceOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "osNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ABERTA',
    "statusSapRaw" TEXT,
    "type" TEXT,
    "area" TEXT,
    "priority" TEXT DEFAULT 'MEDIA',
    "responsible" TEXT,
    "responsibleName" TEXT,
    "responsibleId" TEXT,
    "equipmentId" TEXT,
    "equipmentCode" TEXT,
    "equipmentName" TEXT,
    "technicalObjectRaw" TEXT,
    "planningGroup" TEXT,
    "planningGroupCode" TEXT,
    "openedAt" DATETIME,
    "closedAt" DATETIME,
    "workedHours" REAL,
    "downtimeHours" REAL,
    "operation" TEXT,
    "operationCode" TEXT,
    "failureCause" TEXT,
    "solution" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "importBatch" TEXT,
    "dataQualityIssue" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ServiceOrder_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ServiceOrder" ("area", "closedAt", "createdAt", "description", "downtimeHours", "equipmentId", "failureCause", "id", "openedAt", "osNumber", "priority", "responsible", "solution", "source", "status", "title", "type", "updatedAt", "workedHours") SELECT "area", "closedAt", "createdAt", "description", "downtimeHours", "equipmentId", "failureCause", "id", "openedAt", "osNumber", "priority", "responsible", "solution", "source", "status", "title", "type", "updatedAt", "workedHours" FROM "ServiceOrder";
DROP TABLE "ServiceOrder";
ALTER TABLE "new_ServiceOrder" RENAME TO "ServiceOrder";
CREATE UNIQUE INDEX "ServiceOrder_osNumber_key" ON "ServiceOrder"("osNumber");
CREATE INDEX "ServiceOrder_osNumber_idx" ON "ServiceOrder"("osNumber");
CREATE INDEX "ServiceOrder_status_idx" ON "ServiceOrder"("status");
CREATE INDEX "ServiceOrder_type_idx" ON "ServiceOrder"("type");
CREATE INDEX "ServiceOrder_area_idx" ON "ServiceOrder"("area");
CREATE INDEX "ServiceOrder_openedAt_idx" ON "ServiceOrder"("openedAt");
CREATE INDEX "ServiceOrder_responsibleName_idx" ON "ServiceOrder"("responsibleName");
CREATE INDEX "ServiceOrder_equipmentId_idx" ON "ServiceOrder"("equipmentId");
CREATE INDEX "ServiceOrder_equipmentCode_idx" ON "ServiceOrder"("equipmentCode");
CREATE INDEX "ServiceOrder_planningGroup_idx" ON "ServiceOrder"("planningGroup");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
