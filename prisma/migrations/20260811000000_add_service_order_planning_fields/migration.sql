-- Campos de planejamento da Ordem de Manutenção (SAP PM/Fiori) usados pela aba
-- Equipamentos Críticos: tipo de atividade, tipo de manutenção e tipo de ordem.
-- Migration ADITIVA: colunas nulas, nenhum dado existente é alterado ou apagado.
-- `planningGroup` / `planningGroupCode` já existiam e NÃO são duplicados aqui.

ALTER TABLE "ServiceOrder" ADD COLUMN IF NOT EXISTS "planningActivityType" TEXT;
ALTER TABLE "ServiceOrder" ADD COLUMN IF NOT EXISTS "maintenanceType" TEXT;
ALTER TABLE "ServiceOrder" ADD COLUMN IF NOT EXISTS "orderType" TEXT;

CREATE INDEX IF NOT EXISTS "ServiceOrder_planningActivityType_idx"
  ON "ServiceOrder" ("planningActivityType");
