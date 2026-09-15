"use client";

import { KpiGrid, type KpiCardData, type KpiTone } from "@/components/ui/KpiGrid";

/**
 * Alias das abas de Compras para a grade de KPIs do portal.
 *
 * A implementação mora em `@/components/ui/KpiGrid` desde que Ordens de Serviço
 * passou a usar a mesma grade (FASE 10). Este arquivo existe só para as telas de
 * Compras não precisarem mudar de import — os tipos e o comportamento são os mesmos.
 */
export type PurchaseKpiTone = KpiTone;
export type PurchaseKpiCard = KpiCardData;

export const PurchaseKpiCards = KpiGrid;
