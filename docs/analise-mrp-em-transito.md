# Análise MRP — Em trânsito (FASE G)

Reproduz a aba "Em trânsito" do `Analise_MRP_Compacto (1).html` (`renderTransito()`) com paridade 1:1, em `/dashboard/analise-mrp?tab=transit`.

## Fonte dos dados

- **Compras:** `MrpAnalysisRun` vigente → **`purchaseImportId`** → `MrpPurchaseItem`. São todas as linhas, **inclusive de materiais fora da Base MRP**.
  - Nunca a "última importação" global.
  - Nunca as tabelas de compras do portal (`Purchase`/`PurchaseRecord`).
  - Um run antigo continua auditável com as compras dele.
- **Itens da análise:** usados só para descrição, área e o filtro "Só materiais da base MRP". Vêm do mesmo cache por runId da tela Comprar.
- **Última compra:** o **mesmo** `comprasIndex()`, `cmpOrdem()` e `cmpStatus()` das FASES C e D (`buildMrpPurchaseIndex`). Vale só a última compra de cada código.

| Camada | Arquivo |
|---|---|
| Regra pura | `src/lib/mrp/transit.ts` (`buildMrpTransitGroups`, `filterMrpTransit`, `mrpTransitRef`) |
| Leitura | `src/services/mrp-transit.service.ts` (cache por runId) |
| API | `GET /api/mrp/analysis/current/transit?transitQ&transitStatus&transitMrp&limit` |
| UI | `src/components/mrp/MrpTransitTab.tsx` |

## KPIs (dois universos, como no HTML)

| Card | Valor | Universo |
|---|---|---|
| Linhas de compra | quantidade de `MrpPurchaseItem` | todas as linhas da importação do run |
| Em trânsito | grupos com a última compra `pend` | **todos** os códigos das compras, inclusive fora da base |
| Qtd. em trânsito | soma da quantidade **da última compra** de cada código pendente | idem |
| Recebidos | grupos com a última compra `rec` | idem |
| Saíram do MRP | itens da análise com status final **Comprado**; texto "X de qtd. evitada" = soma de `suggestedOriginal` | itens da análise |

Os cinco valores vêm de `MrpAnalysisRun.kpis`, gravados pelo motor, e não são recalculados na tela.

**Clique em "Saíram do MRP":** abre Comprar com `status=Comprado` e **limpa área, conjunto e busca**, como pedido no item 50 da FASE G. O HTML só trocava o status; a diferença é deliberada, para nenhum filtro escondido reduzir a lista.

## Tabela "Última compra de cada material"

- **Colunas:** Código · Material · Qtd · Fornecedor · Pedido / Req. · Data · Previsão · Situação.
- **Material:**
  - descrição da análise; se não houver, o texto da última compra;
  - selo Mec ou Elé, ou **"fora da base MRP"** quando o código não está na análise;
  - "N compras" quando há mais de uma compra.
- **Qtd:** quantidade da **última** compra.
- **Pedido / Req.:** o pedido; se não houver, a requisição; se não houver nenhum, "—".
- **Data e Previsão:** datas da última compra em DD/MM/AAAA. Vazio aparece como "—"; o HTML deixava em branco.
- **Situação:** pend → Em trânsito, rec → Recebido, sem → Sem pedido.
- **Filtros:**
  - status Em trânsito (padrão), Recebidos, Sem pedido / requisição ou Todos;
  - "Só materiais da base MRP" (desmarcado por padrão);
  - busca `norm()` no código, no texto e no fornecedor da última compra, com debounce de 300 ms.
- **Ordem:** data da requisição da última compra, decrescente (`localeCompare`; vazias por último). Empates seguem a 1ª aparição do código nas compras (`firstSeq`). O `cmpOrdem` só escolhe **qual** é a última compra; a tabela não é ordenada por ele.
- **Paginação:** 200 linhas, e "mostrar mais" soma 400.
- **URL:** `transitStatus`, `transitQ` e `transitMrp`. Os nomes são diferentes dos da aba Comprar, para as duas não interferirem. Os filtros ficam preservados ao trocar de aba.
- **Estados vazios:** sem análise, o estado vazio do módulo; sem compras, "Nenhuma compra carregada."; filtro sem resultado, "Nenhuma compra neste filtro".

## Consultas

| Situação | Consultas |
|---|---|
| Cache frio | 3 (run vigente + compras + itens da análise) |
| Cache quente (abrir ou filtrar) | 1 (run vigente) |

Um run novo usa outra chave de cache.

## Testes

| Comando | Cobertura | Resultado |
|---|---|---|
| `npm run test:mrp-transit` | ver abaixo | 22 checagens, 0 falhas |
| `npm run test:mrp-screen-db -- --direct` | KPIs gravados e tabela da API iguais ao `renderTransito()`; `purchaseImportId` do run (inclusive após uma importação nova); consultas | aprovado |
| `npm run test:mrp-e2e -- --direct` | ver abaixo | aprovado |

O `test:mrp-transit` compara com o markup do `renderTransito()` original:
- KPIs e grupos (count, última compra, status);
- tabela em **144 combinações**, com 0 divergências, em 3 cenários: base embutida com 2.600 compras sintéticas e códigos fora da base, fixtures em xlsx e fixtures em CSV;
- os casos obrigatórios: fora da base, 3 compras com a última recebida, Qtd. só da última compra, Saíram do MRP 3 → 35, universos diferentes e empates de data.

O `test:mrp-e2e` cobre:
- `?tab=transit` e refresh;
- os 5 KPIs iguais ao banco;
- tabela igual à API;
- as 8 colunas;
- status Todos;
- selo "fora da base";
- o checkbox;
- a busca;
- filtros preservados entre abas;
- o clique em Saíram do MRP;
- voltar;
- celular.

## Pendente

- **PARIDADE MB52 REAL: PENDENTE.**
- **PARIDADE COMPRAS REAL: PENDENTE.**
- Não está pronto para produção.
