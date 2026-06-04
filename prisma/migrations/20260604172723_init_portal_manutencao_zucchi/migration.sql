-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'VISUALIZADOR',
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "position" TEXT,
    "sector" TEXT,
    "lastAccess" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sector" TEXT,
    "location" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPERANDO',
    "criticality" TEXT NOT NULL DEFAULT 'MEDIA',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ServiceOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "osNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "area" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ABERTA',
    "priority" TEXT NOT NULL DEFAULT 'MEDIA',
    "responsible" TEXT,
    "equipmentId" TEXT,
    "openedAt" DATETIME NOT NULL,
    "closedAt" DATETIME,
    "downtimeHours" REAL,
    "workedHours" REAL,
    "failureCause" TEXT,
    "solution" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ServiceOrder_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "item" TEXT NOT NULL,
    "materialCode" TEXT,
    "supplier" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SOLICITADA',
    "priority" TEXT NOT NULL DEFAULT 'MEDIA',
    "quantity" REAL,
    "unitValue" REAL,
    "totalValue" REAL,
    "requestDate" DATETIME,
    "purchaseDate" DATETIME,
    "expectedDate" DATETIME,
    "requester" TEXT,
    "equipmentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Purchase_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT,
    "unit" TEXT NOT NULL,
    "currentStock" REAL NOT NULL DEFAULT 0,
    "minimumStock" REAL NOT NULL DEFAULT 0,
    "averageValue" REAL,
    "criticality" TEXT NOT NULL DEFAULT 'MEDIA',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MaterialMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "materialId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "type" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "unitValue" REAL,
    "totalValue" REAL,
    "movementDate" DATETIME NOT NULL,
    "responsible" TEXT,
    "observation" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MaterialMovement_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MaterialMovement_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Lubricant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT,
    "unit" TEXT NOT NULL,
    "currentStock" REAL NOT NULL DEFAULT 0,
    "minimumStock" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LubricantMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lubricantId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "type" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "movementDate" DATETIME NOT NULL,
    "responsible" TEXT,
    "observation" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LubricantMovement_lubricantId_fkey" FOREIGN KEY ("lubricantId") REFERENCES "Lubricant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LubricantMovement_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIA',
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "equipmentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Alert_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "serviceOrderId" TEXT,
    "osNumber" TEXT,
    "workDate" DATETIME NOT NULL,
    "hours" REAL NOT NULL,
    "weeklyGoal" REAL,
    "monthlyGoal" REAL,
    "observation" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimeEntry_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Procedure" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "fileUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "responsible" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ImportHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "importedBy" TEXT,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "createdRows" INTEGER NOT NULL DEFAULT 0,
    "updatedRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_name_idx" ON "User"("name");

-- CreateIndex
CREATE INDEX "User_login_idx" ON "User"("login");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_code_key" ON "Equipment"("code");

-- CreateIndex
CREATE INDEX "Equipment_code_idx" ON "Equipment"("code");

-- CreateIndex
CREATE INDEX "Equipment_name_idx" ON "Equipment"("name");

-- CreateIndex
CREATE INDEX "Equipment_status_idx" ON "Equipment"("status");

-- CreateIndex
CREATE INDEX "Equipment_criticality_idx" ON "Equipment"("criticality");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceOrder_osNumber_key" ON "ServiceOrder"("osNumber");

-- CreateIndex
CREATE INDEX "ServiceOrder_osNumber_idx" ON "ServiceOrder"("osNumber");

-- CreateIndex
CREATE INDEX "ServiceOrder_status_idx" ON "ServiceOrder"("status");

-- CreateIndex
CREATE INDEX "ServiceOrder_type_idx" ON "ServiceOrder"("type");

-- CreateIndex
CREATE INDEX "ServiceOrder_area_idx" ON "ServiceOrder"("area");

-- CreateIndex
CREATE INDEX "ServiceOrder_openedAt_idx" ON "ServiceOrder"("openedAt");

-- CreateIndex
CREATE INDEX "ServiceOrder_equipmentId_idx" ON "ServiceOrder"("equipmentId");

-- CreateIndex
CREATE INDEX "Purchase_status_idx" ON "Purchase"("status");

-- CreateIndex
CREATE INDEX "Purchase_materialCode_idx" ON "Purchase"("materialCode");

-- CreateIndex
CREATE INDEX "Purchase_supplier_idx" ON "Purchase"("supplier");

-- CreateIndex
CREATE INDEX "Purchase_expectedDate_idx" ON "Purchase"("expectedDate");

-- CreateIndex
CREATE INDEX "Purchase_equipmentId_idx" ON "Purchase"("equipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Material_code_key" ON "Material"("code");

-- CreateIndex
CREATE INDEX "Material_code_idx" ON "Material"("code");

-- CreateIndex
CREATE INDEX "Material_name_idx" ON "Material"("name");

-- CreateIndex
CREATE INDEX "Material_category_idx" ON "Material"("category");

-- CreateIndex
CREATE INDEX "Material_criticality_idx" ON "Material"("criticality");

-- CreateIndex
CREATE INDEX "MaterialMovement_materialId_idx" ON "MaterialMovement"("materialId");

-- CreateIndex
CREATE INDEX "MaterialMovement_equipmentId_idx" ON "MaterialMovement"("equipmentId");

-- CreateIndex
CREATE INDEX "MaterialMovement_type_idx" ON "MaterialMovement"("type");

-- CreateIndex
CREATE INDEX "MaterialMovement_movementDate_idx" ON "MaterialMovement"("movementDate");

-- CreateIndex
CREATE UNIQUE INDEX "Lubricant_code_key" ON "Lubricant"("code");

-- CreateIndex
CREATE INDEX "Lubricant_code_idx" ON "Lubricant"("code");

-- CreateIndex
CREATE INDEX "Lubricant_name_idx" ON "Lubricant"("name");

-- CreateIndex
CREATE INDEX "LubricantMovement_lubricantId_idx" ON "LubricantMovement"("lubricantId");

-- CreateIndex
CREATE INDEX "LubricantMovement_equipmentId_idx" ON "LubricantMovement"("equipmentId");

-- CreateIndex
CREATE INDEX "LubricantMovement_type_idx" ON "LubricantMovement"("type");

-- CreateIndex
CREATE INDEX "LubricantMovement_movementDate_idx" ON "LubricantMovement"("movementDate");

-- CreateIndex
CREATE INDEX "Alert_type_idx" ON "Alert"("type");

-- CreateIndex
CREATE INDEX "Alert_severity_idx" ON "Alert"("severity");

-- CreateIndex
CREATE INDEX "Alert_status_idx" ON "Alert"("status");

-- CreateIndex
CREATE INDEX "Alert_equipmentId_idx" ON "Alert"("equipmentId");

-- CreateIndex
CREATE INDEX "TimeEntry_userId_idx" ON "TimeEntry"("userId");

-- CreateIndex
CREATE INDEX "TimeEntry_userName_idx" ON "TimeEntry"("userName");

-- CreateIndex
CREATE INDEX "TimeEntry_osNumber_idx" ON "TimeEntry"("osNumber");

-- CreateIndex
CREATE INDEX "TimeEntry_workDate_idx" ON "TimeEntry"("workDate");

-- CreateIndex
CREATE INDEX "TimeEntry_serviceOrderId_idx" ON "TimeEntry"("serviceOrderId");

-- CreateIndex
CREATE INDEX "Procedure_category_idx" ON "Procedure"("category");

-- CreateIndex
CREATE INDEX "Procedure_active_idx" ON "Procedure"("active");

-- CreateIndex
CREATE INDEX "Procedure_title_idx" ON "Procedure"("title");

-- CreateIndex
CREATE INDEX "ImportHistory_type_idx" ON "ImportHistory"("type");

-- CreateIndex
CREATE INDEX "ImportHistory_status_idx" ON "ImportHistory"("status");

-- CreateIndex
CREATE INDEX "ImportHistory_createdAt_idx" ON "ImportHistory"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfig_key_key" ON "SystemConfig"("key");
