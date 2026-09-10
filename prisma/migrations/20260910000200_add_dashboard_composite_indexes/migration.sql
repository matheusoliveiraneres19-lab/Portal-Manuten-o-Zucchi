-- Índices COMPOSTOS para os filtros que os dashboards realmente combinam.
--
-- Só entrou índice cujo par (igualdade, range) aparece junto em query real do
-- código — nada especulativo. Índice sobrando custa escrita em toda importação,
-- que é justamente a operação mais pesada do portal.
--
-- Aditivo: nenhum índice existente é removido, nenhum dado muda, nenhum plano de
-- consulta atual deixa de funcionar (o planner escolhe o melhor caminho).
--
-- ATENÇÃO OPERACIONAL: CREATE INDEX (sem CONCURRENTLY) toma lock de escrita na
-- tabela enquanto constrói. Aqui é intencional — o Prisma roda a migration em
-- transação e CONCURRENTLY não pode rodar dentro de uma. As tabelas são de porte
-- médio e a janela é de segundos; ainda assim, aplique fora do horário de
-- importação. Se alguma tabela crescer muito, crie o índice à mão com
-- CONCURRENTLY antes de rodar a migration — o IF NOT EXISTS a torna no-op.

-- ServiceOrder — critical-equipments/buildWhere: range de `openedAt` + `status IN (...)`.
CREATE INDEX IF NOT EXISTS "ServiceOrder_status_openedAt_idx"
  ON "ServiceOrder"("status", "openedAt");

-- PurchaseRecord — TODO dashboard de Compras parte de `ignored = false` e soma
-- um range em purchaseOrderDate ou requisitionDate (buildFilterWhere).
CREATE INDEX IF NOT EXISTS "PurchaseRecord_ignored_purchaseOrderDate_idx"
  ON "PurchaseRecord"("ignored", "purchaseOrderDate");
CREATE INDEX IF NOT EXISTS "PurchaseRecord_ignored_requisitionDate_idx"
  ON "PurchaseRecord"("ignored", "requisitionDate");

-- PcFactoryRecord — buildWhere combina categoria/toggle de manutenção com o
-- range de `startDateTime` em praticamente toda consulta da aba.
CREATE INDEX IF NOT EXISTS "PcFactoryRecord_statusCategory_startDateTime_idx"
  ON "PcFactoryRecord"("statusCategory", "startDateTime");
CREATE INDEX IF NOT EXISTS "PcFactoryRecord_isMaintenanceKpi_startDateTime_idx"
  ON "PcFactoryRecord"("isMaintenanceKpi", "startDateTime");

-- LubricantMovement — entradas/saídas por período: `movementCategory` +
-- `movementDate` aparecem juntos em 6 consultas do service.
CREATE INDEX IF NOT EXISTS "LubricantMovement_movementCategory_movementDate_idx"
  ON "LubricantMovement"("movementCategory", "movementDate");
