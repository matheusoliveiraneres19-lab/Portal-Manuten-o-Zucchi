/**
 * Testes dos DASHBOARDS por prioridade (TAREFAS 3 a 7) — não tocam o banco.
 *
 * Cobre a matemática que alimenta cards, gráficos e ranking crítico da aba
 * Compras Pendentes: contagem, percentual, barras empilhadas por requisitante e
 * por grupo de mercadoria, e a ordenação obrigatória N1 → N2 → mais antiga.
 *
 * Uso: npm run test:purchases-analysis
 */
import {
  buildPendingPriorityAnalysis,
  emptyPriorityAnalysis,
  type PriorityAnalysisRow
} from "@/utils/purchase-priority-analysis";

const TODAY = new Date(Date.UTC(2026, 7, 26)); // 2026-08-26

let failures = 0;
let total = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  total += 1;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures += 1;
    console.log(`❌ ${name}\n     recebido: ${a}\n     esperado: ${e}`);
  } else {
    console.log(`✅ ${name}  →  ${a}`);
  }
}

let seq = 0;
function row(overrides: Partial<PriorityAnalysisRow>): PriorityAnalysisRow {
  seq += 1;
  return {
    id: `row-${seq}`,
    purchasePriority: null,
    requisitionLevel: null,
    trackingNumber: null,
    requisitionNumber: `1000000${seq}`,
    materialCode: `MAT-${seq}`,
    itemDescription: `Item ${seq}`,
    quantity: 10,
    pendingQuantity: 10,
    unit: "PC",
    requisitionDate: new Date(Date.UTC(2026, 7, 1)),
    requester: "MNERES",
    goodsGroupCode: "Z001",
    goodsGroupDescription: "Material Elétrico",
    ...overrides
  };
}

/** Data em UTC, para os testes de idade não dependerem de fuso. */
function day(year: number, month: number, dayOfMonth: number): Date {
  return new Date(Date.UTC(year, month - 1, dayOfMonth));
}

/* ------------------------------------------------------------------ */
/* 1. Cards e percentuais (TAREFAS 3 e 4)                             */
/* ------------------------------------------------------------------ */

console.log("\n== Cards por prioridade (contagem + percentual) ==");

// 8 linhas: 1 N1, 2 N2, 1 N3, 0 N4, 4 sem prioridade.
const SET_A: PriorityAnalysisRow[] = [
  row({ purchasePriority: "N1", trackingNumber: "N1" }),
  row({ purchasePriority: "N2", trackingNumber: "N02" }),
  row({ purchasePriority: "N2", trackingNumber: "N2" }),
  row({ purchasePriority: "N3", trackingNumber: "N03" }),
  row({}),
  row({}),
  row({}),
  row({ purchasePriority: null, trackingNumber: "N9" })
];

const a = buildPendingPriorityAnalysis(SET_A, true, TODAY);
check("summary", a.summary, { totalPending: 8, n1: 1, n2: 2, n3: 1, n4: 0, withoutPriority: 4 });
check("soma dos cards = total pendente", a.summary.n1 + a.summary.n2 + a.summary.n3 + a.summary.n4 + a.summary.withoutPriority, 8);
check(
  "byPriority na ordem N1→N4→Sem prioridade",
  a.byPriority.map((slice) => slice.priority),
  ["N1", "N2", "N3", "N4", "SEM_PRIORIDADE"]
);
check(
  "byPriority contagens",
  a.byPriority.map((slice) => slice.count),
  [1, 2, 1, 0, 4]
);
check(
  "byPriority percentuais (2 casas)",
  a.byPriority.map((slice) => slice.percentage),
  [12.5, 25, 12.5, 0, 50]
);
check(
  "percentuais somam 100",
  a.byPriority.reduce<number>((sum, slice) => sum + slice.percentage, 0),
  100
);
check(
  "nenhum percentual é NaN/Infinity",
  a.byPriority.every((slice) => Number.isFinite(slice.percentage)),
  true
);

// Recorte VAZIO: 0% em tudo, sem divisão por zero.
const empty = buildPendingPriorityAnalysis([], true, TODAY);
check("recorte vazio: total 0", empty.summary.totalPending, 0);
check(
  "recorte vazio: percentuais 0 (sem NaN)",
  empty.byPriority.map((slice) => slice.percentage),
  [0, 0, 0, 0, 0]
);
check("recorte vazio: ranking vazio", empty.criticalItems.length, 0);

// Estado "coluna ausente": as cinco fatias existem, mas available = false.
const unavailable = emptyPriorityAnalysis();
check("emptyPriorityAnalysis().available", unavailable.available, false);
check("emptyPriorityAnalysis() tem as 5 fatias", unavailable.byPriority.length, 5);

/* ------------------------------------------------------------------ */
/* 2. Prioridades por requisitante (TAREFA 5)                         */
/* ------------------------------------------------------------------ */

console.log("\n== Prioridades por requisitante ==");

const SET_B: PriorityAnalysisRow[] = [
  // VMARQUES: volume alto, mas só 1 N1.
  ...Array.from({ length: 30 }, () => row({ requester: "VMARQUES", purchasePriority: "N3" })),
  row({ requester: "VMARQUES", purchasePriority: "N1" }),
  // MNERES: volume menor, 3 N1 → deve vir PRIMEIRO (criticidade, não volume).
  ...Array.from({ length: 3 }, () => row({ requester: "MNERES", purchasePriority: "N1" })),
  ...Array.from({ length: 2 }, () => row({ requester: "MNERES", purchasePriority: "N2" })),
  // Sem requisitante: conta nos cards, mas não vira barra.
  row({ requester: null, purchasePriority: "N1" })
];

const b = buildPendingPriorityAnalysis(SET_B, true, TODAY);
check(
  "ordena por N1 antes de volume",
  b.byRequester.map((entry) => entry.label),
  ["MNERES", "VMARQUES"]
);
check("MNERES", b.byRequester[0], { label: "MNERES", n1: 3, n2: 2, n3: 0, n4: 0, withoutPriority: 0, total: 5 });
check("VMARQUES", b.byRequester[1], { label: "VMARQUES", n1: 1, n2: 0, n3: 30, n4: 0, withoutPriority: 0, total: 31 });
check("linha sem requisitante não vira barra", b.byRequester.length, 2);
check("mas conta no card N1", b.summary.n1, 5);

/* ------------------------------------------------------------------ */
/* 3. Prioridades por grupo de mercadoria (TAREFA 6)                  */
/* ------------------------------------------------------------------ */

console.log("\n== Prioridades por grupo de mercadoria ==");

const SET_C: PriorityAnalysisRow[] = [
  row({ goodsGroupDescription: "Material Elétrico", purchasePriority: "N1" }),
  row({ goodsGroupDescription: "Material Elétrico", purchasePriority: "N1" }),
  ...Array.from({ length: 18 }, () => row({ goodsGroupDescription: "Material Elétrico", purchasePriority: "N2" })),
  row({ goodsGroupDescription: "Material Mecânico", purchasePriority: "N1" }),
  ...Array.from({ length: 22 }, () => row({ goodsGroupDescription: "Material Mecânico", purchasePriority: "N2" })),
  ...Array.from({ length: 3 }, () => row({ goodsGroupDescription: "Lubrificantes", purchasePriority: "N2" })),
  ...Array.from({ length: 5 }, () => row({ goodsGroupDescription: "Lubrificantes", purchasePriority: "N3" })),
  // Sem descrição: cai no código do grupo.
  row({ goodsGroupDescription: null, goodsGroupCode: "Z999", purchasePriority: "N4" })
];

const c = buildPendingPriorityAnalysis(SET_C, true, TODAY);
check(
  "ordem dos grupos (2 N1 → 1 N1 → 0 N1 por N2 → resto)",
  c.byMerchandiseGroup.map((entry) => entry.label),
  ["Material Elétrico", "Material Mecânico", "Lubrificantes", "Z999"]
);
check("Material Elétrico", c.byMerchandiseGroup[0], { label: "Material Elétrico", n1: 2, n2: 18, n3: 0, n4: 0, withoutPriority: 0, total: 20 });
check("Material Mecânico", c.byMerchandiseGroup[1], { label: "Material Mecânico", n1: 1, n2: 22, n3: 0, n4: 0, withoutPriority: 0, total: 23 });
check("Lubrificantes", c.byMerchandiseGroup[2], { label: "Lubrificantes", n1: 0, n2: 3, n3: 5, n4: 0, withoutPriority: 0, total: 8 });
check("grupo sem descrição usa o código", c.byMerchandiseGroup[3].label, "Z999");

/* ------------------------------------------------------------------ */
/* 4. Ranking crítico (TAREFA 7)                                      */
/* ------------------------------------------------------------------ */

console.log("\n== Top Compras Pendentes Críticas ==");

const SET_D: PriorityAnalysisRow[] = [
  row({ requisitionNumber: "N4-antiga", purchasePriority: "N4", requisitionDate: day(2025, 1, 10) }),
  row({ requisitionNumber: "N2-recente", purchasePriority: "N2", requisitionDate: day(2026, 8, 20) }),
  row({ requisitionNumber: "N1-recente", purchasePriority: "N1", requisitionDate: day(2026, 8, 24) }),
  row({ requisitionNumber: "N1-antiga", purchasePriority: "N1", requisitionDate: day(2026, 6, 1) }),
  row({ requisitionNumber: "N2-antiga", purchasePriority: "N2", requisitionDate: day(2026, 3, 15) }),
  row({ requisitionNumber: "sem-prioridade", purchasePriority: null, requisitionDate: day(2024, 1, 1) }),
  row({ requisitionNumber: "N3-media", purchasePriority: "N3", requisitionDate: day(2026, 5, 5) }),
  // Sem data: vai para o FIM do bloco N1, não para a frente.
  row({ requisitionNumber: "N1-sem-data", purchasePriority: "N1", requisitionDate: null })
];

const d = buildPendingPriorityAnalysis(SET_D, true, TODAY);
check(
  "ordem: N1 (mais antiga primeiro, sem data no fim) → N2 → N3 → N4 → sem prioridade",
  d.criticalItems.map((item) => item.requisition),
  ["N1-antiga", "N1-recente", "N1-sem-data", "N2-antiga", "N2-recente", "N3-media", "N4-antiga", "sem-prioridade"]
);
check("1º item é N1", d.criticalItems[0].priority, "N1");
check("dias em aberto de N1-antiga (2026-06-01 → 2026-08-26)", d.criticalItems[0].daysOpen, 86);
check("sem data → daysOpen null (não NaN)", d.criticalItems[2].daysOpen, null);
check("rótulo da prioridade", d.criticalItems[0].priorityLabel, "N1");
check("rótulo de sem prioridade", d.criticalItems[7].priorityLabel, "Sem prioridade");

// Empate de data no mesmo N1: maior quantidade pendente na frente.
const SET_E: PriorityAnalysisRow[] = [
  row({ requisitionNumber: "menor-qtd", purchasePriority: "N1", requisitionDate: day(2026, 6, 1), pendingQuantity: 2 }),
  row({ requisitionNumber: "maior-qtd", purchasePriority: "N1", requisitionDate: day(2026, 6, 1), pendingQuantity: 40 })
];
check(
  "empate de data → maior quantidade pendente primeiro",
  buildPendingPriorityAnalysis(SET_E, true, TODAY).criticalItems.map((item) => item.requisition),
  ["maior-qtd", "menor-qtd"]
);

// Data no FUTURO (digitação errada na planilha) não gera dias negativos.
const SET_F = [row({ purchasePriority: "N1", requisitionDate: day(2027, 1, 1) })];
check("data futura → 0 dias (nunca negativo)", buildPendingPriorityAnalysis(SET_F, true, TODAY).criticalItems[0].daysOpen, 0);

// O cru do "Nº acompanhamento" chega ao ranking para conferência.
check("trackingNumberRaw preservado", buildPendingPriorityAnalysis([row({ purchasePriority: "N3", trackingNumber: "N03" })], true, TODAY).criticalItems[0].trackingNumberRaw, "N03");

// Limite do ranking: 25 itens, mesmo com 60 pendências.
const SET_G = Array.from({ length: 60 }, () => row({ purchasePriority: "N1" }));
check("ranking limitado a 25 itens", buildPendingPriorityAnalysis(SET_G, true, TODAY).criticalItems.length, 25);
check("mas o card N1 conta as 60", buildPendingPriorityAnalysis(SET_G, true, TODAY).summary.n1, 60);

/* ------------------------------------------------------------------ */
/* 5. Valor gravado inválido não quebra a agregação                   */
/* ------------------------------------------------------------------ */

console.log("\n== Robustez: prioridade inesperada no banco ==");

// Se um dia o banco tiver um valor fora da faixa, ele cai em "sem prioridade" —
// nunca cria uma sexta categoria nem gera undefined nos cards.
const SET_H = [
  row({ purchasePriority: "N9" }),
  row({ purchasePriority: "" }),
  row({ purchasePriority: "n2" }),
  row({ purchasePriority: "N01" })
];
const h = buildPendingPriorityAnalysis(SET_H, true, TODAY);
check("valores estranhos → sem prioridade; n2/N01 normalizados", h.summary, {
  totalPending: 4,
  n1: 1,
  n2: 1,
  n3: 0,
  n4: 0,
  withoutPriority: 2
});
check("nenhuma categoria extra", h.byPriority.length, 5);

console.log(
  `\n${failures === 0 ? "TODOS OS TESTES PASSARAM" : `${failures} TESTE(S) FALHARAM`} — ${total - failures}/${total}`
);
process.exit(failures === 0 ? 0 : 1);
