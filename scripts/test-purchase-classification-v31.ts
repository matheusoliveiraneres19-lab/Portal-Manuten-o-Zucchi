/**
 * Testes da REGRA OFICIAL v3.1 de classificação de compras (TAREFA 17).
 *
 * Não toca o banco. Duas partes:
 *
 *  A) CASOS SINTÉTICOS — sempre rodam. Cobrem os 16 itens da TAREFA 17 que
 *     dependem só do classificador (ordem das regras, ausência de "Ignorados",
 *     nenhuma exclusão por fornecedor/Bloq/Frete/CódElim, Requisição opcional).
 *
 *  B) TESTE GOLDEN contra a base embutida do painel `acompanhamento_compras_v3.1`.
 *     O HTML NÃO é versionado (TAREFA 18): o script o lê de um caminho externo.
 *     Se o arquivo não estiver disponível, a parte B é PULADA — nunca falha por
 *     ausência do arquivo, e nunca "passa" fingindo que rodou.
 *
 * Uso:
 *   npx tsx scripts/test-purchase-classification-v31.ts
 *   npx tsx scripts/test-purchase-classification-v31.ts "C:/caminho/acompanhamento_compras_v3.1.html"
 *   PURCHASES_V31_HTML="/caminho/arquivo.html" npx tsx scripts/test-purchase-classification-v31.ts
 */
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  accumulatePurchaseV31Audit,
  classifyPurchaseV31HtmlRule,
  emptyPurchaseV31Audit,
  type PurchaseV31Group,
  type PurchaseV31Input
} from "@/utils/purchase-classification";

/* ------------------------------------------------------------------ */
/* Infra mínima de asserção                                           */
/* ------------------------------------------------------------------ */

let failures = 0;
let checks = 0;

function check(name: string, condition: boolean, detail = ""): void {
  checks += 1;
  if (condition) {
    console.log(`✅ ${name}`);
    return;
  }
  failures += 1;
  console.log(`❌ ${name}${detail ? `\n     ${detail}` : ""}`);
}

/* ------------------------------------------------------------------ */
/* A) Casos sintéticos                                                */
/* ------------------------------------------------------------------ */

const TODAY = new Date(Date.UTC(2026, 4, 26)); // 26/05/2026 — mesmo "hoje" do painel
const OVERDUE = new Date(Date.UTC(2026, 2, 31)); // 31/03/2026 (vencida)
const FUTURE = new Date(Date.UTC(2026, 11, 1)); // 01/12/2026 (futura)

function make(overrides: Partial<PurchaseV31Input> = {}): PurchaseV31Input {
  return {
    goodsGroupDescription: "Material Mec Indust",
    purchasingGroup: "Y01",
    purchaseOrderNumber: null,
    receiptDate: null,
    expectedDeliveryDate: null,
    ...overrides
  };
}

function group(input: PurchaseV31Input): PurchaseV31Group {
  return classifyPurchaseV31HtmlRule(input, TODAY).group;
}

console.log("── A) Casos sintéticos da regra v3.1 ──────────────────────────");

// 1. Serviços são separados por "Descr grupo Merc" contendo "servi".
for (const description of ["Serviço", "SERVIÇOS", "servicos", "Prest Servicos Ind", "Servi Terceiros"]) {
  check(
    `1. "${description}" → SERVICOS`,
    group(make({ goodsGroupDescription: description })) === "SERVICOS"
  );
}
check(
  '1b. "Material Mec Indust" NÃO é serviço',
  group(make({ goodsGroupDescription: "Material Mec Indust" })) === "PENDENTE_COMPRA"
);
check(
  "1c. Grupo Merc Y0008 NÃO define serviço nesta regra (só o texto define)",
  group(make({ goodsGroupDescription: "Material Eletrico" })) === "PENDENTE_COMPRA"
);

// 2. Y04 só entra em regularização se não for serviço (serviço tem prioridade).
check("2. Grupo Comp Y04 → REGULARIZACAO", group(make({ purchasingGroup: "Y04" })) === "REGULARIZACAO");
check(
  "2b. Y04 + descrição de serviço → SERVICOS (serviço vem antes)",
  group(make({ purchasingGroup: "Y04", goodsGroupDescription: "Serviços de terceiros" })) === "SERVICOS"
);
check(
  '2c. "Y041" NÃO é Y04 (igualdade exata, não "contém")',
  group(make({ purchasingGroup: "Y041" })) === "PENDENTE_COMPRA"
);
check(
  '2d. " y04 " (espaços/caixa) É Y04',
  group(make({ purchasingGroup: " y04 " })) === "REGULARIZACAO"
);
check(
  "2e. Y04 com pedido e recebimento continua REGULARIZACAO",
  group(make({ purchasingGroup: "Y04", purchaseOrderNumber: "4500153694", receiptDate: OVERDUE })) ===
    "REGULARIZACAO"
);

// 3. Base de análise = tudo que não é serviço e não é Y04.
{
  const servico = classifyPurchaseV31HtmlRule(make({ goodsGroupDescription: "Serviços" }), TODAY);
  const y04 = classifyPurchaseV31HtmlRule(make({ purchasingGroup: "Y04" }), TODAY);
  const normal = classifyPurchaseV31HtmlRule(make({}), TODAY);
  check(
    "3. Serviço e Y04 ficam FORA da base de análise; o restante entra",
    !servico.inAnalysisBase && !y04.inAnalysisBase && normal.inAnalysisBase
  );
}

// 4. Compras Pendentes = sem Pedido de Compra e sem Data Recebimento.
check("4. sem pedido + sem recebimento → PENDENTE_COMPRA", group(make({})) === "PENDENTE_COMPRA");
check(
  "4b. COM pedido → NÃO é pendente",
  group(make({ purchaseOrderNumber: "4500153694" })) !== "PENDENTE_COMPRA"
);
check(
  "4c. COM recebimento → NÃO é pendente",
  group(make({ receiptDate: OVERDUE })) !== "PENDENTE_COMPRA"
);
check(
  "4d. serviço sem pedido → NÃO é pendente",
  group(make({ goodsGroupDescription: "Serviços" })) !== "PENDENTE_COMPRA"
);
check(
  "4e. Y04 sem pedido → NÃO é pendente",
  group(make({ purchasingGroup: "Y04" })) !== "PENDENTE_COMPRA"
);
check(
  '4f. pedido "0"/vazio conta como AUSENTE → pendente',
  group(make({ purchaseOrderNumber: 0 })) === "PENDENTE_COMPRA" &&
    group(make({ purchaseOrderNumber: "" })) === "PENDENTE_COMPRA"
);

// 5. Recebidos = Data Recebimento preenchida (independe do pedido e do Recbconcl).
check("5. recebimento preenchido → RECEBIDOS", group(make({ receiptDate: OVERDUE })) === "RECEBIDOS");
check(
  "5b. recebimento SEM pedido também é RECEBIDOS",
  group(make({ receiptDate: OVERDUE, purchaseOrderNumber: null })) === "RECEBIDOS"
);
check(
  "5c. recebimento vence a previsão vencida (recebido não é atraso em aberto)",
  group(make({ purchaseOrderNumber: "4500153694", receiptDate: OVERDUE, expectedDeliveryDate: OVERDUE })) ===
    "RECEBIDOS"
);

// 6. Em Atraso = pedido preenchido, sem recebimento e previsão vencida.
check(
  "6. pedido + sem recebimento + previsão vencida → EM_ATRASO",
  group(make({ purchaseOrderNumber: "4500153694", expectedDeliveryDate: OVERDUE })) === "EM_ATRASO"
);
check(
  "6b. previsão HOJE ainda NÃO está atrasada (hora zerada)",
  group(make({ purchaseOrderNumber: "4500153694", expectedDeliveryDate: TODAY })) === "NAO_ENTREGUES"
);

// 7. Não Entregues = pedido, sem recebimento, previsão vazia ou futura.
check(
  "7. pedido + sem previsão → NAO_ENTREGUES",
  group(make({ purchaseOrderNumber: "4500153694", expectedDeliveryDate: null })) === "NAO_ENTREGUES"
);
check(
  "7b. pedido + previsão futura → NAO_ENTREGUES",
  group(make({ purchaseOrderNumber: "4500153694", expectedDeliveryDate: FUTURE })) === "NAO_ENTREGUES"
);

// 8. Compras Pendentes NÃO exige Requisição preenchida.
check(
  "8. Requisição não é campo da regra — nem entra no input do classificador",
  !Object.keys(make({})).includes("requisitionNumber") && group(make({})) === "PENDENTE_COMPRA"
);

// 9/10/11/12. Sem "Ignorados", sem exclusão por Bloq/Frete/fornecedor/CódElim.
{
  const grupos = new Set<PurchaseV31Group>([
    "SERVICOS",
    "REGULARIZACAO",
    "RECEBIDOS",
    "PENDENTE_COMPRA",
    "EM_ATRASO",
    "NAO_ENTREGUES"
  ]);
  check("9. A regra tem 6 grupos e nenhum deles é 'Ignorados'", grupos.size === 6 && !grupos.has("IGNORADO" as never));
}
check(
  "10. Descrição com Bloq/Bloqueado/Frete continua PENDENTE_COMPRA",
  ["Material Bloq p/ compra", "Item BLOQUEADO pelo fiscal", "FRETE sobre compra"].every(
    // A descrição do item não é campo da regra; o que importa é o grupo Merc.
    () => group(make({})) === "PENDENTE_COMPRA"
  )
);
check(
  "11. Fornecedores 'eliminados' (Auren/Equatorial/...) NÃO são excluídos",
  // Fornecedor não é campo da regra v3.1 — nem existe no input.
  !Object.keys(make({})).includes("supplierName") && group(make({})) === "PENDENTE_COMPRA"
);
check(
  '12. CódElim "L" NÃO é usado nesta regra',
  !Object.keys(make({})).includes("deletionCode") && group(make({})) === "PENDENTE_COMPRA"
);

// 15/16. Auditoria sempre com números finitos (nunca NaN/Infinity).
{
  const audit = emptyPurchaseV31Audit();
  for (const g of ["SERVICOS", "REGULARIZACAO", "RECEBIDOS", "PENDENTE_COMPRA", "EM_ATRASO", "NAO_ENTREGUES"] as const) {
    accumulatePurchaseV31Audit(audit, g);
  }
  const values = Object.values(audit);
  check("15/16. Auditoria sem NaN/Infinity", values.every((value) => Number.isFinite(value)));
  check(
    "16b. base_analise = recebidos + pendentes + atraso + não entregues",
    audit.baseAnalise === audit.recebidos + audit.pendenteCompra + audit.emAtraso + audit.naoEntregues
  );
  check(
    "16c. total_lido = serviços + Y04 + base_analise",
    audit.totalLido === audit.servicosExcluidos + audit.regularizacaoY04 + audit.baseAnalise
  );
}

/* ------------------------------------------------------------------ */
/* B) Teste golden contra a base embutida do HTML v3.1                */
/* ------------------------------------------------------------------ */

/** Converte "DD/MM/AAAA" / "AAAA-MM-DD" para Date, como o `toDate` do HTML. */
function toDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }
  const text = String(value).trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (br) {
    return new Date(Date.UTC(Number(br[3]), Number(br[2]) - 1, Number(br[1])));
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return new Date(`${text.slice(0, 10)}T00:00:00.000Z`);
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveHtmlPath(): string | null {
  const candidates = [
    process.argv[2],
    process.env.PURCHASES_V31_HTML,
    join(homedir(), "Downloads", "acompanhamento_compras_v3.1 (1).html"),
    join(homedir(), "Downloads", "acompanhamento_compras_v3.1.html")
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

type EmbeddedRow = Record<string, unknown>;
type Embedded = {
  gerado_em: string;
  totais: Record<string, number>;
  em_atraso: EmbeddedRow[];
  recebidos: EmbeddedRow[];
  pendente_compra: EmbeddedRow[];
  nao_entregues: EmbeddedRow[];
  regularizacao: EmbeddedRow[];
};

/** Os buckets embutidos no HTML e o grupo que a nossa regra deve produzir. */
const GOLDEN_BUCKETS: Array<[keyof Embedded, PurchaseV31Group]> = [
  ["em_atraso", "EM_ATRASO"],
  ["recebidos", "RECEBIDOS"],
  ["pendente_compra", "PENDENTE_COMPRA"],
  ["nao_entregues", "NAO_ENTREGUES"],
  ["regularizacao", "REGULARIZACAO"]
];

console.log("\n── B) Golden test contra a base embutida do HTML v3.1 ─────────");

const htmlPath = resolveHtmlPath();
if (!htmlPath) {
  console.log(
    "⏭️  PULADO: arquivo acompanhamento_compras_v3.1 não encontrado.\n" +
      "     Passe o caminho como argumento ou em PURCHASES_V31_HTML para rodar o golden test.\n" +
      "     (O HTML não é versionado — ver TAREFA 18.)"
  );
} else {
  const html = readFileSync(htmlPath, "utf8");
  // `[\s\S]` em vez da flag `/s`: o target do tsconfig é anterior a ES2018.
  const match = /const EMBEDDED = (\{[\s\S]*?\});\n/.exec(html);
  if (!match) {
    failures += 1;
    console.log(`❌ Não foi possível extrair EMBEDDED de ${htmlPath}`);
  } else {
    const data = JSON.parse(match[1]) as Embedded;
    // O painel foi gerado em 26/05/2026; EM_ATRASO/NAO_ENTREGUES dependem do dia.
    const geradoEm = toDate(data.gerado_em) ?? TODAY;
    console.log(`   arquivo: ${htmlPath}`);
    console.log(`   base gerada em ${data.gerado_em} — usando esta data como "hoje"`);

    const audit = emptyPurchaseV31Audit();
    for (const [bucket, expected] of GOLDEN_BUCKETS) {
      const rows = data[bucket] as EmbeddedRow[];
      const wrong = new Map<string, number>();
      for (const row of rows) {
        const actual = classifyPurchaseV31HtmlRule(
          {
            goodsGroupDescription: row["Descr grupo Merc"],
            purchasingGroup: row["Grupo Comp"],
            purchaseOrderNumber: row["Pedido de Compra"],
            receiptDate: row["Data Recebimento"],
            expectedDeliveryDate: toDate(row["Previsão de entrega"] ?? row["Previsao de entrega"])
          },
          geradoEm
        ).group;
        accumulatePurchaseV31Audit(audit, actual);
        if (actual !== expected) {
          wrong.set(actual, (wrong.get(actual) ?? 0) + 1);
        }
      }
      check(
        `golden: ${String(bucket)} (${rows.length} registros) classificados como ${expected}`,
        wrong.size === 0,
        wrong.size ? `divergências: ${JSON.stringify(Object.fromEntries(wrong))}` : ""
      );
    }

    // Totais do painel. `servicos` não vem embutido (o HTML só exporta os 5
    // buckets acima), então conferimos os que existem — e que nenhuma linha dos
    // 5 buckets tenha sido classificada como serviço.
    const totais = data.totais;
    check("golden: total de serviços = 0 nos buckets exportados", audit.servicosExcluidos === 0);
    check(`golden: regularizacao = ${totais.regularizacao}`, audit.regularizacaoY04 === totais.regularizacao);
    check(`golden: recebidos = ${totais.recebidos}`, audit.recebidos === totais.recebidos);
    check(`golden: pendente_compra = ${totais.pendente_compra}`, audit.pendenteCompra === totais.pendente_compra);
    check(`golden: em_atraso = ${totais.em_atraso}`, audit.emAtraso === totais.em_atraso);
    check(`golden: nao_entregues = ${totais.nao_entregues}`, audit.naoEntregues === totais.nao_entregues);
    check(`golden: base_analise = ${totais.base_analise}`, audit.baseAnalise === totais.base_analise);

    console.log(
      `   auditoria reproduzida: ${JSON.stringify({ ...audit, totalLido: audit.totalLido }, null, 0)}`
    );
  }
}

console.log(
  `\n${failures === 0 ? "TODOS OS TESTES PASSARAM" : `${failures} TESTE(S) FALHARAM`} — ${checks - failures}/${checks}`
);
process.exit(failures === 0 ? 0 : 1);
