-- ANÁLISE MRP (FASE D) — posição do material na análise.
--
-- O resultado de analisar() segue a ordem de materiais() (ordem das abas da
-- Base MRP e linha de origem). Essa ordem decide os desempates das ordenações
-- estáveis das telas e a ordem das somas dos KPIs, então precisa ser guardada.
--
-- ADITIVA e idempotente: só a tabela MRP "MrpAnalysisItem" (criada na FASE B).
ALTER TABLE "MrpAnalysisItem" ADD COLUMN IF NOT EXISTS "position" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "MrpAnalysisItem_runId_position_idx" ON "MrpAnalysisItem"("runId", "position");
