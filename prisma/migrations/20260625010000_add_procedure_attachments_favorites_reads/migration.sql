-- Central de Procedimentos (fase 03) — anexos, favoritos, confirmação de leitura e
-- ordem da trilha. Aplicada no Supabase via MCP apply_migration (NÃO via migrate dev).
-- Aditiva: novas tabelas + 1 coluna; não altera dados existentes.

ALTER TABLE "Procedure" ADD COLUMN IF NOT EXISTS "onboardingOrder" INTEGER;

CREATE TABLE IF NOT EXISTS "ProcedureAttachment" (
  "id" TEXT NOT NULL,
  "procedureId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileType" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "fileSize" INTEGER,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcedureAttachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProcedureAttachment_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "Procedure"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ProcedureAttachment_procedureId_idx" ON "ProcedureAttachment"("procedureId");

CREATE TABLE IF NOT EXISTS "ProcedureFavorite" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "procedureId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcedureFavorite_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProcedureFavorite_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "Procedure"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProcedureFavorite_userId_procedureId_key" ON "ProcedureFavorite"("userId", "procedureId");
CREATE INDEX IF NOT EXISTS "ProcedureFavorite_userId_idx" ON "ProcedureFavorite"("userId");
CREATE INDEX IF NOT EXISTS "ProcedureFavorite_procedureId_idx" ON "ProcedureFavorite"("procedureId");

CREATE TABLE IF NOT EXISTS "ProcedureReadConfirmation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "procedureId" TEXT NOT NULL,
  "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcedureReadConfirmation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProcedureReadConfirmation_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "Procedure"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProcedureReadConfirmation_userId_procedureId_key" ON "ProcedureReadConfirmation"("userId", "procedureId");
CREATE INDEX IF NOT EXISTS "ProcedureReadConfirmation_userId_idx" ON "ProcedureReadConfirmation"("userId");
CREATE INDEX IF NOT EXISTS "ProcedureReadConfirmation_procedureId_idx" ON "ProcedureReadConfirmation"("procedureId");

-- RLS habilitado (sem policies) — consistente com as demais tabelas; o app acessa via
-- Prisma com a connection string (role service), que ignora RLS.
ALTER TABLE "ProcedureAttachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProcedureFavorite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProcedureReadConfirmation" ENABLE ROW LEVEL SECURITY;

-- Bucket privado para os materiais de apoio (criado via storage.buckets):
-- insert into storage.buckets (id, name, public) values ('procedure-attachments','procedure-attachments', false);
