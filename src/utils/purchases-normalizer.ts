/**
 * Funções puras de normalização e classificação da planilha de Compras (SAP/Fiori).
 * Sem dependência de Prisma ou React — testáveis isoladamente.
 *
 * Concentra TODAS as regras de negócio de compras (pedido criado, MIGO/MIRO,
 * recebimento, atrasos, Y01/Y04, material/serviço, bloqueados). Os services e o
 * importador apenas consomem estas funções — fonte única das regras.
 */
import { ItemNature, PurchaseType } from "@prisma/client";
import { converterDataExcel, converterNumeroBrasileiro, limparTexto } from "@/utils/importacao";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

/** Reaproveita o parser de número brasileiro ("1.234,56", number, "R$ ..."). */
export function parsePurchaseNumber(value: unknown): number | null {
  return converterNumeroBrasileiro(value);
}

/** Reaproveita o conversor de datas (serial Excel, dd/mm/aaaa, ISO). */
export function parsePurchaseDate(value: unknown): Date | null {
  return converterDataExcel(value);
}

/** Texto limpo ou null quando vazio. */
export function optionalText(value: unknown): string | null {
  const text = limparTexto(value);
  return text || null;
}

/* ------------------------------------------------------------------ */
/* Helpers de normalização (TAREFA 2)                                 */
/* ------------------------------------------------------------------ */

/** Texto sem acento, minúsculo, espaços colapsados — base das comparações. */
export function normalizeText(value: unknown): string {
  return normalizeLoose(value).replace(/\s+/g, " ").trim();
}

/** Há conteúdo real (não vazio, não só espaços). */
export function hasValue(value: unknown): boolean {
  return normalizeText(value).length > 0;
}

/** Marcado com "X" (aceita "X", "x", " X "). */
export function isMarkedX(value: unknown): boolean {
  return normalizeText(value) === "x";
}

/** Alias semântico do conversor de datas (serial Excel, dd/mm/aaaa, ISO). */
export function parseDate(value: unknown): Date | null {
  return converterDataExcel(value);
}

/**
 * Documento SAP "válido": texto não vazio, com ao menos um dígito e que não seja
 * apenas zeros. Cobre "Pedido de Compra", "MIGO" e "MIRO" — quando vazio, "0",
 * "-" ou sem número, considera-se ausente.
 */
export function isValidSapDocument(value: unknown): boolean {
  const text = limparTexto(value);
  if (!text) {
    return false;
  }
  const digits = text.replace(/\D/g, "");
  if (!digits) {
    return false;
  }
  return Number(digits) > 0;
}

/** Marca de recebimento concluído (Recbconcl = "X"). */
export function isReceiptFlagSet(value: unknown): boolean {
  return isMarkedX(value);
}

/* ------------------------------------------------------------------ */
/* Classificação hierárquica N1 > N2 > N3 > N4                        */
/* ------------------------------------------------------------------ */

/** Níveis da taxonomia de compras, na ordem hierárquica. */
export const CLASSIFICATION_LEVELS = ["n1", "n2", "n3", "n4"] as const;
export type ClassificationLevel = (typeof CLASSIFICATION_LEVELS)[number];

/** Rótulos curtos usados em colunas, filtros e gráficos. */
export const CLASSIFICATION_LEVEL_LABELS: Record<ClassificationLevel, string> = {
  n1: "N1",
  n2: "N2",
  n3: "N3",
  n4: "N4"
};

/**
 * Valores que a planilha usa para dizer "sem classificação". Tratados como
 * ausentes para não virarem uma categoria falsa nos gráficos.
 */
const CLASSIFICATION_PLACEHOLDERS = new Set(["", "-", "--", "#", "n/a", "na", "nd", "null", "0", "sem classificacao"]);

/**
 * Normaliza um valor de nível N1/N2/N3/N4 vindo da planilha:
 * limpa espaços duplicados e devolve `null` para vazio/placeholder.
 * PRESERVA a acentuação e a caixa originais — é o texto exibido ao usuário;
 * o agrupamento usa `classificationKey` (insensível a caixa/acento).
 */
export function normalizeClassificationLevel(value: unknown): string | null {
  const text = limparTexto(value).replace(/\s+/g, " ").trim();
  if (!text) {
    return null;
  }
  if (CLASSIFICATION_PLACEHOLDERS.has(normalizeText(text))) {
    return null;
  }
  return text;
}

/**
 * Chave estável de agrupamento de um nível (sem acento, minúsculo). Evita que
 * "Elétrica" e "ELETRICA" virem duas barras distintas no gráfico.
 * Devolve "" quando o valor é ausente.
 */
export function classificationKey(value: unknown): string {
  return normalizeText(normalizeClassificationLevel(value) ?? "");
}

/* ------------------------------------------------------------------ */
/* Classificação de natureza da compra (Grupo Comp) e do item         */
/* ------------------------------------------------------------------ */

/** Y04 = Regularização, Y01 = Compra normal, demais = OUTROS. */
export function classifyPurchaseType(purchasingGroup: unknown): PurchaseType {
  const code = limparTexto(purchasingGroup).toUpperCase();
  if (code.includes("Y04")) {
    return PurchaseType.REGULARIZACAO;
  }
  if (code.includes("Y01")) {
    return PurchaseType.NORMAL;
  }
  return PurchaseType.OUTROS;
}

/**
 * Serviço = Grupo de Mercadorias (Grupo Merc / goodsGroupCode) contém Y0008
 * (TAREFA 8). Também confere a descrição do grupo por segurança.
 */
export function isServiceByGoodsGroup(goodsGroupCode: unknown, goodsGroupDescription?: unknown): boolean {
  return (
    normalizeText(goodsGroupCode).includes("y0008") ||
    normalizeText(goodsGroupDescription).includes("y0008")
  );
}

/** Y04 = Regularização, no Grupo Comp (purchasingGroup). */
export function isRegularizationByGroup(purchasingGroup: unknown): boolean {
  return normalizeText(purchasingGroup).includes("y04");
}

/* ------------------------------------------------------------------ */
/* Predicados da REGRA v3.1 do HTML (acompanhamento_compras_v3.1)      */
/* ------------------------------------------------------------------ */

/**
 * "Célula preenchida" com a MESMA semântica do HTML, que testa a veracidade do
 * valor cru da planilha (`!!get(row, 'Pedido de Compra')`). Por isso:
 *  - `null` / `undefined` / `""` / `0` / `false` → vazio;
 *  - qualquer outro texto, número ou `Date` válido → preenchido.
 *
 * Repare que NÃO há trim: no HTML uma célula com espaços conta como preenchida.
 * Os campos do portal já chegam limpos por `limparTexto`/`optionalText`, então a
 * diferença é inócua — mas o comportamento fica idêntico ao original.
 */
export function hasSpreadsheetValue(value: unknown): boolean {
  if (value === null || value === undefined || value === false) {
    return false;
  }
  if (value instanceof Date) {
    return !Number.isNaN(value.getTime());
  }
  if (typeof value === "number") {
    return value !== 0 && !Number.isNaN(value);
  }
  return String(value).length > 0;
}

/**
 * SERVIÇO na regra v3.1: `Descr grupo Merc` contém "servi".
 * No HTML: `(get(row,'Descr grupo Merc')||'').toLowerCase().includes('servi')`.
 *
 * Aqui a comparação também remove acentos — como o radical "servi" não tem
 * acento, o conjunto de linhas casadas é EXATAMENTE o mesmo ("Serviço",
 * "SERVIÇOS", "servicos", "Prest. Serviços"), só que tolerante a variações de
 * codificação vindas do Excel.
 *
 * ATENÇÃO: esta regra NÃO usa Grupo Merc = Y0008. A detecção por Y0008 é da
 * regra gerencial do portal (`isServiceByGoodsGroup`) e não existe no HTML.
 */
export function isServiceByGoodsGroupDescription(goodsGroupDescription: unknown): boolean {
  return normalizeText(goodsGroupDescription).includes("servi");
}

/**
 * REGULARIZAÇÃO na regra v3.1: `Grupo Comp` é EXATAMENTE "Y04".
 * No HTML: `(get(row,'Grupo Comp')||'').trim().toUpperCase() === 'Y04'`.
 *
 * Diferente de `isRegularizationByGroup` (gerencial), que aceita qualquer grupo
 * que CONTENHA "Y04" — aqui a igualdade é exata, como no original.
 */
export function isRegularizationGroupExact(purchasingGroup: unknown): boolean {
  return normalizeText(purchasingGroup).toUpperCase() === "Y04";
}

/**
 * Fornecedores eliminados (TAREFA 6): não entram nos relatórios de compras.
 * Match PARCIAL, case/acento-insensível (cobre "Auren Energia", "Equatorial
 * Energia", etc.).
 */
export const ELIMINATED_SUPPLIERS = [
  "auren",
  "newcom",
  "smart",
  "comerc",
  "trivela",
  "emprafil",
  "equatorial",
  "esfera"
] as const;

export function isEliminatedSupplierName(...fields: unknown[]): boolean {
  const haystack = fields.map((field) => normalizeText(field)).filter(Boolean).join(" | ");
  if (!haystack) {
    return false;
  }
  return ELIMINATED_SUPPLIERS.some((term) => haystack.includes(term));
}

/** Termos que retiram o item do relatório (TAREFA 5): bloqueado e derivações + frete. */
export const IGNORED_DESCRIPTION_TERMS = ["bloq", "frete"] as const;

/** Descrição indica bloqueado/frete — fora do relatório. Retorna o termo ou null. */
export function detectIgnoredDescriptionTerm(...fields: unknown[]): string | null {
  const haystack = fields.map((field) => normalizeText(field)).filter(Boolean).join(" | ");
  for (const term of IGNORED_DESCRIPTION_TERMS) {
    if (haystack.includes(term)) {
      return term;
    }
  }
  return null;
}

/** Frete: descrição/grupo contém "frete" — fora do relatório. */
export function isFreightItem(itemDescription: unknown, goodsGroupDescription?: unknown): boolean {
  return normalizeText(itemDescription).includes("frete") || normalizeText(goodsGroupDescription).includes("frete");
}

/** CódElim = "L": pedido/requisição marcado para eliminação — fora do relatório. */
export function isDeletionExcludedCode(deletionCode: unknown): boolean {
  return normalizeText(deletionCode) === "l";
}

const SERVICE_KEYWORDS = [
  "prest",
  "serv",
  "servico",
  "serviço",
  "servicos",
  "serviços",
  "locacao",
  "locação",
  "montagem",
  "mao de obra",
  "mão de obra"
];

/** SERVICO quando a categoria ou o texto do pedido indicam serviço/locação/mão de obra. */
export function classifyItemNature(goodsGroupDescription: unknown, itemDescription: unknown): ItemNature {
  const category = normalizeLoose(goodsGroupDescription);
  if (category.includes("servico")) {
    return ItemNature.SERVICO;
  }
  const description = normalizeLoose(itemDescription);
  const hit = SERVICE_KEYWORDS.some((keyword) => description.includes(normalizeLoose(keyword)));
  return hit ? ItemNature.SERVICO : ItemNature.MATERIAL;
}

/* ------------------------------------------------------------------ */
/* Itens bloqueados / ignorados                                       */
/* ------------------------------------------------------------------ */

/**
 * Detecta itens bloqueados de forma case-insensitive em qualquer campo textual
 * relevante. Retorna a razão (campo + termo) quando bloqueado, ou null.
 */
export function detectBlockedReason(fields: {
  itemDescription?: unknown;
  materialCode?: unknown;
  supplierName?: unknown;
  goodsGroupDescription?: unknown;
  deletionCode?: unknown;
}): string | null {
  const candidates: Array<[string, unknown]> = [
    ["Texto Breve do Pedido", fields.itemDescription],
    ["Material", fields.materialCode],
    ["Descrição Fornecedor", fields.supplierName],
    ["Descr grupo Merc", fields.goodsGroupDescription],
    ["Código de eliminação", fields.deletionCode]
  ];

  for (const [campo, value] of candidates) {
    const text = limparTexto(value);
    if (text && /bloq/i.test(text)) {
      return `${campo}: "${text}"`;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Status do processo (MIGO / MIRO / recebimento / atrasos)           */
/* ------------------------------------------------------------------ */

export type PurchaseStatusInput = {
  purchaseOrderNumber: unknown;
  migoNumber: unknown;
  migoDate: Date | null;
  miroNumber: unknown;
  miroDate: Date | null;
  receiptFlag: unknown;
  receiptDate: Date | null;
  expectedDeliveryDate: Date | null;
};

export type PurchaseStatusFlags = {
  hasPurchaseOrder: boolean;
  hasMigo: boolean;
  hasMiro: boolean;
  isReceiptCompleted: boolean;
  /** Recbconcl = "X" (recebimento concluído no SAP). Base do "entregue". */
  isReceiptConfirmed: boolean;
  isLateOpen: boolean;
  isLateReceived: boolean;
  delayDays: number | null;
};

/** Aplica as regras 1–6 de negócio para derivar os flags de status. */
export function computeStatusFlags(input: PurchaseStatusInput, now: Date): PurchaseStatusFlags {
  const hasPurchaseOrder = isValidSapDocument(input.purchaseOrderNumber);
  const hasMigo = isValidSapDocument(input.migoNumber) || input.migoDate !== null;
  const hasMiro = isValidSapDocument(input.miroNumber) || input.miroDate !== null;

  const isReceiptConfirmed = isReceiptFlagSet(input.receiptFlag);
  const isReceiptCompleted =
    isReceiptFlagSet(input.receiptFlag) || input.receiptDate !== null || hasMigo;

  // Data efetiva de recebimento (recebimento físico ou MIGO).
  const effectiveReceiptDate = input.receiptDate ?? input.migoDate ?? null;

  let isLateOpen = false;
  let isLateReceived = false;
  let delayDays: number | null = null;

  if (input.expectedDeliveryDate) {
    if (effectiveReceiptDate) {
      // Recebido: atraso quando recebeu depois da previsão.
      if (effectiveReceiptDate.getTime() > input.expectedDeliveryDate.getTime()) {
        isLateReceived = true;
        delayDays = diffDays(input.expectedDeliveryDate, effectiveReceiptDate);
      }
    } else if (!isReceiptCompleted && input.expectedDeliveryDate.getTime() < now.getTime()) {
      // Em aberto: previsão vencida e ainda sem recebimento/MIGO.
      isLateOpen = true;
      delayDays = diffDays(input.expectedDeliveryDate, now);
    }
  }

  return { hasPurchaseOrder, hasMigo, hasMiro, isReceiptCompleted, isReceiptConfirmed, isLateOpen, isLateReceived, delayDays };
}

/* ------------------------------------------------------------------ */
/* Tempos do processo (TAREFA 7)                                      */
/* ------------------------------------------------------------------ */

export type ProcessTimeInput = {
  requisitionDate: Date | null;
  purchaseOrderDate: Date | null;
  receiptDate: Date | null;
  migoDate: Date | null;
  miroDate: Date | null;
};

export type ProcessTimes = {
  requisitionToOrderDays: number | null;
  orderToReceiptDays: number | null;
  migoToMiroDays: number | null;
  totalProcessDays: number | null;
};

export function computeProcessTimes(input: ProcessTimeInput): ProcessTimes {
  const receipt = input.receiptDate ?? input.migoDate ?? null;
  const processEnd = input.miroDate ?? input.receiptDate ?? input.migoDate ?? null;

  return {
    requisitionToOrderDays: nonNegativeDiff(input.requisitionDate, input.purchaseOrderDate),
    orderToReceiptDays: nonNegativeDiff(input.purchaseOrderDate, receipt),
    migoToMiroDays: nonNegativeDiff(input.migoDate, input.miroDate),
    totalProcessDays: nonNegativeDiff(input.requisitionDate, processEnd)
  };
}

/* ------------------------------------------------------------------ */
/* Valor da compra (TAREFA 10)                                        */
/* ------------------------------------------------------------------ */

/**
 * Data de referência do registro para análises mensais/anuais.
 * Prioridade: Data do Pedido → Data da Requisição → Previsão de Entrega.
 * Garante que registros sem pedido (só requisição) ainda apareçam nos gráficos.
 */
export function getPurchaseRecordReferenceDate(record: {
  purchaseOrderDate?: Date | null;
  requisitionDate?: Date | null;
  expectedDeliveryDate?: Date | null;
}): Date | null {
  return record.purchaseOrderDate ?? record.requisitionDate ?? record.expectedDeliveryDate ?? null;
}

/** Valor preferencial: Total líquido; se vazio ou zero, cai para Total bruto. */
export function resolvePurchaseValue(netTotal: number | null, grossTotal: number | null): number | null {
  if (netTotal !== null && netTotal !== 0) {
    return netTotal;
  }
  if (grossTotal !== null) {
    return grossTotal;
  }
  return netTotal;
}

/* ------------------------------------------------------------------ */
/* Chave técnica de deduplicação                                      */
/* ------------------------------------------------------------------ */

/**
 * Identidade ESTÁVEL da linha: requisição + material + descrição.
 *
 * Só campos que NÃO mudam quando a requisição vira pedido. Ficaram de fora, de
 * propósito, `purchaseOrderNumber`, `quantity` e `netTotal`: os três só ganham
 * (ou mudam de) valor depois do pedido, e usá-los na chave fazia a reimportação
 * criar uma linha NOVA em vez de atualizar a existente — deixando a versão
 * antiga, sem pedido, eternamente listada como "pendente de compra".
 */
export function buildPurchaseGroupKey(parts: {
  requisitionNumber: string | null;
  materialCode: string | null;
  itemDescription: string;
}): string {
  return [parts.requisitionNumber ?? "", parts.materialCode ?? "", parts.itemDescription].join("|");
}

/**
 * Chave técnica de deduplicação: identidade estável + ordinal da ocorrência.
 *
 * O ordinal existe porque a planilha do SAP NÃO traz número de item da
 * requisição: uma mesma requisição/material pode render várias linhas, iguais em
 * tudo menos no valor (itens distintos do mesmo pedido). Sem o ordinal a chave
 * colidiria dentro da própria planilha e a importação perderia linhas; com ele,
 * a n-ésima ocorrência de um grupo casa sempre com a n-ésima da carga anterior.
 *
 * `occurrence` é 1-based e vem da ORDEM DE LEITURA da planilha. Se duas linhas
 * do mesmo grupo trocarem de posição entre um export e outro, elas trocam de
 * identidade entre si — inofensivo, já que pertencem ao mesmo grupo e todos os
 * campos são sobrescritos no update. Quando o grupo CRESCE (a requisição vira
 * três itens de pedido), a ocorrência 1 é atualizada e as demais são criadas:
 * nenhuma linha órfã sobra.
 */
export function buildPurchaseTechnicalKey(parts: {
  requisitionNumber: string | null;
  materialCode: string | null;
  itemDescription: string;
  occurrence: number;
}): string {
  return `${buildPurchaseGroupKey(parts)}|#${parts.occurrence}`;
}

/* ------------------------------------------------------------------ */
/* Rótulos                                                            */
/* ------------------------------------------------------------------ */

export const PURCHASE_TYPE_LABELS: Record<PurchaseType, string> = {
  NORMAL: "Compra normal (Y01)",
  REGULARIZACAO: "Regularização (Y04)",
  OUTROS: "Outros"
};

export const ITEM_NATURE_LABELS: Record<ItemNature, string> = {
  MATERIAL: "Material",
  SERVICO: "Serviço"
};

/** Opções do filtro de status operacional (multi-seleção). value estável p/ URL. */
export const PURCHASE_OPERATIONAL_STATUSES: Array<{ value: string; label: string }> = [
  { value: "sem-pedido", label: "Sem pedido criado" },
  { value: "com-pedido", label: "Com pedido criado" },
  { value: "pendente-migo", label: "Pendente de MIGO" },
  { value: "com-migo", label: "Com MIGO" },
  { value: "pendente-miro", label: "Pendente de MIRO" },
  { value: "com-miro", label: "Com MIRO" },
  { value: "atrasado-aberto", label: "Atrasado em aberto" },
  { value: "recebido-atraso", label: "Recebido com atraso" },
  { value: "recebimento-concluido", label: "Recebimento concluído" },
  { value: "y04", label: "Regularização (Y04)" },
  { value: "y01", label: "Compra normal (Y01)" },
  { value: "servico", label: "Serviço" },
  { value: "material", label: "Material" }
];

export const PURCHASE_OPERATIONAL_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  PURCHASE_OPERATIONAL_STATUSES.map((status) => [status.value, status.label])
);

/** Campos de data filtráveis e seus rótulos. */
export const PURCHASE_DATE_FIELD_LABELS: Record<string, string> = {
  requisitionDate: "Data da requisição",
  purchaseOrderDate: "Data do pedido",
  expectedDeliveryDate: "Previsão de entrega",
  receiptDate: "Data de recebimento",
  migoDate: "Data MIGO",
  miroDate: "Data MIRO"
};

/** Rótulo de status legível para a tabela (pendentes e realizadas). */
export function purchaseStatusLabel(flags: {
  hasPurchaseOrder: boolean;
  hasMigo: boolean;
  hasMiro: boolean;
  isReceiptCompleted: boolean;
  isLateOpen: boolean;
  isLateReceived: boolean;
}): string {
  if (!flags.hasPurchaseOrder) {
    return "Sem pedido";
  }
  if (flags.isLateOpen) {
    return "Atrasado";
  }
  if (flags.hasMiro) {
    return "MIRO lançada";
  }
  if (flags.isReceiptCompleted || flags.hasMigo) {
    return flags.isLateReceived ? "Recebido com atraso" : "Recebido";
  }
  return "Pedido em aberto";
}

/* ------------------------------------------------------------------ */
/* Helpers internos                                                   */
/* ------------------------------------------------------------------ */

function diffDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_IN_MS);
}

/** Diferença em dias, ou null quando alguma data falta. Pode ser negativa. */
function nonNegativeDiff(from: Date | null, to: Date | null): number | null {
  if (!from || !to) {
    return null;
  }
  const days = diffDays(from, to);
  return days >= 0 ? days : null;
}

function normalizeLoose(value: unknown): string {
  return limparTexto(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}
