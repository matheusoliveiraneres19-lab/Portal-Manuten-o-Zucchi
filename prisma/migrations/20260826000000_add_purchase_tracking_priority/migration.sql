-- Prioridade da compra lida da coluna "Nº acompanhamento" + valor líquido da compra.
-- Migration ADITIVA: colunas nulas, nenhum dado existente é alterado ou apagado.
--
-- trackingNumber   = valor CRU da coluna "Nº acompanhamento" (ex.: "N03").
-- purchasePriority = valor NORMALIZADO ("N1".."N4"); NULL = sem prioridade.
-- netValue         = coluna "Valor líquido"; única fonte do card "Valor comprado".
--                    Separada de "netTotal" ("Total liq") de propósito — não há
--                    fallback entre as duas.

ALTER TABLE "PurchaseRecord" ADD COLUMN IF NOT EXISTS "trackingNumber" TEXT;
ALTER TABLE "PurchaseRecord" ADD COLUMN IF NOT EXISTS "purchasePriority" TEXT;
ALTER TABLE "PurchaseRecord" ADD COLUMN IF NOT EXISTS "netValue" DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS "PurchaseRecord_purchasePriority_idx"
  ON "PurchaseRecord" ("purchasePriority");
