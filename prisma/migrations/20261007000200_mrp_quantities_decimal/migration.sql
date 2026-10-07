-- ANÁLISE MRP (FASE B) — quantidades de DOUBLE PRECISION para DECIMAL(65,30).
--
-- Motivo: o servidor roda com extra_float_digits = 0, então todo float8 trafega
-- como texto de 15 dígitos — 0.30000000000000004 vira 0.3 e 434.99999999999994
-- vira 434.9999999999999, na gravação e na leitura pelo Prisma. O numeric faz a
-- ida e volta EXATA do Number do JS (única perda: -0 vira 0). Medido por
-- scripts/mrp/test-numeric-precision.ts.
--
-- Só toca as tabelas MRP criadas em 20261007000100 (nenhuma tabela antiga).
-- Bancos novos já nascem com DECIMAL pela 20261007000100; aqui a conversão só
-- acontece onde a coluna ainda é double precision (idempotente).
--
-- A conversão passa pelo texto com extra_float_digits = 3 (dígitos suficientes
-- para o valor exato do double), e não pelo cast direto float8 -> numeric, que
-- arredonda para 15 dígitos.

SET extra_float_digits = 3;

DO $$
DECLARE
  col RECORD;
BEGIN
  FOR col IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND data_type = 'double precision'
      AND (table_name, column_name) IN (
        ('MrpBaseMaterial', 'min'),
        ('MrpBaseMaterial', 'max'),
        ('MrpStockItem', 'freeQty'),
        ('MrpPurchaseItem', 'quantity'),
        ('MrpAnalysisItem', 'min'),
        ('MrpAnalysisItem', 'max'),
        ('MrpAnalysisItem', 'free'),
        ('MrpAnalysisItem', 'suggested'),
        ('MrpAnalysisItem', 'suggestedOriginal'),
        ('MrpAnalysisItem', 'missing'),
        ('MrpAnalysisItem', 'purchaseQty')
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE DECIMAL(65,30) USING (%I::text)::numeric',
      col.table_name, col.column_name, col.column_name
    );
  END LOOP;
END $$;

RESET extra_float_digits;
