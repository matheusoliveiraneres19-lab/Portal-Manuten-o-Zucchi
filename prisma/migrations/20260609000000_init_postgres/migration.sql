-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'GESTOR', 'TECNICO', 'COMPRAS', 'VISUALIZADOR');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ATIVO', 'INATIVO');

-- CreateEnum
CREATE TYPE "Criticality" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA');

-- CreateEnum
CREATE TYPE "EquipmentStatus" AS ENUM ('OPERANDO', 'EM_MANUTENCAO', 'PARADO', 'INATIVO');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('CORRETIVA', 'PREVENTIVA', 'PREDITIVA', 'MELHORIA', 'INSPECAO');

-- CreateEnum
CREATE TYPE "MaintenanceArea" AS ENUM ('MECANICA', 'ELETRICA', 'LUBRIFICACAO', 'PCM', 'OPERACIONAL');

-- CreateEnum
CREATE TYPE "ServiceOrderStatus" AS ENUM ('ABERTA', 'LIBERADA', 'EM_ANDAMENTO', 'AGUARDANDO_MATERIAL', 'FECHADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('SOLICITADA', 'EM_COTACAO', 'APROVADA', 'COMPRADA', 'ENTREGUE', 'ATRASADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "MaterialMovementType" AS ENUM ('ENTRADA', 'SAIDA', 'AJUSTE');

-- CreateEnum
CREATE TYPE "LubricantMovementType" AS ENUM ('COMPRA', 'CONSUMO', 'AJUSTE');

-- CreateEnum
CREATE TYPE "LubricantMovementCategory" AS ENUM ('ENTRADA', 'SAIDA', 'ESTOQUE_INICIAL', 'AJUSTE');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('QUEBRA_RECORRENTE', 'COMPRA_ATRASADA', 'ESTOQUE_BAIXO', 'OS_ATRASADA', 'HORAS_ABAIXO_META', 'LUBRIFICANTE_BAIXO', 'TEMPERATURA', 'VIBRACAO', 'PRESSAO', 'EQUIPAMENTO_PARADO');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('ABERTO', 'EM_ANALISE', 'RESOLVIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "ProcedureCategory" AS ENUM ('MECANICA', 'ELETRICA', 'LUBRIFICACAO', 'SEGURANCA', 'PCM', 'OPERACIONAL', 'OUTROS');

-- CreateEnum
CREATE TYPE "ImportType" AS ENUM ('ORDENS_SERVICO', 'COMPRAS', 'MATERIAIS', 'LUBRIFICANTES', 'HORAS_APONTADAS', 'EQUIPAMENTOS', 'PROCEDIMENTOS');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('SUCESSO', 'PARCIAL', 'ERRO', 'EM_PROCESSAMENTO');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('MANUAL', 'SAP', 'EXCEL', 'SISTEMA');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'VISUALIZADOR',
    "status" "UserStatus" NOT NULL DEFAULT 'ATIVO',
    "position" TEXT,
    "sector" TEXT,
    "lastAccess" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sector" TEXT,
    "location" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "status" "EquipmentStatus" NOT NULL DEFAULT 'OPERANDO',
    "criticality" "Criticality" NOT NULL DEFAULT 'MEDIA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceOrder" (
    "id" TEXT NOT NULL,
    "osNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ServiceOrderStatus" NOT NULL DEFAULT 'ABERTA',
    "statusSapRaw" TEXT,
    "type" "MaintenanceType",
    "area" "MaintenanceArea",
    "priority" "Priority" DEFAULT 'MEDIA',
    "responsible" TEXT,
    "responsibleName" TEXT,
    "responsibleId" TEXT,
    "equipmentId" TEXT,
    "equipmentCode" TEXT,
    "equipmentName" TEXT,
    "technicalObjectRaw" TEXT,
    "planningGroup" TEXT,
    "planningGroupCode" TEXT,
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "workedHours" DOUBLE PRECISION,
    "downtimeHours" DOUBLE PRECISION,
    "operation" TEXT,
    "operationCode" TEXT,
    "failureCause" TEXT,
    "solution" TEXT,
    "source" "DataSource" NOT NULL DEFAULT 'MANUAL',
    "importBatch" TEXT,
    "dataQualityIssue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "materialCode" TEXT,
    "supplier" TEXT,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'SOLICITADA',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIA',
    "quantity" DOUBLE PRECISION,
    "unitValue" DOUBLE PRECISION,
    "totalValue" DOUBLE PRECISION,
    "requestDate" TIMESTAMP(3),
    "purchaseDate" TIMESTAMP(3),
    "expectedDate" TIMESTAMP(3),
    "requester" TEXT,
    "equipmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT,
    "unit" TEXT NOT NULL,
    "currentStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minimumStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "averageValue" DOUBLE PRECISION,
    "criticality" "Criticality" NOT NULL DEFAULT 'MEDIA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialMovement" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "type" "MaterialMovementType" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitValue" DOUBLE PRECISION,
    "totalValue" DOUBLE PRECISION,
    "movementDate" TIMESTAMP(3) NOT NULL,
    "responsible" TEXT,
    "observation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lubricant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "type" TEXT,
    "unit" TEXT NOT NULL,
    "currentStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minimumStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "technicalSheetUrl" TEXT,
    "applicationNotes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lubricant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LubricantMachineApplication" (
    "id" TEXT NOT NULL,
    "lubricantId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "equipmentCode" TEXT,
    "equipmentName" TEXT NOT NULL,
    "applicationPoint" TEXT,
    "recommendation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LubricantMachineApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LubricantMovement" (
    "id" TEXT NOT NULL,
    "lubricantId" TEXT NOT NULL,
    "materialCode" TEXT NOT NULL,
    "materialDescription" TEXT NOT NULL,
    "center" TEXT,
    "companyName" TEXT,
    "storageLocation" TEXT,
    "movementTypeCode" TEXT,
    "movementTypeText" TEXT,
    "movementCategory" "LubricantMovementCategory" NOT NULL,
    "movementDate" TIMESTAMP(3) NOT NULL,
    "movementTime" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "absoluteQuantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "source" "DataSource" NOT NULL DEFAULT 'EXCEL',
    "importBatch" TEXT,
    "technicalKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LubricantMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "Priority" NOT NULL DEFAULT 'MEDIA',
    "status" "AlertStatus" NOT NULL DEFAULT 'ABERTO',
    "equipmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "serviceOrderId" TEXT,
    "osNumber" TEXT,
    "workDate" TIMESTAMP(3) NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "weeklyGoal" DOUBLE PRECISION,
    "monthlyGoal" DOUBLE PRECISION,
    "observation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Procedure" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "ProcedureCategory" NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "fileUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "responsible" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Procedure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportHistory" (
    "id" TEXT NOT NULL,
    "type" "ImportType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "importedBy" TEXT,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "createdRows" INTEGER NOT NULL DEFAULT 0,
    "updatedRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "status" "ImportStatus" NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "ServiceOrder_responsibleName_idx" ON "ServiceOrder"("responsibleName");

-- CreateIndex
CREATE INDEX "ServiceOrder_equipmentId_idx" ON "ServiceOrder"("equipmentId");

-- CreateIndex
CREATE INDEX "ServiceOrder_equipmentCode_idx" ON "ServiceOrder"("equipmentCode");

-- CreateIndex
CREATE INDEX "ServiceOrder_planningGroup_idx" ON "ServiceOrder"("planningGroup");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceOrder_osNumber_operationCode_key" ON "ServiceOrder"("osNumber", "operationCode");

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
CREATE INDEX "Lubricant_active_idx" ON "Lubricant"("active");

-- CreateIndex
CREATE INDEX "LubricantMachineApplication_lubricantId_idx" ON "LubricantMachineApplication"("lubricantId");

-- CreateIndex
CREATE INDEX "LubricantMachineApplication_equipmentId_idx" ON "LubricantMachineApplication"("equipmentId");

-- CreateIndex
CREATE INDEX "LubricantMachineApplication_equipmentCode_idx" ON "LubricantMachineApplication"("equipmentCode");

-- CreateIndex
CREATE UNIQUE INDEX "LubricantMovement_technicalKey_key" ON "LubricantMovement"("technicalKey");

-- CreateIndex
CREATE INDEX "LubricantMovement_lubricantId_idx" ON "LubricantMovement"("lubricantId");

-- CreateIndex
CREATE INDEX "LubricantMovement_materialCode_idx" ON "LubricantMovement"("materialCode");

-- CreateIndex
CREATE INDEX "LubricantMovement_movementDate_idx" ON "LubricantMovement"("movementDate");

-- CreateIndex
CREATE INDEX "LubricantMovement_movementCategory_idx" ON "LubricantMovement"("movementCategory");

-- CreateIndex
CREATE INDEX "LubricantMovement_technicalKey_idx" ON "LubricantMovement"("technicalKey");

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

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialMovement" ADD CONSTRAINT "MaterialMovement_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialMovement" ADD CONSTRAINT "MaterialMovement_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LubricantMachineApplication" ADD CONSTRAINT "LubricantMachineApplication_lubricantId_fkey" FOREIGN KEY ("lubricantId") REFERENCES "Lubricant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LubricantMovement" ADD CONSTRAINT "LubricantMovement_lubricantId_fkey" FOREIGN KEY ("lubricantId") REFERENCES "Lubricant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

