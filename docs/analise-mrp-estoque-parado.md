# Análise MRP — Estoque parado (FASE H)

Reproduz a aba "Estoque parado" do `Analise_MRP_Compacto (1).html` (`paradoRows()` e `renderParado()`) em `/dashboard/analise-mrp?tab=idle`.

## Fonte e regra

- **Fonte:** só os `MrpAnalysisItem` do run vigente (`noMovement`, `free`, área, conjunto, grupo e UM, já gravados pelo motor da FASE D). Vêm do mesmo cache por runId das outras abas.
  - Não lê o estoque importado.
  - Não recalcula a regra.
- **Quem entra:** só itens com `noMovement = true`, ou seja, `noParams || isSemMovTxt(statusMrp)`.
- **Capital parado:** `free > 0`.
- **Zerado:** `free <= 0`, **inclusive saldo negativo**.

| Camada | Arquivo |
|---|---|
| Regra pura | `src/lib/mrp/idle.ts` (`filterMrpIdle`, `mrpIdleSituation`, `mrpIdleShareText`) |
| Leitura | `src/services/mrp-idle.service.ts` |
| API | `GET /api/mrp/analysis/current/idle-stock?idleQ&idleType&idleArea&limit` |
| UI | `src/components/mrp/MrpIdleTab.tsx` |

## KPIs (globais, do run; informativos, não filtram)

| Card | Valor | Texto |
|---|---|---|
| Sem movimentação | `kpis.semMov` | `semMov / max(1, total) × 100` com 1 casa ("77,7% da base") |
| Com saldo | `kpis.parado` | capital parado |
| Qtd. parada | `kpis.qtdParada` (soma do saldo > 0) | soma do saldo |
| Zerados | `semMov − parado` | candidatos a inativação |

**Percentual:** o HTML exibia o resultado do `toFixed(1)` com ponto ("77.7%"). O Portal mostra com vírgula ("77,7%"), como pedido na FASE H. O valor é o mesmo.

## Tabela "Materiais sem movimentação"

- **Filtros:**
  - busca `norm()` no código e na descrição, com debounce de 300 ms;
  - tipo: Com saldo (padrão), Zerados ou Todos;
  - área: Todas, Mecânica ou Elétrica.
  - Os filtros ficam na URL como `idleQ`, `idleType` e `idleArea`, nomes próprios da aba, e são preservados entre abas.
- **Ordem:** maior saldo primeiro. Empates seguem `position`, pelo sort estável sobre a ordem de `materiais()`.
- **Colunas:**
  - Código;
  - Material (descrição, selos de área e conjunto);
  - Saldo (com UM);
  - Grupo ("—" quando vazio; o HTML deixava em branco);
  - Situação (Capital parado ou Zerado).
- **Paginação:** 200 linhas, e "mostrar mais" soma 400.
- **Contagem:** "X materiais neste filtro". Nenhum indicador novo foi criado.
- **Estados vazios:**
  - sem análise, o estado vazio do módulo;
  - sem materiais parados, "Nenhum material sem movimentação identificado na análise atual.";
  - filtro sem resultado, "Nenhum material neste filtro".

## Consultas

| Situação | Consultas |
|---|---|
| Cache frio | 2 (run vigente + itens) |
| Cache quente | 1 |
| Ao filtrar | 1 |

## Correção nesta fase (navegação)

O voltar e avançar entre abas podia deixar a lista Comprar diferente da URL, quando uma resposta antiga chegava depois da nova. A `MrpAnalysisView` agora aplica só a resposta da navegação mais recente. A regra de negócio não mudou.

## Testes

| Comando | Cobertura | Resultado |
|---|---|---|
| `npm run test:mrp-idle-stock` | ver abaixo | 21 checagens, 0 falhas |
| `npm run test:mrp-screen-db -- --direct` | KPIs gravados e ordem da API iguais ao `renderParado()` (18 combinações); consultas | aprovado |
| `npm run test:mrp-e2e -- --direct` | ver abaixo | aprovado |

O `test:mrp-idle-stock` compara com o markup do `renderParado()` original:
- os 4 KPIs e o percentual;
- as 5 colunas de cada linha em **135 combinações**, com 0 divergências, em 3 cenários: base embutida com saldos negativos, zeros e empates, e duas fixtures;
- os casos obrigatórios: 0 e −2 em Zerados, capital parado, material normal fora da aba, ordem 100/50/50/0/−2 e 428/4.280 = 10,0%.

O `test:mrp-e2e` cobre:
- `?tab=idle`;
- KPIs iguais ao banco e invariáveis com os filtros;
- padrão Com saldo;
- Zerados;
- Todos com 200 → 600 → 1.000;
- área;
- busca;
- filtros entre abas;
- voltar e avançar;
- refresh;
- celular.

## Pendente

- **PARIDADE MB52 REAL: PENDENTE.**
- **PARIDADE COMPRAS REAL: PENDENTE.**
- Não está pronto para produção.
