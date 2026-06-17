-- Migration ADITIVA: campos de férias no Collaborator (módulo Equipe e Horas, ETAPA 2).
-- Apenas adiciona colunas opcionais; não altera dados existentes.

ALTER TABLE "Collaborator" ADD COLUMN "vacationStartDate" TIMESTAMP(3);
ALTER TABLE "Collaborator" ADD COLUMN "acquisitionPeriodStart" TIMESTAMP(3);
