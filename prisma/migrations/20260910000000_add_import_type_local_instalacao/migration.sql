-- Adiciona LOCAL_INSTALACAO ao enum ImportType.
--
-- ISOLADA DE PROPÓSITO: o PostgreSQL proíbe USAR um valor de enum na MESMA
-- transação em que ele foi criado. Mantendo esta migration sozinha, nenhuma
-- outra instrução pode esbarrar nessa restrição.
--
-- Aditiva e reversível na prática: nenhuma linha existente muda. As importações
-- de "Local de Instalação" gravadas antes desta migration continuam com o valor
-- antigo (EQUIPAMENTOS) e seguem sendo exibidas normalmente no histórico.
ALTER TYPE "ImportType" ADD VALUE IF NOT EXISTS 'LOCAL_INSTALACAO';
