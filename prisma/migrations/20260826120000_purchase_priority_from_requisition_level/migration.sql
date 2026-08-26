-- Corrige a ORIGEM da prioridade e do valor comprado das compras.
--
-- Descoberta: na planilha do portal a prioridade N1..N4 vem da coluna
-- "Nível requisição" (já mapeada em `requisitionLevel`) e o valor comprado da
-- coluna "Total líquido" (já mapeada em `netTotal`). A migration anterior
-- (20260826000000) apostou em "Nº acompanhamento" e "Valor líquido", que não
-- existem nesse export.
--
-- 1) Remove `netValue`: criada na migration anterior, NUNCA recebeu dado (a
--    importação que a alimentaria nunca rodou) e era redundante com `netTotal`,
--    que já é a coluna correta. Deixá-la seria uma coluna morta ao lado de
--    `netTotal` — confusão garantida para quem ler o schema depois.
ALTER TABLE "PurchaseRecord" DROP COLUMN IF EXISTS "netValue";

-- 2) Backfill de `purchasePriority` a partir de `requisitionLevel` (ou, na falta
--    dele, de `trackingNumber`) — a MESMA precedência do importador.
--
--    Sem isto, os dashboards por prioridade só acenderiam depois de uma
--    reimportação: as 3.353 linhas já no banco foram importadas antes das
--    colunas existirem. Os valores presentes ("N1".."N4", "N01", "2") são
--    exatamente os que a regra reconhece.
--
--    A expressão espelha `normalizePurchasePriority` (src/utils/purchases-normalizer.ts):
--    remove tudo que não é letra/dígito, minúsculo, prefixo opcional e zeros à
--    esquerda, aceitando só 1..4. `WHERE purchasePriority IS NULL` torna a
--    migration idempotente e impede que ela sobrescreva o que a importação já
--    gravou.
UPDATE "PurchaseRecord"
SET "purchasePriority" = 'N' || substring(
      lower(regexp_replace(coalesce("requisitionLevel", "trackingNumber"), '[^A-Za-z0-9]', '', 'g'))
      from '^(?:n|nivel|niveis|prioridade|prior|prio|p)?0*([1-4])$')
WHERE "purchasePriority" IS NULL
  AND coalesce("requisitionLevel", "trackingNumber") IS NOT NULL
  AND lower(regexp_replace(coalesce("requisitionLevel", "trackingNumber"), '[^A-Za-z0-9]', '', 'g'))
      ~ '^(?:n|nivel|niveis|prioridade|prior|prio|p)?0*[1-4]$';
