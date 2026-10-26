# Análise MRP — Exportações Excel (FASE J)

Reproduz as 6 exportações do `Analise_MRP_Compacto (1).html` (bloco EXPORTAÇÕES):

- `exportCompra(false)`
- `exportCompra(true)`
- `exportConjuntos()`
- `exportParado()`
- `exportTransito()`
- `exportBase()`

## Arquitetura

O `.xlsx` é gerado **no servidor**. O navegador só envia o tipo e os filtros atuais e baixa o arquivo com o nome que vem no `Content-Disposition`. Nenhuma biblioteca Excel vai para o bundle do navegador.

| Camada | Arquivo |
|---|---|
| Conteúdo (porta 1:1 do HTML) | `src/lib/mrp/export.ts`: HDR/COLW, `mrpExportLine` (= `linha()`), os 6 builders, `mrpExportDateStamp`, `mrpExportFileName` |
| Gravação | `src/lib/mrp/export-workbook.ts`: SheetJS **0.20.3**, já instalada no projeto; `aoa_to_sheet` + `!cols` (`wch`) + `book_append_sheet` |
| Snapshot | `src/services/mrp-export.service.ts` (`exportMrp`, `buildMrpExport`) |
| API | `GET /api/mrp/export?type=…` |
| UI | `src/components/mrp/MrpExportButton.tsx`, usado nas 5 abas |

**Bibliotecas:**
- **A SheetJS 0.18.5 embutida no HTML não é usada.** O conteúdo é equivalente, mas os bytes não são idênticos.
- O `exceljs`, que também está no projeto, não foi usado: a SheetJS grava `!cols`/`wch` exatamente como o legado.

## Snapshot

Cada exportação lê o run vigente **uma vez**:

| Exportação | Fonte |
|---|---|
| Lista, por área, conjuntos, estoque parado | itens do run (`getMrpRunItemsCached(runId)`, o mesmo cache da tela) |
| Compras | `MrpPurchaseItem` da `purchaseImportId` do run (cache por runId) |
| Excel da base | a base exibida na aba Base MRP: `run.baseVersionId` ou, sem run, a base ativa |

**Fontes nunca usadas:**
- `runId` vindo do cliente;
- a "última importação";
- `Material`, `MaterialMovement`, `PurchaseRecord`.

## Exportações

| `type` | HTML | Recorte | Arquivo | Abas | Colunas |
|---|---|---|---|---|---|
| `buy` | `exportCompra(false)` | `filtrarCompra()`: q, status, area, family, sort | `Lista_Compra_MRP_AAAAMMDD.xlsx` | Lista de compra | 12 |
| `buy-by-area` | `exportCompra(true)` | `filtrarCompra()` **e depois** a divisão por área | `Lista_Compra_MRP_AAAAMMDD.xlsx` | Mecânica / Elétrica (`substring(0,28)`, só com linhas) | 12 |
| `families` | `exportConjuntos()` | análise **completa** (ignora Comprar); por família, `sugerida` DESC com empate estável (ordem da análise / position) | `Satelites_Coroas_AAAAMMDD.xlsx` | 5 famílias na ordem FAMS (`substring(0,28)`, só com linhas) | 12 |
| `idle` | `exportParado()` | `paradoRows()`: idleQ, idleType, idleArea; saldo DESC estável | `Estoque_Parado_AAAAMMDD.xlsx` | Sem movimentacao | **12** (o `sheet()` da lista, não as 5 da tela) |
| `transit` | `exportTransito()` | **todos** os grupos de `comprasIndex()`, na ordem de 1ª aparição (ignora busca, situação e "Só materiais da base") | `Compras_Realizadas_AAAAMMDD.xlsx` | Compras | 12 |
| `base` | `exportBase()` | `baseFiltrada()`: baseQ, baseArea, baseFilter | `Base_MRP_AAAAMMDD.xlsx` | Base MRP | 9 |

### Regras de conteúdo

- **Situação** (lista, área, conjuntos, parado): `Comprado` → "Em trânsito"; os demais repetem o status.
  - Material sem mín/máx sai como **"OK"**, não "Sem MRP".
  - Isso difere de propósito do selo da tela.
- **Observação:** `obsDe()`, o mesmo `mrpObservation` da tela.
- **Saldo, Mínimo, Máximo, Comprar e Quantidade:** células numéricas.
- **Compras:**
  - **Descrição:** a do material na análise; fora da base, o **texto da última compra**.
  - **Área:** "fora da base" para material fora da base.
  - **Quantidade:** da **última** compra, sem somar as compras do código.
  - **Datas:** texto `DD/MM/AAAA` (`dataBR`), vazio quando não houver.
  - **Situação:** Em trânsito / Recebido / Sem pedido/requisição.
  - **Compras do código:** número de linhas do código.
- **Larguras (`wch`):**
  - lista: 14·46·12·20·12·7·12·11·11·12·15·52;
  - compras: 14·44·12·12·30·18·16·18·18·18·22·10;
  - base: 14·46·12·20·14·7·15·15·28.
- **Data do nome:** dia da geração no fuso **America/Sao_Paulo**. O HTML usava o relógio do navegador no Brasil; na Vercel (UTC), sem o fuso, o arquivo poderia sair com o dia seguinte depois das 21h.

### Sem dados

| Situação | Comportamento |
|---|---|
| Sem análise | "Gere a análise primeiro." (como o HTML) |
| Nenhum conjunto | "Nenhum conjunto identificado." (como o HTML) |
| Sem compras | "Nenhuma compra carregada." (como o HTML) |
| Por área sem linhas | "Nada para exportar." (como o HTML) |
| Lista, estoque parado ou base com recorte vazio | "Nada para exportar." (**diferente do HTML**) |

Na última linha, o HTML baixava um arquivo só com o cabeçalho. O Portal segue o item 51 da FASE J ("não gerar workbook vazio").

A API responde 422 com `{ ok:false, message }`, e a tela mostra a mensagem num toast.

## Permissões

- Exportar é leitura: qualquer usuário autenticado pode (`requireApiSession`).
- Sem sessão, a resposta é 401.
- Envio e alteração da base continuam restritos a ADMIN/GESTOR.

## Consultas e desempenho

| Tipo | Consultas com cache frio | Consultas com cache quente |
|---|---|---|
| Lista / por área / conjuntos / estoque parado | 2 (run + itens) | 1 |
| Compras | 3 (run + compras + itens) | 1 |
| Base | 4 (run + base ativa + versão + materiais) | 2 |

**Gravação do `.xlsx`:**
- ~4.280 linhas: 100–160 ms, ~1,9 MB.
- 972 grupos de compras reais: ~25 ms, ~0,5 MB.

## Testes

| Script | O que cobre |
|---|---|
| `npm run test:mrp-export` | paridade com as funções do HTML capturadas na sandbox: nome, abas, linhas, células e `!cols` em todas as combinações de filtro, mais o `.xlsx` relido célula a célula (tipo + valor + larguras). Roda sobre a base embutida + sintéticos, as fixtures e os **arquivos reais** (Controle_MRP + estoque 0810 + compras 0810), quando presentes na máquina. |
| `npm run test:mrp-export-db -- --direct` | serviço com banco: Excel = API da tela, snapshot (compras mais novas e base ativa diferente não entram), sem análise, consultas frio/quente |
| `npm run test:mrp-e2e -- --direct` (seção 9c) | os 6 botões baixam o arquivo (nome, MIME, tamanho, abas, linhas = API), duplo clique gera 1 requisição, VISUALIZADOR exporta, anônimo não |

PARIDADE MB52 REAL: PENDENTE · PARIDADE COMPRAS REAL: PENDENTE.
