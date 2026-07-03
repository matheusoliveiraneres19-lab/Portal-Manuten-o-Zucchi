/**
 * Testes da REGRA CENTRAL de classificação de compras (TAREFA 18).
 * Não toca o banco. Uso: npx tsx scripts/test-purchase-classification.ts
 */
import {
  classifyPurchaseRecord,
  type PurchaseClassificationInput
} from "@/utils/purchase-classification";

const TODAY = new Date(Date.UTC(2026, 6, 3)); // 2026-07-03
const OVERDUE = new Date(Date.UTC(2026, 5, 1)); // 2026-06-01 (vencida)
const FUTURE = new Date(Date.UTC(2026, 11, 1)); // 2026-12-01 (futura)

function make(overrides: Partial<PurchaseClassificationInput>): PurchaseClassificationInput {
  return {
    purchasingGroup: "Y01",
    goodsGroupCode: "Z001",
    goodsGroupDescription: "Materiais elétricos",
    itemDescription: "Rolamento 6205",
    materialDescription: "Rolamento 6205",
    materialCode: "MAT-1",
    supplierCode: "F1",
    supplierName: "Fornecedor Genérico LTDA",
    deletionCode: null,
    purchaseOrderNumber: null,
    receiptFlag: null,
    receiptDate: null,
    expectedDeliveryDate: null,
    ...overrides
  };
}

type Case = {
  name: string;
  input: PurchaseClassificationInput;
  expectStatus: string;
  expectGroup?: string;
  expectNature?: string;
  extra?: (c: ReturnType<typeof classifyPurchaseRecord>) => boolean;
};

const cases: Case[] = [
  { name: "1. Y01 sem pedido → PENDENTE_COMPRA", input: make({}), expectStatus: "PENDENTE_COMPRA", expectGroup: "COMPRAS_PENDENTES", expectNature: "Y01_COMPRA_NORMAL" },
  { name: "2. Y01 com pedido → COMPRADO", input: make({ purchaseOrderNumber: "4500001", expectedDeliveryDate: FUTURE }), expectStatus: "COMPRADO", expectGroup: "COMPRAS_REALIZADAS" },
  { name: "3. Y01 com pedido + previsão vencida + sem recebimento → ATRASADO", input: make({ purchaseOrderNumber: "4500002", expectedDeliveryDate: OVERDUE }), expectStatus: "ATRASADO", expectGroup: "COMPRAS_PENDENTES" },
  { name: "4. Y01 recebimento + Recbconcl X → ENTREGUE", input: make({ purchaseOrderNumber: "4500003", expectedDeliveryDate: FUTURE, receiptFlag: "X", receiptDate: new Date(Date.UTC(2026, 6, 1)) }), expectStatus: "ENTREGUE", expectGroup: "COMPRAS_REALIZADAS" },
  { name: "5. Y04 → REGULARIZACAO", input: make({ purchasingGroup: "Y04" }), expectStatus: "REGULARIZACAO", expectGroup: "REGULARIZACOES", expectNature: "Y04_REGULARIZACAO" },
  { name: "6. Y0008 (Grupo Merc) → SERVICO", input: make({ goodsGroupCode: "Y0008" }), expectStatus: "SERVICO", expectGroup: "SERVICOS", expectNature: "Y0008_SERVICO" },
  { name: "7. CódElim L → IGNORADO", input: make({ deletionCode: "L", purchaseOrderNumber: "4500004" }), expectStatus: "IGNORADO", expectGroup: "IGNORADOS" },
  { name: "8. Fornecedor Equatorial → IGNORADO", input: make({ supplierName: "Equatorial Energia S.A." }), expectStatus: "IGNORADO" },
  { name: "9. Fornecedor Auren → IGNORADO", input: make({ supplierName: "AUREN ENERGIA" }), expectStatus: "IGNORADO" },
  { name: "10. Descrição Bloq → IGNORADO", input: make({ itemDescription: "Material Bloq p/ compra" }), expectStatus: "IGNORADO" },
  { name: "11. Descrição Bloqueado → IGNORADO", input: make({ itemDescription: "Item BLOQUEADO pelo fiscal" }), expectStatus: "IGNORADO" },
  { name: "12. Descrição frete → IGNORADO", input: make({ itemDescription: "FRETE sobre compra" }), expectStatus: "IGNORADO" },
  { name: "13. Y04 com pedido → REGULARIZACAO (não COMPRADO)", input: make({ purchasingGroup: "Y04", purchaseOrderNumber: "4500005" }), expectStatus: "REGULARIZACAO" },
  { name: "14. Y0008 com pedido → SERVICO (não COMPRADO)", input: make({ goodsGroupCode: "Y0008", purchaseOrderNumber: "4500006" }), expectStatus: "SERVICO" },
  {
    name: "15. Y01 entregue depois da previsão → ENTREGUE + isLateReceived",
    input: make({ purchaseOrderNumber: "4500007", expectedDeliveryDate: OVERDUE, receiptFlag: "X", receiptDate: new Date(Date.UTC(2026, 6, 1)) }),
    expectStatus: "ENTREGUE",
    extra: (c) => c.isLateReceived === true
  }
];

let failures = 0;
for (const testCase of cases) {
  const result = classifyPurchaseRecord(testCase.input, TODAY);
  const checks: string[] = [];
  if (result.operationalStatus !== testCase.expectStatus) checks.push(`status=${result.operationalStatus} (esperado ${testCase.expectStatus})`);
  if (testCase.expectGroup && result.reportGroup !== testCase.expectGroup) checks.push(`group=${result.reportGroup} (esperado ${testCase.expectGroup})`);
  if (testCase.expectNature && result.purchaseNature !== testCase.expectNature) checks.push(`nature=${result.purchaseNature} (esperado ${testCase.expectNature})`);
  if (testCase.extra && !testCase.extra(result)) checks.push("extra falhou");

  if (checks.length) {
    failures += 1;
    console.log(`❌ ${testCase.name}\n     ${checks.join(" | ")}\n     motivo: ${result.classificationReason}`);
  } else {
    console.log(`✅ ${testCase.name}  →  ${result.operationalStatus} (${result.classificationReason})`);
  }
}

console.log(`\n${failures === 0 ? "TODOS OS TESTES PASSARAM" : `${failures} TESTE(S) FALHARAM`} — ${cases.length - failures}/${cases.length}`);
process.exit(failures === 0 ? 0 : 1);
