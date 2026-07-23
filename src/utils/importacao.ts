import {
  Criticality,
  LubricantMovementType,
  MaintenanceType,
  PurchaseStatus,
  ServiceOrderStatus
} from "@prisma/client";

export function normalizarNomeColuna(value: string) {
  return limparTexto(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

export function converterDataExcel(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + value * 24 * 60 * 60 * 1000);
  }

  const text = limparTexto(value);
  if (!text) {
    return null;
  }

  // dd/mm/aaaa, dd.mm.aaaa (SAP) ou dd-mm-aaaa — separador . / ou -.
  const brDate = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (brDate) {
    const day = Number(brDate[1]);
    const month = Number(brDate[2]) - 1;
    const year = Number(brDate[3].length === 2 ? `20${brDate[3]}` : brDate[3]);
    return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function converterNumeroBrasileiro(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const text = limparTexto(value)
    .replace(/\s/g, "")
    .replace(/^R\$/i, "")
    .replace(/\./g, "")
    .replace(",", ".");

  if (!text) {
    return null;
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function converterHorasParaDecimal(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const text = limparTexto(value).toLowerCase();
  if (!text) {
    return null;
  }

  const hourMinute = text.match(/^(\d{1,3}):([0-5]\d)$/);
  if (hourMinute) {
    return Number(hourMinute[1]) + Number(hourMinute[2]) / 60;
  }

  const textHours = text.match(/^(\d+(?:[,.]\d+)?)\s*h?$/);
  if (textHours) {
    return converterNumeroBrasileiro(textHours[1]);
  }

  return null;
}

export function limparTexto(value: unknown) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Separa um campo composto no formato "R\u00f3tulo (c\u00f3digo)" do export cru do SAP.
 * Pega o \u00daLTIMO grupo de par\u00eanteses (r\u00f3tulos podem ter par\u00eanteses internos),
 * aplicando trim no r\u00f3tulo e no c\u00f3digo. Quando n\u00e3o h\u00e1 par\u00eanteses, devolve o
 * texto inteiro como r\u00f3tulo e `code = null`.
 *
 * Ex.: "BIFIO DESALINHADO (4005060)" -> { label: "BIFIO DESALINHADO", code: "4005060" }
 *      "aberto (0)"                  -> { label: "aberto", code: "0" }
 *      "Servi\u00e7o Terceiro"            -> { label: "Servi\u00e7o Terceiro", code: null }
 */
export function splitLabelCode(value: unknown): { label: string; code: string | null; raw: string } {
  const raw = limparTexto(value);
  if (!raw) {
    return { label: "", code: null, raw };
  }

  // `.*` \u00e9 guloso, ent\u00e3o captura at\u00e9 o \u00daLTIMO "(" -> \u00faltimo grupo de par\u00eanteses.
  const match = raw.match(/^(.*)\(([^()]*)\)\s*$/);
  if (match) {
    return { label: limparTexto(match[1]), code: limparTexto(match[2]) || null, raw };
  }

  return { label: raw, code: null, raw };
}

export function padronizarStatusOS(value: unknown): ServiceOrderStatus | null {
  // O export cru do SAP traz o status como "r\u00f3tulo (c\u00f3digo)" (ex.: "aberto (0)").
  // Separamos para casar tanto pelo r\u00f3tulo quanto pelo c\u00f3digo num\u00e9rico do SAP.
  const { label, code } = splitLabelCode(value);
  const normalized = normalizeEnumText(label || code || "");
  const map: Record<string, ServiceOrderStatus> = {
    aberta: ServiceOrderStatus.ABERTA,
    aberto: ServiceOrderStatus.ABERTA,
    liberada: ServiceOrderStatus.LIBERADA,
    liberado: ServiceOrderStatus.LIBERADA,
    lib: ServiceOrderStatus.LIBERADA,
    em_andamento: ServiceOrderStatus.EM_ANDAMENTO,
    andamento: ServiceOrderStatus.EM_ANDAMENTO,
    aguardando_material: ServiceOrderStatus.AGUARDANDO_MATERIAL,
    aguardando_peca: ServiceOrderStatus.AGUARDANDO_MATERIAL,
    fechada: ServiceOrderStatus.FECHADA,
    fechado: ServiceOrderStatus.FECHADA,
    concluida: ServiceOrderStatus.FECHADA,
    concluido: ServiceOrderStatus.FECHADA,
    concl: ServiceOrderStatus.FECHADA,
    // SAP: "Tecnicamente encerrado" (TECO) = ordem tecnicamente conclu\u00edda.
    tecnicamente_encerrado: ServiceOrderStatus.FECHADA,
    tecnicamente_encerrada: ServiceOrderStatus.FECHADA,
    tecnicamente_concluida: ServiceOrderStatus.FECHADA,
    tecnicamente_concluido: ServiceOrderStatus.FECHADA,
    encerrado: ServiceOrderStatus.FECHADA,
    encerrada: ServiceOrderStatus.FECHADA,
    encerr: ServiceOrderStatus.FECHADA,
    finalizada: ServiceOrderStatus.FECHADA,
    finalizado: ServiceOrderStatus.FECHADA,
    teco: ServiceOrderStatus.FECHADA,
    tecn: ServiceOrderStatus.FECHADA,
    conf: ServiceOrderStatus.FECHADA,
    cnf: ServiceOrderStatus.FECHADA,
    cancelada: ServiceOrderStatus.CANCELADA,
    cancelado: ServiceOrderStatus.CANCELADA
  };

  const byLabel = map[normalized];
  if (byLabel) {
    return byLabel;
  }

  // Fallback pelo c\u00f3digo do SAP (0 = aberto, 2 = liberado, 3 = tecnicamente encerrado).
  const codeMap: Record<string, ServiceOrderStatus> = {
    "0": ServiceOrderStatus.ABERTA,
    "2": ServiceOrderStatus.LIBERADA,
    "3": ServiceOrderStatus.FECHADA
  };
  const effectiveCode = code ?? (/^\d+$/.test(normalized) ? normalized : null);
  if (effectiveCode && codeMap[effectiveCode]) {
    return codeMap[effectiveCode];
  }

  return null;
}

export function padronizarTipoManutencao(value: unknown): MaintenanceType | null {
  const normalized = normalizeEnumText(value);
  const map: Record<string, MaintenanceType> = {
    corretiva: MaintenanceType.CORRETIVA,
    preventiva: MaintenanceType.PREVENTIVA,
    preditiva: MaintenanceType.PREDITIVA,
    melhoria: MaintenanceType.MELHORIA,
    inspecao: MaintenanceType.INSPECAO,
    inspeção: MaintenanceType.INSPECAO
  };

  return map[normalized] ?? null;
}

export function padronizarCriticidade(value: unknown): Criticality | null {
  const normalized = normalizeEnumText(value);
  const map: Record<string, Criticality> = {
    baixa: Criticality.BAIXA,
    media: Criticality.MEDIA,
    medio: Criticality.MEDIA,
    alta: Criticality.ALTA,
    critica: Criticality.CRITICA,
    critico: Criticality.CRITICA
  };

  return map[normalized] ?? null;
}

export function padronizarStatusCompra(value: unknown): PurchaseStatus | null {
  const normalized = normalizeEnumText(value);
  const map: Record<string, PurchaseStatus> = {
    solicitada: PurchaseStatus.SOLICITADA,
    solicitado: PurchaseStatus.SOLICITADA,
    em_cotacao: PurchaseStatus.EM_COTACAO,
    cotacao: PurchaseStatus.EM_COTACAO,
    aprovada: PurchaseStatus.APROVADA,
    aprovado: PurchaseStatus.APROVADA,
    comprada: PurchaseStatus.COMPRADA,
    comprado: PurchaseStatus.COMPRADA,
    entregue: PurchaseStatus.ENTREGUE,
    atrasada: PurchaseStatus.ATRASADA,
    atrasado: PurchaseStatus.ATRASADA,
    cancelada: PurchaseStatus.CANCELADA,
    cancelado: PurchaseStatus.CANCELADA
  };

  return map[normalized] ?? null;
}

export function identificarTipoMovimentoLubrificante(value: unknown): LubricantMovementType | null {
  const normalized = normalizeEnumText(value);
  const map: Record<string, LubricantMovementType> = {
    compra: LubricantMovementType.COMPRA,
    entrada: LubricantMovementType.COMPRA,
    consumo: LubricantMovementType.CONSUMO,
    saida: LubricantMovementType.CONSUMO,
    saida_consumo: LubricantMovementType.CONSUMO,
    ajuste: LubricantMovementType.AJUSTE
  };

  return map[normalized] ?? null;
}

function normalizeEnumText(value: unknown) {
  return limparTexto(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}
