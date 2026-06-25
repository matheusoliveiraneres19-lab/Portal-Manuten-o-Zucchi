-- Central de Procedimentos (fase 02) — extensão ADITIVA do model Procedure.
-- Aplicada no Supabase via MCP apply_migration (NÃO via prisma migrate dev — ver
-- memória prisma-supabase-migration-desync). Mantém os campos legados intactos.

ALTER TABLE "Procedure"
  ALTER COLUMN "category" SET DEFAULT 'OUTROS',
  ADD COLUMN IF NOT EXISTS "slug" TEXT,
  ADD COLUMN IF NOT EXISTS "categoryName" TEXT,
  ADD COLUMN IF NOT EXISTS "summary" TEXT,
  ADD COLUMN IF NOT EXISTS "objective" TEXT,
  ADD COLUMN IF NOT EXISTS "whenToUse" TEXT,
  ADD COLUMN IF NOT EXISTS "content" TEXT,
  ADD COLUMN IF NOT EXISTS "commonMistakes" TEXT,
  ADD COLUMN IF NOT EXISTS "level" TEXT NOT NULL DEFAULT 'Básico',
  ADD COLUMN IF NOT EXISTS "estimatedMinutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "targetAudience" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'Publicado',
  ADD COLUMN IF NOT EXISTS "tags" TEXT,
  ADD COLUMN IF NOT EXISTS "isFeatured" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "isOnboarding" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "viewCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastReviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "nextReviewAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "Procedure_slug_key" ON "Procedure"("slug");
CREATE INDEX IF NOT EXISTS "Procedure_status_idx" ON "Procedure"("status");
CREATE INDEX IF NOT EXISTS "Procedure_categoryName_idx" ON "Procedure"("categoryName");
CREATE INDEX IF NOT EXISTS "Procedure_isFeatured_idx" ON "Procedure"("isFeatured");
CREATE INDEX IF NOT EXISTS "Procedure_isOnboarding_idx" ON "Procedure"("isOnboarding");
