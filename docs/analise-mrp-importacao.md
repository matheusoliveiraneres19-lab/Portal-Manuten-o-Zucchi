# Análise MRP — importação 1:1 (FASE C)

Esta fase reproduz a **leitura** das planilhas do `Analise_MRP_Compacto (1).html`. O motor (Comprar/Verificar/OK), as telas e as exportações ficam para as fases D em diante. A persistência usada aqui foi criada na FASE B (ver `docs/analise-mrp-persistencia.md`).

## Biblioteca pura — `src/lib/mrp/`

| Arquivo | Funções originais do HTML |
|---|---|
| `normalization.ts` | `norm`, `cleanCode` (não remove zeros à esquerda do material), `cleanText` |
| `number-parser.ts` | `parseNum`; também `normalizeNegativeZero`, usada só para exibir, serializar e comparar |
| `date-parser.ts` | `isoOf`, `parseData`, `dataBR` |
| `aliases.ts` | `ALIAS` (16 campos, ordem preservada, protegido por snapshot), `detectCol` |
| `classification.ts` | `famDe` (`resolveMrpFamily`), `isSemMovTxt`, área pelo nome da aba, abas ignoradas |
| `workbook.ts` | `XLSX.read` com as mesmas opções do HTML; `sheetToAOA` |
| `file-detection.ts` | `scoreHeader`, `findHeaderRow`, `pontuar`, `analisarArquivo`, `colunasOk`; encaixe dos slots (`receberArquivos`), `reatribuir`, trava do `atualizarSlots` |
| `base-parser.ts` | `importarBase` |
| `stock-parser.ts` | trecho de estoque do `processar` |
| `purchase-parser.ts` | trecho de compras do `processar`, `cmpStatus`, `cmpOrdem`, `comprasIndex` |
| `import-plan.ts` | prévia por tipo/aba e plano de importação (ordem e mensagens do `processar`) |
| `types.ts` | tipos compartilhados |

Duas diferenças **neutras**, ou seja, que não mudam o resultado:
- A leitura usa `blankrows: true` e descarta as linhas vazias depois. O resultado é idêntico ao do `sheetToAOA` do HTML, e assim cada registro guarda a linha real da planilha (`sourceRow`).
- Acréscimos só do Portal:
  - `confidence` e `warnings`. Um arquivo com pontuação 0/0/0 continua sendo classificado como **base**, como no HTML, mas recebe confidence `LOW` e o aviso "Nenhuma coluna reconhecida com segurança.";
  - sem Base MRP vigente no banco, a planilha do MRP passa a ser obrigatória. No HTML isso não acontece porque sempre existe a base embutida.

## Regras preservadas, com os testes que as comprovam

- **Cabeçalho:** é a primeira linha de maior `scoreHeader` entre as 12 primeiras. O `scoreHeader` não conta mín/máx.
- **`detectCol`:** primeiro igualdade exata, na ordem dos aliases. Depois procura cabeçalho que *contenha* o alias, testando do alias mais longo para o mais curto.
  - Consequência: sem uma coluna de data da requisição, "Data recebimento" é lida como `data`.
- **Tipo do arquivo:**
  - `base`, se a pontuação de base for maior ou igual à maior pontuação;
  - senão `cmp`, se a pontuação de compras for maior que a de estoque;
  - senão `est`.
  - A aba escolhida é a de maior pontuação; em empate, a primeira.
- **Slots:** um arquivo cujo tipo já está ocupado vai para o primeiro slot vazio, na ordem base → est → cmp. Se não houver slot vazio, ele substitui o anterior. São no máximo 4 arquivos por envio.
- **Base MRP:**
  - **todas** as abas do arquivo são lidas; a aba escolhida no slot serve só para validar;
  - abas cujo nome contém `gyan`, `usogeral` ou `automatico` são ignoradas;
  - abas sem Material/Mín/Máx são puladas sem derrubar o arquivo;
  - área: nome com `eletric` → Elétrica; com `mecanic` ou `manutenc` → Mecânica; senão a área padrão (Mecânica);
  - conjunto = `famDe(Status MRP)`;
  - **duplicados:** vale a primeira ocorrência. A repetição só completa o conjunto quando ele está vazio e troca mín **e** máx juntos quando a primeira tem `!min && !max`. **Não** completa a descrição.
- **Estoque:**
  - obrigatórios: Material e Utilização livre;
  - o filtro de depósito passa por `cleanCode`, perde os zeros à esquerda e vai para maiúsculas. Isso vale **só para o depósito**, nunca para o código do material;
  - filtro vazio = todos os depósitos;
  - filtro preenchido sem coluna Depósito: todas as linhas entram e o resultado avisa;
  - código repetido: **a primeira ocorrência vence e as seguintes são descartadas, não somadas**;
  - nenhuma linha restante = erro, e nada é importado.
- **Compras:**
  - só Material é obrigatório;
  - toda linha com código entra, **sem deduplicação**;
  - `seq` (= `c.i`) numera só as linhas aceitas;
  - as datas ficam como texto `YYYY-MM-DD`.
- **Última compra** (`cmpOrdem`): a chave é `(dataReq || recebimento || previsao || "0000-00-00") | pedido(12) | requisição(12) | seq(7)`, comparada como texto. A última é a de maior chave. O status (`cmpStatus`) vem só dessa última compra: `rec` / `pend` / `sem`.

## Fluxo no servidor — `src/services/mrp-import.service.ts`

```
POST /api/mrp/import/upload-url  → URL assinada (navegador → Supabase Storage, imports/analise-mrp/)
POST /api/mrp/import/inspect     → baixa, detecta, encaixa nos slots, prévia + trava; ImportHistory UPLOADED (sha256)
POST /api/mrp/import/preview     → outro tipo/aba/depósito/área sem reenviar (reatribuir / trocarAba)
POST /api/mrp/import/confirm     → reserva → plano → staging → validação → UMA transação
GET  /api/mrp/import/[id]        → estado da importação
POST /api/mrp/base/activate      → ativação EXPLÍCITA de uma versão da Base MRP
```

Todas as rotas exigem papel **ADMIN ou GESTOR**.

O `confirm` funciona assim:
1. **Reserva atômica dos históricos.** Uma segunda confirmação simultânea é recusada sem tocar em nada. Uma reserva abandonada há mais de 10 minutos pode ser retomada.
2. **Plano** com as mensagens do HTML. O primeiro erro interrompe tudo.
3. **`ImportStagingRow`:** a linha crua e a normalizada, com status `VALID` ou `IGNORED` (motivos: sem código, duplicado, outro depósito).
4. **Validação:** a quantidade de linhas válidas no staging precisa bater com o plano.
5. **Uma transação:**
   - trava de idempotência por histórico;
   - `MrpBaseVersion` + materiais (**inativa**, a não ser com `activateBase: true`);
   - `MrpStockImport` + itens;
   - `MrpPurchaseImport` + itens;
   - históricos marcados como `COMPLETED`.

Se qualquer etapa falhar, tudo é revertido, o histórico fica `FAILED` e pode ser confirmado de novo. Importar o mesmo arquivo outra vez gera uma nova importação, sem sobrescrever a anterior. **Nenhuma `MrpAnalysisRun` é criada nesta fase.**

As quantidades são gravadas com `toMrpDecimal` (exatas). O staging guarda números como texto.

**Ordem dos materiais para a FASE D:** é a ordem de inserção do `materiais()`, recuperável por (posição de `sourceSheet` em `MrpBaseVersion.sheets`, `sourceRow`). Isso importa nos desempates de ordenação.

## Fusos e versões da SheetJS

O HTML usa a SheetJS **0.18.5** (embutida) e o Portal usa a **0.20.3**. A 0.18.5 tem falhas de segurança conhecidas na leitura de arquivos, por isso não foi adotada no servidor.

| Fuso | Portal × HTML |
|---|---|
| UTC (fuso das funções da Vercel) | **idênticos** em todos os casos |
| America/Sao_Paulo (fuso do navegador onde o HTML roda) | 3 divergências, todas por bugs da 0.18.5 |

As 3 divergências em São Paulo:
- uma célula de data com hora ≥ 23:59:32 vira o dia seguinte no HTML, por um desvio de +28 s (LMT);
- a meia-noite do início do horário de verão de 2018 (04/11/2018) vira 03/11 no HTML;
- uma data ISO em **CSV** (`2026-09-01`) vira 31/08 no HTML.

O Portal dá o mesmo resultado em qualquer fuso. As divergências estão registradas e **não foram corrigidas**: a decisão fica para o comparador da FASE K.

## Testes

```bash
npm run test:mrp-import                    # sem banco: 181 checagens contra o HTML executado em sandbox
npm run test:mrp-import-db -- --direct     # integração com o banco (DIRECT_URL, connection_limit=1)
```

- O `test:mrp-import` executa o `<script>` original do HTML, com a SheetJS dele, em `node:vm` (`scripts/mrp/html-runtime.ts`). Ele compara helpers, snapshot do `ALIAS`, leitura do workbook, slots e trava, `trocarAba`/`reatribuir`, `processar` (base, estoque, compras e mensagens de erro), última compra, a **Base MRP real** e a sonda de fuso.
- Os scripts usam `scripts/mrp/script-db.ts`: `connection_limit=1` e uma nova tentativa finita, com backoff, **só na conexão inicial**.

## Base MRP real — `Controle_MRP_SAP_novo_analisado.xlsx`

| Aba | Área | Linhas | Materiais |
|---|---|---|---|
| MRP Analise manutenção | Mecânica | 3.465 | 3.465 |
| MRP Analise Eletrica | Elétrica | 794 | 794 |
| MRP Automatico Gyan | ignorada | — | — |

Total: **4.259** materiais, com 0 duplicados e 0 linhas sem código. Portal = HTML, com 0 divergências campo a campo.

## Pendente

**PARIDADE COM ARQUIVOS REAIS DE ESTOQUE (MB52) E COMPRAS: PENDENTE.** Os testes usam fixtures controladas, geradas em `scripts/mrp/fixtures.ts`. Ainda não há interface de importação, que fica para as fases seguintes.
