/**
 * Cadastro de LOCAIS DE INSTALAÇÃO (planilha importada) como Map por TAG, para
 * resolver máquina-raiz e repartimento com `utils/functional-location-hierarchy`.
 *
 * O cadastro só muda numa importação de locais, mas a aba Ordens de Serviço o usa
 * a cada navegação (ranking por máquina). Uma cópia em memória por 10 minutos evita
 * uma consulta extra por página — relevante pelo histórico de "max clients reached"
 * no Supabase. Opcional por natureza: tabela vazia ou indisponível devolve Map vazio
 * e o resolvedor usa só o padrão estrutural do TAG.
 *
 * Equipamentos Críticos mantém o próprio carregador (sem cache); este é o da aba
 * Ordens de Serviço.
 */
import { prisma } from "@/lib/prisma";
import type { FunctionalLocationLite } from "@/utils/functional-location-hierarchy";

const TTL_MS = 10 * 60 * 1000;

let cached: { at: number; lookup: Map<string, FunctionalLocationLite> } | null = null;
let inflight: Promise<Map<string, FunctionalLocationLite>> | null = null;

export async function getFunctionalLocationLookup(): Promise<Map<string, FunctionalLocationLite>> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.lookup;
  // Requisições simultâneas compartilham a mesma consulta.
  if (inflight) return inflight;

  inflight = prisma.functionalLocation
    .findMany({
      select: {
        tag: true,
        description: true,
        costCenter: true,
        rootTag: true,
        rootDescription: true,
        equipmentFamily: true,
        parentTag: true
      }
    })
    .then((rows) => {
      const lookup = new Map<string, FunctionalLocationLite>(rows.map((row) => [row.tag, row]));
      cached = { at: Date.now(), lookup };
      return lookup;
    })
    .catch((error) => {
      console.warn("[ordens-servico] cadastro de locais indisponível — usando padrão estrutural do TAG.", error);
      // Sem cache em falha: a próxima requisição tenta de novo.
      return new Map<string, FunctionalLocationLite>();
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}
