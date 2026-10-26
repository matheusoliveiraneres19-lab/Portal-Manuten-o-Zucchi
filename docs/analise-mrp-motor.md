# Análise MRP — motor (FASE D)

Esta fase reproduz `analisar()`, `pendentes()`, `obsDe()`, `contar()` e `comprasIndex()` do `Analise_MRP_Compacto (1).html`. Ainda não há interface; as telas entram a partir da FASE E.

## Onde as regras moram

| Camada | Arquivo | Papel |
|---|---|---|
| Motor puro | `src/lib/mrp/analysis-engine.ts` | `analyzeMrp` (analisar), `buildMrpPendingIndex` (pendentes), `mrpObservation` (obsDe), `countMrp` (contar), `removedFromMrp`, `mrpIdleKind`, `purchaseKpis`, `orderMrpBaseMaterials` |
| Aritmética | `src/lib/mrp/mrp-math.ts` | semântica JS explícita (`<= 0`, `<`, subtração, `max(0,…)`, soma em ordem) e `-0` → `0` só na saída |
| Execução | `src/services/mrp-analysis.service.ts` | `runMrpAnalysis`, `loadMrpAnalysisInputs`, `getCurrentMrpAnalysisSummary`, `getMrpAnalysisItems` |
| API | `POST /api/mrp/analysis/run` | executar a análise (ADMIN e GESTOR) |
| API | `GET /api/mrp/analysis/current` | análise vigente: KPIs e fontes, sem itens (qualquer usuário autenticado) |

**Proibido** recalcular Comprar, Verificar, OK, Comprado, sugerida, faltante, sem movimentação ou última compra em componentes React. As telas consomem o `MrpAnalysisItem` e os helpers do motor.

## Regras (todas do HTML, inclusive as peculiaridades)

- **Universo:** cada material da Base MRP gera exatamente um item, na ordem do `materiais()`. Um material que só existe no estoque não entra.
  - A ordem é a das abas em `MrpBaseVersion.sheets` e, dentro de cada aba, a linha de origem. Ela fica gravada em `MrpAnalysisItem.position`.
- **Saldo:** é a utilização livre do estoque. Se o material não estiver no estoque, o saldo é `0` e `notFound = true`.
- **Sem parâmetros:** `noParams = min <= 0 && max <= 0`.
- **Status original:**

  | Condição (avaliada nesta ordem) | Status |
  |---|---|
  | `noParams` | OK |
  | saldo `<= 0` | Comprar |
  | saldo `< min` | Verificar |
  | demais casos | OK |

  Com mín 0, máx > 0 e saldo > 0, o status é **OK**.
- **Quantidade sugerida original:** `noParams ? 0 : max(0, (max > 0 ? max : min) − saldo)`. Ela é calculada **também para OK**: mín 10, máx 20 e saldo 15 dão **OK com sugerida 5**.
- **Última compra:** os itens são agrupados por material e ordenados pela chave do `cmpOrdem` (texto). A última é a de maior chave. O índice é montado uma única vez.
- **Pendentes:** só entram os materiais cuja **última** compra está `pend`. Uma compra antiga pendente seguida de uma recebida não conta.
- **Compra pendente:**
  - sempre preenche `purchase*`, em **qualquer** status;
  - se o status original é **Comprar** ou **Verificar**, o material vira **Comprado**, com `suggested = 0` e `missing = max(0, suggestedOriginal − purchaseQty)`. Ele continua Comprado mesmo que falte quantidade;
  - se o status original é **OK**, o material continua OK, com a sugerida e a compra preenchida.
- **Sem movimentação:** `noMovement = noParams || isSemMovTxt(statusMrp)`. Os termos reconhecidos são `semsaida`, `semmovimenta`, `semmov`, `semconsumo`, `semgiro`, `naomovimentado`, `obsoleto` e `inativo`.
  - **Capital parado** = `noMovement && free > 0`.
  - **Zerado** = `noMovement && free <= 0`.
  - Os dois são derivados e não têm coluna própria.
- **Observação (`obsDe`):** mesmas frases do HTML.
  - Comprado: `pedido X` ou `requisição X` · quantidade e UM · previsão · `faltam X`.
  - Comprar: `Zerado (não consta no estoque enviado)` ou `Material zerado`.
  - Verificar: `Abaixo do mínimo (saldo de mín)`.
  - Sem parâmetros: `Sem mín/máx no MRP`.
  - OK: texto vazio.

## KPIs (`MrpAnalysisRun.kpis`)

- **Contagens:** `total`, `Comprar`, `Verificar`, `Comprado`, `OK`.
- **`qtd`:** soma de `suggested` de **todos** os materiais, inclusive os OK.
- **`qtdTransito`:** soma de `purchaseQty` dos materiais Comprado.
- **Sem movimentação:**
  - `semMov` = quantidade de materiais sem movimentação;
  - `parado` = quantos deles têm saldo > 0;
  - `qtdParada` = soma do saldo desses `parado`.
- **"Saíram do MRP":**
  - `removedFromMrp` = materiais com status final Comprado;
  - `avoidedQty` = soma de `suggestedOriginal` deles (a `suggested` já está zerada).
- **`purchases`** (aba Em trânsito, pela última compra de cada material): `linhas`, `materiais`, `pendentes`, `recebidos`, `semPedido`, `qtdPendente`.

## Números

O motor calcula em **double**, como o HTML.
- O Decimal do banco é convertido uma vez na leitura (`fromMrpDecimal`, exato) e uma vez na gravação (`toMrpDecimal`).
- Fazer a conta em Decimal mudaria os resultados: o HTML soma `0.1 + 0.2 = 0.30000000000000004`.
- Por isso as somas dos KPIs seguem a ordem do `materiais()` e batem com o HTML **bit a bit** (por exemplo `qtd = 22270.499999999985`).
- O `-0` é normalizado para `0` só na saída.

## Execução e snapshot

O `runMrpAnalysis` funciona em quatro etapas:
1. **Valida** a base, o estoque e as compras. Sem `baseVersionId`, usa a Base MRP ativa e grava o id usado.
2. **Valida o depósito.** O filtro é aplicado na importação do estoque. Um `depositFilter` diferente do que foi importado é recusado.
3. **Carrega** em 6 consultas (3 das fontes e 3 dos itens) e roda o motor em memória.
4. **Grava numa transação:**
   - cria o `MrpAnalysisRun`;
   - grava os itens com `createMany` em lotes de 1.000;
   - confere a quantidade gravada;
   - troca o `isCurrent`, com o índice único parcial da FASE B garantindo que só haja um.

   Se qualquer passo falhar, nada fica gravado e a análise anterior continua vigente.

Cada execução é um **snapshot imutável**: rodar de novo cria outro run e não altera os anteriores nem as fontes. Com as mesmas fontes, o resultado é idêntico material por material.

**Medido:** 4.280 materiais em 18 consultas, com motor de cerca de 11 ms. O total foi de cerca de 7,4 s a partir desta rede (gravação de cerca de 5,6 s até o Supabase em us-west-2). Na Vercel (`pdx1`, perto do banco) a gravação tende a ser bem menor.

## Diferenças autorizadas em relação ao HTML

1. **Importação atômica e transacional** (FASES B e C).
2. **Datas determinísticas**, independentes do fuso.

   Os bugs de data da SheetJS 0.18.5 no fuso de São Paulo **não são reproduzidos**:
   - uma hora a partir de 23:59:32 vira o dia seguinte;
   - 04/11/2018 vira 03/11/2018;
   - uma data ISO em CSV volta um dia.

   No comparador da FASE K, essas diferenças serão classificadas como **`KNOWN_LEGACY_DATE_BUG`** e reportadas à parte, sem ficarem escondidas.

## Testes

```bash
npm run test:mrp-engine                       # sem banco: regras + paridade com o HTML (58 checagens)
npm run test:mrp-analysis-db -- --direct      # integração: run, KPIs, current, snapshot, rollback, recusas, base padrão
```

| Cenário de paridade | Materiais | Divergências |
|---|---|---|
| Fixtures pelo fluxo completo de arquivos | 8 · 8 · 4.280 (3 cenários) | 0 em todos os campos, na compra, no `obsDe` e no `contar` |
| Base embutida real com estoque e compras sintéticos | 4.280 | 0 |
| Fuzz (4 sementes) | 2.500 cada | 0 |
| Do banco ao HTML (fixtures importadas → `runMrpAnalysis` → itens gravados = `analisar()` do HTML) | — | 0 |

## Pendente

- **PARIDADE COM MB52 REAL: PENDENTE.**
- **PARIDADE COM COMPRAS REAIS: PENDENTE.**
