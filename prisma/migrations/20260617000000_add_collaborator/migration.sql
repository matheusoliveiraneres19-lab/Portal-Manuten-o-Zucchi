-- Migration ADITIVA: módulo Equipe e Horas (cadastro de colaboradores).
-- Não altera nenhuma tabela existente (TimeEntry já possui índice em userName).

-- CreateEnum
CREATE TYPE "CollaboratorArea" AS ENUM ('MECANICA', 'ELETRICA', 'AUTOMACAO', 'OUTROS');

-- CreateEnum
CREATE TYPE "CollaboratorStatus" AS ENUM ('ATIVO', 'FERIAS', 'AFASTADO', 'DESLIGADO');

-- CreateTable
CREATE TABLE "Collaborator" (
    "id" TEXT NOT NULL,
    "matricula" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "role" TEXT,
    "area" "CollaboratorArea" NOT NULL DEFAULT 'OUTROS',
    "shift" TEXT,
    "monthlyGoal" DOUBLE PRECISION NOT NULL DEFAULT 220,
    "status" "CollaboratorStatus" NOT NULL DEFAULT 'ATIVO',
    "admissionDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collaborator_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Collaborator_matricula_key" ON "Collaborator"("matricula");

-- CreateIndex
CREATE INDEX "Collaborator_matricula_idx" ON "Collaborator"("matricula");

-- CreateIndex
CREATE INDEX "Collaborator_nameKey_idx" ON "Collaborator"("nameKey");

-- CreateIndex
CREATE INDEX "Collaborator_status_idx" ON "Collaborator"("status");

-- CreateIndex
CREATE INDEX "Collaborator_area_idx" ON "Collaborator"("area");
