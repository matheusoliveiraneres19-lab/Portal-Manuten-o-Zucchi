# Análise MRP — compras lidas do Portal

O MRP não recebe mais planilha de compras. As compras vêm do banco do Portal
(`PurchaseRecord`, o mesmo de Compras Pendentes / Compras Realizadas) e são
gravadas como **snapshot** a cada análise. O motor (`analysis-engine.ts`,
`mrp-math.ts`) não mudou: só a origem das compras.

## Fluxo operacional

1. Compras do Portal atualizadas (importação em Compras).
2. **Atualizar MRP**: anexar o estoque (MB52, obrigatório) e, se quiser, a Base MRP.
3. O Portal lê as compras automaticamente, grava o snapshot e roda a análise.
4. A equipe consulta.

Depois de uma importação de compras bem-sucedida, o Portal tenta recalcular a
análise vigente sozinho (**PURCHASE_SYNC**): mesma Base, mesmo estoque, snapshot
novo de compras. Falha ou desistência nunca derrubam a importação de compras;
ficam na auditoria (`mrp_update_success` / `mrp_update_failed`, `trigger: PURCHASE_SYNC`).

## De onde vêm as compras

`getPurchaseAnalysisBaseSnapshot` (`src/services/purchases-analysis-base.service.ts`):

- **retrato atual** = linhas do último lote importado (`importBatch`), o mesmo recorte de Compras Pendentes;
- **base de análise da regra v3.1** (nem serviço, nem Y04), com as MESMAS cláusulas SQL e a MESMA
  `classifyPurchaseV31HtmlRule` das páginas de Compras;
- 2 consultas (lote + linhas), sem consulta por material ou por pedido.

| Grupo v3.1 | No MRP |
|---|---|
| `PENDENTE_COMPRA` (requisição sem pedido) | compra em aberto (`receiptDate` vazio) |
| `EM_ATRASO` / `NAO_ENTREGUES` (pedido sem recebimento) | compra em aberto → Em trânsito |
| `RECEBIDOS` (Data Recebimento preenchida) | recebida, com a data REAL do Portal |

Mapeamento (antiga coluna da planilha → `PurchaseRecord`): Material → `materialCode`
(zeros à esquerda mantidos, `cleanCode`), Texto Breve → `itemDescription`, Quantid →
`quantity`, Data da Requisição → `requisitionDate`, Requisição → `requisitionNumber`,
Pedido de Compra → `purchaseOrderNumber`, Data Recebimento → `receiptDate` (só em
RECEBIDOS), Previsão de entrega → `expectedDeliveryDate`, Fornecedor → `supplierName`.

- **Deduplicação:** cada `PurchaseRecord` do lote é um item (`technicalKey` única);
  pendente e recebido nunca coexistem para a mesma linha. Não há dedup por material.
- **Recebimento parcial:** a regra v3.1 trata como recebida a linha com Data
  Recebimento. Linhas recebidas com Quant Pendente > 0 só são contadas
  (`receivedWithPendingQty`) para auditoria; nenhuma regra nova foi criada.
- **Ordem (`seq`):** determinística (data da requisição, requisição, pedido, material, chave técnica).

## Export de compras sem dados de recebimento

O Portal recebe dois layouts de compras: o export diário `requisicoes_compra_*.xlsx`
**não traz** Data Recebimento, Previsão de entrega nem Quant Pendente; o
`compras.xlsx` traz. Com o diário como retrato atual, toda compra pareceria em
aberto (simulação de 14/10/2026: 152 materiais iriam indevidamente para Comprado,
Recebidos = 0).

Por isso, se o lote atual tem pedidos mas **nenhuma** linha com Data Recebimento,
Previsão ou Quant Pendente (mesmo critério de disponibilidade de colunas das
páginas de Compras), o MRP **não gera análise**:

- Atualizar MRP: mensagem "A importação de compras mais recente do Portal não traz
  dados de recebimento…", nada é importado, a análise anterior continua vigente;
- PURCHASE_SYNC: desiste (`NO_RECEIPT_DATA`), registra na auditoria.

**Pendência:** incluir essas colunas no export diário do SAP. A partir daí o
fluxo funciona sem nenhuma mudança de código.

## Snapshot e histórico

- `MrpPurchaseImport.source`: `FILE_UPLOAD` (planilha, runs antigos) ou `PORTAL_DB`
  (snapshot). `metadata`: regra, lote lido, momento da leitura e contagens.
  Migration aditiva `20261013000000_mrp_purchase_import_source`.
- `PORTAL_DB` não tem arquivo: `fileName`/`sheet` vazios (sem nome fictício); a
  tela mostra "Compras: Portal · sincronizado em … · N pendentes · M recebidas".
- O run aponta para o snapshot, nunca para `PurchaseRecord`: compras alteradas
  depois geram outro snapshot no próximo run. Aba Em trânsito e exportação de
  Compras leem o snapshot do run.
- Runs antigos (`FILE_UPLOAD`) abrem normalmente; nada antigo é apagado.
- Aviso "Há compras mais recentes no Portal do que nesta análise." quando o lote
  atual de compras é diferente do lido no snapshot.

## Erros

| Situação | Resultado |
|---|---|
| Consulta às compras falhou | HTTP 503 `MRP_PORTAL_PURCHASES_FAILED`; nada importado; análise anterior vigente |
| Lote sem dados de recebimento | HTTP 503 `MRP_PORTAL_PURCHASES_NO_RECEIPT_DATA`; idem |
| Zero compras (consulta ok) | válido: análise gerada, Em trânsito vazio |
| Falha ao gravar snapshot ou na análise | HTTP 422; estoque importado fica no histórico sem uso |

Auditoria `mrp_update_success`: `purchasesSource: "PORTAL"`, `snapshotId`,
`pendingCount`, `receivedCount`, `purchaseLines`, `purchasesImportBatch`.

## Testes

```
npm run test:mrp-portal-purchases
```

Converte as compras das fixtures, de 3 conjuntos sintéticos sobre a base real e
da planilha real `compras 0810` para o formato do Portal e confirma resultado do
motor **idêntico** (0 divergências), além dos casos: recebida antiga + pendente
nova, o inverso, código fora da Base, recebida sem data, zeros à esquerda e
export sem colunas de recebimento. Auditorias somente leitura:
`scripts/mrp/audit-portal-purchases.ts`, `scripts/mrp/audit-mrp-purchase-file-vs-portal.ts`.
