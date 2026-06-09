/**
 * Service de Materiais — indicadores de movimentação de materiais (MaterialMovement).
 * "Mais utilizados" = materiais com saída (SAIDA) dentro do período.
 */
import { MaterialMovementType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withinPeriod, type DateRange } from "@/utils/date-range";

export type MostUsedMaterial = {
  materialId: string;
  name: string;
  code: string;
  unit: string;
  totalQuantity: number;
};

/**
 * Quantidade de materiais distintos com saída no período (KPI "Materiais Mais Utilizados").
 */
export async function getMostUsedMaterialsCount(period: DateRange): Promise<number> {
  const grouped = await prisma.materialMovement.groupBy({
    by: ["materialId"],
    where: {
      type: MaterialMovementType.SAIDA,
      movementDate: withinPeriod(period)
    },
    _sum: { quantity: true }
  });

  return grouped.length;
}

/**
 * Ranking de materiais mais utilizados (saída) no período, com nome/código.
 * Disponível para gráficos/tabelas de materiais sem recalcular em outro lugar.
 */
export async function getMostUsedMaterials(period: DateRange, limit = 10): Promise<MostUsedMaterial[]> {
  const grouped = await prisma.materialMovement.groupBy({
    by: ["materialId"],
    where: {
      type: MaterialMovementType.SAIDA,
      movementDate: withinPeriod(period)
    },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: limit
  });

  if (!grouped.length) {
    return [];
  }

  const materials = await prisma.material.findMany({
    where: { id: { in: grouped.map((item) => item.materialId) } },
    select: { id: true, name: true, code: true, unit: true }
  });
  const byId = new Map(materials.map((material) => [material.id, material]));

  return grouped.flatMap((item) => {
    const material = byId.get(item.materialId);

    return material
      ? [
          {
            materialId: material.id,
            name: material.name,
            code: material.code,
            unit: material.unit,
            totalQuantity: Number(item._sum.quantity ?? 0)
          }
        ]
      : [];
  });
}
