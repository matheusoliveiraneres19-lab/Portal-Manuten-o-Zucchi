-- Classificação hierárquica N1 > N2 > N3 > N4 das requisições de compra.
-- Migration ADITIVA: colunas nulas, nenhum dado existente é alterado ou apagado.
-- Não confundir com `requisitionLevel` ("Nível requisição" do SAP), que já existia
-- e continua intacto — N1..N4 é a taxonomia de análise da planilha de compras.

ALTER TABLE "PurchaseRecord" ADD COLUMN IF NOT EXISTS "classificationN1" TEXT;
ALTER TABLE "PurchaseRecord" ADD COLUMN IF NOT EXISTS "classificationN2" TEXT;
ALTER TABLE "PurchaseRecord" ADD COLUMN IF NOT EXISTS "classificationN3" TEXT;
ALTER TABLE "PurchaseRecord" ADD COLUMN IF NOT EXISTS "classificationN4" TEXT;

CREATE INDEX IF NOT EXISTS "PurchaseRecord_classificationN1_idx"
  ON "PurchaseRecord" ("classificationN1");
CREATE INDEX IF NOT EXISTS "PurchaseRecord_classificationN2_idx"
  ON "PurchaseRecord" ("classificationN2");
