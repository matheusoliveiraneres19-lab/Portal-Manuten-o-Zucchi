import { ImportType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { DataQualitySummary } from "@/types/data-quality";

/**
 * QUALIDADE DOS DADOS — montagem compartilhada.
 *
 * Cada aba responde as mesmas três perguntas ("quantos registros entraram", "o que
 * ficou de fora", "de quando é a base"), então a parte comum mora aqui: só o conteúdo
 * específico é de cada service. Sem isso, cinco abas escreveriam cinco variações da
 * mesma consulta ao histórico de importação, e elas divergiriam na primeira mudança.
 */

/** Última importação bem-sucedida de um módulo, para carimbar a idade da base. */
export async function getLastImport(type: ImportType): Promise<{ at: string | null; label: string | null }> {
  try {
    const last = await prisma.importHistory.findFirst({
      where: { type, status: "SUCESSO" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, fileName: true, totalRows: true }
    });
    if (!last) return { at: null, label: null };

    const rows = last.totalRows ? `${last.totalRows.toLocaleString("pt-BR")} linhas` : null;
    return {
      at: last.createdAt.toISOString(),
      label: [last.fileName, rows].filter(Boolean).join(" · ") || null
    };
  } catch (error) {
    console.error("Falha ao ler o histórico de importação.", error);
    return { at: null, label: null };
  }
}

type BuildInput = Omit<DataQualitySummary, "lastImportAt" | "lastImportLabel"> & {
  importType: ImportType;
};

/**
 * Completa o resumo com os dados da última importação do módulo.
 *
 * Os números de registros vêm do service, porque só ele sabe qual recorte a tela está
 * mostrando — medir aqui daria o total da tabela, que é justamente o erro que a FASE 2
 * corrigiu nos filtros.
 */
export async function buildDataQualitySummary({ importType, ...rest }: BuildInput): Promise<DataQualitySummary> {
  const lastImport = await getLastImport(importType);
  return { ...rest, lastImportAt: lastImport.at, lastImportLabel: lastImport.label };
}
