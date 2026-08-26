import * as XLSX from "xlsx";
import { ImportStatus, ImportType, ItemNature, PurchaseRecordSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { limparTexto, normalizarNomeColuna } from "@/utils/importacao";
import {
  buildPurchaseGroupKey,
  buildPurchaseTechnicalKey,
  computeProcessTimes,
  computeStatusFlags,
  getPurchaseRecordReferenceDate,
  normalizeClassificationLevel,
  normalizeTrackingNumber,
  optionalText,
  parsePurchaseDate,
  parsePurchaseNetValue,
  parsePurchaseNumber,
  purchasePriorityForDatabase,
  resolvePurchaseValue
} from "@/utils/purchases-normalizer";
import { classifyPurchaseRecord, summarizePurchaseV31 } from "@/utils/purchase-classification";
import type {
  ParsedPurchaseRecord,
  PurchaseClassificationAudit,
  PurchaseExcelRow,
  PurchaseImportError,
  PurchaseImportPeriod,
  PurchaseImportResult,
  PurchaseNetValueAudit,
  PurchasePriorityAudit
} from "@/types/purchases";

const SHEET_NAME = "Data";

/**
 * Mapa: cabeçalho normalizado -> chave da linha.
 *
 * A normalização (`normalizarNomeColuna`) é equivalente à do HTML v3.1
 * (`normalize('NFD')` + remove acentos + `toLowerCase()` + `trim()`), com a
 * diferença de trocar separadores por "_". Por isso **cada cabeçalho é aceito
 * com ou sem acento** com uma única entrada: "Descrição Fornecedor" e
 * "Descricao Fornecedor" caem os dois em `descricao_fornecedor`; o mesmo vale
 * para "Previsão/Previsao de entrega" e "Requisição/Requisicao".
 *
 * As 14 colunas do layout v3.1 estão todas cobertas: Data do Pedido, Pedido de
 * Compra, Material, Texto breve material, Quantid, Quant Pendente, Fornecedor,
 * Descrição Fornecedor, Data Recebimento, Requisitante, Previsão de entrega,
 * Requisição, Grupo Comp e Descr grupo Merc.
 */
const COLUMN_MAP: Record<string, keyof PurchaseExcelRow> = {
  pedido_de_compra: "purchaseOrderNumber",
  pedido_compra: "purchaseOrderNumber",
  pedido: "purchaseOrderNumber",
  data_da_requisicao: "requisitionDate",
  data_requisicao: "requisitionDate",
  requisicao: "requisitionNumber",
  nivel_requisicao: "requisitionLevel",
  fornecedor: "supplierCode",
  descricao_fornecedor: "supplierName",
  material: "materialCode",
  texto_breve_do_pedido: "itemDescription",
  texto_breve_pedido: "itemDescription",
  // Layout v3.1 do HTML: a descrição do item vem como "Texto breve material".
  texto_breve_material: "itemDescription",
  texto_breve_do_material: "itemDescription",
  quantid: "quantity",
  quantidade: "quantity",
  qtd: "quantity",
  quant_pendente: "pendingQuantity",
  quantidade_pendente: "pendingQuantity",
  qtd_pendente: "pendingQuantity",
  recebimto_concluido: "receiptCompletedFlag",
  recebimento_concluido: "receiptCompletedFlag",
  recbconcl: "receiptCompletedFlag",
  recb_concl: "receiptCompletedFlag",
  recebconcl: "receiptCompletedFlag",
  recb_concluido: "receiptCompletedFlag",
  codigo_de_eliminacao: "deletionCode",
  cod_eliminacao: "deletionCode",
  unid_med: "unit",
  unidade: "unit",
  data_do_pedido: "purchaseOrderDate",
  data_pedido: "purchaseOrderDate",
  dt_pedido: "purchaseOrderDate",
  dt_requisicao: "requisitionDate",
  previsao_de_entrega: "expectedDeliveryDate",
  previsao_entrega: "expectedDeliveryDate",
  previsao: "expectedDeliveryDate",
  dt_entrega: "expectedDeliveryDate",
  preco_brut: "grossPrice",
  preco_bruto: "grossPrice",
  preco_liq: "netPrice",
  preco_liquido: "netPrice",
  total_bruto: "grossTotal",
  total_brut: "grossTotal",
  total_liq: "netTotal",
  total_liquido: "netTotal",
  // Coluna "Valor líquido" (TAREFA 10). Cabeçalho SEPARADO de "Total liq": o card
  // "Valor comprado" soma SÓ esta coluna, sem fallback para Total liq/bruto,
  // Prç.avaliação ou quantidade × preço. As variantes com acento caem aqui
  // sozinhas — `normalizarNomeColuna` remove acento e troca "." e espaço por "_"
  // (e o `mapRow` ainda tenta a variante sem "_").
  valor_liquido: "netValue",
  valor_liq: "netValue",
  vlr_liquido: "netValue",
  vlr_liq: "netValue",
  valor_liquido_item: "netValue",
  net_value: "netValue",
  recebimento: "receiptNumber",
  data_recebimento: "receiptDate",
  data_de_recebimento: "receiptDate",
  dt_recebimento: "receiptDate",
  migo: "migoNumber",
  data_migo: "migoDate",
  grupo_merc: "goodsGroupCode",
  descr_grupo_merc: "goodsGroupDescription",
  descricao_grupo_merc: "goodsGroupDescription",
  requisitante: "requester",
  miro: "miroNumber",
  data_miro: "miroDate",
  grupo_comp: "purchasingGroup",
  grupo_de_compras: "purchasingGroup",
  grupo_compras: "purchasingGroup",
  // Classificação hierárquica N1 > N2 > N3 > N4 (TAREFA 1). Os cabeçalhos chegam
  // normalizados por `normarizarNomeColuna` (sem acento, minúsculo, "_"), e o
  // `mapRow` ainda tenta a variante sem "_" — por isso "Nível 1", "Nivel 1",
  // "Classificação N1" e "Categoria N1" caem todos aqui.
  n1: "classificationN1",
  nivel_1: "classificationN1",
  nivel1: "classificationN1",
  classificacao_n1: "classificationN1",
  classificacao_nivel_1: "classificationN1",
  categoria_n1: "classificationN1",
  n2: "classificationN2",
  nivel_2: "classificationN2",
  nivel2: "classificationN2",
  classificacao_n2: "classificationN2",
  classificacao_nivel_2: "classificationN2",
  categoria_n2: "classificationN2",
  n3: "classificationN3",
  nivel_3: "classificationN3",
  nivel3: "classificationN3",
  classificacao_n3: "classificationN3",
  classificacao_nivel_3: "classificationN3",
  categoria_n3: "classificationN3",
  n4: "classificationN4",
  nivel_4: "classificationN4",
  nivel4: "classificationN4",
  classificacao_n4: "classificationN4",
  classificacao_nivel_4: "classificationN4",
  categoria_n4: "classificationN4",
  // PRIORIDADE da compra — coluna "Nº acompanhamento" (TAREFA 1). Não confundir
  // com as colunas N1..N4 acima (taxonomia hierárquica) nem com "Nível
  // requisição" (`requisitionLevel`): aqui o CABEÇALHO é "Nº acompanhamento" e o
  // VALOR é que vale "N1".."N4".
  //
  // `normalizarNomeColuna` remove acento e troca todo símbolo por "_", então
  // "Nº acompanhamento", "N° acompanhamento", "N. acompanhamento" e
  // "N acompanhamento" caem TODAS em `n_acompanhamento`.
  n_acompanhamento: "trackingNumber",
  no_acompanhamento: "trackingNumber",
  nr_acompanhamento: "trackingNumber",
  num_acompanhamento: "trackingNumber",
  numero_acompanhamento: "trackingNumber",
  numero_de_acompanhamento: "trackingNumber",
  n_de_acompanhamento: "trackingNumber",
  acompanhamento: "trackingNumber",
  prioridade: "trackingNumber",
  prioridade_compra: "trackingNumber",
  prioridade_da_compra: "trackingNumber"
};

type ImportOptions = {
  fileName?: string;
  importedBy?: string;
  importBatch?: string;
  /** Data de referência para cálculos de atraso (default: agora). Injetável em testes. */
  now?: Date;
};

/** Lê e mapeia as linhas da aba "Data" a partir de um arquivo ou buffer. */
export function readPurchaseRows(source: string | Buffer | ArrayBuffer, sheetName = SHEET_NAME): PurchaseExcelRow[] {
  const workbook =
    typeof source === "string"
      ? XLSX.readFile(source, { cellDates: true })
      : XLSX.read(source, { type: "buffer", cellDates: true });

  // Casa "Data" de forma tolerante (espaços/acentos/maiúsculas); senão, usa a 1ª aba.
  const target = normalizarNomeColuna(sheetName);
  const matchedName =
    workbook.SheetNames.find((name) => name === sheetName) ??
    workbook.SheetNames.find((name) => normalizarNomeColuna(name) === target) ??
    workbook.SheetNames[0];
  const worksheet = matchedName ? workbook.Sheets[matchedName] : undefined;
  if (!worksheet) {
    throw new Error(`A aba "${sheetName}" não foi encontrada na planilha.`);
  }

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "", raw: true });
  return rawRows.map(mapRow);
}

function mapRow(row: Record<string, unknown>): PurchaseExcelRow {
  const mapped: PurchaseExcelRow = {};
  for (const key of Object.keys(row)) {
    const normalized = normalizarNomeColuna(key);
    const target = COLUMN_MAP[normalized] ?? COLUMN_MAP[normalized.replace(/_/g, "")];
    if (target && mapped[target] === undefined) {
      mapped[target] = row[key];
    }
  }
  return mapped;
}

/** Valida que ao menos uma coluna essencial foi reconhecida. */
function validateColumns(rows: PurchaseExcelRow[]): void {
  if (rows.length === 0) {
    return;
  }
  const sample = rows[0];
  const recognized = ["itemDescription", "materialCode", "requisitionNumber", "purchaseOrderNumber"].some(
    (field) => field in sample
  );
  if (!recognized) {
    throw new Error(
      'Colunas não reconhecidas. Verifique se a planilha tem "Texto Breve do Pedido", "Material", "Requisição" e "Pedido de Compra" na aba "Data".'
    );
  }
}

function emptyResult(totalRows: number): PurchaseImportResult {
  return {
    totalRows,
    importedRows: 0,
    ignoredRows: 0,
    createdRows: 0,
    updatedRows: 0,
    errorRows: 0,
    totalWithoutPurchaseOrder: 0,
    totalWithPurchaseOrder: 0,
    totalMigo: 0,
    totalMiro: 0,
    totalLateOpen: 0,
    totalLateReceived: 0,
    totalRegularizations: 0,
    totalNormalPurchases: 0,
    totalServices: 0,
    totalMaterials: 0,
    totalValue: 0,
    totalBlocked: 0,
    totalExcluded: 0,
    totalPurchased: 0,
    totalReceived: 0,
    totalReceivedLate: 0,
    totalPendingPurchase: 0,
    totalNotDelivered: 0,
    suppliersDetected: 0,
    errors: []
  };
}

const DB_IN_CHUNK = 1000; // chunk para consultas "IN" (limite de parâmetros)
const CREATE_CHUNK = 500; // chunk para createMany (limite de parâmetros do Postgres)
const UPDATE_CONCURRENCY = 20; // updates paralelos por lote

/**
 * Importa registros de compra em LOTE — sem consulta 1-por-linha.
 *  1) parse + dedupe em memória; 2) descobre chaves existentes numa consulta;
 *  3) createMany dos novos + updates dos existentes em chunks paralelos.
 * Isso evita o timeout da função serverless (Vercel) em planilhas grandes
 * (antes eram ~2 queries por linha, o que estourava o limite e importava parcial).
 */
export async function importPurchaseRows(
  rows: PurchaseExcelRow[],
  options: ImportOptions = {}
): Promise<PurchaseImportResult> {
  validateColumns(rows);

  const result = emptyResult(rows.length);
  const importBatch = options.importBatch ?? `COMPRAS-${new Date().toISOString()}`;
  const now = options.now ?? new Date();

  // 1) Parse + dedupe por technicalKey (em memória; não toca o banco).
  //
  // O ordinal da ocorrência acompanha a ORDEM DE LEITURA da planilha: a n-ésima
  // linha de um mesmo (requisição|material|descrição) recebe `#n`, e é assim que
  // ela reencontra a linha correspondente da importação anterior. Ver
  // `buildPurchaseTechnicalKey`.
  const occurrences = new Map<string, number>();
  const nextOccurrence = (groupKey: string): number => {
    const next = (occurrences.get(groupKey) ?? 0) + 1;
    occurrences.set(groupKey, next);
    return next;
  };

  const parsedByKey = new Map<string, ParsedPurchaseRecord>();
  for (let index = 0; index < rows.length; index += 1) {
    const line = index + 2; // +1 cabeçalho, +1 base 1
    try {
      const parsed = parseRow(rows[index], line, now, nextOccurrence);
      if (!parsed) {
        continue; // linha vazia — não conta como importada nem erro
      }
      if (parsedByKey.has(parsed.technicalKey)) {
        result.ignoredRows += 1; // duplicada na própria planilha
        continue;
      }
      parsedByKey.set(parsed.technicalKey, parsed);
    } catch (error) {
      result.errorRows += 1;
      result.errors.push(toImportError(error, line));
    }
  }

  const parsedList = Array.from(parsedByKey.values());

  // 2) Quais chaves já existem (consulta em lote, sem 1-por-linha).
  const existingKeys = await loadExistingKeys(parsedList.map((parsed) => parsed.technicalKey));
  const toCreate = parsedList.filter((parsed) => !existingKeys.has(parsed.technicalKey));
  const toUpdate = parsedList.filter((parsed) => existingKeys.has(parsed.technicalKey));

  // 3) Grava em lote.
  result.createdRows = await createInChunks(toCreate, importBatch);
  result.updatedRows = await updateInChunks(toUpdate, importBatch);
  result.importedRows = result.createdRows + result.updatedRows;

  // 4) Indicadores do resumo (todas as linhas válidas; bloqueados só como ignorados).
  for (const parsed of parsedList) {
    accumulate(result, parsed);
  }
  result.totalValue = round(result.totalValue);
  result.suppliersDetected = new Set(
    parsedList.map((parsed) => parsed.supplierName).filter((name): name is string => Boolean(name))
  ).size;

  // 5) Qualidade dos dados: período detectado e avisos.
  result.periodDetected = detectPeriod(parsedList);
  result.warnings = buildWarnings(parsedList);
  result.missingColumns = [];

  // 6) Auditoria da REGRA OFICIAL v3.1 (TAREFA 16).
  //
  // Roda sobre as linhas CRUAS lidas da planilha — antes da deduplicação por
  // technicalKey e sem descartar linha vazia — porque é assim que o HTML conta
  // (`raw.length`). Só assim os totais são comparáveis 1:1 com o painel.
  result.v31Audit = summarizePurchaseV31(
    rows,
    (row) => ({
      goodsGroupDescription: row.goodsGroupDescription,
      purchasingGroup: row.purchasingGroup,
      purchaseOrderNumber: row.purchaseOrderNumber,
      receiptDate: row.receiptDate,
      expectedDeliveryDate: parsePurchaseDate(row.expectedDeliveryDate)
    }),
    now
  );

  // 7) Auditoria da classificação N1..N4 (TAREFA 11).
  result.classificationAudit = buildClassificationAudit(parsedList, rows);
  if (!result.classificationAudit.columnsDetected.length) {
    result.warnings.push(
      "Colunas N1/N2/N3/N4 não encontradas na planilha. A análise por classificação da aba Compras Pendentes ficará indisponível até uma reimportação com essas colunas."
    );
  }

  // 8) Auditoria da PRIORIDADE ("Nº acompanhamento") — TAREFA 12.
  result.priorityAudit = buildPriorityAudit(parsedList, rows);
  if (!result.priorityAudit.columnDetected) {
    result.warnings.push(
      'Coluna "Nº acompanhamento" não encontrada na planilha. Os cards, gráficos e o ranking por prioridade N1/N2/N3/N4 da aba Compras Pendentes ficarão indisponíveis até uma reimportação com essa coluna.'
    );
  } else if (result.priorityAudit.unrecognizedSamples.length) {
    result.warnings.push(
      `${result.priorityAudit.unrecognizedValues} linha(s) têm "Nº acompanhamento" fora da faixa N1..N4 e entram como "Sem prioridade". Exemplos: ${result.priorityAudit.unrecognizedSamples.join(", ")}.`
    );
  }

  // 9) Auditoria do VALOR LÍQUIDO — TAREFA 12.
  result.netValueAudit = buildNetValueAudit(parsedList, rows);
  if (!result.netValueAudit.columnDetected) {
    result.warnings.push(
      'Coluna "Valor líquido" não encontrada na planilha. O card "Valor comprado" da aba Compras Realizadas fica sem valor — reimporte a planilha com essa coluna. Nenhum outro campo é usado como substituto, para não exibir um valor incorreto.'
    );
  }

  await createImportHistory(result, options);
  return result;
}

function toRecordData(parsed: ParsedPurchaseRecord, importBatch: string) {
  return { ...parsed, source: PurchaseRecordSource.EXCEL, importBatch };
}

/** Conjunto de technicalKeys já existentes (consultas "IN" em chunks). */
async function loadExistingKeys(keys: string[]): Promise<Set<string>> {
  const existing = new Set<string>();
  for (let i = 0; i < keys.length; i += DB_IN_CHUNK) {
    const chunk = keys.slice(i, i + DB_IN_CHUNK);
    const found = await prisma.purchaseRecord.findMany({
      where: { technicalKey: { in: chunk } },
      select: { technicalKey: true }
    });
    for (const row of found) {
      existing.add(row.technicalKey);
    }
  }
  return existing;
}

/** Insere novos registros em lote (createMany), respeitando o limite de parâmetros. */
async function createInChunks(toCreate: ParsedPurchaseRecord[], importBatch: string): Promise<number> {
  let created = 0;
  for (let i = 0; i < toCreate.length; i += CREATE_CHUNK) {
    const chunk = toCreate.slice(i, i + CREATE_CHUNK).map((parsed) => toRecordData(parsed, importBatch));
    const res = await prisma.purchaseRecord.createMany({ data: chunk, skipDuplicates: true });
    created += res.count;
  }
  return created;
}

/** Atualiza registros existentes (por technicalKey) em chunks paralelos. */
async function updateInChunks(toUpdate: ParsedPurchaseRecord[], importBatch: string): Promise<number> {
  let updated = 0;
  for (let i = 0; i < toUpdate.length; i += UPDATE_CONCURRENCY) {
    const chunk = toUpdate.slice(i, i + UPDATE_CONCURRENCY);
    await Promise.all(
      chunk.map((parsed) =>
        prisma.purchaseRecord.update({
          where: { technicalKey: parsed.technicalKey },
          data: toRecordData(parsed, importBatch)
        })
      )
    );
    updated += chunk.length;
  }
  return updated;
}

/** Período detectado na planilha: menor/maior data de referência + meses distintos. */
function detectPeriod(parsedList: ParsedPurchaseRecord[]): PurchaseImportPeriod {
  const dates = parsedList
    .map((parsed) => getPurchaseRecordReferenceDate(parsed))
    .filter((date): date is Date => date !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  if (!dates.length) {
    return { start: null, end: null, months: [] };
  }

  const months = Array.from(
    new Set(dates.map((date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`))
  ).sort();

  return {
    start: dates[0].toISOString().slice(0, 10),
    end: dates[dates.length - 1].toISOString().slice(0, 10),
    months
  };
}

/**
 * Auditoria da classificação N1..N4 (TAREFA 11): quantas linhas trouxeram cada
 * nível preenchido, quantas ficaram sem nenhuma classificação e quantas dessas
 * linhas são de fato compras pendentes (o público-alvo da análise).
 *
 * `columnsDetected` olha as linhas CRUAS: uma coluna existe na planilha quando
 * o mapeamento a reconheceu em alguma linha, mesmo que o valor esteja vazio.
 */
/**
 * Auditoria da PRIORIDADE lida de "Nº acompanhamento" (TAREFA 12): quantas
 * linhas caíram em cada N1..N4, quantas ficaram sem prioridade e quais valores
 * o normalizador não reconheceu (amostra, para o usuário corrigir a planilha).
 *
 * `columnDetected` olha as linhas CRUAS: a coluna existe quando o mapeamento a
 * reconheceu em alguma linha, mesmo com a célula vazia.
 */
function buildPriorityAudit(
  parsedList: ParsedPurchaseRecord[],
  rawRows: PurchaseExcelRow[]
): PurchasePriorityAudit {
  const byPriority: Record<string, number> = { N1: 0, N2: 0, N3: 0, N4: 0 };
  let withoutPriority = 0;
  let unrecognizedValues = 0;
  const unrecognized = new Set<string>();

  for (const parsed of parsedList) {
    if (parsed.purchasePriority && parsed.purchasePriority in byPriority) {
      byPriority[parsed.purchasePriority] += 1;
      continue;
    }
    withoutPriority += 1;
    // Célula PREENCHIDA que não virou prioridade: erro de digitação na planilha
    // (o vazio é "sem prioridade" legítimo e não entra na amostra).
    if (parsed.trackingNumber) {
      unrecognizedValues += 1;
      if (unrecognized.size < 5) {
        unrecognized.add(`"${parsed.trackingNumber}"`);
      }
    }
  }

  return {
    columnDetected: rawRows.some((row) => "trackingNumber" in row),
    totalRows: parsedList.length,
    n1: byPriority.N1,
    n2: byPriority.N2,
    n3: byPriority.N3,
    n4: byPriority.N4,
    withoutPriority,
    unrecognizedValues,
    unrecognizedSamples: Array.from(unrecognized)
  };
}

/**
 * Auditoria do VALOR LÍQUIDO (TAREFA 12): quantas linhas trouxeram a coluna
 * "Valor líquido" preenchida, quantas não, e a soma lida.
 *
 * A soma cobre TODAS as linhas válidas da planilha — é o número que o usuário
 * confere contra o total da coluna no Excel. O card "Valor comprado" da aba
 * aplica depois o recorte de compras realizadas, então é normal ser menor.
 */
function buildNetValueAudit(
  parsedList: ParsedPurchaseRecord[],
  rawRows: PurchaseExcelRow[]
): PurchaseNetValueAudit {
  let rowsWithNetValue = 0;
  let totalNetValue = 0;

  for (const parsed of parsedList) {
    if (parsed.netValue !== null && Number.isFinite(parsed.netValue)) {
      rowsWithNetValue += 1;
      totalNetValue += parsed.netValue;
    }
  }

  return {
    columnDetected: rawRows.some((row) => "netValue" in row),
    totalRows: parsedList.length,
    rowsWithNetValue,
    rowsWithoutNetValue: parsedList.length - rowsWithNetValue,
    totalNetValue: round(totalNetValue)
  };
}

function buildClassificationAudit(
  parsedList: ParsedPurchaseRecord[],
  rawRows: PurchaseExcelRow[]
): PurchaseClassificationAudit {
  const columnsDetected: string[] = [];
  const rawKeys: Array<[keyof PurchaseExcelRow, string]> = [
    ["classificationN1", "N1"],
    ["classificationN2", "N2"],
    ["classificationN3", "N3"],
    ["classificationN4", "N4"]
  ];
  for (const [key, label] of rawKeys) {
    if (rawRows.some((row) => key in row)) {
      columnsDetected.push(label);
    }
  }

  let withN1 = 0;
  let withN2 = 0;
  let withN3 = 0;
  let withN4 = 0;
  let withoutAny = 0;
  let pendingWithN1 = 0;

  for (const parsed of parsedList) {
    if (parsed.classificationN1) withN1 += 1;
    if (parsed.classificationN2) withN2 += 1;
    if (parsed.classificationN3) withN3 += 1;
    if (parsed.classificationN4) withN4 += 1;
    if (!parsed.classificationN1 && !parsed.classificationN2 && !parsed.classificationN3 && !parsed.classificationN4) {
      withoutAny += 1;
    }
    if (parsed.operationalStatus === "PENDENTE_COMPRA" && parsed.classificationN1) {
      pendingWithN1 += 1;
    }
  }

  return { columnsDetected, withN1, withN2, withN3, withN4, withoutAny, pendingWithN1 };
}

/** Avisos de qualidade da importação. */
function buildWarnings(parsedList: ParsedPurchaseRecord[]): string[] {
  const warnings: string[] = [];
  const semPedidoComReferencia = parsedList.filter(
    (parsed) => !parsed.purchaseOrderDate && (parsed.requisitionDate || parsed.expectedDeliveryDate)
  ).length;
  if (semPedidoComReferencia > 0) {
    warnings.push(
      `${semPedidoComReferencia} registro(s) sem Data do Pedido foram posicionados pela Data da Requisição/Previsão nos gráficos mensais.`
    );
  }
  const semData = parsedList.filter((parsed) => getPurchaseRecordReferenceDate(parsed) === null).length;
  if (semData > 0) {
    warnings.push(`${semData} registro(s) sem nenhuma data entram nos totais, mas não aparecem nos gráficos mensais.`);
  }
  return warnings;
}

/** Lê o arquivo Excel e importa. Atalho usado pelo script CLI e pela API. */
export async function importPurchasesFromExcel(
  source: string | Buffer | ArrayBuffer,
  options: ImportOptions = {}
): Promise<PurchaseImportResult> {
  const rows = readPurchaseRows(source);
  return importPurchaseRows(rows, options);
}

/** Soma os indicadores do resumo (REGRA 16) a partir de um registro parseado. */
function accumulate(result: PurchaseImportResult, parsed: ParsedPurchaseRecord): void {
  // Excluídos do relatório (bloqueado/frete/fornecedor eliminado/CódElim "L") contam
  // só como auditoria; ficam fora de TODOS os demais indicadores.
  if (parsed.ignored) {
    result.ignoredRows += 1;
    if (parsed.isBlocked) result.totalBlocked += 1;
    result.totalExcluded += 1;
    return;
  }

  if (parsed.hasPurchaseOrder) {
    result.totalWithPurchaseOrder += 1;
  } else {
    result.totalWithoutPurchaseOrder += 1;
  }
  if (parsed.hasMigo) {
    result.totalMigo += 1;
  }
  if (parsed.hasMiro) {
    result.totalMiro += 1;
  }
  if (parsed.purchaseType === "REGULARIZACAO") {
    result.totalRegularizations += 1;
  }
  if (parsed.purchaseType === "NORMAL") {
    result.totalNormalPurchases += 1;
  }
  if (parsed.isService) {
    result.totalServices += 1;
  } else {
    result.totalMaterials += 1;
  }

  // Comprado = base Y01 material (não serviço, não Y04) com pedido de compra.
  if (!parsed.isService && parsed.purchaseType !== "REGULARIZACAO" && parsed.hasPurchaseOrder) {
    result.totalPurchased += 1;
  }

  // Contagens canônicas por status operacional (novo vocabulário).
  switch (parsed.operationalStatus) {
    case "ENTREGUE":
      result.totalReceived += 1;
      if (parsed.isLateReceived) result.totalReceivedLate += 1;
      break;
    case "ATRASADO":
      result.totalLateOpen += 1;
      break;
    case "COMPRADO":
      result.totalNotDelivered += 1;
      break;
    case "PENDENTE_COMPRA":
      result.totalPendingPurchase += 1;
      break;
    default:
      break;
  }

  const value = resolvePurchaseValue(parsed.netTotal, parsed.grossTotal);
  if (value) {
    result.totalValue += value;
  }
}

function parseRow(
  row: PurchaseExcelRow,
  line: number,
  now: Date,
  nextOccurrence: (groupKey: string) => number
): ParsedPurchaseRecord | null {
  const itemDescription = limparTexto(row.itemDescription);
  const materialCode = optionalText(row.materialCode);
  const requisitionNumber = optionalText(row.requisitionNumber);
  const purchaseOrderNumber = optionalText(row.purchaseOrderNumber);

  // Linha completamente vazia: ignora silenciosamente.
  if (!itemDescription && !materialCode && !requisitionNumber && !purchaseOrderNumber) {
    return null;
  }

  const description = itemDescription || materialCode || `Requisição ${requisitionNumber ?? "?"}`;

  const requisitionDate = parsePurchaseDate(row.requisitionDate);
  const purchaseOrderDate = parsePurchaseDate(row.purchaseOrderDate);
  const expectedDeliveryDate = parsePurchaseDate(row.expectedDeliveryDate);
  const receiptDate = parsePurchaseDate(row.receiptDate);
  const migoDate = parsePurchaseDate(row.migoDate);
  const miroDate = parsePurchaseDate(row.miroDate);

  const netTotal = parsePurchaseNumber(row.netTotal);
  const grossTotal = parsePurchaseNumber(row.grossTotal);
  // Coluna "Valor líquido" — parser de moeda próprio (R$, milhar, negativo do
  // SAP). Fica em campo separado: nunca cai para netTotal/grossTotal.
  const netValue = parsePurchaseNetValue(row.netValue);
  const quantity = parsePurchaseNumber(row.quantity);
  const pendingQuantity = parsePurchaseNumber(row.pendingQuantity);

  const supplierName = optionalText(row.supplierName);
  const supplierCode = optionalText(row.supplierCode);
  const goodsGroupCode = optionalText(row.goodsGroupCode);
  const goodsGroupDescription = optionalText(row.goodsGroupDescription);
  const deletionCode = optionalText(row.deletionCode);

  const flags = computeStatusFlags(
    {
      purchaseOrderNumber,
      migoNumber: row.migoNumber,
      migoDate,
      miroNumber: row.miroNumber,
      miroDate,
      receiptFlag: row.receiptCompletedFlag,
      receiptDate,
      expectedDeliveryDate
    },
    now
  );

  const times = computeProcessTimes({ requisitionDate, purchaseOrderDate, receiptDate, migoDate, miroDate });

  // REGRA CENTRAL: classificação canônica (mesma função usada por services e UI).
  const classification = classifyPurchaseRecord(
    {
      purchasingGroup: row.purchasingGroup,
      goodsGroupCode,
      goodsGroupDescription,
      itemDescription: description,
      materialDescription: row.itemDescription,
      materialCode,
      supplierCode,
      supplierName,
      deletionCode,
      purchaseOrderNumber,
      receiptFlag: row.receiptCompletedFlag,
      receiptDate,
      expectedDeliveryDate
    },
    now
  );

  const identity = { requisitionNumber, materialCode, itemDescription: description };
  const technicalKey = buildPurchaseTechnicalKey({
    ...identity,
    occurrence: nextOccurrence(buildPurchaseGroupKey(identity))
  });

  return {
    purchaseOrderNumber,
    requisitionNumber,
    requisitionLevel: optionalText(row.requisitionLevel),
    supplierCode: optionalText(row.supplierCode),
    supplierName,
    materialCode,
    itemDescription: description,
    quantity,
    pendingQuantity,
    unit: optionalText(row.unit),
    requisitionDate,
    purchaseOrderDate,
    expectedDeliveryDate,
    receiptDate,
    migoDate,
    miroDate,
    receiptNumber: optionalText(row.receiptNumber),
    migoNumber: optionalText(row.migoNumber),
    miroNumber: optionalText(row.miroNumber),
    grossPrice: parsePurchaseNumber(row.grossPrice),
    netPrice: parsePurchaseNumber(row.netPrice),
    grossTotal,
    netTotal,
    netValue,
    goodsGroupCode,
    goodsGroupDescription,
    // Classificação N1..N4 — opcional na planilha; null quando a coluna não existe.
    classificationN1: normalizeClassificationLevel(row.classificationN1),
    classificationN2: normalizeClassificationLevel(row.classificationN2),
    classificationN3: normalizeClassificationLevel(row.classificationN3),
    classificationN4: normalizeClassificationLevel(row.classificationN4),
    // Prioridade (TAREFAS 1 e 2): o CRU vai para `trackingNumber` ("N03") e o
    // normalizado para `purchasePriority` ("N3"); NULL quando não reconhecido.
    trackingNumber: normalizeTrackingNumber(row.trackingNumber),
    purchasePriority: purchasePriorityForDatabase(row.trackingNumber),
    requester: optionalText(row.requester),
    purchasingGroup: optionalText(row.purchasingGroup),
    deletionCode,
    purchaseType: classification.purchaseType,
    itemNature: classification.isService ? ItemNature.SERVICO : ItemNature.MATERIAL,
    operationalStatus: classification.operationalStatus,
    isService: classification.isService,
    isBlocked: classification.isBlocked,
    isFreight: classification.isFreight,
    isEliminatedSupplier: classification.isEliminatedSupplier,
    isDeletionExcluded: classification.isDeletionExcluded,
    hasPurchaseOrder: classification.hasPurchaseOrder,
    hasMigo: flags.hasMigo,
    hasMiro: flags.hasMiro,
    isReceiptCompleted: flags.isReceiptCompleted,
    isReceiptConfirmed: classification.isReceiptConfirmed,
    isLateOpen: flags.isLateOpen,
    isLateReceived: classification.isLateReceived,
    delayDays: flags.delayDays,
    requisitionToOrderDays: times.requisitionToOrderDays,
    orderToReceiptDays: times.orderToReceiptDays,
    migoToMiroDays: times.migoToMiroDays,
    totalProcessDays: times.totalProcessDays,
    ignored: classification.isIgnored,
    ignoredReason: classification.ignoreReason,
    technicalKey
  };
}

async function createImportHistory(result: PurchaseImportResult, options: ImportOptions): Promise<void> {
  const status =
    result.errorRows === 0
      ? ImportStatus.SUCESSO
      : result.importedRows > 0
        ? ImportStatus.PARCIAL
        : ImportStatus.ERRO;

  await prisma.importHistory.create({
    data: {
      type: ImportType.COMPRAS,
      fileName: options.fileName ?? "BASE DE DADOS PORTAL COMPRAS.xlsx",
      importedBy: options.importedBy ?? "importacao-local",
      totalRows: result.totalRows,
      createdRows: result.createdRows,
      updatedRows: result.updatedRows,
      errorRows: result.errorRows,
      status,
      errorMessage: result.errors.length ? summarizeErrors(result.errors) : null
    }
  });
}

function toImportError(error: unknown, line: number): PurchaseImportError {
  if (error && typeof error === "object" && "linha" in error && "mensagem" in error) {
    return error as PurchaseImportError;
  }
  return { linha: line, mensagem: error instanceof Error ? error.message : "Erro inesperado ao importar a linha." };
}

function summarizeErrors(errors: PurchaseImportError[]): string {
  return errors
    .slice(0, 10)
    .map((error) => `Linha ${error.linha}: ${error.mensagem}`)
    .join(" | ");
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
